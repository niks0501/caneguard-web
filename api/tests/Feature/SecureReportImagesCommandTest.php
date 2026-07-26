<?php

namespace Tests\Feature;

use App\Models\Report;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SecureReportImagesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_copies_verifies_and_removes_legacy_public_images(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $link = storage_path('framework/testing/caneguard-public-link');
        if (is_link($link)) {
            unlink($link);
        }
        symlink(Storage::disk('public')->path(''), $link);
        config([
            'caneguard.legacy_public_storage_link' => $link,
        ]);
        $report = Report::factory()->create([
            'image_path' => 'reports/legacy-image.png',
        ]);
        Storage::disk('public')->put(
            $report->image_path,
            'legacy-image-content',
        );

        $this->artisan('reports:secure-images')
            ->assertSuccessful();

        Storage::disk('local')->assertExists($report->image_path);
        Storage::disk('public')->assertExists($report->image_path);
        $this->assertSame(
            Storage::disk('public')->get($report->image_path),
            Storage::disk('local')->get($report->image_path),
        );

        $this->artisan('reports:secure-images', ['--remove-public' => true])
            ->assertSuccessful();

        Storage::disk('local')->assertExists($report->image_path);
        Storage::disk('public')->assertMissing($report->image_path);
        $this->assertFalse(is_link($link));
    }

    public function test_command_does_not_remove_anything_when_an_image_is_missing(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $verified = Report::factory()->create([
            'image_path' => 'reports/verified.png',
        ]);
        Report::factory()->create([
            'image_path' => 'reports/missing.png',
        ]);
        Storage::disk('local')->put($verified->image_path, 'verified');
        Storage::disk('public')->put($verified->image_path, 'verified');

        $this->artisan('reports:secure-images', ['--remove-public' => true])
            ->assertFailed();

        Storage::disk('public')->assertExists($verified->image_path);
    }

    public function test_command_refuses_a_foreign_link_before_public_deletion(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $link = storage_path('framework/testing/caneguard-foreign-link');
        $foreign = storage_path('framework/testing/caneguard-foreign-target');
        if (is_link($link)) {
            unlink($link);
        }
        if (! is_dir($foreign)) {
            mkdir($foreign, 0777, true);
        }
        symlink($foreign, $link);
        config(['caneguard.legacy_public_storage_link' => $link]);
        $report = Report::factory()->create([
            'image_path' => 'reports/still-public.png',
        ]);
        Storage::disk('local')->put($report->image_path, 'same-content');
        Storage::disk('public')->put($report->image_path, 'same-content');

        try {
            $this->artisan(
                'reports:secure-images',
                ['--remove-public' => true],
            )->assertFailed();

            Storage::disk('public')->assertExists($report->image_path);
            $this->assertTrue(is_link($link));
        } finally {
            if (is_link($link)) {
                unlink($link);
            }
        }
    }
}
