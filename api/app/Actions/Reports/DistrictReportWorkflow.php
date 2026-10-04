<?php

namespace App\Actions\Reports;

use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportEvent;
use App\Models\DistrictReportTransmission;
use App\Models\DistrictReportVersion;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Preparation is not approval; send records an intent, never delivers mail. */
final class DistrictReportWorkflow
{
    public function __construct(private readonly DistrictAccess $access, private readonly BuildReportDocument $documents) {}

    public function prepare(User $actor, string $week): DistrictReportVersion
    {
        abort_unless($this->access->office($actor), 403);
        $period = $this->documents->resolvePeriod(['period_type' => 'weekly', 'week' => $week]);

        return DB::transaction(function () use ($actor, $period, $week): DistrictReportVersion {
            $district = District::query()->lockForUpdate()->findOrFail($this->access->pilotId());
            $refs = $this->sourceRefs($district->id, $period['start']->toDateString(), true);
            $content = $this->documents->handle(['period_type' => 'weekly', 'week' => $week], $actor);
            $version = DistrictReportVersion::query()->create([
                'district_id' => $district->id,
                'week_start' => $period['start']->toDateString(),
                'version' => 1 + (int) DistrictReportVersion::query()->where('district_id', $district->id)
                    ->where('week_start', $period['start']->toDateString())->max('version'),
                'content' => $content,
                'content_hash' => $this->hash($content),
                'source_refs' => $refs,
                'prepared_by_id' => $actor->id,
            ]);
            $this->event($version, 'prepared', $actor);

            return $version;
        }, attempts: 3);
    }

    public function approve(User $actor, DistrictReportVersion $version, string $hash): DistrictReportVersion
    {
        // Check role/grant before conflict/record-state responses, including direct reviewer calls.
        abort_unless($this->access->grant($actor, 'report:approve', $version->district_id) !== null, 403);

        return DB::transaction(function () use ($actor, $version, $hash): DistrictReportVersion {
            $locked = $this->lock($version);
            $grant = $this->access->grant($actor->fresh(), 'report:approve', $locked->district_id);
            abort_unless($grant !== null, 403);
            $this->assertCurrent($locked, $hash);
            if ($locked->approved_at !== null) {
                abort_unless($this->approvalValid($locked), 409);

                return $locked;
            }
            $locked->update([
                'approved_by_id' => $actor->id,
                'approved_grant_id' => $grant->id,
                'approved_grant_revision' => $grant->revision,
                'approved_at' => now()->utc(),
            ]);
            $this->event($locked, 'approved', $actor, $grant);

            return $locked;
        }, attempts: 3);
    }

    public function requestSend(User $actor, DistrictReportVersion $version, string $hash, string $key): DistrictReportTransmission
    {
        abort_unless($this->access->grant($actor, 'report:send', $version->district_id) !== null, 403);
        // The office delivery contract is a separate launch gate, default closed.
        abort_unless(config('caneguard.weekly_send_enabled') === true, 503);

        return DB::transaction(function () use ($actor, $version, $hash, $key): DistrictReportTransmission {
            $locked = $this->lock($version);
            $grant = $this->access->grant($actor->fresh(), 'report:send', $locked->district_id);
            abort_unless($grant !== null, 403);
            $this->assertCurrent($locked, $hash);
            abort_unless($this->approvalValid($locked), 409);
            $existing = DistrictReportTransmission::query()->where('district_report_version_id', $locked->id)->first();
            if ($existing !== null) {
                abort_unless($existing->idempotency_key === $key && $existing->requested_by_id === $actor->id
                    && $existing->state !== 'cancelled', 409);

                return $existing;
            }
            abort_if(DistrictReportTransmission::query()->where('idempotency_key', $key)->exists(), 409);
            $recipients = DistrictRecipientSet::query()->where('district_id', $locked->district_id)
                ->whereNull('revoked_at')->orderByDesc('id')->lockForUpdate()->first();
            abort_unless($recipients !== null && $recipients->recipients !== [], 409);
            $intent = DistrictReportTransmission::query()->create([
                'district_report_version_id' => $locked->id,
                'district_recipient_set_id' => $recipients->id,
                'requested_by_id' => $actor->id,
                'send_grant_id' => $grant->id,
                'send_grant_revision' => $grant->revision,
                'idempotency_key' => $key,
                'state' => 'pending',
            ]);
            $this->event($locked, 'send_requested', $actor, $grant, $intent);

            return $intent;
        }, attempts: 3);
    }

    /** Must be called by any future transport worker immediately before delivery. No mail implementation ships here. */
    public function checkPending(DistrictReportTransmission $intent): bool
    {
        return DB::transaction(function () use ($intent): bool {
            $version = $this->lock(DistrictReportVersion::findOrFail($intent->district_report_version_id));
            $intent = DistrictReportTransmission::query()->lockForUpdate()->findOrFail($intent->id);
            if ($intent->state !== 'pending') {
                return false;
            }
            $actor = User::findOrFail($intent->requested_by_id);
            $grant = $this->access->grant($actor, 'report:send', $version->district_id);
            $recipients = DistrictRecipientSet::findOrFail($intent->district_recipient_set_id);
            $valid = config('caneguard.weekly_send_enabled') === true && $grant !== null
                && $grant->id === $intent->send_grant_id && $grant->revision === $intent->send_grant_revision
                && $recipients->revoked_at === null && $recipients->district_id === $version->district_id
                && $this->approvalValid($version) && $this->isCurrent($version, $version->content_hash);
            if (! $valid) {
                $intent->update(['state' => 'cancelled']);
                $this->event($version, 'cancelled', $actor, $grant, $intent);
            }

            return $valid;
        }, attempts: 3);
    }

    private function lock(DistrictReportVersion $version): DistrictReportVersion
    {
        District::query()->whereKey($version->district_id)->lockForUpdate()->firstOrFail();

        return DistrictReportVersion::query()->lockForUpdate()->findOrFail($version->id);
    }

    private function approvalValid(DistrictReportVersion $version): bool
    {
        if ($version->approved_at === null) {
            return false;
        }
        $actor = User::find($version->approved_by_id);
        $grant = $this->access->grant($actor, 'report:approve', $version->district_id);

        return $grant !== null && $grant->id === $version->approved_grant_id
            && $grant->revision === $version->approved_grant_revision;
    }

    private function assertCurrent(DistrictReportVersion $version, string $hash): void
    {
        abort_unless($this->isCurrent($version, $hash), 409);
    }

    private function isCurrent(DistrictReportVersion $version, string $hash): bool
    {
        return hash_equals($version->content_hash, $hash)
            && hash_equals($version->content_hash, $this->hash($version->content))
            && ! DistrictReportVersion::query()->where('district_id', $version->district_id)
                ->where('week_start', $version->week_start)->where('version', '>', $version->version)->exists()
            && $version->source_refs === $this->sourceRefs($version->district_id, $version->week_start);
    }

    private function sourceRefs(int $districtId, string $weekStart, bool $lock = false): array
    {
        $start = CarbonImmutable::parse($weekStart, 'Asia/Manila')->startOfDay();

        return Report::query()->where('district_id', $districtId)
            ->where('submitted_at', '>=', $start->utc())->where('submitted_at', '<', $start->addWeek()->utc())
            ->orderBy('id')->when($lock, fn ($query) => $query->lockForUpdate())->get()
            ->map(fn (Report $report): array => [
                'uuid' => $report->uuid,
                'version' => (int) $report->lock_version,
                'evidence_hash' => $this->hash($report->getAttributes()),
            ])->all();
    }

    private function hash(array $content): string
    {
        return hash('sha256', json_encode($this->canonical($content), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->canonical($item);
            }
        }

        return $value;
    }

    private function event(DistrictReportVersion $version, string $action, User $actor, ?DistrictGrant $grant = null, ?DistrictReportTransmission $intent = null): void
    {
        DistrictReportEvent::query()->create([
            'district_report_version_id' => $version->id,
            'district_id' => $version->district_id,
            'week_start' => $version->week_start,
            'content_hash' => $version->content_hash,
            'action' => $action,
            'actor_id' => $actor->id,
            'actor_uuid' => $actor->uuid,
            'actor_role' => $actor->role,
            'grant_id' => $grant?->id,
            'grant_revision' => $grant?->revision,
            'recipient_set_id' => $intent?->district_recipient_set_id,
            'idempotency_key' => $intent?->idempotency_key,
            'created_at' => now()->utc(),
        ]);
    }
}
