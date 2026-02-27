import { VERSION } from "./config";

const NPM_PACKAGE_NAME = "macos-work-tracker";

/**
 * Compares two semver strings. Returns true if remote is newer than local.
 */
export function isNewerVersion(local: string, remote: string): boolean {
  const l = local.split(".").map(Number);
  const r = remote.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (l[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (l[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Checks npm registry for a newer version and logs if one is available.
 * Failures are silently ignored — this should never block startup.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`);
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    if (data.version && isNewerVersion(VERSION, data.version)) {
      console.log(`Update available: ${VERSION} → ${data.version}  (npm i -g ${NPM_PACKAGE_NAME})`);
    }
  } catch {
    // Network errors are expected (offline, DNS, etc.) — ignore silently
  }
}
