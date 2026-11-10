<?php

namespace App\Console\Commands;

use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * Read-only safety net for rows inserted by direct SQL (see
 * docs/development/mobile-direct-sql-rulebook.md). It mirrors what the mobile
 * feeds serialize and filter, and never writes.
 */
final class CheckMobileData extends Command
{
    private const FAILS = 'fails on phone';

    private const HIDDEN = 'hidden from phone';

    private const LABELS = ['healthy', 'mosaic', 'rust', 'smut'];

    private const CASE_STATES = [Report::CASE_STATE_OPEN, Report::CASE_STATE_CLOSED];

    private const ASSIGNED_STATES = [
        Report::FIELD_VALIDATION_STATE_ASSIGNED,
        Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
        Report::FIELD_VALIDATION_STATE_COMPLETED,
    ];

    private const FIELD_VALIDATION_STATES = [
        Report::FIELD_VALIDATION_STATE_UNASSIGNED,
        ...self::ASSIGNED_STATES,
    ];

    protected $signature = 'caneguard:check-mobile-data';

    protected $description = 'Read-only: list reports and assignments that phones would reject or never see, with reference code and reason';

    /** @var array<int, array{reference: string, effect: string, reason: string}> */
    private array $findings = [];

    private ?int $pilotId = null;

    private CarbonImmutable $now;

    private bool $hasOrigin = false;

    public function handle(DistrictAccess $access): int
    {
        $this->findings = [];
        $this->now = CarbonImmutable::now('UTC');
        $this->hasOrigin = Schema::hasColumn('reports', 'origin');

        try {
            $this->pilotId = $access->pilotId();
        } catch (Throwable) {
            $this->pilotId = null;
        }

        $checked = 0;
        DB::table('reports')->orderBy('id')->chunkById(500, function (Collection $reports) use (&$checked): void {
            $checked += $reports->count();
            $this->checkChunk($reports);
        });
        $this->checkOrphanAssignments();

        if ($this->pilotId === null) {
            $this->add('(all rows)', self::HIDDEN, 'No pilot district is configured or seeded, so every phone feed is empty');
        }

        if ($this->findings === []) {
            $this->info("Checked {$checked} reports: no row would fail or stay hidden on phones.");

            return self::SUCCESS;
        }

        $this->table(
            ['Reference code', 'Effect', 'Reason'],
            array_map(fn (array $f): array => [$f['reference'], $f['effect'], $f['reason']], $this->findings),
        );
        $this->error(sprintf('Checked %d reports: %d problem(s) found. Nothing was changed.', $checked, count($this->findings)));

        return self::FAILURE;
    }

    /** @param  Collection<int, object>  $reports */
    private function checkChunk(Collection $reports): void
    {
        $assignments = DB::table('field_validation_assignments')
            ->whereIn('report_id', $reports->pluck('id'))->get()->keyBy('report_id');
        $completed = DB::table('field_validation_completions')
            ->whereIn('assignment_id', $assignments->pluck('id'))->pluck('assignment_id')->flip();
        $userIds = $reports->pluck('reporter_id')->merge($assignments->pluck('assignee_id'))->unique()->values();
        $users = DB::table('users')->whereIn('id', $userIds)
            ->get(['id', 'uuid', 'name', 'role', 'is_active', 'email_verified_at'])->keyBy('id');
        $members = $this->pilotId === null ? collect() : DB::table('district_memberships')
            ->where('district_id', $this->pilotId)->whereNull('revoked_at')
            ->whereIn('user_id', $userIds)->pluck('user_id')->flip();

        foreach ($reports as $report) {
            $ref = $this->reference($report);
            $assignment = $assignments->get($report->id);

            $this->checkReportContract($report, $ref, $users->get($report->reporter_id));
            $this->checkReportVisibility($report, $ref, $assignment, $assignment !== null && $completed->has($assignment->id));
            if ($assignment !== null) {
                $this->checkAssignment($assignment, $ref, $users->get($assignment->assignee_id), $members->has($assignment->assignee_id));
            }
        }
    }

    private function checkReportContract(object $report, string $ref, ?object $reporter): void
    {
        $fail = fn (string $reason) => $this->add($ref, self::FAILS, $reason);

        if (! is_string($report->uuid) || ! Str::isUuid($report->uuid)) {
            $fail('uuid is missing or not a UUID');
        }
        if (! is_string($report->client_uuid) || ! Str::isUuid($report->client_uuid)) {
            $fail('client_uuid is missing or not a UUID (use a server-minted UUID for office rows)');
        }
        if (trim((string) $report->reference_code) === '' || mb_strlen((string) $report->reference_code) > 32) {
            $fail('reference_code is empty or longer than 32 characters');
        }
        if ($reporter === null) {
            $fail("reporter_id {$report->reporter_id} matches no user");
        } elseif (! is_string($reporter->uuid) || ! Str::isUuid($reporter->uuid) || trim((string) $reporter->name) === '') {
            $fail('reporter user has no UUID or no name (phone submitter block)');
        }
        if ($report->captured_at === null) {
            $fail('captured_at is empty; serializing the assignment crashes the whole feed');
        }
        if ($report->submitted_at === null) {
            $fail('submitted_at is empty; serializing the assignment crashes the whole feed');
        }
        if ($report->updated_at === null) {
            $fail('updated_at is empty; phones sync by updated_at and the status feed crashes');
        }
        // An office-born case may exist without an AI prediction; a value that
        // is present must still be valid.
        $noScanAllowed = $this->hasOrigin && ($report->origin ?? null) === 'office';
        if (! ($noScanAllowed && $report->predicted_label === null)
            && ! in_array($report->predicted_label, self::LABELS, true)) {
            $fail('predicted_label must be one of '.implode('/', self::LABELS));
        }
        if (! ($noScanAllowed && $report->confidence === null)
            && (! is_numeric($report->confidence) || $report->confidence < 0 || $report->confidence > 1)) {
            $fail('confidence must be a number between 0 and 1');
        }
        if ($noScanAllowed && ($report->predicted_label === null) !== ($report->confidence === null)) {
            $fail('predicted_label and confidence must both be set or both be empty');
        }
        if (trim((string) $report->barangay) === '') {
            $fail('barangay is empty');
        }
        if ($report->affected_portion_percent !== null && ($report->affected_portion_percent < 0 || $report->affected_portion_percent > 100)) {
            $fail('affected_portion_percent must be between 0 and 100');
        }
        if ($report->affected_area_hectares !== null && $report->affected_area_hectares < 0) {
            $fail('affected_area_hectares must not be negative');
        }
        if ($report->case_state !== null && ! in_array($report->case_state, self::CASE_STATES, true)) {
            $fail("case_state '{$report->case_state}' is not open or closed");
        }
        if ($report->field_validation_state !== null && ! in_array($report->field_validation_state, self::FIELD_VALIDATION_STATES, true)) {
            $fail("field_validation_state '{$report->field_validation_state}' is not a known state");
        }
        if ($this->hasOrigin && ! in_array($report->origin ?? null, ['mobile', 'office'], true)) {
            $fail("origin '".($report->origin ?? 'NULL')."' is not mobile or office");
        }
    }

    private function checkReportVisibility(object $report, string $ref, ?object $assignment, bool $completed): void
    {
        $assignedState = in_array($report->field_validation_state, self::ASSIGNED_STATES, true);
        // Only rows meant for a phone are judged on visibility: assigned work.
        if ($assignment === null && ! $assignedState) {
            return;
        }

        $hide = fn (string $reason) => $this->add($ref, self::HIDDEN, $reason);

        if ($assignment === null) {
            $hide("field_validation_state is '{$report->field_validation_state}' but there is no field_validation_assignments row");

            return;
        }
        if ($this->pilotId !== null && (int) $report->district_id !== $this->pilotId) {
            $hide('district_id is empty or not the configured pilot district');
        }
        if ($report->case_state !== Report::CASE_STATE_OPEN) {
            $state = $report->case_state ?? 'NULL';
            $hide("case_state is {$state}; the assignment feed only lists open cases".($completed ? '' : ' (no completion recorded)'));
        }
        if (! $assignedState) {
            $hide('field_validation_state is '.($report->field_validation_state ?? 'NULL').'; the assignment feed needs assigned, in_progress or completed');
        }
    }

    private function checkAssignment(object $assignment, string $ref, ?object $assignee, bool $member): void
    {
        $fail = fn (string $reason) => $this->add($ref, self::FAILS, $reason);
        $hide = fn (string $reason) => $this->add($ref, self::HIDDEN, $reason);

        if (! is_string($assignment->uuid) || ! Str::isUuid($assignment->uuid)) {
            $fail('assignment uuid is missing or not a UUID');
        }
        if ($assignment->activated_at === null) {
            $fail('assignment activated_at is empty; serializing the assignment crashes the whole feed');
        }
        if ($assignment->updated_at === null) {
            $fail('assignment updated_at is empty; phones sync by updated_at and never receive it');
        } elseif (CarbonImmutable::parse($assignment->updated_at, 'UTC')->greaterThan($this->now)) {
            $hide('assignment updated_at is in the future; phones skip it until then');
        }

        if ($assignee === null) {
            $fail("assignee_id {$assignment->assignee_id} matches no user");

            return;
        }
        if (! is_string($assignee->uuid) || ! Str::isUuid($assignee->uuid) || trim((string) $assignee->name) === '') {
            $fail('assignee user has no UUID or no name');
        }
        if ($assignee->role !== User::ROLE_FIELD_REPORTER || ! $assignee->is_active || $assignee->email_verified_at === null) {
            $hide('assignee is not an active, email-verified field reporter, so no phone can read this assignment');
        } elseif (! $member) {
            $hide('assignee has no active membership in the pilot district');
        }
    }

    private function checkOrphanAssignments(): void
    {
        DB::table('field_validation_assignments as a')
            ->leftJoin('reports as r', 'r.id', '=', 'a.report_id')
            ->whereNull('r.id')->get(['a.id', 'a.uuid', 'a.report_id'])
            ->each(fn (object $a) => $this->add(
                "(assignment {$a->id})",
                self::HIDDEN,
                "assignment points at report_id {$a->report_id}, which does not exist",
            ));
    }

    private function reference(object $report): string
    {
        $code = trim((string) $report->reference_code);

        return $code === '' ? "(report id {$report->id})" : $code;
    }

    private function add(string $reference, string $effect, string $reason): void
    {
        $this->findings[] = ['reference' => $reference, 'effect' => $effect, 'reason' => $reason];
    }
}
