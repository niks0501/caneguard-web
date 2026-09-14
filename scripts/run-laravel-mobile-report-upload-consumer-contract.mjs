import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const phpCommand = process.platform === 'win32' ? 'php.exe' : 'php';
const result = spawnSync(
  phpCommand,
  ['artisan', 'test', '--filter=MobileReportUpload(ContractTest|V2)'],
  {
    cwd: path.join(repositoryRoot, 'api'),
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`[consumer] could not start Laravel contract tests: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  console.error(
    `[consumer] Laravel mobile report upload contract tests failed with exit code ${result.status ?? 'unknown'}.`,
  );
  process.exitCode = result.status || 1;
} else {
  console.log(
    '[consumer] PASS Laravel mobile report upload contract tests accepted the v1 and V2 boundaries.',
  );
}
