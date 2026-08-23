<?php

namespace Tests\Feature;

use App\Contracts\MobileReportUploadContract;
use App\Http\Requests\StoreMobileReportRequest;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MobileReportUploadContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_machine_readable_contract_is_complete_and_compiles_to_the_request_boundary(): void
    {
        $contract = MobileReportUploadContract::definition();
        $fields = $contract['fields'];
        $expectedFields = [
            'client_uuid',
            'image',
            'image_source_type',
            'source_width',
            'source_height',
            'predicted_label',
            'confidence',
            'class_scores',
            'symptom_keys',
            'checklist_consistency',
            'reported_severity',
            'mismatch_reported',
            'reporter_suspected_condition',
            'reporter_observation_text',
            'quality_warnings',
            'barangay',
            'farmer_or_farm_owner_name',
            'province',
            'municipality',
            'final_latitude',
            'final_longitude',
            'location_source',
            'gps_accuracy',
            'observed_at',
            'scan_record_client_uuid',
            'sugarcane_variety',
            'crop_age',
            'cane_class',
            'affected_area_hectares',
            'affected_portion_percent',
            'field_notes',
            'model_version',
            'preprocess_ms',
            'inference_ms',
            'total_ms',
            'captured_at',
        ];

        $this->assertSame('caneguard-multipart-contract', $contract['artifact_format']);
        $this->assertSame('mobile-report-upload-v1', $contract['contract']);
        $this->assertSame(1, $contract['version']);
        $this->assertSame('POST', $contract['wire']['method']);
        $this->assertSame('/api/v1/mobile/reports', $contract['wire']['path']);
        $route = app('router')->getRoutes()->match(
            Request::create($contract['wire']['path'], $contract['wire']['method']),
        );
        $this->assertSame($contract['wire']['path'], '/'.$route->uri());
        $this->assertContains($contract['wire']['method'], $route->methods());
        $this->assertSame('multipart/form-data', $contract['wire']['content_type']);
        $this->assertSame('ignored', $contract['wire']['undeclared_fields']);
        $this->assertSame($expectedFields, array_keys($fields));
        $this->assertSame(
            'class_scores[{key}]',
            $fields['class_scores']['wire_name_template'],
        );
        $this->assertSame('symptom_keys[]', $fields['symptom_keys']['wire_name_template']);
        $this->assertSame(
            'quality_warnings[]',
            $fields['quality_warnings']['wire_name_template'],
        );
        $this->assertSame(
            [
                'client_uuid',
                'image',
                'image_source_type',
                'predicted_label',
                'confidence',
                'class_scores',
                'symptom_keys',
                'checklist_consistency',
                'barangay',
                'model_version',
                'preprocess_ms',
                'inference_ms',
                'total_ms',
                'captured_at',
            ],
            array_keys(array_filter(
                $fields,
                fn (array $field): bool => $field['required'] === true,
            )),
        );

        foreach ($fields as $name => $field) {
            $this->assertArrayHasKey('wire_type', $field, $name);
            $this->assertArrayHasKey('type', $field, $name);
            $this->assertArrayHasKey('required', $field, $name);
            $this->assertArrayHasKey('nullable', $field, $name);
        }

        $image = $fields['image'];
        $this->assertSame(10485760, $image['max_bytes']);
        $this->assertSame(
            ['jpg', 'jpeg', 'png', 'webp'],
            array_merge(...array_map(
                fn (array $format): array => $format['extensions'],
                $image['formats'],
            )),
        );
        $this->assertSame(
            ['image/jpeg', 'image/png', 'image/webp'],
            array_merge(...array_map(
                fn (array $format): array => $format['mime_types'],
                $image['formats'],
            )),
        );
        $this->assertSame(
            ['source_width', 'source_height'],
            $image['metadata']['client_declared_fields'],
        );
        $this->assertSame(
            'image_size_bytes',
            $image['metadata']['server_derived_fields']['size_bytes']['persistence_column'],
        );
        $this->assertSame(
            [Report::LABEL_HEALTHY, Report::LABEL_MOSAIC, Report::LABEL_RUST],
            Report::labels(),
        );
        $this->assertSame($fields['predicted_label']['enum'], Report::labels());
        $this->assertArrayHasKey('same_major_compatible_widening', $contract['versioning']);
        $this->assertArrayHasKey('new_major_required', $contract['versioning']);

        $request = StoreMobileReportRequest::create(
            '/api/v1/mobile/reports',
            'POST',
        );
        $compiledFields = array_values(array_filter(
            array_keys($request->rules()),
            fn (string $name): bool => ! str_contains($name, '.'),
        ));

        $this->assertSame($expectedFields, $compiledFields);
    }

    public function test_declared_text_boundaries_are_accepted_and_the_next_character_is_rejected(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();
        $fields = MobileReportUploadContract::definition()['fields'];
        $boundedFields = array_keys(array_filter(
            $fields,
            fn (array $field): bool => $field['type'] === 'string'
                && array_key_exists('max_length', $field),
        ));

        foreach ($boundedFields as $field) {
            $maximum = $fields[$field]['max_length'];

            $this->postUpload($token, [
                $field => str_repeat('x', $maximum),
            ])->assertCreated();
        }

        foreach ($boundedFields as $field) {
            $maximum = $fields[$field]['max_length'];

            $this->postUpload($token, [
                $field => str_repeat('x', $maximum + 1),
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->assertDatabaseCount('reports', count($boundedFields));
    }

    public function test_declared_image_formats_and_the_exact_10_mib_boundary_are_enforced(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();
        $image = MobileReportUploadContract::field('image');

        foreach ($image['formats'] as $format) {
            foreach ($format['extensions'] as $extension) {
                $this->postUpload($token, [
                    'image' => UploadedFile::fake()->image("leaf.{$extension}", 1, 1)
                        ->size(1),
                ])
                    ->assertCreated()
                    ->assertJsonPath(
                        'data.image.mime_type',
                        $format['mime_types'][0],
                    );
            }
        }

        $maximumBytes = $image['max_bytes'];
        $maximumKilobytes = intdiv($maximumBytes, 1024);
        $atMaximum = $this->postUpload($token, [
            'image' => UploadedFile::fake()->image('leaf.png', 1, 1)
                ->size($maximumKilobytes),
        ])->assertCreated();

        $this->assertSame($maximumBytes, $atMaximum->json('data.image.size_bytes'));

        $this->postUpload($token, [
            'image' => UploadedFile::fake()->image('leaf.png', 1, 1)
                ->size($maximumKilobytes + 1),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('image');

        $this->assertDatabaseCount('reports', 5);
    }

    public function test_declared_image_contract_rejects_unsupported_formats_and_invalid_content(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();

        foreach (['gif', 'heic', 'heif', 'avif'] as $extension) {
            $this->postUpload($token, [
                'image' => UploadedFile::fake()->create(
                    "leaf.{$extension}",
                    1,
                    "image/{$extension}",
                ),
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('image');
        }

        $this->postUpload($token, [
            'image' => UploadedFile::fake()
                ->createWithContent('leaf.png', 'not an image')
                ->mimeType('text/plain'),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('image');

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_declared_date_time_fields_reject_date_only_values(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();

        foreach (['captured_at', 'observed_at'] as $field) {
            $this->postUpload($token, [
                $field => '2026-07-20',
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_declared_required_uuid_enum_and_array_boundaries_are_enforced(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();
        $fields = MobileReportUploadContract::definition()['fields'];

        foreach (array_keys(array_filter(
            $fields,
            fn (array $field): bool => $field['required'] === true,
        )) as $field) {
            $payload = $this->payload();
            unset($payload[$field]);

            $this->postUpload($token, payload: $payload)
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        foreach (['client_uuid', 'scan_record_client_uuid'] as $field) {
            $this->postUpload($token, [
                $field => 'not-a-uuid',
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        foreach (['image_source_type', 'predicted_label', 'location_source'] as $field) {
            $this->postUpload($token, [
                $field => 'not-in-v1',
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->postUpload($token, [
            'class_scores' => [
                'healthy' => 0.5,
                'mosaic' => 0.5,
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('class_scores');

        $this->postUpload($token, [
            'symptom_keys' => [],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('symptom_keys');

        $this->postUpload($token, [
            'symptom_keys' => ['rust', 'rust'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('symptom_keys.1');

        $this->postUpload($token, [
            'quality_warnings' => ['not-in-v1'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('quality_warnings.0');

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_declared_numeric_boundaries_are_accepted_and_just_outside_them_are_rejected(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();
        $fields = MobileReportUploadContract::definition()['fields'];

        $accepted = [
            ['confidence', $fields['confidence']['minimum']],
            ['confidence', $fields['confidence']['maximum']],
            ['source_width', $fields['source_width']['minimum']],
            ['source_width', $fields['source_width']['maximum']],
            ['source_height', $fields['source_height']['minimum']],
            ['source_height', $fields['source_height']['maximum']],
            ['affected_area_hectares', 0.01],
            [
                'affected_portion_percent',
                $fields['affected_portion_percent']['minimum'],
            ],
            [
                'affected_portion_percent',
                $fields['affected_portion_percent']['maximum'],
            ],
            ['preprocess_ms', $fields['preprocess_ms']['minimum']],
            ['preprocess_ms', $fields['preprocess_ms']['maximum']],
            ['inference_ms', $fields['inference_ms']['minimum']],
            ['inference_ms', $fields['inference_ms']['maximum']],
            ['total_ms', $fields['total_ms']['minimum']],
            ['total_ms', $fields['total_ms']['maximum']],
        ];

        foreach ($accepted as [$field, $value]) {
            $this->postUpload($token, [$field => $value])->assertCreated();
        }

        $rejected = [
            ['confidence', -0.01],
            ['confidence', 1.01],
            ['source_width', 0],
            ['source_width', 50001],
            ['source_height', 0],
            ['source_height', 50001],
            ['affected_area_hectares', 0],
            ['affected_portion_percent', -0.01],
            ['affected_portion_percent', 100.01],
            ['preprocess_ms', -0.01],
            ['preprocess_ms', 1000000000],
            ['inference_ms', -0.01],
            ['inference_ms', 1000000000],
            ['total_ms', -0.01],
            ['total_ms', 1000000000],
        ];

        foreach ($rejected as [$field, $value]) {
            $this->postUpload($token, [$field => $value])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->assertDatabaseCount('reports', count($accepted));
    }

    public function test_declared_class_score_boundaries_are_accepted_and_just_outside_them_are_rejected(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();
        $classScores = MobileReportUploadContract::field('class_scores');
        $minimum = $classScores['values']['minimum'];
        $maximum = $classScores['values']['maximum'];
        $accepted = 0;

        foreach ($classScores['required_keys'] as $label) {
            foreach ([$minimum, $maximum] as $value) {
                $scores = array_fill_keys($classScores['required_keys'], 0.5);
                $scores[$label] = $value;

                $this->postUpload($token, [
                    'class_scores' => $scores,
                ])->assertCreated();
                $accepted++;
            }
        }

        foreach ($classScores['required_keys'] as $label) {
            foreach ([$minimum - 0.01, $maximum + 0.01] as $value) {
                $scores = array_fill_keys($classScores['required_keys'], 0.5);
                $scores[$label] = $value;

                $this->postUpload($token, [
                    'class_scores' => $scores,
                ])
                    ->assertUnprocessable()
                    ->assertJsonValidationErrors("class_scores.{$label}");
            }
        }

        $this->assertDatabaseCount('reports', $accepted);
    }

    public function test_declared_coordinate_boundaries_and_conditional_location_rules_are_enforced(): void
    {
        Storage::fake('local');
        $token = $this->fieldReporterToken();
        $fields = MobileReportUploadContract::definition()['fields'];
        $latitude = $fields['final_latitude'];
        $longitude = $fields['final_longitude'];

        foreach ([
            [
                'final_latitude' => $latitude['minimum'],
                'final_longitude' => $longitude['minimum'],
            ],
            [
                'final_latitude' => $latitude['maximum'],
                'final_longitude' => $longitude['maximum'],
            ],
        ] as $location) {
            $this->postUpload($token, array_merge($location, [
                'location_source' => 'manual_map',
            ]))->assertCreated();
        }

        $this->postUpload($token, [
            'final_latitude' => $latitude['minimum'] - 0.01,
            'final_longitude' => 0,
            'location_source' => 'manual_map',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('final_latitude');

        $this->postUpload($token, [
            'final_latitude' => 0,
            'final_longitude' => $longitude['maximum'] + 0.01,
            'location_source' => 'manual_map',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('final_longitude');

        foreach ([
            [['final_latitude' => 10], 'final_longitude'],
            [['final_longitude' => 120], 'final_latitude'],
            [['location_source' => 'manual_map'], 'final_latitude'],
            [['gps_accuracy' => 4], 'gps_accuracy'],
            [['location_source' => 'gps'], 'gps_accuracy'],
            [[
                'final_latitude' => 10,
                'final_longitude' => 120,
                'location_source' => 'manual_map',
                'gps_accuracy' => 4,
            ], 'gps_accuracy'],
        ] as [$overrides, $errorField]) {
            $this->postUpload($token, $overrides)
                ->assertUnprocessable()
                ->assertJsonValidationErrors($errorField);
        }

        $this->postUpload($token, [
            'final_latitude' => 10,
            'final_longitude' => 120,
            'location_source' => 'gps',
            'gps_accuracy' => $fields['gps_accuracy']['minimum'],
        ])->assertCreated();

        $this->postUpload($token, [
            'final_latitude' => 10,
            'final_longitude' => 120,
            'location_source' => 'gps',
            'gps_accuracy' => -0.01,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('gps_accuracy');

        $this->assertDatabaseCount('reports', 3);
    }

    private function fieldReporterToken(): string
    {
        return User::factory()
            ->fieldReporter()
            ->create()
            ->createToken('mobile-upload-contract-test')
            ->plainTextToken;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function postUpload(string $token, array $overrides = [], ?array $payload = null)
    {
        return $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $payload ?? $this->payload($overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        $image = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            strict: true,
        );

        return array_merge([
            'client_uuid' => fake()->uuid(),
            'image' => UploadedFile::fake()->createWithContent('leaf.png', $image),
            'image_source_type' => 'camera',
            'source_width' => 1,
            'source_height' => 1,
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.82,
            'class_scores' => [
                'healthy' => 0.08,
                'mosaic' => 0.10,
                'rust' => 0.82,
            ],
            'symptom_keys' => ['rust'],
            'checklist_consistency' => 'consistent',
            'reported_severity' => 'moderate',
            'quality_warnings' => ['low-resolution'],
            'barangay' => 'Mabini',
            'model_version' => 'caneguard-mobile-v1.0.0',
            'preprocess_ms' => 12.5,
            'inference_ms' => 95.75,
            'total_ms' => 122.25,
            'captured_at' => '2026-07-20T10:00:00.456+08:00',
        ], $overrides);
    }
}
