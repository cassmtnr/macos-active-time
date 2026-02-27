#!/usr/bin/env bun
/**
 * Work Tracker CLI - command-line interface for viewing and managing work sessions.
 *
 * USAGE:
 *   work-tracker [command] [options]
 *
 * COMMON COMMANDS:
 *   work-tracker status     - Check if you're currently working
 *   work-tracker today      - See today's work summary
 *   work-tracker report     - See work report for the week
 *   work-tracker export     - Export to CSV for HR systems
 */

import {
  load, save, readLog, createSession, generateId,
  toDateStr, toTimeStr, minutesBetween, formatDuration, parseTimeToISO,
  isValidDate, isValidTime,
} from "./storage";
import { VERSION, APP_NAME, ABSENCE_MINUTES } from "./config";
import type { Session, Absence, AbsenceType, AbsenceDuration } from "./types";

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

/** Parsed command-line arguments */
export interface Args {
  command: string;
  output?: string;
  date: string;
  start?: string;
  end?: string;
  id?: string;
  sick?: boolean;
  vacation?: boolean;
  half?: boolean;
}

/**
 * Parses command-line arguments into a structured object.
 * Returns null if validation fails (invalid date/time format).
 *
 * Supports:
 *   -o, --output FILE   Output file for export
 *   --date YYYY-MM-DD   Date for add/list/edit
 *   --start HH:MM       Start time
 *   --end HH:MM         End time
 *   --id ID             Session ID for edit/delete
 *
 * @param argv - Arguments to parse (defaults to process.argv.slice(2))
 * @returns Parsed arguments or null if validation fails
 */
export function parseArgs(argv?: string[]): Args | null {
  const args = argv ?? process.argv.slice(2);
  const result: Args = {
    command: args[0] || "status",
    date: toDateStr(),
  };

  // Parse optional flags
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "-o" || arg === "--output") && next) {
      result.output = next;
      i++;
    } else if (arg === "--date" && next) {
      if (!isValidDate(next)) {
        console.error("Error: --date must be in YYYY-MM-DD format");
        return null;
      }
      result.date = next;
      i++;
    } else if (arg === "--start" && next) {
      if (!isValidTime(next)) {
        console.error("Error: --start must be in HH:MM format");
        return null;
      }
      result.start = next;
      i++;
    } else if (arg === "--end" && next) {
      if (!isValidTime(next)) {
        console.error("Error: --end must be in HH:MM format");
        return null;
      }
      result.end = next;
      i++;
    } else if (arg === "--id" && next) {
      result.id = next;
      i++;
    } else if (arg === "--sick") {
      result.sick = true;
    } else if (arg === "--vacation") {
      result.vacation = true;
    } else if (arg === "--half") {
      result.half = true;
    }
  }

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Prints an error message and exits with code 1.
 * The 'never' return type tells TypeScript this function never returns.
 */
function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

/**
 * Calculates the duration of a session in minutes.
 */
export function sessionDuration(session: Session): number {
  return minutesBetween(session.startTime, session.endTime);
}

/**
 * Groups sessions by their date.
 * Returns a Map where keys are dates (YYYY-MM-DD) and values are arrays of sessions.
 */
export function groupByDate(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = map.get(session.date) || [];
    list.push(session);
    map.set(session.date, list);
  }
  return map;
}

/**
 * Returns the duration of an absence in minutes.
 */
export function absenceDuration(absence: Absence): number {
  return ABSENCE_MINUTES[absence.duration];
}

/**
 * Groups absences by their date.
 */
export function groupAbsencesByDate(absences: Absence[]): Map<string, Absence[]> {
  const map = new Map<string, Absence[]>();
  for (const absence of absences) {
    const list = map.get(absence.date) || [];
    list.push(absence);
    map.set(absence.date, list);
  }
  return map;
}

/**
 * Checks whether a new absence can be added, and how.
 * Returns "blocked" if the date is already full, "upgrade" if an existing
 * half-day should be promoted to full, or "add" if a new entry is needed.
 */
export function resolveAbsenceAdd(
  existing: Absence[],
): "blocked" | "upgrade" | "add" {
  const existingMinutes = existing.reduce((sum, a) => sum + ABSENCE_MINUTES[a.duration], 0);

  if (existingMinutes >= ABSENCE_MINUTES.full) return "blocked";

  // Existing half + new half or full → upgrade to full
  if (existing.length === 1 && existing[0].duration === "half") {
    return "upgrade";
  }

  return "add";
}

/**
 * Formats an absence type for display in the table (5 chars).
 */
function absenceTypeLabel(type: AbsenceType): string {
  return type === "sick" ? " sick" : "vactn";
}

// ============================================================================
// COMMANDS
// ============================================================================

/** Shows current work session status (same as list for today) */
async function status(): Promise<void> {
  await list(toDateStr());
}

/** Shows today's work summary */
async function today(): Promise<void> {
  const store = await load();
  const date = toDateStr();

  // Combine completed sessions with current session (if any)
  const allSessions = [
    ...store.sessions,
    ...(store.currentSession ? [store.currentSession] : []),
  ];
  const todaySessions = allSessions.filter(s => s.date === date);
  const todayAbsences = store.absences.filter(a => a.date === date);

  if (todaySessions.length === 0 && todayAbsences.length === 0) {
    console.log("No work recorded today");
    return;
  }

  const sessionMinutes = todaySessions.reduce((sum, s) => sum + sessionDuration(s), 0);
  const absenceMinutes = todayAbsences.reduce((sum, a) => sum + absenceDuration(a), 0);
  const totalMinutes = sessionMinutes + absenceMinutes;

  console.log(`Date: ${date}`);
  console.log(`Total: ${formatDuration(totalMinutes)} (${(totalMinutes / 60).toFixed(2)} hours)\n`);
  console.log("Sessions:");

  for (const session of todaySessions) {
    const endTime = session.endTime ? toTimeStr(session.endTime) : "ongoing";
    const duration = formatDuration(sessionDuration(session));
    console.log(`  ${toTimeStr(session.startTime)} - ${endTime}: ${duration}`);
  }

  for (const absence of todayAbsences) {
    const hours = (absenceDuration(absence) / 60).toFixed(1);
    console.log(`  ${absence.type} (${absence.duration} day): ${hours}h`);
  }
}

/** Shows work report for all recorded sessions */
async function report(): Promise<void> {
  const store = await load();

  // Combine all sessions
  const allSessions = [
    ...store.sessions,
    ...(store.currentSession ? [store.currentSession] : []),
  ];

  const grouped = groupByDate(allSessions);
  const groupedAbsences = groupAbsencesByDate(store.absences);

  // Collect all dates from both sessions and absences
  const dateSet = new Set([...grouped.keys(), ...groupedAbsences.keys()]);
  const dates = [...dateSet].sort();

  if (dates.length === 0) {
    console.log("No work records found");
    return;
  }

  console.log("Work Report\n");

  let totalMinutes = 0;

  for (const date of dates) {
    const sessions = grouped.get(date) || [];
    const absences = groupedAbsences.get(date) || [];

    // Calculate daily total
    const sessionMins = sessions.reduce((sum, s) => sum + sessionDuration(s), 0);
    const absenceMins = absences.reduce((sum, a) => sum + absenceDuration(a), 0);
    const dayMinutes = sessionMins + absenceMins;
    totalMinutes += dayMinutes;
    const dayHours = (dayMinutes / 60).toFixed(1);

    const rowCount = sessions.length + absences.length;

    // Table drawing for this date
    const top    = "┌──────────┬───────┬───────┬───────┐";
    const header = "│    ID    │ Start │  End  │ Hours │";
    const sep    = "├──────────┼───────┼───────┼───────┤";

    console.log(`${date}:\n`);
    console.log(top);
    console.log(header);
    console.log(sep);

    let rowIndex = 0;

    for (const session of sessions) {
      const id = session.id.padStart(8);
      const start = toTimeStr(session.startTime);
      const end = session.endTime ? toTimeStr(session.endTime) : "now  ";
      const hours = (sessionDuration(session) / 60).toFixed(1).padStart(5);
      console.log(`│ ${id} │ ${start} │ ${end} │ ${hours} │`);
      rowIndex++;
      if (rowIndex < rowCount) {
        console.log(sep);
      }
    }

    for (const absence of absences) {
      const id = absence.id.padStart(8);
      const typeLabel = absenceTypeLabel(absence.type);
      const durLabel = (absence.duration === "half" ? "half " : "full ");
      const hours = (absenceDuration(absence) / 60).toFixed(1).padStart(5);
      console.log(`│ ${id} │ ${typeLabel} │ ${durLabel} │ ${hours} │`);
      rowIndex++;
      if (rowIndex < rowCount) {
        console.log(sep);
      }
    }

    console.log("├──────────┴───────┴───────┴───────┤");
    console.log(`│${(`Total Day: ${dayHours.padStart(4)} `).padStart(34)}│`);
    console.log("└──────────────────────────────────┘\n");
  }

  console.log("─────────────────────────────────────");
  console.log(`Total Month: ${formatDuration(totalMinutes)} over ${dates.length} days`);
  console.log(`Average: ${formatDuration(Math.round(totalMinutes / dates.length))} per day`);
}

/** Exports all sessions to CSV format */
async function exportCsv(output?: string): Promise<void> {
  const store = await load();

  // Combine completed sessions with current session (if any)
  const allSessions = [
    ...store.sessions,
    ...(store.currentSession ? [store.currentSession] : []),
  ];

  const grouped = groupByDate(allSessions);
  const groupedAbsences = groupAbsencesByDate(store.absences);

  const dateSet = new Set([...grouped.keys(), ...groupedAbsences.keys()]);
  const dates = [...dateSet].sort();

  if (dates.length === 0) {
    console.log("No sessions to export");
    return;
  }

  // Build CSV grouped by date with daily totals
  const lines = ["Date,Start Time,End Time,Hours"];
  let totalMinutes = 0;

  for (const date of dates) {
    const sessions = grouped.get(date) || [];
    const absences = groupedAbsences.get(date) || [];

    let dayMinutes = 0;

    for (const session of sessions) {
      const hours = (sessionDuration(session) / 60).toFixed(2);
      const endTime = session.endTime ? toTimeStr(session.endTime) : "ongoing";
      lines.push(`${session.date},${toTimeStr(session.startTime)},${endTime},${hours}`);
      dayMinutes += sessionDuration(session);
    }

    for (const absence of absences) {
      const hours = (absenceDuration(absence) / 60).toFixed(2);
      lines.push(`${absence.date},${absence.type},${absence.duration} day,${hours}`);
      dayMinutes += absenceDuration(absence);
    }

    // Daily total row
    const dayHours = (dayMinutes / 60).toFixed(2);
    lines.push(`${date},Total Day,,${dayHours}`);
    lines.push(""); // Empty line between days
    totalMinutes += dayMinutes;
  }

  // Overall total
  const totalHours = (totalMinutes / 60).toFixed(2);
  lines.push(`Total Month,,,${totalHours}`);

  const csv = lines.join("\n");

  if (output) {
    await Bun.write(output, csv);
    console.log(`Exported to ${output}`);
  } else {
    console.log(csv);
  }
}

/** Manually starts a work session */
async function start(): Promise<void> {
  const store = await load();

  if (store.currentSession) {
    fail("Session already active");
  }

  store.currentSession = createSession();
  await save(store);
  console.log(`Started at ${toTimeStr(store.currentSession.startTime)}`);
}

/** Manually stops the current work session */
async function stop(): Promise<void> {
  const store = await load();

  if (!store.currentSession) {
    fail("No active session");
  }

  store.currentSession.endTime = new Date().toISOString();
  const duration = sessionDuration(store.currentSession);

  // Only save if session has non-zero duration
  if (duration > 0) {
    store.sessions.push(store.currentSession);
    console.log(`Stopped. Duration: ${formatDuration(duration)}`);
  }
  store.currentSession = null;
  await save(store);
}

/** Adds a past work session or absence manually */
async function add(date: string, startTime?: string, endTime?: string, sick?: boolean, vacation?: boolean, half?: boolean): Promise<void> {
  const absenceType: AbsenceType | null = sick ? "sick" : vacation ? "vacation" : null;

  if (absenceType) {
    const store = await load();
    const duration: AbsenceDuration = half ? "half" : "full";
    const existing = store.absences.filter(a => a.date === date && a.type === absenceType);
    const action = resolveAbsenceAdd(existing);

    if (action === "blocked") {
      console.log(`Already have a full day ${absenceType} on ${date}`);
      return;
    }

    if (action === "upgrade") {
      existing[0].duration = "full";
      await save(store);
      console.log(`Upgraded ${absenceType} on ${date} to full day: 8.0h`);
      return;
    }

    const absence: Absence = {
      id: generateId(),
      date,
      type: absenceType,
      duration,
    };

    store.absences.push(absence);
    store.absences.sort((a, b) => a.date.localeCompare(b.date));
    await save(store);

    const hours = (ABSENCE_MINUTES[duration] / 60).toFixed(1);
    console.log(`Added ${absenceType} (${duration} day) on ${date}: ${hours}h`);
    return;
  }

  if (!startTime || !endTime) {
    fail("--start and --end required (or use --sick / --vacation)");
  }

  const store = await load();

  const session: Session = {
    id: generateId(),
    date,
    startTime: parseTimeToISO(date, startTime),
    endTime: parseTimeToISO(date, endTime),
  };

  store.sessions.push(session);
  store.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
  await save(store);

  const duration = formatDuration(sessionDuration(session));
  console.log(`Added: ${date} ${startTime} - ${endTime} (${duration})`);
}

/** Lists all sessions for a specific date */
async function list(date: string): Promise<void> {
  const store = await load();
  const filtered = store.sessions.filter(s => s.date === date);

  // Include current session if it matches the date
  if (store.currentSession && store.currentSession.date === date) {
    filtered.push(store.currentSession);
  }

  const absences = store.absences.filter(a => a.date === date);

  if (filtered.length === 0 && absences.length === 0) {
    console.log(`No sessions for ${date}`);
    return;
  }

  // Calculate total hours
  const sessionMins = filtered.reduce((sum, s) => sum + sessionDuration(s), 0);
  const absenceMins = absences.reduce((sum, a) => sum + absenceDuration(a), 0);
  const totalMinutes = sessionMins + absenceMins;
  const totalHours = (totalMinutes / 60).toFixed(1);

  const rowCount = filtered.length + absences.length;

  // Table drawing
  const top    = "┌──────────┬───────┬───────┬───────┐";
  const header = "│    ID    │ Start │  End  │ Hours │";
  const sep    = "├──────────┼───────┼───────┼───────┤";

  console.log(`Sessions for ${date}:\n`);
  console.log(top);
  console.log(header);
  console.log(sep);

  let rowIndex = 0;

  for (const session of filtered) {
    const id = session.id.padStart(8);
    const start = toTimeStr(session.startTime);
    const end = session.endTime ? toTimeStr(session.endTime) : "now  ";
    const hours = (sessionDuration(session) / 60).toFixed(1).padStart(5);
    console.log(`│ ${id} │ ${start} │ ${end} │ ${hours} │`);
    rowIndex++;
    if (rowIndex < rowCount) {
      console.log(sep);
    }
  }

  for (const absence of absences) {
    const id = absence.id.padStart(8);
    const typeLabel = absenceTypeLabel(absence.type);
    const durLabel = (absence.duration === "half" ? "half " : "full ");
    const hours = (absenceDuration(absence) / 60).toFixed(1).padStart(5);
    console.log(`│ ${id} │ ${typeLabel} │ ${durLabel} │ ${hours} │`);
    rowIndex++;
    if (rowIndex < rowCount) {
      console.log(sep);
    }
  }

  console.log("├──────────┴───────┴───────┴───────┤");
  console.log(`│${(`Total Day: ${totalHours.padStart(4)} `).padStart(34)}│`);
  console.log("└──────────────────────────────────┘");

  console.log("\nUse --id with edit/delete commands");
}

/** Edits an existing session */
async function edit(
  id?: string,
  date?: string,
  startTime?: string,
  endTime?: string
): Promise<void> {
  if (!id) {
    fail("--id required");
  }

  const store = await load();

  // Find session by ID prefix - check both completed sessions and current session
  let session: Session | undefined = store.sessions.find(s => s.id.startsWith(id));
  const isCurrentSession = !session && store.currentSession?.id.startsWith(id);

  if (isCurrentSession && store.currentSession) {
    session = store.currentSession;
  }

  if (!session) {
    fail(`Session not found: ${id}`);
  }

  // Update fields that were provided
  const targetDate = date || session.date;
  if (date) session.date = date;
  if (startTime) session.startTime = parseTimeToISO(targetDate, startTime);
  if (endTime) session.endTime = parseTimeToISO(targetDate, endTime);

  // Re-sort sessions by start time (only if editing a completed session)
  if (!isCurrentSession) {
    store.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  await save(store);

  const endStr = session.endTime ? toTimeStr(session.endTime) : "ongoing";
  console.log(`Updated: ${session.date} ${toTimeStr(session.startTime)} - ${endStr}`);
}

/** Deletes a session or absence */
async function del(id?: string): Promise<void> {
  if (!id) {
    fail("--id required");
  }

  const store = await load();

  // Find session by ID prefix - check completed sessions
  const index = store.sessions.findIndex(s => s.id.startsWith(id));

  if (index !== -1) {
    const [deleted] = store.sessions.splice(index, 1);
    await save(store);
    console.log(`Deleted: ${deleted.date} ${toTimeStr(deleted.startTime)}`);
    return;
  }

  // Check if it's the current session
  if (store.currentSession?.id.startsWith(id)) {
    const deleted = store.currentSession;
    store.currentSession = null;
    await save(store);
    console.log(`Deleted current session: ${deleted.date} ${toTimeStr(deleted.startTime)}`);
    return;
  }

  // Check absences
  const absenceIndex = store.absences.findIndex(a => a.id.startsWith(id));

  if (absenceIndex !== -1) {
    const [deleted] = store.absences.splice(absenceIndex, 1);
    await save(store);
    console.log(`Deleted ${deleted.type} (${deleted.duration} day) on ${deleted.date}`);
    return;
  }

  fail(`Session not found: ${id}`);
}

/** Shows recent event log entries */
async function log(): Promise<void> {
  const lines = await readLog();

  if (lines.length === 0) {
    console.log("No event log found");
    return;
  }

  console.log("Recent events:\n");
  lines.forEach(line => console.log(line));
}

// ============================================================================
// HELP TEXT
// ============================================================================

const HELP = `
${APP_NAME} v${VERSION} - Automatic work time tracker for macOS

Commands:
  status              Current session status
  today               Today's summary
  report              Work report
  export [-o FILE]    Export CSV
  start / stop        Manual session control
  add --date --start --end    Add past session
  add --sick [--half] [--date]     Add sick leave
  add --vacation [--half] [--date] Add vacation
  list --date         List sessions for date
  edit --id [--start] [--end] Edit session
  delete --id         Delete session or absence
  log                 Show event log
  daemon              Start background daemon
  version             Show version

Options:
  -o, --output FILE   Output file
  --date YYYY-MM-DD   Target date (default: today)
  --start HH:MM       Start time
  --end HH:MM         End time
  --id ID             Session ID
  --sick              Mark as sick leave
  --vacation          Mark as vacation
  --half              Half day (4h, default: full 8h)
`;

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args) {
    process.exit(1);
  }

  // Map of command names to their handler functions
  const commands: Record<string, () => Promise<void>> = {
    status,
    today,
    start,
    stop,
    log,
    report,
    export: () => exportCsv(args.output),
    add: () => add(args.date, args.start, args.end, args.sick, args.vacation, args.half),
    list: () => list(args.date),
    edit: () => edit(args.id, args.date, args.start, args.end),
    delete: () => del(args.id),
    daemon: () => import("./daemon").then(() => {}),
    help: async () => console.log(HELP),
    "-h": async () => console.log(HELP),
    "--help": async () => console.log(HELP),
    version: async () => console.log(`${APP_NAME} v${VERSION}`),
    "-v": async () => console.log(`${APP_NAME} v${VERSION}`),
    "--version": async () => console.log(`${APP_NAME} v${VERSION}`),
  };

  const handler = commands[args.command];

  if (!handler) {
    console.log(`Unknown command: ${args.command}`);
    console.log(HELP);
    process.exit(1);
  }

  await handler();
}

// Run the CLI
main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
