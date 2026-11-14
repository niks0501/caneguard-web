<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Proposal tests for scripts/preflight-aerial.php, the deploy-time gate that
 * stops an aerial-enabled release before migrations when Python, the model
 * or storage are not staged. No model runs here; only the refusal paths and
 * the flag-off no-op are exercised.
 */
class AerialDeployPreflightTest extends TestCase
{
    /**
     * @param  array<string, string>  $env
     */
    private function preflight(array $env): Process
    {
        $process = new Process(
            [PHP_BINARY, base_path('../scripts/preflight-aerial.php'), base_path('..')],
            null,
            $env + ['CANEGUARD_AERIAL_ANALYSIS_ENABLED' => 'true'],
        );
        $process->setTimeout(60);
        $process->run();

        return $process;
    }

    public function test_flag_off_changes_nothing_and_passes(): void
    {
        $run = $this->preflight([
            'CANEGUARD_AERIAL_ANALYSIS_ENABLED' => 'false',
            'CANEGUARD_AERIAL_PYTHON' => '/nonexistent/python',
        ]);

        $this->assertSame(0, $run->getExitCode());
        $this->assertStringContainsString('nothing to check', $run->getOutput());
        $this->assertSame('', $run->getErrorOutput());
    }

    public function test_flag_on_without_python_or_model_fails_naming_each_piece(): void
    {
        $run = $this->preflight([
            'CANEGUARD_AERIAL_PYTHON' => '/nonexistent/python',
            'CANEGUARD_AERIAL_MODEL_PATH' => '/nonexistent/model.onnx',
        ]);

        $this->assertSame(1, $run->getExitCode());
        $this->assertStringContainsString("CANEGUARD_AERIAL_PYTHON ('/nonexistent/python') cannot be executed", $run->getErrorOutput());
        $this->assertStringContainsString("Model file '/nonexistent/model.onnx' is missing", $run->getErrorOutput());
    }

    public function test_flag_on_with_unset_model_path_fails(): void
    {
        $run = $this->preflight(['CANEGUARD_AERIAL_MODEL_PATH' => '']);

        $this->assertSame(1, $run->getExitCode());
        $this->assertStringContainsString('CANEGUARD_AERIAL_MODEL_PATH is not set', $run->getErrorOutput());
    }

    public function test_flag_on_with_model_that_does_not_match_the_pin_fails(): void
    {
        $model = tempnam(sys_get_temp_dir(), 'aerial-model-');
        file_put_contents($model, 'not the pinned model');

        try {
            $run = $this->preflight(['CANEGUARD_AERIAL_MODEL_PATH' => $model]);
        } finally {
            unlink($model);
        }

        $this->assertSame(1, $run->getExitCode());
        $this->assertStringContainsString('does not match the pinned', $run->getErrorOutput());
    }
}
