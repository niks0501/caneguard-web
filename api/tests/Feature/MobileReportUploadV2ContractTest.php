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

    public function test_v2_artifact_compiles_conditional_model_keys_and_client_only_write_boundary(): void
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
            $contract['fields']['class_scores']['conditions'][0]['required_keys'],
        );
        $this->assertSame(
            4,
            $contract['fields']['class_scores']['min_properties'],
        );
        $this->assertArrayNotHasKey('max_properties', $contract['fields']['class_scores']);
        $this->assertTrue($contract['fields']['class_scores']['additional_properties']);
        $this->assertContains(
            'smut',
            $contract['fields']['symptom_keys']['items']['enum'],
        );
        $this->assertSame(
            ['v1.0-mobilenetv2'],
            $contract['fields']['model_version']['known_values'],
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
        $clientFields = $contract['authority']['client_owned'];
        sort($clientFields);
        $acceptedFields = $compiledFields;
        sort($acceptedFields);
        $this->assertSame($acceptedFields, $clientFields);
        foreach (array_merge($contract['authority']['server_derived'], $contract['authority']['server_owned_read_only']) as $field) {
            $this->assertNotContains($field, $compiledFields);
        }

        $route = app('router')->getRoutes()->match(
            Request::create($contract['wire']['path'], $contract['wire']['method']),
        );
        $this->assertSame($contract['wire']['path'], '/'.$route->uri());
        $this->assertContains($contract['wire']['method'], $route->methods());
    }
}
