<?php

namespace Tests\Feature;

use App\Contracts\MobileReportUploadV2Contract;
use App\Http\Requests\StoreMobileReportV2Request;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class MobileReportUploadV2ContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_v2_artifact_compiles_to_the_four_class_request_boundary(): void
    {
        $contract = MobileReportUploadV2Contract::definition();

        $this->assertSame('caneguard-multipart-contract', $contract['artifact_format']);
        $this->assertSame('mobile-report-upload-v2', $contract['contract']);
        $this->assertSame(2, $contract['version']);
        $this->assertSame('POST', $contract['wire']['method']);
        $this->assertSame('/api/v2/mobile/reports', $contract['wire']['path']);
        $this->assertSame(
            ['healthy', 'mosaic', 'rust', 'smut'],
            $contract['fields']['predicted_label']['enum'],
        );
        $this->assertSame(
            ['healthy', 'mosaic', 'rust', 'smut'],
            $contract['fields']['class_scores']['required_keys'],
        );
        $this->assertSame(
            4,
            $contract['fields']['class_scores']['min_properties'],
        );
        $this->assertSame(
            4,
            $contract['fields']['class_scores']['max_properties'],
        );
        $this->assertContains(
            'smut',
            $contract['fields']['symptom_keys']['items']['enum'],
        );
        $this->assertSame(
            ['v1.0-mobilenetv2'],
            $contract['fields']['model_version']['enum'],
        );

        $request = StoreMobileReportV2Request::create(
            '/api/v2/mobile/reports',
            'POST',
        );
        $compiledFields = array_values(array_filter(
            array_keys($request->rules()),
            fn (string $name): bool => ! str_contains($name, '.'),
        ));
        $this->assertSame(array_keys($contract['fields']), $compiledFields);

        $route = app('router')->getRoutes()->match(
            Request::create($contract['wire']['path'], $contract['wire']['method']),
        );
        $this->assertSame($contract['wire']['path'], '/'.$route->uri());
        $this->assertContains($contract['wire']['method'], $route->methods());
    }
}
