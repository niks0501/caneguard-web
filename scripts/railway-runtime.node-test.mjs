import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const docker = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

test("PHP runtime ini supports contract-size photos plus multipart overhead", () => {
  assert.match(docker, /COPY railway\/uploads\.ini \/usr\/local\/etc\/php\/conf\.d\/caneguard-uploads\.ini/);
  assert.match(docker, /RUN php -r.*upload_max_filesize.*post_max_size/);
  const result = spawnSync("php", ["-n", "-c", "railway/uploads.ini", "-r",
    'echo json_encode([ini_get("upload_max_filesize"), ini_get("post_max_size")]);'], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["12M", "16M"]);
  const contract = JSON.parse(readFileSync("docs/contracts/mobile-report-upload-v2.json", "utf8"));
  assert.match(JSON.stringify(contract), /10485760/);
  assert.ok(12 * 1024 ** 2 > 10485760);
  assert.ok(16 * 1024 ** 2 > 12 * 1024 ** 2);
});

test("deploy wiring remains API-only and realtime closed, with only gated demo bootstrap and no sync workaround", () => {
  assert.match(docker, /ARG VITE_API_BASE_URL/);
  assert.match(docker, /ENV VITE_API_BASE_URL=\$\{VITE_API_BASE_URL\}/);
  assert.match(docker, /ARG VITE_DATA_SOURCE=api/);
  assert.match(docker, /ARG VITE_REALTIME_ENABLED=false/);
  assert.match(docker, /RUN npm run build/);
  const start = readFileSync("railway/start.sh", "utf8");
  assert.match(start, /a2dismod mpm_event mpm_worker/);
  assert.match(start, /a2enmod mpm_prefork/);
  assert.doesNotMatch(start, /--seed|QUEUE_CONNECTION=sync|SELF_REGISTRATION_ENABLED=true/);
  assert.match(start, /case "\$\{CANEGUARD_RAILWAY_DEMO_SEED:-\}"/);
  assert.match(start, /nasugbu-dashboard-20261006\)/);
  assert.match(start, /db:seed --class=RailwayDemoSeeder --force --no-interaction/);
  assert.match(start, /db:seed[\s\S]*chown -R www-data:www-data storage/);
  assert.doesNotMatch(start, /db:seed --force|db:seed --class=DatabaseSeeder/);
  assert.match(start, /MYSQL_ATTR_SSL_CA=\/tmp\/aiven-ca.pem/);
});
