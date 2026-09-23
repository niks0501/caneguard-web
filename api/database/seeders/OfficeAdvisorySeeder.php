<?php

namespace Database\Seeders;

use App\Models\Advisory;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

class OfficeAdvisorySeeder extends Seeder
{
    /**
     * @var array<int, array{uuid: string, code: string, title: string, content: string}>
     */
    private const ADVISORIES = [
        [
            'uuid' => '5c21f90a-5a40-4d8d-ae35-1275bb3f0001',
            'code' => 'ADV-OFFICE-OPS-001',
            'title' => 'Document and monitor affected rows',
            'content' => 'Mark the affected rows, record the date and visible changes, and revisit the same area to check whether symptoms are spreading. Keep the observations with the case.',
        ],
        [
            'uuid' => '5c21f90a-5a40-4d8d-ae35-1275bb3f0002',
            'code' => 'ADV-OFFICE-OPS-002',
            'title' => 'Clean tools between affected areas',
            'content' => 'Remove plant material from tools and clean them between affected areas. Keep affected material separate from healthy planting material and follow local disposal guidance.',
        ],
        [
            'uuid' => '5c21f90a-5a40-4d8d-ae35-1275bb3f0003',
            'code' => 'ADV-OFFICE-OPS-003',
            'title' => 'Collect field evidence for follow-up',
            'content' => 'Photograph representative affected plants and nearby healthy plants, record the field location and date, and arrange a field inspection if symptoms are unclear or continue to spread.',
        ],
    ];

    public function run(): void
    {
        $reviewer = User::query()
            ->where('email', 'mao@caneguard.test')
            ->firstOrFail();

        foreach (self::ADVISORIES as $index => $advisory) {
            Advisory::query()->updateOrCreate(
                ['code' => $advisory['code']],
                [
                    ...$advisory,
                    'status' => Advisory::STATUS_VALIDATED,
                    'validation_provenance' => 'CaneGuard office operational reference for routine field documentation and follow-up.',
                    'created_by_id' => $reviewer->getKey(),
                    'validated_by_id' => $reviewer->getKey(),
                    'validated_at' => CarbonImmutable::parse('2026-09-01 08:00:00', 'UTC')
                        ->addMinutes($index),
                    'retired_by_id' => null,
                    'retired_at' => null,
                ],
            );
        }
    }
}
