/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const qaApiProxyTarget = process.env.QA_API_PROXY_TARGET;
const qaPublicHost = process.env.QA_PUBLIC_URL
  ? new URL(process.env.QA_PUBLIC_URL).hostname
  : undefined;
const qaApiProxy = qaApiProxyTarget
  ? Object.fromEntries(
      ["/api", "/sanctum", "/login", "/logout"].map((path) => [
        path,
        {
          target: qaApiProxyTarget,
          changeOrigin: false,
          secure: false,
        },
      ]),
    )
  : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  server: {
    allowedHosts: qaPublicHost ? [qaPublicHost] : undefined,
    proxy: qaApiProxy,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/auth.json",
        "**/api/.env*",
        "**/api/config/**",
        "**/api/storage/**",
        "**/api/bootstrap/cache/**",
      ],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
