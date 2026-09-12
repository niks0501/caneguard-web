import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAPLIBRE_ADVISORY = "GHSA-jrc7-96c5-q579";
export const MAPLIBRE_SAFE_VERSION = "6.9.0";

const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function dependencyContractErrors(packageJson, lockfile) {
  const errors = [];
  const declaredVersion = packageJson.dependencies?.["maplibre-gl"];
  const lockedRootVersion = lockfile.packages?.[""]?.dependencies?.["maplibre-gl"];
  const lockedVersion = lockfile.packages?.["node_modules/maplibre-gl"]?.version;

  if (declaredVersion !== `^${MAPLIBRE_SAFE_VERSION}`) {
    errors.push(
      `maplibre-gl must remain ^${MAPLIBRE_SAFE_VERSION} to stay clear of ${MAPLIBRE_ADVISORY}`,
    );
  }
  if (lockedRootVersion !== `^${MAPLIBRE_SAFE_VERSION}`) {
    errors.push(
      `package-lock.json must retain the root maplibre-gl requirement ^${MAPLIBRE_SAFE_VERSION}`,
    );
  }
  if (lockedVersion !== MAPLIBRE_SAFE_VERSION) {
    errors.push(
      `package-lock.json must resolve node_modules/maplibre-gl to ${MAPLIBRE_SAFE_VERSION} (advisory ${MAPLIBRE_ADVISORY})`,
    );
  }

  return errors;
}

export function assertDependencyContract(
  packageJson = JSON.parse(readFileSync(join(SCRIPT_ROOT, "package.json"), "utf8")),
  lockfile = JSON.parse(readFileSync(join(SCRIPT_ROOT, "package-lock.json"), "utf8")),
) {
  const errors = dependencyContractErrors(packageJson, lockfile);
  if (errors.length > 0) {
    throw new Error(`Dependency security contract failed:\n- ${errors.join("\n- ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertDependencyContract();
  console.log(
    `Dependency security contract passed: maplibre-gl ${MAPLIBRE_SAFE_VERSION} is pinned outside ${MAPLIBRE_ADVISORY}.`,
  );
}
