/**
 * Type definitions for the work tracker.
 *
 * These interfaces define the shape of our data. TypeScript uses these to
 * catch errors at compile time and provide autocomplete in editors.
 */

/**
 * A single work session (one continuous period of work).
 *
 * @example
 * {
 *   id: "a1b2c3d4",
 *   date: "2026-01-22",
 *   startTime: "2026-01-22T09:00:00.000Z",
 *   endTime: "2026-01-22T17:30:00.000Z"
 * }
 */
export interface Session {
  /** Unique identifier - 8 random alphanumeric characters (e.g., "a1b2c3d4") */
  id: string;

  /** Date in YYYY-MM-DD format (e.g., "2026-01-22") */
  date: string;

  /** ISO timestamp when work started (e.g., "2026-01-22T09:00:00.000Z") */
  startTime: string;

  /** ISO timestamp when work ended, or null if session is ongoing */
  endTime: string | null;
}

/**
 * The main data store - saved to sessions.json.
 *
 * Contains all completed sessions and the currently active session (if any).
 */
export interface Store {
  /** Schema version for future migrations */
  version: number;

  /** All completed work sessions */
  sessions: Session[];

  /** The currently active session, or null if not working */
  currentSession: Session | null;

  /** All absence entries (sick leaves and vacations) */
  absences: Absence[];
}

/**
 * Type of absence entry.
 */
export type AbsenceType = "sick" | "vacation";

/**
 * Duration of an absence entry.
 * - "full": full day (8 hours)
 * - "half": half day (4 hours)
 */
export type AbsenceDuration = "full" | "half";

/**
 * A single absence entry (sick leave or vacation).
 *
 * @example
 * {
 *   id: "x9y8z7w6",
 *   date: "2026-02-09",
 *   type: "sick",
 *   duration: "full"
 * }
 */
export interface Absence {
  /** Unique identifier - 8 random alphanumeric characters */
  id: string;

  /** Date in YYYY-MM-DD format */
  date: string;

  /** Type of absence */
  type: AbsenceType;

  /** Full day (8h) or half day (4h) */
  duration: AbsenceDuration;
}

/**
 * Events that the daemon responds to.
 *
 * - "startup": Daemon just started
 * - "lock": User locked their screen (work ends)
 * - "unlock": User unlocked their screen (work starts)
 */
export type Event = "lock" | "unlock" | "startup";
