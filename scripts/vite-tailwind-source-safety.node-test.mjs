import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(import.meta.dirname, "..");

function waitForReady(child, timeoutMs) {
  return new Promise((resolveReady, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Vite did not become ready. stderr: ${stderr}`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/READY (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveReady(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2000);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Vite exited before readiness with code ${code} and signal ${signal}. stderr: ${stderr}`));
    });
  });
}

function stopProcessGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

test(
  "Tailwind transforms remain responsive when the worktree contains a named pipe",
  { skip: process.platform === "win32", timeout: 15_000 },
  async (t) => {
    const cacheRoot = resolve(projectRoot, "node_modules/.cache");
    mkdirSync(cacheRoot, { recursive: true });
    const fixture = mkdtempSync(resolve(cacheRoot, "vite-tailwind-source-safety-"));
    const sourceCss = readFileSync(resolve(projectRoot, "src/index.css"), "utf8");
    const tailwindDirectives = sourceCss
      .split("\n")
      .filter((line) => line.startsWith('@import "tailwindcss"') || line.startsWith("@source "))
      .join("\n");

    assert.match(tailwindDirectives, /source\(none\)/);
    assert.match(tailwindDirectives, /@source "\.\/\*\*\/\*\.\{js,jsx,ts,tsx\}";/);

    mkdirSync(resolve(fixture, "src"));
    writeFileSync(
      resolve(fixture, "index.html"),
      '<!doctype html><html><body><div class="p-4">Ready</div><script type="module" src="/src/main.ts"></script></body></html>',
    );
    writeFileSync(resolve(fixture, "src/main.ts"), 'import "./index.css";\n');
    writeFileSync(resolve(fixture, "src/index.css"), `${tailwindDirectives}\n`);

    const fifoPath = resolve(fixture, "runtime-control.fifo");
    const mkfifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    assert.equal(mkfifo.status, 0, mkfifo.stderr);

    const viteUrl = pathToFileURL(resolve(projectRoot, "node_modules/vite/dist/node/index.js")).href;
    const tailwindUrl = pathToFileURL(resolve(projectRoot, "node_modules/@tailwindcss/vite/dist/index.mjs")).href;
    writeFileSync(
      resolve(fixture, "server.mjs"),
      `import { createServer } from ${JSON.stringify(viteUrl)};\n` +
        `import tailwindcss from ${JSON.stringify(tailwindUrl)};\n` +
        `const server = await createServer({ root: ${JSON.stringify(fixture)}, logLevel: "silent", plugins: [tailwindcss()], server: { host: "127.0.0.1", port: 0 } });\n` +
        "await server.listen();\n" +
        "const address = server.httpServer.address();\n" +
        'process.stdout.write(`READY ${address.port}\\n`);\n',
    );

    const child = spawn(process.execPath, [resolve(fixture, "server.mjs")], {
      cwd: projectRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => {
      stopProcessGroup(child);
      rmSync(fixture, { recursive: true, force: true });
    });

    const port = await waitForReady(child, 5_000);
    const response = await fetch(`http://127.0.0.1:${port}/src/index.css`, {
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /\.p-4/);
  },
);
