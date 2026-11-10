/**
 * Configuration constants for the work tracker.
 *
 * All paths and magic numbers are defined here to make them easy to find and modify.
 * This is the single source of truth for configuration values.
 */

import { homedir } from "os";
import { join } from "path";
import pkg from "../package.json";

/** Application version from package.json (inlined at compile time) */
export const VERSION: string = pkg.version;

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

