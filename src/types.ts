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
 *   id: "1706012345-abc1234",
 *   date: "2026-01-22",
 *   startTime: "2026-01-22T09:00:00.000Z",
 *   endTime: "2026-01-22T17:30:00.000Z"
 * }
 */
export interface Session {
  /** Unique identifier - timestamp + random string (e.g., "1706012345-abc1234") */
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
}

/**
 * Events that the daemon responds to.
 *
 * - "startup": Daemon just started
 * - "lock": User locked their screen (work ends)
 * - "unlock": User unlocked their screen (work starts)
 */
export type Event = "lock" | "unlock" | "startup";
