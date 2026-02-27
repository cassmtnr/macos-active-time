/**
 * Configuration constants for the work tracker.
 *
 * All paths and magic numbers are defined here to make them easy to find and modify.
 * This is the single source of truth for configuration values.
 */

import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Fallback version for compiled binary
const FALLBACK_VERSION = "0.0.1";

// Read version from package.json (may fail in compiled binary)
let version = FALLBACK_VERSION;
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Skip if running in Bun's virtual filesystem (compiled binary)
  if (!__dirname.startsWith("/$bunfs")) {
    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = await Bun.file(packageJsonPath).json();
    version = packageJson.version;
  }
} catch {
  // Use fallback version if package.json can't be read
}

/** Application version from package.json */
export const VERSION: string = version;

/** Application name */
export const APP_NAME = "work-tracker";

/** Directory where all work tracker data is stored (~/.work-tracker) */
export const DATA_DIR = join(homedir(), ".work-tracker");

/** Path to the JSON file that stores all work sessions */
export const DATA_FILE = join(DATA_DIR, "sessions.json");

/** Path to the event log file (records lock/unlock events) */
export const LOG_FILE = join(DATA_DIR, "events.log");

/** How often (in ms) the daemon checks if the screen is locked. 5 seconds = 5000ms */
export const POLL_INTERVAL_MS = 5000;

/** Milliseconds in one minute - used for time calculations */
export const MS_PER_MINUTE = 60000;

/** Maximum length of session IDs */
export const ID_LENGTH = 8;

/** Default number of log lines to show */
export const DEFAULT_LOG_LINES = 20;

/** Minutes for absence durations */
export const ABSENCE_MINUTES = { full: 480, half: 240 } as const;

