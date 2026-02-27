import { VERSION, APP_NAME, DATA_DIR } from "./config";
import { join } from "path";
import { spawn } from "child_process";

const NPM_PACKAGE_NAME = "macos-work-tracker";
const CHECK_FILE = join(DATA_DIR, ".last-update-check");

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
 * Returns true if the last check was more than 24 hours ago (or never).
 */
async function shouldCheck(): Promise<boolean> {
  try {
    const file = Bun.file(CHECK_FILE);
    const text = await file.text();
    const last = Number(text.trim());
    return Date.now() - last > 86_400_000; // 24 hours
  } catch {
    return true;
  }
}

/**
 * Records the current time as the last check timestamp.
 */
async function recordCheck(): Promise<void> {
  await Bun.write(CHECK_FILE, String(Date.now()));
}

/**
 * Shows a macOS notification via osascript.
 */
function notify(title: string, message: string): void {
  spawn("osascript", [
    "-e",
    `display notification "${message}" with title "${APP_NAME}" subtitle "${title}"`,
  ], { stdio: "ignore" });
}

/**
 * Checks npm registry for a newer version (at most once per day).
 * Failures are silently ignored — this should never block the daemon.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    if (!(await shouldCheck())) return;

    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`);
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    await recordCheck();

    if (data.version && isNewerVersion(VERSION, data.version)) {
      console.log(`Update available: ${VERSION} → ${data.version}`);
      notify(
        `Update available: ${data.version}`,
        `Run: npm i -g ${NPM_PACKAGE_NAME}`,
      );
    }
  } catch {
    // Network errors are expected (offline, DNS, etc.) — ignore silently
  }
}
