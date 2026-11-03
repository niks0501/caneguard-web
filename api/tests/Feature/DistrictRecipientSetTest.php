<?php

namespace Tests\Feature;

use App\Models\DistrictRecipientSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistrictRecipientSetTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/district-recipient-sets';

    private function payload(array $override = []): array
    {
        return [...['recipients' => ['office@example.test', 'chief@example.test'], 'office_reference' => 'synthetic-office-ref', 'current_password' => 'password'], ...$override];
    }

    private function admin(): User
    {
        $admin = User::factory()->admin()->inDistrict($this->pilotDistrict())->create();
        $this->actingAs($admin, 'web');

        return $admin;
    }

    public function test_empty_until_replaced_then_replace_revokes_old_set_and_audits(): void
    {
        $admin = $this->admin();
        $this->getJson(self::URL)->assertOk()->assertJsonPath('data', []);

        $this->postJson(self::URL.'/replace', $this->payload())->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.revoked_at', null)->assertJsonPath('data.0.recipients.1', 'chief@example.test');
        $first = DistrictRecipientSet::query()->firstOrFail();

        $this->postJson(self::URL.'/replace', $this->payload(['recipients' => ['new@example.test'], 'office_reference' => 'second-ref']))->assertOk()
            ->assertJsonCount(2, 'data')->assertJsonPath('data.0.recipients.0', 'new@example.test')->assertJsonPath('data.0.revoked_at', null);
        $this->assertNotNull($first->fresh()->revoked_at);
        $this->assertSame(['office@example.test', 'chief@example.test'], $first->fresh()->recipients);
        $this->assertSame(1, DistrictRecipientSet::query()->whereNull('revoked_at')->count());
        $this->assertDatabaseHas('security_audits', ['actor_id' => $admin->id, 'action' => 'district_recipient_set_replaced', 'outcome' => 'success']);
        $this->assertStringNotContainsString('new@example.test', (string) \DB::table('security_audits')->where('action', 'district_recipient_set_replaced')->pluck('metadata')->implode(''));
    }

    public function test_step_up_is_required_and_a_wrong_password_changes_nothing(): void
    {
        $this->admin();
        $this->postJson(self::URL.'/replace', $this->payload(['current_password' => 'wrong']))->assertForbidden();
        $this->postJson(self::URL.'/replace', array_diff_key($this->payload(), ['current_password' => 1]))->assertUnprocessable();
        $this->assertDatabaseCount('district_recipient_sets', 0);
    }

    public function test_size_email_and_reference_validation(): void
    {
        $this->admin();
        foreach ([[], ['not-an-email'], array_map(fn ($i) => "user{$i}@example.test", range(1, 21))] as $recipients) {
            $this->postJson(self::URL.'/replace', $this->payload(['recipients' => $recipients]))->assertUnprocessable();
        }
        $this->postJson(self::URL.'/replace', $this->payload(['office_reference' => '']))->assertUnprocessable();
        $this->assertDatabaseCount('district_recipient_sets', 0);
        $this->postJson(self::URL.'/replace', $this->payload(['recipients' => array_map(fn ($i) => "user{$i}@example.test", range(1, 20))]))->assertOk();
        $this->postJson(self::URL.'/replace', $this->payload(['recipients' => ['A@example.test', 'a@example.test']]))->assertOk()->assertJsonCount(1, 'data.0.recipients');
    }

    public function test_failed_replace_rolls_back_the_revocation(): void
    {
        $this->admin();
        $this->postJson(self::URL.'/replace', $this->payload())->assertOk();
        DistrictRecipientSet::creating(fn () => throw new \RuntimeException('boom'));
        try {
            $this->withoutExceptionHandling()->postJson(self::URL.'/replace', $this->payload(['recipients' => ['x@example.test']]));
        } catch (\RuntimeException) {
        }
        $this->assertSame(1, DistrictRecipientSet::query()->whereNull('revoked_at')->count());
    }

    public function test_sets_stay_immutable_and_undeletable(): void
    {
        $this->admin();
        $this->postJson(self::URL.'/replace', $this->payload())->assertOk();
        $set = DistrictRecipientSet::query()->firstOrFail();
        $this->expectException(\LogicException::class);
        $set->update(['recipients' => ['edit@example.test']]);
    }

    public function test_sets_cannot_be_deleted(): void
    {
        $this->admin();
        $this->postJson(self::URL.'/replace', $this->payload())->assertOk();
        $this->expectException(\LogicException::class);
        DistrictRecipientSet::query()->firstOrFail()->delete();
    }

    public function test_only_active_admins_can_read_or_replace(): void
    {
        $district = $this->pilotDistrict();
        foreach ([User::factory()->reviewer()->inDistrict($district)->create(), User::factory()->fieldReporter()->inDistrict($district)->create()] as $user) {
            \Auth::forgetGuards();
            $this->actingAs($user, 'web');
            $this->getJson(self::URL)->assertForbidden();
            $this->postJson(self::URL.'/replace', $this->payload())->assertForbidden();
        }
        \Auth::forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->postJson(self::URL.'/replace', $this->payload())->assertUnauthorized();
        $this->assertDatabaseCount('district_recipient_sets', 0);
    }

    public function test_replace_enables_send_in_report_index_meta_when_gate_is_on(): void
    {
        $this->admin();
        config(['caneguard.weekly_send_enabled' => true]);
        $this->getJson('/api/v1/district-reports')->assertJsonPath('meta.send_enabled', false)->assertJsonPath('meta.delivery_gate_open', true)->assertJsonPath('meta.recipients_configured', false);
        $this->postJson(self::URL.'/replace', $this->payload())->assertOk();
        $this->getJson('/api/v1/district-reports')->assertJsonPath('meta.send_enabled', true)->assertJsonPath('meta.recipients_configured', true);
    }
}
