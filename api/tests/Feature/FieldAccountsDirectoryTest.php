<?php

namespace Tests\Feature;

use App\Models\DistrictMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class FieldAccountsDirectoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_lists_field_accounts_only_and_can_revoke_then_restore_through_the_access_operation(): void
    {
        $district = $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        $field = User::factory()->fieldReporter()->create();
        User::factory()->reviewer()->create();
        DistrictMembership::create(['user_id' => $field->id, 'district_id' => $district->id]);
        $field->refresh();
        $this->actingAs($admin, 'web');

        $this->getJson('/api/v1/admin/accounts/field')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $field->uuid)->assertJsonPath('data.0.role', 'field_reporter')
            ->assertJsonPath('data.0.is_active', true)->assertJsonPath('data.0.access_version', $field->access_version);

        $body = fn (string $operation, User $u) => ['contract_version' => 'accounts-access-v1', 'operation' => $operation,
            'desired' => ['role' => 'field_reporter', 'grants' => []], 'current_password' => 'password', 'office_reference' => 'synthetic',
            'idempotency_key' => (string) Str::uuid(), 'expected_access_version' => $u->access_version];
        $path = '/api/v2/admin/accounts/'.$field->uuid.'/access';
        $this->putJson($path, $body('revoke', $field))->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertNotNull($field->districtMemberships()->first()->revoked_at);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $field->id, 'action' => 'district_access_changed']);

        $field->refresh();
        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.is_active', false);
        $this->putJson($path, $body('restore', $field))->assertOk()->assertJsonPath('data.is_active', true);
    }

    public function test_directory_is_admin_only(): void
    {
        $this->pilotDistrict();
        $this->getJson('/api/v1/admin/accounts/field')->assertUnauthorized();
        $this->actingAs(User::factory()->reviewer()->create(), 'web');
        $this->getJson('/api/v1/admin/accounts/field')->assertForbidden();
    }
}
