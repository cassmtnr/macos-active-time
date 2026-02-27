/**
 * Storage module - handles reading/writing data to disk.
 *
 * This module is responsible for:
 * - Loading and saving the session data (sessions.json)
 * - Appending to the event log (events.log)
 * - Helper functions for working with dates, times, and durations
 *
 * All data is stored in ~/.work-tracker/
 */

import { mkdir, appendFile } from "fs/promises";
import { DATA_DIR, DATA_FILE, LOG_FILE, MS_PER_MINUTE, DEFAULT_LOG_LINES, ID_LENGTH } from "./config";
import type { Store, Session } from "./types";

/** Empty store used when no data exists or data is corrupted */
const EMPTY_STORE: Store = { version: 2, sessions: [], currentSession: null, absences: [] };

/**
 * Creates the data directory if it doesn't exist.
 * Uses recursive: true so it won't fail if directory already exists.
 */
async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

// ============================================================================
// DATA PERSISTENCE
// ============================================================================

/**
 * Loads the session data from disk.
 *
 * - Creates empty store if file doesn't exist
 * - If file is corrupted, backs it up and creates new empty store
 *
 * @returns The loaded store data
 */
export async function load(): Promise<Store> {
  await ensureDir();
  const file = Bun.file(DATA_FILE);

  // If file doesn't exist, create it with empty data
  if (!(await file.exists())) {
    await save(EMPTY_STORE);
    return EMPTY_STORE;
  }

  // Try to parse existing file
  try {
    const store: Store = await file.json();
    // Migrate v1 → v2: add absences array
    if (store.version < 2) {
      store.version = 2;
      store.absences = store.absences ?? [];
      await save(store);
    }
    return store;
  } catch {
    // File is corrupted - backup and start fresh
    await Bun.write(`${DATA_FILE}.backup.${Date.now()}`, await file.text());
    await save(EMPTY_STORE);
    return EMPTY_STORE;
  }
}

/**
 * Saves the session data to disk.
 *
 * @param store - The data to save
 */
export async function save(store: Store): Promise<void> {
  await ensureDir();
  await Bun.write(DATA_FILE, JSON.stringify(store, null, 2));
}

/**
 * Appends a line to the event log.
 * Format: [ISO_TIMESTAMP] message
 *
 * @param message - The event to log (e.g., "lock", "unlock")
 */
export async function appendLog(message: string): Promise<void> {
  await ensureDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_FILE, line);
}

/**
 * Reads the last N lines from the event log.
 *
 * @param lines - Number of lines to return (default: DEFAULT_LOG_LINES)
 * @returns Array of log lines, or empty array if log doesn't exist
 */
export async function readLog(lines = DEFAULT_LOG_LINES): Promise<string[]> {
  const file = Bun.file(LOG_FILE);
  if (!(await file.exists())) return [];
  const content = await file.text();
  return content.trim().split("\n").slice(-lines);
}

// ============================================================================
// SESSION HELPERS
// ============================================================================

/**
 * Creates a new work session starting now.
 *
 * @param time - Start time (defaults to now)
 * @returns A new Session object
 */
export function createSession(time = new Date()): Session {
  return {
    id: generateId(),
    date: toDateStr(time),
    startTime: time.toISOString(),
    endTime: null,
  };
}

/**
 * Generates a unique session ID.
 * Format: 8 random alphanumeric characters (e.g., "a1b2c3d4")
 */
export function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ============================================================================
// DATE/TIME FORMATTING
// ============================================================================

/**
 * Converts a Date to YYYY-MM-DD format.
 *
 * @example toDateStr(new Date()) // "2026-01-22"
 */
export function toDateStr(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

/**
 * Extracts HH:MM from an ISO timestamp.
 *
 * @example toTimeStr("2026-01-22T09:15:00.000Z") // "09:15"
 */
export function toTimeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Calculates minutes between two timestamps.
 *
 * @param start - ISO timestamp for start
 * @param end - ISO timestamp for end (if null, uses current time)
 * @returns Number of minutes (rounded, minimum 0)
 */
export function minutesBetween(start: string, end: string | null): number {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.round((endMs - startMs) / MS_PER_MINUTE));
}

/**
 * Formats minutes as "Xh Ym".
 *
 * @example formatDuration(90) // "1h 30m"
 * @example formatDuration(45) // "0h 45m"
 */
export function formatDuration(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * Validates a time string in HH:MM format.
 *
 * @param time - Time string to validate
 * @returns true if valid, false otherwise
 */
export function isValidTime(time: string): boolean {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Validates a date string in YYYY-MM-DD format.
 *
 * @param date - Date string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDate(date: string): boolean {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Parses a date + time string into an ISO timestamp.
 * Used for manual session entry (e.g., "2026-01-22" + "09:00").
 * Times are interpreted as local time.
 *
 * @param date - Date in YYYY-MM-DD format
 * @param time - Time in HH:MM format
 * @returns ISO timestamp string
 * @throws Error if date or time format is invalid
 */
export function parseTimeToISO(date: string, time: string): string {
  if (!isValidDate(date)) {
    throw new Error(`Invalid date format: ${date} (expected YYYY-MM-DD)`);
  }
  if (!isValidTime(time)) {
    throw new Error(`Invalid time format: ${time} (expected HH:MM)`);
  }

  const [hours, minutes] = time.split(":").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return d.toISOString();
}
