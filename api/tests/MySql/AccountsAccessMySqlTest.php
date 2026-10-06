<?php

namespace Tests\MySql;

use App\Actions\Auth\ManageAccounts;
use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportTransmission;
use App\Models\DistrictReportVersion;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Separate connections/committed synthetic fixtures prove the real MySQL lock and generated-index behavior. */
class AccountsAccessMySqlTest extends TestCase
{
    private array $userIds = [];

    private ?int $districtId = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^firstmate_[a-z0-9_]+$|^caneguard_test$/D', DB::connection()->getDatabaseName());
        config(['caneguard.accounts_enabled' => true]);
    }

    public function test_generated_unique_backstop_rejects_second_active_approver_even_outside_service(): void
    {
        [$actor, $district, $first, $second] = $this->fixtures();
        DistrictGrant::query()->create(['user_id' => $first->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        try {
            DB::table('district_grants')->insert(['user_id' => $second->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
            $this->fail('The generated unique index must reject a second approval holder.');
        } catch (QueryException $error) {
            $this->assertSame('23000', (string) $error->getCode());
        }
        $this->assertSame(1, DistrictGrant::query()->where('district_id', $district->id)->where('ability', 'report:approve')->whereNull('revoked_at')->count());
    }

    public function test_concurrent_grant_decisions_have_one_winner_under_the_same_district_lock(): void
    {
        [$actor, $district, $first, $second] = $this->fixtures();
        $requests = [];
        foreach ([$first, $second] as $target) {
            $requests[] = [$target->uuid, $this->body($target->fresh(), ['report:approve'])];
        }
        $results = $this->race($actor, $requests);
        sort($results);
        $this->assertSame(['ACCOUNT_ACCESS_UPDATED', 'APPROVER_ALREADY_ASSIGNED'], $results);
        $this->assertSame(1, DistrictGrant::query()->where('district_id', $district->id)->where('ability', 'report:approve')->whereNull('revoked_at')->count());
        $this->assertSame(1, DB::table('account_access_events')->where('district_id', $district->id)->count());
    }

    public function test_concurrent_same_key_deduplicates_and_different_keys_compare_and_swap(): void
    {
        [$actor, $district, $target, $other] = $this->fixtures();
        $body = $this->body($target->fresh(), ['report:send']);
        $this->assertSame(['ACCOUNT_ACCESS_UPDATED', 'ACCOUNT_ACCESS_UPDATED'], $this->race($actor, [[$target->uuid, $body], [$target->uuid, $body]]));
        $this->assertSame(1, DB::table('account_access_events')->where('district_id', $district->id)->count());
        $this->assertSame(1, DB::table('account_access_receipts')->where('district_id', $district->id)->count());
        $body = $this->body($other->fresh(), ['report:send']);
        $second = [...$body, 'idempotency_key' => (string) Str::uuid()];
        $results = $this->race($actor, [[$other->uuid, $body], [$other->uuid, $second]]);
        sort($results);
        $this->assertSame(['ACCESS_VERSION_CONFLICT', 'ACCOUNT_ACCESS_UPDATED'], $results);
    }

    public function test_concurrent_transfers_revoke_old_key_once_and_never_create_two_approvers(): void
    {
        [$actor, $district, $old, $first] = $this->fixtures();
        $second = User::factory()->admin()->create();
        $this->userIds[] = $second->id;
        DistrictMembership::query()->create(['user_id' => $second->id, 'district_id' => $district->id]);
        $grant = DistrictGrant::query()->create(['user_id' => $old->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        $requests = [];
        foreach ([$first, $second] as $target) {
            $body = $this->body($target->fresh(), []);
            unset($body['operation'], $body['expected_access_version'], $body['desired']);
            $body += ['from_uuid' => $old->uuid, 'to_uuid' => $target->uuid, 'from_expected_access_version' => $old->fresh()->access_version, 'to_expected_access_version' => $target->fresh()->access_version];
            $requests[] = [null, $body];
        }
        $results = $this->race($actor, $requests, 'transfer');
        sort($results);
        $this->assertSame(['ACCESS_VERSION_CONFLICT', 'ACCOUNT_ACCESS_UPDATED'], $results);
        $this->assertNotNull($grant->fresh()->revoked_at);
        $this->assertSame(1, DistrictGrant::query()->where('district_id', $district->id)->where('ability', 'report:approve')->whereNull('revoked_at')->count());
        $this->assertSame(2, DB::table('account_access_events')->where('district_id', $district->id)->count());
    }

    public function test_legacy_key_transfer_does_not_change_active_admin_approval_or_sealed_history(): void
    {
        [$actor, $district, $old, $target] = $this->fixtures();
        config(['caneguard.weekly_send_enabled' => true]);
        $approval = DistrictGrant::query()->create(['user_id' => $old->id, 'district_id' => $district->id, 'ability' => 'report:approve'])->fresh();
        $send = DistrictGrant::query()->create(['user_id' => $actor->id, 'district_id' => $district->id, 'ability' => 'report:send'])->fresh();
        $content = ['appendix_enabled' => false, 'contract' => 'weekly-report-content-v1'];
        $version = DistrictReportVersion::query()->create([
            'district_id' => $district->id, 'week_start' => '2026-10-05', 'version' => 1, 'content' => $content,
            'content_hash' => hash('sha256', json_encode($content)), 'source_refs' => [], 'prepared_by_id' => $actor->id,
            'approved_by_id' => $old->id, 'approved_grant_id' => $approval->id, 'approved_grant_revision' => $approval->revision,
            'approved_at' => now(), 'document_sha256' => hash('sha256', 'synthetic-history'), 'document_bytes' => base64_encode('synthetic-history'),
        ]);
        $recipients = DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['synthetic@example.test'], 'office_reference' => 'SYNTHETIC-RECIPIENTS']);
        $intent = DistrictReportTransmission::query()->create([
            'district_report_version_id' => $version->id, 'district_recipient_set_id' => $recipients->id, 'requested_by_id' => $actor->id,
            'send_grant_id' => $send->id, 'send_grant_revision' => $send->revision, 'idempotency_key' => (string) Str::uuid(), 'state' => 'pending',
        ]);
        $workflow = app(DistrictReportWorkflow::class);
        $this->assertTrue($workflow->checkPending($intent));
        $body = $this->body($target->fresh(), []);
        unset($body['operation'], $body['expected_access_version'], $body['desired']);
        $body += ['from_uuid' => $old->uuid, 'to_uuid' => $target->uuid, 'from_expected_access_version' => $old->fresh()->access_version, 'to_expected_access_version' => $target->fresh()->access_version];
        $request = Request::create('/api/v2/admin/accounts/approval-transfer', 'POST', $body);
        $request->setUserResolver(fn () => $actor->fresh());
        app(ManageAccounts::class)->handle($request, 'transfer');
        $this->assertTrue($workflow->checkPending($intent));
        $this->assertSame('pending', $intent->fresh()->state);
        $this->assertSame($old->id, $version->fresh()->approved_by_id);
        $this->assertSame($approval->revision, $version->fresh()->approved_grant_revision);
        $this->assertDatabaseMissing('district_report_events', ['district_report_version_id' => $version->id, 'action' => 'cancelled']);
    }

    public function test_stale_identity_save_atomically_advances_the_latest_grant_version(): void
    {
        [$actor, $district, $target] = $this->fixtures();
        $stale = $target->fresh();
        DistrictGrant::query()->create(['user_id' => $target->id, 'district_id' => $district->id, 'ability' => 'report:send']);
        $currentVersion = $target->fresh()->access_version;
        $stale->forceFill(['name' => 'Synthetic renamed officer'])->save();
        $this->assertSame($currentVersion + 1, $target->fresh()->access_version);
        $this->assertSame($currentVersion + 1, $stale->access_version);
    }

    private function fixtures(): array
    {
        $code = 'accounts-race-'.Str::uuid();
        $district = District::query()->create(['code' => $code, 'name' => 'Synthetic accounts concurrency district']);
        $this->districtId = $district->id;
        config(['caneguard.pilot_district_code' => $code]);
        $users = [];
        foreach (range(1, 3) as $index) {
            $user = User::factory()->admin()->create(['name' => 'Synthetic accounts race '.$index]);
            $this->userIds[] = $user->id;
            DistrictMembership::query()->create(['user_id' => $user->id, 'district_id' => $district->id]);
            $users[] = $user;
        }
        DistrictGrant::query()->create(['user_id' => $users[0]->id, 'district_id' => $district->id, 'ability' => 'staff:manage']);

        return [$users[0]->fresh(), $district, $users[1]->fresh(), $users[2]->fresh()];
    }

    private function body(User $target, array $grants): array
    {
        return ['contract_version' => 'accounts-access-v1', 'operation' => 'replace', 'current_password' => 'password',
            'office_reference' => 'SYNTHETIC-MYSQL-RACE', 'idempotency_key' => (string) Str::uuid(),
            'expected_access_version' => $target->access_version, 'desired' => ['role' => 'admin', 'grants' => $grants]];
    }

    private function race(User $actor, array $requests, string $kind = 'access'): array
    {
        $this->assertTrue(function_exists('pcntl_fork'), 'Actual MySQL concurrency requires pcntl; do not silently skip it.');
        $directory = sys_get_temp_dir().'/cg-accounts-race-'.Str::uuid();
        mkdir($directory, 0700);
        // Never share a live PDO socket across a fork.
        DB::disconnect();
        $children = [];
        foreach ($requests as $index => [$uuid, $body]) {
            $pid = pcntl_fork();
            if ($pid === -1) {
                $this->fail('Could not fork MySQL concurrency worker.');
            }
            if ($pid === 0) {
                try {
                    DB::purge();
                    $request = Request::create('/api/v2/admin/accounts/'.$uuid.'/access', 'PUT', $body);
                    $request->setUserResolver(fn () => User::findOrFail($actor->id));
                    // Each child waits on the same start barrier, not a sequential emulation.
                    while (! file_exists($directory.'/start')) {
                        usleep(1000);
                    }
                    $result = app(ManageAccounts::class)->handle($request, $kind, $uuid)['code'];
                } catch (HttpResponseException $failure) {
                    $result = json_decode($failure->getResponse()->getContent(), true)['code'];
                } catch (\Throwable $failure) {
                    $result = get_class($failure);
                }
                file_put_contents($directory.'/'.$index, $result);
                DB::disconnect();
                exit(0);
            }
            $children[] = $pid;
        }
        touch($directory.'/start');
        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
            $this->assertSame(0, pcntl_wexitstatus($status));
        }
        DB::purge();
        $results = [];
        foreach (array_keys($requests) as $index) {
            $results[] = file_get_contents($directory.'/'.$index);
            unlink($directory.'/'.$index);
        }
        unlink($directory.'/start');
        rmdir($directory);

        return $results;
    }

    protected function tearDown(): void
    {
        if ($this->districtId !== null) {
            // Only this test's committed synthetic fixtures; never touch unrelated seeded/production records.
            DB::table('account_access_receipts')->where('district_id', $this->districtId)->delete();
            DB::table('account_access_events')->where('district_id', $this->districtId)->delete();
            DB::table('security_audits')->whereIn('actor_id', $this->userIds)->delete();
            $versionIds = DB::table('district_report_versions')->where('district_id', $this->districtId)->pluck('id');
            DB::table('district_report_transmissions')->whereIn('district_report_version_id', $versionIds)->delete();
            DB::table('district_report_events')->where('district_id', $this->districtId)->delete();
            DB::table('district_report_versions')->where('district_id', $this->districtId)->delete();
            DB::table('district_recipient_sets')->where('district_id', $this->districtId)->delete();
            DB::table('district_grants')->where('district_id', $this->districtId)->delete();
            DB::table('district_memberships')->where('district_id', $this->districtId)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
            DB::table('districts')->where('id', $this->districtId)->delete();
        }
        parent::tearDown();
    }
}
