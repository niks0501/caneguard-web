#!/usr/bin/env node

import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readMobileFieldValidationAssignmentArtifact } from './validate-mobile-field-validation-assignment-v1.mjs';
import { readMobileFieldValidationCompletionArtifact } from './validate-mobile-field-validation-completion-v1.mjs';
import { readMobileNotificationsArtifact } from './validate-mobile-notifications-v1.mjs';
import { readMobileReportUploadArtifact } from './validate-mobile-report-upload-v1.mjs';
import { readReportLifecycleArtifact } from './validate-report-lifecycle-v1.mjs';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const API_SOURCE = path.join(REPOSITORY_ROOT, 'api');
const CONTRACT_ARTIFACTS = [
  {
    relativePath: 'docs/contracts/mobile-report-upload-v1.json',
    reader: readMobileReportUploadArtifact,
  },
  {
    relativePath: 'docs/contracts/mobile-field-validation-assignment-v1.json',
    reader: readMobileFieldValidationAssignmentArtifact,
  },
  {
    relativePath: 'docs/contracts/mobile-field-validation-completion-v1.json',
    reader: readMobileFieldValidationCompletionArtifact,
  },
  {
    relativePath: 'docs/contracts/mobile-notifications-v1.json',
    reader: readMobileNotificationsArtifact,
  },
  {
    relativePath: 'docs/contracts/report-lifecycle-v1.json',
    reader: readReportLifecycleArtifact,
  },
];
const DEFAULT_EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  'docs/evidence/phase1-lifecycle/local-stack-acceptance.json',
);
const HOST = '127.0.0.1';
const REPORT_CLIENT_UUID = '30000000-0000-4000-8000-000000000058';
const REPORT_SCAN_CLIENT_UUID = '40000000-0000-4000-8000-000000000058';
const FIELD_PASSWORD = `phase1-${randomBytes(24).toString('hex')}`;
const REVIEWER_PASSWORD = `phase1-${randomBytes(24).toString('hex')}`;
const ADMIN_PASSWORD = `phase1-${randomBytes(24).toString('hex')}`;
const MOBILE_TEST_PATH = 'src/features/lifecycle/__tests__/phase1LifecycleAcceptance.test.ts';

export class Phase1AcceptanceError extends Error {
  constructor(message) {
    super(`[acceptance] ${message}`);
    this.name = 'Phase1AcceptanceError';
    this.category = 'local-stack';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.output ?? process.env.PHASE1_EVIDENCE_PATH ?? DEFAULT_EVIDENCE_PATH);
  const mobileDir = resolveMobileDirectory(args.mobileDir ?? process.env.MOBILE_REPO_DIR);
  const startedAt = new Date().toISOString();
  const steps = [];
  const mobileRevision = mobileDir ? gitRevision(mobileDir) : null;
  const mobileWorktreeDirty = mobileDir ? gitDirty(mobileDir) : null;
  const mobileDependenciesAvailable = mobileDir
    ? existsSync(path.join(mobileDir, 'node_modules/.bin/jest'))
    : false;
  const trustedContractGate = !mobileDir
    ? 'not_run_no_mobile_checkout'
    : mobileWorktreeDirty
      ? 'not_run_pending_clean_mobile_commit'
      : mobileDependenciesAvailable
        ? 'not_run_pending_trusted_producer_execution'
        : 'blocked_mobile_dependencies';
  const evidence = {
    schema: 'caneguard.phase1-lifecycle-evidence',
    schema_version: 1,
    evidence_class: 'automated_local_stack',
    status: 'FAIL',
    started_at: startedAt,
    completed_at: null,
    web_revision: gitRevision(REPOSITORY_ROOT),
    web_worktree_dirty: gitDirty(REPOSITORY_ROOT),
    mobile_revision: mobileRevision,
    mobile_worktree_dirty: mobileWorktreeDirty,
    mobile_dependencies_available: mobileDependenciesAvailable,
    stack: {
      api: 'Laravel HTTP server',
      database: 'temporary SQLite database',
      transport: 'Mobile-shaped HTTP requests from Node fetch',
    },
    physical_device: false,
    device_automation: 'not_run',
    trusted_contract_gate: trustedContractGate,
    simulated_boundaries: [
      'Mobile authentication and HTTP transport are simulated by this Node harness.',
      'The optional Mobile SQLite reopen seam uses a temporary file; this API flow does not exercise a physical app process restart.',
      'No Android or iOS runtime, physical device, production service, or remote network is exercised.',
    ],
    contract_artifacts: [],
    steps,
    limitations: [
      'This artifact is automated local-stack evidence only and must not be reported as physical-device or device-flow evidence.',
      'Mobile device acceptance remains a separate handoff after the local stack and trusted contract gates pass.',
      'The Mobile app seam test is run only when an existing Mobile node_modules installation is available; this harness never installs dependencies.',
      'A dirty working tree is local development evidence only; trusted gates require exact clean committed revisions.',
      'The trusted cross-repository producer gate remains separate from this local-stack harness and requires the pinned clean Mobile revision plus installed Mobile Jest dependencies.',
    ],
  };

  let tempRoot = null;
  let server = null;
  let apiBaseUrl = null;
  let mobileToken = null;
  let reviewerCookies = null;
  let report = null;
  let assignment = null;
  let completion = null;

  try {
    await runStep(steps, 'canonical contract artifacts', async () => {
      const definitions = await Promise.all(
        CONTRACT_ARTIFACTS.map(({ relativePath, reader }) => reader(
          path.join(REPOSITORY_ROOT, relativePath),
        )),
      );
      evidence.contract_artifacts = CONTRACT_ARTIFACTS.map(({ relativePath }, index) => (
        artifactEvidence(relativePath, definitions[index])
      ));
      return 'All linked v1 artifacts passed structural validation.';
    });

    await runStep(steps, 'Mobile source artifact alignment', async () => {
      if (!mobileDir) return { status: 'SKIPPED', details: 'No Mobile checkout supplied.' };
      const paths = CONTRACT_ARTIFACTS.map(({ relativePath }) => ({
        web: path.join(REPOSITORY_ROOT, relativePath),
        mobile: path.join(mobileDir, 'references', path.basename(relativePath)),
      }));
      if (paths.some(({ mobile }) => !existsSync(mobile))) {
        return {
          status: 'SKIPPED',
          details: 'Mobile checkout did not contain every linked reference artifact.',
        };
      }
      const contents = await Promise.all(paths.flatMap(({ web, mobile }) => [
        readFile(web),
        readFile(mobile),
      ]));
      for (let index = 0; index < contents.length; index += 2) {
        if (!contents[index].equals(contents[index + 1])) {
          throw new Phase1AcceptanceError(
            'Mobile reference artifacts differ from the Web-owned canonical artifacts.',
          );
        }
      }
      return `All Mobile reference artifacts match (${gitRevision(mobileDir)}).`;
    });

    tempRoot = await createTemporaryApi();
    server = await startLocalApi(tempRoot);
    apiBaseUrl = server.baseUrl;
    await runStep(steps, 'local API health and seeded users', async () => {
      const health = await waitForJson(`${apiBaseUrl}/api/health`, (result) => (
        result.response.status === 200
        && result.body?.data?.status === 'ok'
        && result.body?.data?.checks?.database === 'ready'
        && result.body?.data?.checks?.storage === 'ready'
      ));
      if (!health) throw new Phase1AcceptanceError('The local API did not become healthy.');
      return 'Temporary SQLite database and seeded demo users are ready.';
    });

    await runStep(steps, 'Mobile report submission', async () => {
      const login = await requestJson(`${apiBaseUrl}/api/v1/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'field@caneguard.test',
          password: FIELD_PASSWORD,
          device_name: 'phase1-local-stack',
        }),
      });
      assertResponse(login, 200, 'Mobile login');
      mobileToken = login.body?.token;
      if (typeof mobileToken !== 'string' || mobileToken.length === 0) {
        throw new Phase1AcceptanceError('Mobile login did not return a bearer token.');
      }

      const form = await buildReportForm(tempRoot);
      const upload = await requestJson(`${apiBaseUrl}/api/v1/mobile/reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mobileToken}` },
        body: form,
      });
      assertResponse(upload, [200, 201], 'Mobile report upload');
      report = upload.body?.data;
      assertLifecycle(report?.lifecycle, {
        case_state: 'open',
        verification_outcome: 'not_determined',
        field_validation_state: 'unassigned',
        referral_state: 'not_referred',
      }, 'submitted report');
      if (report?.identity?.client_uuid !== REPORT_CLIENT_UUID) {
        throw new Phase1AcceptanceError('Mobile report upload did not preserve client_uuid.');
      }
      return `Created ${report.identity.reference_code} with an open, unverified lifecycle.`;
    });

    await runStep(steps, 'Reviewer assignment to the field reporter', async () => {
      reviewerCookies = await webLogin(apiBaseUrl, 'mao@caneguard.test', REVIEWER_PASSWORD);
      const current = await webGet(
        apiBaseUrl,
        reviewerCookies,
        `/api/v1/reports/${report.identity.uuid}`,
      );
      assertResponse(current, 200, 'Current report before assignment');
      const assigned = await webPatch(
        apiBaseUrl,
        reviewerCookies,
        `/api/v1/reports/${report.identity.uuid}/review`,
        {
          expected_version: current.body?.data?.version,
          case_state: 'open',
          field_validation_state: 'assigned',
          field_validation_assignee_uuid: report.reporter.uuid,
          field_validation_target_date: '2099-12-31',
        },
      );
      assertResponse(assigned, 200, 'Field validation assignment');
      report = assigned.body?.data;
      assignment = report?.field_validation_assignment;
      if (assignment?.uuid === undefined) {
        throw new Phase1AcceptanceError('Assignment response did not include an assignment UUID.');
      }
      assertLifecycle(report.lifecycle, {
        case_state: 'open',
        verification_outcome: 'not_determined',
        field_validation_state: 'assigned',
        referral_state: 'not_referred',
      }, 'assigned report');
      return `Assigned ${assignment.uuid} without closing or verifying the case.`;
    });

    await runStep(steps, 'Mobile assignment and attention feed', async () => {
      const assignments = await mobileGet(apiBaseUrl, mobileToken, '/api/v1/mobile/assignments?per_page=100');
      assertResponse(assignments, 200, 'Mobile assignment feed');
      const item = assignments.body?.data?.find((entry) => entry.uuid === assignment.uuid);
      if (!item || item.field_validation_state !== 'assigned') {
        throw new Phase1AcceptanceError('Owner-scoped assignment feed did not expose the assigned work.');
      }
      const notifications = await mobileGet(
        apiBaseUrl,
        mobileToken,
        '/api/v1/mobile/notifications?per_page=100',
      );
      assertResponse(notifications, 200, 'Mobile assignment notification feed');
      const assignedNotification = notifications.body?.data?.find(
        (entry) => entry.event_type === 'field_validation_assigned'
          && entry.assignment_uuid === assignment.uuid,
      );
      if (!assignedNotification) {
        throw new Phase1AcceptanceError('Mobile attention feed did not expose the assignment notification.');
      }
      return 'The field reporter received owner-scoped assignment work and attention.';
    });

    await runStep(steps, 'Mobile field validation completion', async () => {
      const form = new FormData();
      form.append('client_uuid', '50000000-0000-4000-8000-000000000058');
      form.append('field_observation', 'Fresh leaves show rust-like lesions during the visit.');
      form.append('field_finding', 'Field evidence is preserved separately for office review.');
      form.append('action_taken', 'Provided field guidance and recorded the next action.');
      form.append('visited_at', '2026-09-02T04:05:06.123Z');
      form.append('gps_outcome', 'unavailable');
      form.append('gps_attempted_at', '2026-09-02T04:05:01.123Z');

      const completed = await mobileRequest(
        apiBaseUrl,
        mobileToken,
        `/api/v1/mobile/assignments/${assignment.uuid}/completion`,
        { method: 'POST', body: form },
      );
      assertResponse(completed, 201, 'Mobile field validation completion');
      completion = completed.body?.data;
      assertLifecycle(completion?.case, {
        case_state: 'open',
        verification_outcome: 'not_determined',
      }, 'completion case');
      if (completion?.assignment?.field_validation_state !== 'completed') {
        throw new Phase1AcceptanceError('Completion did not move the assignment to completed.');
      }
      return 'Completion evidence synced to the API while the case remained open and unverified.';
    });

    await runStep(steps, 'Reviewer completion attention', async () => {
      const notifications = await webGet(apiBaseUrl, reviewerCookies, '/api/v1/notifications?limit=50');
      assertResponse(notifications, 200, 'Reviewer notification feed');
      const completedNotification = notifications.body?.data?.find(
        (entry) => entry.event_type === 'field_validation_completed'
          && entry.assignment_uuid === assignment.uuid,
      );
      if (!completedNotification) {
        throw new Phase1AcceptanceError('Reviewer attention feed did not expose completion evidence.');
      }
      return 'Office users received field validation completion attention.';
    });

    await runStep(steps, 'Reviewer final disposition', async () => {
      const current = await webGet(
        apiBaseUrl,
        reviewerCookies,
        `/api/v1/reports/${report.identity.uuid}`,
      );
      assertResponse(current, 200, 'Current report before final disposition');
      const finalized = await webPatch(
        apiBaseUrl,
        reviewerCookies,
        `/api/v1/reports/${report.identity.uuid}/review`,
        {
          expected_version: current.body?.data?.version,
          case_state: 'closed',
          verification_outcome: 'verified',
          action_taken: 'advisory_provided',
          notes: 'Local-stack Phase 1 acceptance disposition.',
        },
      );
      assertResponse(finalized, 200, 'Final office disposition');
      report = finalized.body?.data;
      assertLifecycle(report.lifecycle, {
        case_state: 'closed',
        verification_outcome: 'verified',
        field_validation_state: 'completed',
        referral_state: 'not_referred',
      }, 'finalized report');
      return 'Reviewer-only disposition closed and verified the completed case.';
    });

    await runStep(steps, 'Mobile final attention refresh', async () => {
      const notifications = await mobileGet(
        apiBaseUrl,
        mobileToken,
        '/api/v1/mobile/notifications?per_page=100',
      );
      assertResponse(notifications, 200, 'Mobile final attention feed');
      const finalNotification = notifications.body?.data?.find(
        (entry) => entry.event_type === 'office_review_completed'
          && entry.case?.uuid === report.identity.uuid,
      );
      if (!finalNotification) {
        throw new Phase1AcceptanceError('Field reporter did not receive the final office review notification.');
      }
      return 'The field reporter received the final office review attention event.';
    });

    await runStep(steps, 'Lifecycle transition safety invariants', async () => {
      if (completion?.case?.case_state !== 'open'
        || completion?.case?.verification_outcome !== 'not_determined'
        || report.lifecycle.case_state !== 'closed'
        || report.lifecycle.verification_outcome !== 'verified'
      ) {
        throw new Phase1AcceptanceError('Lifecycle transition safety invariants were violated.');
      }
      return 'Field completion did not verify or close the case; only final office disposition did.';
    });

    if (mobileDir && existsSync(path.join(mobileDir, 'node_modules/.bin/jest'))) {
      await runStep(steps, 'Mobile automated seam acceptance', async () => {
        runMobileSeamTest(mobileDir);
        return 'The Mobile SQLite/offline seam acceptance test passed.';
      });
    } else {
      steps.push({
        name: 'Mobile automated seam acceptance',
        status: 'SKIPPED',
        details: 'Mobile dependencies are not installed; no dependency installation was attempted.',
      });
    }

    evidence.status = 'PASS_WITH_GAPS';
    evidence.completed_at = new Date().toISOString();
    await writeEvidence(outputPath, evidence);
    console.log(
      `[acceptance] PASS_WITH_GAPS local-stack Phase 1 lifecycle evidence recorded at ${outputPath}. `
        + 'physical_device=false; device_automation=not_run.',
    );
  } catch (error) {
    const failure = error instanceof Phase1AcceptanceError
      ? error
      : new Phase1AcceptanceError(error.message);
    if (!steps.some((step) => step.status === 'FAIL')) {
      steps.push({ name: 'harness execution', status: 'FAIL', details: failure.message });
    }
    evidence.status = 'FAIL';
    evidence.completed_at = new Date().toISOString();
    await writeEvidence(outputPath, evidence);
    throw failure;
  } finally {
    if (reviewerCookies && apiBaseUrl) {
      try {
        await webLogout(apiBaseUrl, reviewerCookies);
      } catch {
        // The evidence already records the lifecycle result; cleanup is best effort.
      }
    }
    if (server) await stopServer(server);
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
}

async function createTemporaryApi() {
  const tempRoot = await mkdtemp(path.join(requireTempDirectory(), 'caneguard-phase1-'));
  const tempApi = path.join(tempRoot, 'api');
  await cp(API_SOURCE, tempApi, {
    recursive: true,
    filter: (source) => shouldCopyApiPath(source),
  });
  await linkOrCopyDirectory(
    path.join(API_SOURCE, 'vendor'),
    path.join(tempApi, 'vendor'),
    'Laravel vendor dependencies',
  );
  await linkOrCopyDirectory(
    path.join(REPOSITORY_ROOT, 'docs'),
    path.join(tempRoot, 'docs'),
    'contract documentation',
  );
  await mkdir(path.join(tempApi, 'storage/app/private'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(tempApi, 'storage/framework/cache/data'), { recursive: true });
  await mkdir(path.join(tempApi, 'storage/framework/sessions'), { recursive: true });
  await mkdir(path.join(tempApi, 'storage/framework/views'), { recursive: true });
  await mkdir(path.join(tempApi, 'storage/logs'), { recursive: true });
  await mkdir(path.join(tempApi, 'bootstrap/cache'), { recursive: true });
  return tempRoot;
}

function requireTempDirectory() {
  return tmpdir();
}

async function linkOrCopyDirectory(
  source,
  target,
  label,
  {
    link = symlink,
    copy = cp,
    platform = process.platform,
  } = {},
) {
  try {
    await link(source, target, platform === 'win32' ? 'junction' : 'dir');
    return 'symlink';
  } catch (linkError) {
    try {
      await copy(source, target, { recursive: true });
      return 'copy';
    } catch (copyError) {
      const describeError = (error) => (
        `${error?.code ? `${error.code}: ` : ''}${error?.message ?? String(error)}`
      );
      throw new Phase1AcceptanceError(
        `${label} could not be linked or copied. `
          + `Link failed: ${describeError(linkError)}. `
          + `Copy fallback failed: ${describeError(copyError)}.`,
      );
    }
  }
}

async function getFreePort() {
  const probe = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    probe.once('error', rejectPromise);
    probe.listen(0, HOST, resolvePromise);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address !== null ? address.port : null;
  await new Promise((resolvePromise) => probe.close(resolvePromise));
  if (!port) throw new Phase1AcceptanceError('Could not select a free local API port.');
  return port;
}

function shouldCopyApiPath(source) {
  const relative = path.relative(API_SOURCE, source);
  if (relative === '') return true;
  const parts = relative.split(path.sep);
  const basename = path.basename(source);
  if (parts[0] === 'vendor' || parts[0] === 'storage') return false;
  if (parts[0] === 'bootstrap' && parts[1] === 'cache') return false;
  if (basename === '.env' || basename === '.env.local' || basename === '.env.qa.local') return false;
  return true;
}

async function startLocalApi(tempRoot) {
  const tempApi = path.join(tempRoot, 'api');
  const databasePath = path.join(tempRoot, 'phase1.sqlite');
  const port = await getFreePort();
  const origin = `http://${HOST}:${port}`;
  const env = {
    ...safeTestEnvironment(),
    APP_NAME: 'CaneGuard Phase 1 Acceptance',
    APP_ENV: 'testing',
    APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
    APP_DEBUG: 'false',
    APP_URL: origin,
    FRONTEND_URL: origin,
    CORS_ALLOWED_ORIGINS: origin,
    SANCTUM_STATEFUL_DOMAINS: `${HOST}:${port},localhost:${port}`,
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: databasePath,
    DB_URL: '',
    SESSION_DRIVER: 'file',
    SESSION_DOMAIN: '',
    SESSION_SECURE_COOKIE: 'false',
    SESSION_SAME_SITE: 'lax',
    FILESYSTEM_DISK: 'local',
    QUEUE_CONNECTION: 'sync',
    CACHE_STORE: 'array',
    BROADCAST_CONNECTION: 'log',
    MAIL_MAILER: 'array',
    LOG_CHANNEL: 'stderr',
    CANEGUARD_FIELD_PASSWORD: FIELD_PASSWORD,
    CANEGUARD_REVIEWER_PASSWORD: REVIEWER_PASSWORD,
    CANEGUARD_ADMIN_PASSWORD: ADMIN_PASSWORD,
  };
  runProcess('php', ['artisan', 'migrate:fresh', '--seed', '--force'], tempApi, env, 'Local API migration and seed');
  const child = spawn(
    'php',
    [
      '-d',
      'upload_max_filesize=12M',
      '-d',
      'post_max_size=16M',
      '-S',
      `${HOST}:${port}`,
      'server.php',
    ],
    { cwd: tempApi, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  child.stdout.on('data', (chunk) => { log = `${log}${chunk}`.slice(-6000); });
  child.stderr.on('data', (chunk) => { log = `${log}${chunk}`.slice(-6000); });
  child.__phase1Log = () => log;
  await waitForProcess(child, 3000, () => {
    throw new Phase1AcceptanceError(`Local API server exited before readiness. ${log}`);
  });
  return { baseUrl: origin, child };
}

async function stopServer(serverState) {
  const child = serverState.child ?? serverState;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolvePromise();
    }, 2000);
    child.once('close', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function waitForProcess(child, timeoutMs, onExit) {
  if (child.exitCode !== null || child.signalCode !== null) onExit();
  await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(resolvePromise, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      try {
        onExit();
        rejectPromise(new Phase1AcceptanceError('Local API server exited unexpectedly.'));
      } catch (error) {
        rejectPromise(error);
      }
    });
  });
}

async function buildReportForm(tempRoot) {
  const imagePath = path.join(tempRoot, 'api/database/seeders/assets/synthetic-sugarcane-rust.png');
  const image = await readFile(imagePath);
  const form = new FormData();
  const append = (name, value) => form.append(name, String(value));
  append('client_uuid', REPORT_CLIENT_UUID);
  append('scan_record_client_uuid', REPORT_SCAN_CLIENT_UUID);
  append('image_source_type', 'camera');
  append('source_width', 1254);
  append('source_height', 1254);
  append('predicted_label', 'rust');
  append('confidence', 0.82);
  append('class_scores[healthy]', 0.08);
  append('class_scores[mosaic]', 0.1);
  append('class_scores[rust]', 0.82);
  append('symptom_keys[]', 'rust');
  append('checklist_consistency', 'consistent');
  append('reported_severity', 'moderate');
  append('quality_warnings[]', 'low-resolution');
  append('barangay', 'Mabini');
  append('model_version', 'caneguard-mobile-v1.0.0');
  append('preprocess_ms', 12.5);
  append('inference_ms', 95.75);
  append('total_ms', 122.25);
  append('captured_at', '2026-09-02T04:00:00.456Z');
  append('observed_at', '2026-09-02T04:01:00.456Z');
  form.append('image', new Blob([image], { type: 'image/png' }), 'phase1-local-stack.png');
  return form;
}

async function webLogin(baseUrl, email, password) {
  const cookies = new Map();
  const csrf = await requestJson(`${baseUrl}/sanctum/csrf-cookie`, {
    headers: { Origin: baseUrl },
  });
  mergeCookies(cookies, csrf.response);
  assertResponse(csrf, 204, 'CSRF cookie');
  const xsrf = cookies.get('XSRF-TOKEN');
  if (!xsrf) throw new Phase1AcceptanceError('CSRF cookie did not include XSRF-TOKEN.');
  const login = await requestJson(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: baseUrl,
      Cookie: cookieHeader(cookies),
      'X-XSRF-TOKEN': decodeURIComponent(xsrf),
    },
    body: JSON.stringify({ email, password }),
  });
  mergeCookies(cookies, login.response);
  assertResponse(login, 204, `Web login for ${email}`);
  return cookies;
}

async function webLogout(baseUrl, cookies) {
  const xsrf = cookies.get('XSRF-TOKEN');
  const logout = await requestJson(`${baseUrl}/logout`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Origin: baseUrl,
      Cookie: cookieHeader(cookies),
      ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}),
    },
  });
  assertResponse(logout, 204, 'Web logout');
}

async function webGet(baseUrl, cookies, requestPath) {
  return requestJson(`${baseUrl}${requestPath}`, {
    headers: {
      Accept: 'application/json',
      Origin: baseUrl,
      Cookie: cookieHeader(cookies),
    },
  });
}

async function webPatch(baseUrl, cookies, requestPath, body) {
  const xsrf = cookies.get('XSRF-TOKEN');
  return requestJson(`${baseUrl}${requestPath}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: baseUrl,
      Cookie: cookieHeader(cookies),
      ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function mobileGet(baseUrl, token, requestPath) {
  return mobileRequest(baseUrl, token, requestPath);
}

async function mobileRequest(baseUrl, token, requestPath, options = {}) {
  return requestJson(`${baseUrl}${requestPath}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

async function waitForJson(url, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(url);
      if (predicate(result)) return result;
      lastError = new Error(`HTTP ${result.response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Phase1AcceptanceError(`Timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}`);
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Phase1AcceptanceError(`${url} request failed: ${error.message}`);
  }
  const text = await response.text();
  let body = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 1000) };
    }
  }
  return { response, body };
}

function assertResponse(result, expectedStatus, label) {
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!statuses.includes(result.response.status)) {
    throw new Phase1AcceptanceError(
      `${label} returned HTTP ${result.response.status}: ${safeJson(result.body)}`,
    );
  }
}

function assertLifecycle(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) {
      throw new Phase1AcceptanceError(
        `${label} expected ${key}=${value}, received ${actual?.[key] ?? 'null'}.`,
      );
    }
  }
}

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ?? '').split(/,(?=[^;]+=)/);
  return values
    .map((cookie) => cookie.match(/^\s*([^=]+)=([^;]*)/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]);
}

function mergeCookies(cookieJar, response) {
  for (const [name, value] of responseCookies(response)) cookieJar.set(name, value);
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function runStep(steps, name, action) {
  const started = Date.now();
  try {
    const result = await action();
    const status = result?.status ?? 'PASS';
    steps.push({
      name,
      status,
      duration_ms: Date.now() - started,
      details: result?.details ?? result ?? 'PASS',
    });
    return result;
  } catch (error) {
    steps.push({
      name,
      status: 'FAIL',
      duration_ms: Date.now() - started,
      details: error.message,
    });
    throw error;
  }
}

function runProcess(command, args, cwd, env, label) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Phase1AcceptanceError(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-4000);
    throw new Phase1AcceptanceError(`${label} failed with exit code ${result.status}: ${output}`);
  }
}

function runMobileSeamTest(mobileDir) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCommand,
    ['test', '--', '--runInBand', MOBILE_TEST_PATH],
    {
      cwd: mobileDir,
      env: safeTestEnvironment(),
      stdio: 'inherit',
    },
  );
  if (result.error) {
    throw new Phase1AcceptanceError(`Mobile seam test could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Phase1AcceptanceError(
      `Mobile seam test failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

function safeTestEnvironment(source = process.env, platform = process.platform) {
  const allowedKeys = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  if (platform === 'win32') {
    allowedKeys.push('TEMP', 'TMP', 'USERPROFILE', 'SystemRoot');
  }
  const environment = {};
  for (const key of allowedKeys) {
    if (source[key]) environment[key] = source[key];
  }
  environment.CI = 'true';
  return environment;
}

function artifactEvidence(relativePath, definition) {
  return {
    path: relativePath,
    contract: definition.contract,
    version: definition.version,
    sha256: sha256File(path.join(REPOSITORY_ROOT, relativePath)),
  };
}

function sha256File(filePath) {
  return createHash('sha256').update(requireFileSync(filePath)).digest('hex');
}

function requireFileSync(filePath) {
  // Keep this small synchronous read isolated for deterministic evidence hashing.
  return readFileSync(filePath);
}

function gitRevision(directory) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function gitDirty(directory) {
  try {
    return execFileSync(
      'git',
      ['-C', directory, 'status', '--porcelain', '--untracked-files=all'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim() !== '';
  } catch {
    return null;
  }
}

function resolveMobileDirectory(explicit) {
  const candidates = [
    explicit,
    path.join(REPOSITORY_ROOT, 'caneguard-mobile'),
    path.join(REPOSITORY_ROOT, '..', 'caneguard-mobile'),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Phase1AcceptanceError(`unexpected argument ${value}`);
    const [key, inlineValue] = value.slice(2).split('=', 2);
    const normalizedKey = {
      'mobile-dir': 'mobileDir',
      output: 'output',
    }[key];
    if (!normalizedKey) throw new Phase1AcceptanceError(`unknown option --${key}`);
    const nextValue = inlineValue ?? values[++index];
    if (!nextValue || nextValue.startsWith('--')) {
      throw new Phase1AcceptanceError(`option --${key} needs a value`);
    }
    parsed[normalizedKey] = nextValue;
  }
  return parsed;
}

function safeJson(value) {
  return JSON.stringify(value, (key, current) => (
    /token|password|authorization/i.test(key) ? '[redacted]' : current
  ));
}

async function writeEvidence(outputPath, evidence) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Phase1AcceptanceError ? error.message : `[acceptance] ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_EVIDENCE_PATH,
  MOBILE_TEST_PATH,
  linkOrCopyDirectory,
  parseArgs,
  resolveMobileDirectory,
  safeTestEnvironment,
};
