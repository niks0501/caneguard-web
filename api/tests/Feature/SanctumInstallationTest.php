<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SanctumInstallationTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_can_issue_sanctum_personal_access_tokens(): void
    {
        $user = User::factory()->create();

        $token = $user->createToken('test-client');

        $this->assertNotSame('', $token->plainTextToken);
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $user->getKey(),
            'name' => 'test-client',
        ]);
    }
}
