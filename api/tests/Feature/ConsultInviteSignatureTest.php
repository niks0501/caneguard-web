<?php

namespace Tests\Feature;

use App\Models\ReportReferral;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ConsultInviteSignatureTest extends TestCase
{
    use RefreshDatabase;

    private ReportReferral $consult;

    private string $token = 'consult-invite-test-token';

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeTime();
        Storage::fake('local');
        $this->consult = ReportReferral::factory()->create([
            'invite_token_hash' => hash('sha256', $this->token),
            'invite_issued_at' => now(),
            'invite_expires_at' => now()->addDays((int) config('caneguard.expert_consult_invite_days')),
        ]);
        Storage::disk('local')->put($this->consult->report->image_path, 'evidence');
    }

    #[DataProvider('inviteRoutes')]
    public function test_relative_signed_invite_is_accessible_without_authentication(string $route): void
    {
        $this->assertGuest();
        $url = URL::temporarySignedRoute($route, $this->consult->invite_expires_at, [
            'token' => $this->token,
        ], false);
        $this->assertStringStartsWith('/api/v1/consult-invites/', $url);

        $response = $this->getJson($url)->assertOk();
        if ($route === 'api.v1.consult-invites.image') {
            $response->assertStreamedContent('evidence');
        } else {
            $response->assertJsonPath('data.case.uuid', $this->consult->report->uuid);
        }

        $this->assertSame(1, $this->consult->fresh()->invite_access_count);
    }

    #[DataProvider('invalidInvites')]
    public function test_invalid_invites_cannot_access_the_packet_or_image(string $route, string $failure): void
    {
        $url = URL::temporarySignedRoute(
            $route,
            $failure === 'expired signature' ? now()->subSecond() : $this->consult->invite_expires_at,
            ['token' => $this->token],
            $failure === 'absolute signature',
        );
        $url = match ($failure) {
            'extended expiry' => str_replace(
                'expires='.$this->consult->invite_expires_at->timestamp,
                'expires='.now()->addYear()->timestamp,
                $url,
            ),
            'tampered signature' => preg_replace('/signature=./', 'signature=x', $url),
            'tampered token' => str_replace($this->token, 'different-token', $url),
            'extra query' => $url.'&extra=untrusted',
            'unsigned' => preg_replace('/&signature=[^&]+/', '', $url),
            default => $url,
        };
        $attributes = match ($failure) {
            'expired record' => ['invite_expires_at' => now()->subSecond()],
            'revoked' => ['invite_revoked_at' => now()],
            'completed' => ['consult_status' => ReportReferral::STATUS_COMPLETED],
            'cancelled' => ['consult_status' => ReportReferral::STATUS_CANCELLED],
            'invalid token hash' => ['invite_token_hash' => hash('sha256', 'different-token')],
            'unissued' => ['invite_issued_at' => null],
            default => [],
        };
        if ($attributes !== []) {
            $this->consult->update($attributes);
        }

        $this->getJson($url)->assertForbidden();
        $this->consult->refresh();
        $this->assertSame(0, $this->consult->invite_access_count);
        $this->assertNull($this->consult->invite_first_accessed_at);
        $this->assertNull($this->consult->invite_last_accessed_at);
    }

    public static function inviteRoutes(): array
    {
        return [
            'show' => ['api.v1.consult-invites.show'],
            'image' => ['api.v1.consult-invites.image'],
        ];
    }

    public static function invalidInvites(): array
    {
        $cases = [];
        foreach (self::inviteRoutes() as $name => [$route]) {
            foreach ([
                'expired signature',
                'extended expiry',
                'tampered signature',
                'tampered token',
                'extra query',
                'unsigned',
                'absolute signature',
                'expired record',
                'revoked',
                'completed',
                'cancelled',
                'invalid token hash',
                'unissued',
            ] as $failure) {
                $cases[$name.': '.$failure] = [$route, $failure];
            }
        }

        return $cases;
    }
}
