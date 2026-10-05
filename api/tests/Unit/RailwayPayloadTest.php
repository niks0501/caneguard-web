<?php

namespace Tests\Unit;

use App\Contracts\MobileFieldValidationAssignmentContract;
use App\Contracts\MobileFieldValidationCompletionContract;
use App\Contracts\MobileNotificationContract;
use App\Contracts\MobileReportUploadContract;
use App\Contracts\MobileReportUploadV2Contract;
use Illuminate\Foundation\Application;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

class RailwayPayloadTest extends TestCase
{
    #[RunInSeparateProcess]
    public function test_docker_runtime_copies_the_exact_files_at_contract_and_logo_reader_paths(): void
    {
        $root = dirname(__DIR__, 3);
        $runtime = sys_get_temp_dir().'/caneguard-payload-'.bin2hex(random_bytes(6));
        mkdir($runtime.'/var/www/html', 0755, true);
        $docker = file_get_contents($root.'/Dockerfile');
        $docker = substr($docker, strpos($docker, 'AS runtime'));
        $files = [];
        try {
            foreach (explode("\n", $docker) as $line) {
                if (! str_starts_with($line, 'COPY docs/contracts/') && ! str_starts_with($line, 'COPY brand/')) {
                    continue;
                }
                $parts = preg_split('/\s+/', $line);
                array_shift($parts);
                $target = array_pop($parts);
                foreach ($parts as $source) {
                    $destination = $runtime.$target.basename($source);
                    if (! is_dir(dirname($destination))) {
                        mkdir(dirname($destination), 0755, true);
                    }
                    copy($root.'/'.$source, $destination);
                    $files[] = $destination;
                }
            }
            $app = new Application($runtime.'/var/www/html');
            Application::setInstance($app);
            foreach ([
                'mobile-report-upload-v1' => MobileReportUploadContract::class,
                'mobile-report-upload-v2' => MobileReportUploadV2Contract::class,
                'mobile-field-validation-assignment-v1' => MobileFieldValidationAssignmentContract::class,
                'mobile-field-validation-completion-v1' => MobileFieldValidationCompletionContract::class,
                'mobile-notifications-v1' => MobileNotificationContract::class,
            ] as $file => $reader) {
                $this->assertSame(json_decode(file_get_contents($root.'/docs/contracts/'.$file.'.json'), true, 512, JSON_THROW_ON_ERROR), $reader::definition());
            }
            $this->assertSame(file_get_contents($root.'/brand/CaneGuard_logo_flat.svg'), file_get_contents(base_path('../brand/CaneGuard_logo_flat.svg')));
            foreach (['RenderWeeklyReport', 'WeeklyReportGraphics'] as $reader) {
                $this->assertStringContainsString("base_path('../brand/CaneGuard_logo_flat.svg')", file_get_contents($root.'/api/app/Actions/Reports/'.$reader.'.php'));
            }
            $this->assertStringContainsString('COPY api/ ./', $docker);
        } finally {
            Application::setInstance(null);
            foreach ($files as $file) {
                unlink($file);
            }
            foreach (['/var/www/docs/contracts', '/var/www/docs', '/var/www/brand', '/var/www/html', '/var/www', '/var', ''] as $dir) {
                if (is_dir($runtime.$dir)) {
                    rmdir($runtime.$dir);
                }
            }
        }
    }
}
