<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\FarmerInquiry;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class FarmerInquiryTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'A farmer passphrase for tests';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    /** A signed-in farmer's bearer token, with no office session in play. */
    private function farmerToken(?User $farmer = null): array
    {
        $farmer ??= User::factory()->farmer()->create(['password' => self::PASSWORD]);
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email, 'password' => self::PASSWORD, 'device_name' => 'Phone', 'device_id' => 'phone-'.$farmer->id,
        ])->assertOk()->json('token');
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return [$farmer, $token];
    }

    private function asToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function asOffice(User $user): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user, 'web');
    }

    private function photo(string $name = 'leaf.jpg', int $width = 40, int $height = 30): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 30, 120, 40));
        ob_start();
        imagejpeg($image);
        $bytes = (string) ob_get_clean();

        return UploadedFile::fake()->createWithContent($name, $bytes);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'client_uuid' => (string) Str::uuid(),
            'barangay' => 'Aga',
            'landmark' => 'Tabing sapa',
            'concern' => 'spreading',
            'ai_label' => 'smut',
            'ai_confidence_percent' => 91,
            'photos' => [$this->photo()],
        ], $override);
    }

    private function submit(string $token, array $override = [])
    {
        return $this->asToken($token)->post('/api/v1/mobile/farmer/inquiries', $this->payload($override), ['Accept' => 'application/json']);
    }

    public function test_a_farmer_token_carries_the_inquiry_ability_and_the_kill_switch_narrows_it(): void
    {
        [$farmer] = $this->farmerToken();
        $this->assertEqualsCanonicalizing(['account:security', 'farmer:inquiry', 'farmer:advisory'], $farmer->tokens()->firstOrFail()->abilities);

        config(['caneguard.farmer.inquiries_enabled' => false]);
        [$other] = $this->farmerToken(User::factory()->farmer()->create(['password' => self::PASSWORD]));
        $this->assertSame(['account:security', 'farmer:advisory'], $other->tokens()->firstOrFail()->abilities);
    }

    public function test_a_farmer_asks_the_office_to_look_and_the_photo_stays_private(): void
    {
        [$farmer, $token] = $this->farmerToken();

        $response = $this->submit($token)->assertCreated()
            ->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.barangay', 'Aga')
            ->assertJsonCount(1, 'data.photos');
        $inquiry = FarmerInquiry::query()->where('uuid', $response->json('data.uuid'))->firstOrFail();

        $this->assertSame($farmer->id, $inquiry->user_id);
        $stored = $inquiry->photos()->firstOrFail();
        Storage::disk('local')->assertExists($stored->path);
        $this->assertStringStartsNotWith('public', $stored->path);
        $this->asToken($token)->get($response->json('data.photos.0.url'))
            ->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Type', 'image/jpeg');
    }

    public function test_a_retried_upload_returns_the_same_request_instead_of_a_duplicate(): void
    {
        [, $token] = $this->farmerToken();
        $payload = $this->payload();

        $first = $this->asToken($token)->post('/api/v1/mobile/farmer/inquiries', $payload, ['Accept' => 'application/json'])->assertCreated();
        $again = $this->asToken($token)->post('/api/v1/mobile/farmer/inquiries', $payload, ['Accept' => 'application/json'])->assertOk();

        $this->assertSame($first->json('data.uuid'), $again->json('data.uuid'));
        $this->assertSame(1, FarmerInquiry::query()->count());
        $this->assertCount(1, Storage::disk('local')->allFiles('farmer-inquiries'));
    }

    public function test_hostile_photos_are_refused_or_cleaned(): void
    {
        [, $token] = $this->farmerToken();

        // Text dressed as an image.
        $this->submit($token, ['photos' => [UploadedFile::fake()->createWithContent('leaf.jpg', '<?php echo 1;')]])->assertUnprocessable();
        // A real image whose declared name lies about nothing but carries a script after the image data.
        $bytes = $this->photo()->getContent().'<?php system($_GET["c"]); ?>';
        $this->submit($token, ['photos' => [UploadedFile::fake()->createWithContent('leaf.jpg', $bytes)]])->assertCreated();
        $stored = Storage::disk('local')->get(FarmerInquiry::query()->firstOrFail()->photos()->firstOrFail()->path);
        $this->assertStringNotContainsString('<?php', $stored);
        $this->assertNotFalse(getimagesizefromstring($stored));
        // Too large, too many, and an absurd canvas.
        $this->submit($token, ['photos' => [UploadedFile::fake()->createWithContent('big.jpg', str_repeat('a', 5 * 1024 * 1024 + 1))]])->assertUnprocessable();
        $this->submit($token, ['photos' => [$this->photo(), $this->photo(), $this->photo()]])->assertUnprocessable();
        $this->submit($token, ['photos' => [$this->photo('wide.jpg', 8001, 10)]])->assertUnprocessable();
        $this->assertSame(1, FarmerInquiry::query()->count());
    }

    public function test_the_request_is_validated(): void
    {
        [, $token] = $this->farmerToken();

        $this->submit($token, ['barangay' => 'Atlantis'])->assertUnprocessable();
        $this->submit($token, ['ai_label' => 'plague'])->assertUnprocessable();
        $this->submit($token, ['concern' => 'free text'])->assertUnprocessable();
        $this->submit($token, ['photos' => []])->assertUnprocessable();
        $this->submit($token, ['client_uuid' => 'nope'])->assertUnprocessable();
        $this->assertSame(0, FarmerInquiry::query()->count());
    }

    public function test_one_live_request_per_plant_and_a_gentle_weekly_cap(): void
    {
        config(['caneguard.farmer.inquiry_open_cap' => 2]);
        [$farmer, $token] = $this->farmerToken();
        $chain = (string) Str::uuid();

        $first = $this->submit($token, ['scan_chain_uuid' => $chain])->assertCreated();
        $this->submit($token, ['scan_chain_uuid' => $chain])->assertStatus(409)
            ->assertJsonPath('code', 'INQUIRY_ALREADY_OPEN')->assertJsonPath('inquiry_uuid', $first->json('data.uuid'));

        $this->submit($token)->assertCreated();
        $this->submit($token)->assertStatus(429)->assertJsonPath('code', 'INQUIRY_LIMIT');

        // Another farmer is unaffected, and a replied request frees the plant.
        [, $other] = $this->farmerToken(User::factory()->farmer()->create(['password' => self::PASSWORD]));
        $this->submit($other)->assertCreated();
        FarmerInquiry::query()->where('user_id', $farmer->id)->update(['status' => 'replied']);
        $this->submit($token, ['scan_chain_uuid' => $chain])->assertCreated();
    }

    public function test_a_check_again_photo_joins_the_open_request_up_to_two_photos(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');
        $add = fn () => $this->asToken($token)->post("/api/v1/mobile/farmer/inquiries/{$uuid}/photos", ['photo' => $this->photo()], ['Accept' => 'application/json']);

        $add()->assertOk()->assertJsonCount(2, 'data.photos');
        $add()->assertStatus(409)->assertJsonPath('code', 'PHOTO_LIMIT');
        $this->assertCount(2, Storage::disk('local')->allFiles('farmer-inquiries'));

        FarmerInquiry::query()->update(['status' => 'replied']);
        $this->asToken($token)->post("/api/v1/mobile/farmer/inquiries/{$uuid}/photos", ['photo' => $this->photo()], ['Accept' => 'application/json'])
            ->assertStatus(409);
    }

    public function test_farmers_only_see_their_own_requests_and_photos(): void
    {
        [, $mine] = $this->farmerToken();
        [, $theirs] = $this->farmerToken(User::factory()->farmer()->create(['password' => self::PASSWORD]));
        $uuid = $this->submit($mine)->assertCreated()->json('data.uuid');

        $this->asToken($theirs)->getJson("/api/v1/mobile/farmer/inquiries/{$uuid}")->assertNotFound();
        $this->asToken($theirs)->get("/api/v1/mobile/farmer/inquiries/{$uuid}/photos/1")->assertNotFound();
        $this->asToken($theirs)->getJson('/api/v1/mobile/farmer/inquiries')->assertOk()->assertJsonCount(0, 'data');
        $this->asToken($mine)->getJson('/api/v1/mobile/farmer/inquiries')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_an_inspector_token_and_office_cookies_cannot_use_the_farmer_endpoints(): void
    {
        $inspector = User::factory()->fieldReporter()->create(['password' => self::PASSWORD]);
        [, $token] = $this->farmerToken($inspector);

        $this->asToken($token)->getJson('/api/v1/mobile/farmer/inquiries')->assertForbidden();
        $this->asOffice(User::factory()->reviewer()->create())->getJson('/api/v1/mobile/farmer/inquiries')->assertForbidden();
    }

    public function test_the_office_queue_is_for_web_staff_only(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');

        $this->asToken($token)->getJson('/api/v1/farmer-inquiries')->assertStatus(403);
        $this->asOffice(User::factory()->fieldReporter()->create())->getJson('/api/v1/farmer-inquiries')->assertForbidden();
        $this->asOffice(User::factory()->reviewer()->create())->getJson('/api/v1/farmer-inquiries')
            ->assertOk()->assertJsonPath('meta.waiting', 1)->assertJsonPath('data.0.uuid', $uuid)
            ->assertJsonPath('data.0.ai_hint.verified', false)->assertJsonPath('data.0.ai_hint.label', 'smut');
        $this->asOffice(User::factory()->admin()->create())->get("/api/v1/farmer-inquiries/{$uuid}/photos/1")->assertOk();
    }

    public function test_a_reviewer_replies_with_a_validated_advisory_and_the_farmer_reads_it(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');
        $reviewer = User::factory()->reviewer()->create();
        $advisory = Advisory::factory()->validated()->create(['title' => 'Smut care', 'content' => 'Cut and bag affected shoots.']);
        $version = FarmerInquiry::query()->where('uuid', $uuid)->value('lock_version');

        $this->asOffice($reviewer)->postJson("/api/v1/farmer-inquiries/{$uuid}/review", ['expected_lock_version' => $version])
            ->assertOk()->assertJsonPath('data.status', 'reviewing');
        $this->asOffice($reviewer)->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", [
            'expected_lock_version' => $version + 1, 'advisory_uuid' => $advisory->uuid, 'body' => 'Check the nearby plants too.',
        ])->assertOk()->assertJsonPath('data.status', 'replied');

        $reply = $this->asToken($token)->getJson("/api/v1/mobile/farmer/inquiries/{$uuid}")->assertOk()
            ->assertJsonPath('data.status', 'replied')->assertJsonPath('data.replies.0.advisory_title', 'Smut care')
            ->assertJsonPath('data.replies.0.body', 'Check the nearby plants too.')->json('data.replies.0');
        $this->assertArrayNotHasKey('author_name', $reply);
    }

    public function test_only_validated_advisories_and_real_replies_are_accepted(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');
        $reviewer = User::factory()->reviewer()->create();
        $version = FarmerInquiry::query()->where('uuid', $uuid)->value('lock_version');
        $reply = fn (array $data) => $this->asOffice($reviewer)->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", ['expected_lock_version' => $version] + $data);

        $reply(['advisory_uuid' => Advisory::factory()->create()->uuid])->assertUnprocessable();
        $reply(['advisory_uuid' => Advisory::factory()->retired()->create()->uuid])->assertUnprocessable();
        $reply(['advisory_uuid' => (string) Str::uuid()])->assertUnprocessable();
        $reply(['body' => '   '])->assertUnprocessable();
        $this->assertSame('new', FarmerInquiry::query()->firstOrFail()->status);
    }

    public function test_an_advisory_used_in_a_reply_is_archived_and_the_reply_keeps_its_wording(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');
        $reviewer = User::factory()->reviewer()->create();
        $advisory = Advisory::factory()->validated()->create(['title' => 'Smut care', 'content' => 'Cut and bag affected shoots.']);
        $version = FarmerInquiry::query()->where('uuid', $uuid)->value('lock_version');
        $this->asOffice($reviewer)->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", [
            'expected_lock_version' => $version, 'advisory_uuid' => $advisory->uuid,
        ])->assertOk();

        $this->asOffice($reviewer)->deleteJson("/api/v1/advisories/{$advisory->uuid}")
            ->assertOk()->assertExactJson(['data' => ['uuid' => $advisory->uuid, 'deleted' => 'archived']]);
        $this->assertSoftDeleted('advisories', ['id' => $advisory->getKey()]);

        $this->asToken($token)->getJson("/api/v1/mobile/farmer/inquiries/{$uuid}")->assertOk()
            ->assertJsonPath('data.replies.0.advisory_title', 'Smut care')
            ->assertJsonPath('data.replies.0.body', 'Cut and bag affected shoots.');

        [, $otherToken] = $this->farmerToken();
        $otherUuid = $this->submit($otherToken)->assertCreated()->json('data.uuid');
        $otherVersion = FarmerInquiry::query()->where('uuid', $otherUuid)->value('lock_version');
        $this->asOffice($reviewer)->postJson("/api/v1/farmer-inquiries/{$otherUuid}/replies", [
            'expected_lock_version' => $otherVersion, 'advisory_uuid' => $advisory->uuid,
        ])->assertUnprocessable()->assertJsonPath('errors.advisory_uuid.0', Advisory::REMOVED_FROM_LIBRARY_MESSAGE);
    }

    public function test_two_reviewers_cannot_answer_the_same_request_twice(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');
        $version = FarmerInquiry::query()->where('uuid', $uuid)->value('lock_version');
        $first = User::factory()->reviewer()->create();
        $second = User::factory()->admin()->create();

        $this->asOffice($first)->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", ['expected_lock_version' => $version, 'body' => 'First answer'])->assertOk();
        $this->asOffice($second)->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", ['expected_lock_version' => $version, 'body' => 'Second answer'])->assertStatus(409);
        $this->asOffice($second)->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", ['expected_lock_version' => $version + 1, 'body' => 'Late answer'])->assertStatus(409);
        $this->assertSame(1, FarmerInquiry::query()->firstOrFail()->replies()->count());
    }

    public function test_a_request_never_touches_reports_or_the_dashboard(): void
    {
        $admin = User::factory()->admin()->create();
        Report::factory()->count(2)->create();
        $summary = fn () => $this->asOffice($admin)->getJson('/api/v1/dashboard/summary')->assertOk()->json();
        $before = $summary();
        $reports = Report::query()->count();

        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token, ['ai_label' => 'smut'])->assertCreated()->json('data.uuid');
        $this->asOffice(User::factory()->reviewer()->create())->postJson("/api/v1/farmer-inquiries/{$uuid}/replies", [
            'expected_lock_version' => 1, 'body' => 'Thanks, we will advise.',
        ])->assertOk();

        $this->assertSame($reports, Report::query()->count());
        $this->assertSame($before, $summary());
    }

    public function test_the_kill_switch_pauses_farmer_requests_and_leaves_inspector_flows_alone(): void
    {
        [, $token] = $this->farmerToken();
        $uuid = $this->submit($token)->assertCreated()->json('data.uuid');
        config(['caneguard.farmer.inquiries_enabled' => false]);

        $this->submit($token)->assertStatus(503)->assertJsonPath('code', 'FEATURE_PAUSED');
        $this->asToken($token)->getJson('/api/v1/mobile/farmer/inquiries')->assertStatus(503);
        $this->asOffice(User::factory()->reviewer()->create())->getJson('/api/v1/farmer-inquiries')->assertStatus(503);

        $inspector = User::factory()->fieldReporter()->create(['password' => self::PASSWORD]);
        $this->farmerToken($inspector);
        $this->assertNotEmpty($inspector->tokens()->firstOrFail()->abilities);
        $this->assertDatabaseHas('farmer_inquiries', ['uuid' => $uuid]);
    }
}
