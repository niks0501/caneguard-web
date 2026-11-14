<?php

declare(strict_types=1);

/**
 * Flag-aware aerial analysis preflight for production deployments.
 *
 * Usage: php scripts/preflight-aerial.php <release-root>
 *
 * Reads the same configuration the application serves (config:cache from the
 * shared .env). When caneguard.aerial.enabled is not true it prints one line
 * and exits 0, changing nothing. When it is true, every piece the synchronous
 * upload path needs must be present, otherwise the exact missing pieces are
 * printed on stderr and the exit status is 1 so the deploy stops before
 * migrations and activation instead of returning 503 to office users later.
 *
 * It runs as the deploy account. It cannot prove PHP-FPM (www-data) can read
 * the model or write storage; docs/production-deployment.md covers that.
 */

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

$release = $argv[1] ?? '';
if ($release === '' || ! is_file($release.'/api/vendor/autoload.php')) {
    fwrite(STDERR, "usage: preflight-aerial.php <release-root> (api/vendor missing)\n");
    exit(2);
}
$release = rtrim($release, '/');

require $release.'/api/vendor/autoload.php';
$app = require $release.'/api/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (config('caneguard.aerial.enabled') !== true) {
    echo "Aerial preflight: CANEGUARD_AERIAL_ANALYSIS_ENABLED is off; nothing to check.\n";
    exit(0);
}

$failures = [];
$fail = static function (string $piece) use (&$failures): void {
    $failures[] = $piece;
};

$python = (string) config('caneguard.aerial.python');
$timeout = max(10, (int) config('caneguard.aerial.timeout_seconds', 60));
$run = static function (array $command) use ($timeout): Process {
    $process = new Process($command);
    $process->setTimeout($timeout);
    try {
        $process->run();
    } catch (Throwable) {
        // A missing executable or timeout surfaces as an unsuccessful process.
    }

    return $process;
};

// 1. Python >= 3.11 at CANEGUARD_AERIAL_PYTHON.
$pythonReady = false;
$version = $run([$python, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
if (! $version->isSuccessful()) {
    $fail("CANEGUARD_AERIAL_PYTHON ('{$python}') cannot be executed; create the venv and set the absolute interpreter path.");
} else {
    $found = trim($version->getOutput());
    if (version_compare($found, '3.11', '<')) {
        $fail("Python {$found} at '{$python}' is too old; Python >= 3.11 is required.");
    } else {
        $pythonReady = true;
        echo "PASS python {$found}\n";
    }
}

// 2. Runtime packages from aerial-inference/requirements.txt.
$packagesReady = false;
if ($pythonReady) {
    $missing = [];
    foreach (['numpy' => 'numpy', 'onnxruntime' => 'onnxruntime', 'PIL' => 'Pillow'] as $module => $package) {
        if (! $run([$python, '-c', "import {$module}"])->isSuccessful()) {
            $missing[] = $package;
        }
    }
    if ($missing !== []) {
        $fail('Python packages missing: '.implode(', ', $missing).". Run: {$python} -m pip install -r aerial-inference/requirements.txt");
    } else {
        $packagesReady = true;
        echo "PASS packages numpy, onnxruntime, Pillow import\n";
    }
}

// 3. Model file exists and matches the pinned SHA-256 (as AnalyzeAerialImage).
$model = config('caneguard.aerial.model_path');
$pinned = config('caneguard.aerial.weights_sha256');
if (! is_string($pinned) || $pinned === '') {
    $file = $release.'/aerial-inference/model.onnx.sha256';
    $pinned = is_file($file) ? (preg_split('/\s+/', trim((string) file_get_contents($file)))[0] ?? '') : '';
}
$pinned = strtolower((string) $pinned);
$modelReady = false;
if (preg_match('/^[0-9a-f]{64}$/', $pinned) !== 1) {
    $fail('No valid pinned SHA-256: set CANEGUARD_AERIAL_WEIGHTS_SHA256 or ship aerial-inference/model.onnx.sha256.');
}
if (! is_string($model) || $model === '') {
    $fail('CANEGUARD_AERIAL_MODEL_PATH is not set.');
} elseif (! is_file($model) || ! is_readable($model)) {
    $fail("Model file '{$model}' is missing or unreadable; stage model.onnx there.");
} elseif (preg_match('/^[0-9a-f]{64}$/', $pinned) === 1) {
    $actual = hash_file('sha256', $model);
    if (! hash_equals($pinned, $actual)) {
        $fail("Model file '{$model}' SHA-256 {$actual} does not match the pinned {$pinned}.");
    } else {
        $modelReady = true;
        echo "PASS model present, SHA-256 matches pin\n";
    }
}

// 4. Private aerial storage directory is writable.
try {
    $storage = Storage::disk('local')->path('aerial');
    if (! is_dir($storage)) {
        $fail("Aerial storage '{$storage}' does not exist; stage it before deploying.");
    } elseif (! is_writable($storage)) {
        $fail("Aerial storage '{$storage}' is not writable.");
    } else {
        echo "PASS storage {$storage} writable\n";
    }
} catch (Throwable $error) {
    $fail('Aerial storage could not be resolved: '.$error::class);
}

// 5. One tiny inference through the exact command the request path runs.
if ($pythonReady && $packagesReady && $modelReady) {
    $work = sys_get_temp_dir().'/aerial-preflight-'.bin2hex(random_bytes(6));
    if (! @mkdir($work, 0700)) {
        $fail("Smoke inference scratch directory '{$work}' cannot be created.");
    } else {
        $image = $work.'/probe.png';
        $mask = $work.'/mask.png';
        $make = $run([$python, '-c', 'import sys; from PIL import Image; Image.new("RGB", (64, 64), (40, 120, 40)).save(sys.argv[1])', $image]);
        if (! $make->isSuccessful() || ! is_file($image)) {
            $fail('Smoke inference could not create its probe image.');
        } else {
            $smoke = $run([
                $python, $release.'/aerial-inference/segment.py',
                '--model', (string) $model, '--image', $image, '--mask-out', $mask, '--sha256', $pinned,
            ]);
            $output = json_decode($smoke->getOutput(), true);
            if (! $smoke->isSuccessful()) {
                $fail('Smoke inference failed: '.trim($smoke->getErrorOutput() ?: 'no output'));
            } elseif (! is_array($output) || ($output['model_sha256'] ?? null) !== $pinned || ! is_file($mask)) {
                $fail('Smoke inference returned an invalid result or no mask.');
            } else {
                echo "PASS smoke inference ({$output['inference_ms']} ms)\n";
            }
        }
        array_map('unlink', glob($work.'/*') ?: []);
        @rmdir($work);
    }
}

if ($failures !== []) {
    fwrite(STDERR, "Aerial analysis is enabled but not ready. Deploy stopped before migrations and activation:\n");
    foreach ($failures as $failure) {
        fwrite(STDERR, " - {$failure}\n");
    }
    fwrite(STDERR, "Stage the missing piece (docs/production-deployment.md, Aerial analysis) or set CANEGUARD_AERIAL_ANALYSIS_ENABLED=false.\n");
    exit(1);
}

echo "PASS aerial preflight\n";
