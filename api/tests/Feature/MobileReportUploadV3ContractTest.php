<?php

namespace Tests\Feature;

use App\Contracts\MobileReportUploadV2Contract;
use App\Contracts\MobileReportUploadV3Contract;
use App\Http\Requests\StoreMobileReportV3Request;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class MobileReportUploadV3ContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_v3_artifact_is_v2_plus_the_survey_link_and_the_declared_widenings_only(): void
    {
        $v2 = MobileReportUploadV2Contract::definition();
        $v3 = MobileReportUploadV3Contract::definition();

        $this->assertSame('mobile-report-upload-v3', $v3['contract']);
        $this->assertSame(3, $v3['version']);
        $this->assertSame('/api/v3/mobile/reports', $v3['wire']['path']);

        $survey = $v3['fields']['field_survey_client_uuid'];
        $this->assertSame('uuid', $survey['type']);
        $this->assertFalse($survey['required']);
        $this->assertTrue($survey['nullable']);

        // Same-major widening: optional plot area and a measured affected area of 0.
        $added = ['field_survey_client_uuid', 'plot_area_hectares', 'plot_area_measurement'];
        foreach (['plot_area_hectares', 'plot_area_measurement'] as $name) {
            $this->assertFalse($v3['fields'][$name]['required'], "{$name} must stay optional");
        }
        $this->assertSame(0, $v3['fields']['affected_area_hectares']['minimum']);
        $this->assertArrayNotHasKey('exclusive_minimum', $v3['fields']['affected_area_hectares']);

        $fields = $v3['fields'];
        $expected = $v2['fields'];
        foreach ($added as $name) {
            unset($fields[$name]);
        }
        foreach (['description'] as $documentation) {
            unset($fields['affected_area_hectares'][$documentation]);
        }
        unset($expected['affected_area_hectares']['exclusive_minimum']);
        $expected['affected_area_hectares']['minimum'] = 0;
        $this->assertEquals($expected, $fields);

        $client = $v3['authority']['client_owned'];
        $this->assertEqualsCanonicalizing(
            $v2['authority']['client_owned'],
            array_values(array_diff($client, $added)),
        );
        $this->assertSame($v2['authority']['server_derived'], $v3['authority']['server_derived']);
        $this->assertSame($v2['authority']['server_owned_read_only'], $v3['authority']['server_owned_read_only']);
    }

    public function test_v3_request_compiles_every_declared_field_and_routes_to_the_declared_path(): void
    {
        $contract = MobileReportUploadV3Contract::definition();
        $request = StoreMobileReportV3Request::create('/api/v3/mobile/reports', 'POST');
        $compiled = array_values(array_filter(
            array_keys($request->rules()),
            fn (string $name): bool => ! str_contains($name, '.'),
        ));
        $this->assertSame(array_keys($contract['fields']), $compiled);

        $route = app('router')->getRoutes()->match(
            Request::create($contract['wire']['path'], $contract['wire']['method']),
        );
        $this->assertSame($contract['wire']['path'], '/'.$route->uri());
    }
}
