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
import { DEFAULT_REPORT_DAYS } from "./config";
import type { Session } from "./types";

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

/** Parsed command-line arguments */
interface Args {
  command: string;
  days: number;
  output?: string;
  date: string;
  start?: string;
  end?: string;
  id?: string;
}

/**
 * Parses command-line arguments into a structured object.
 *
 * Supports:
 *   -d, --days N        Number of days for reports
 *   -o, --output FILE   Output file for export
 *   --date YYYY-MM-DD   Date for add/list/edit
 *   --start HH:MM       Start time
 *   --end HH:MM         End time
 *   --id ID             Session ID for edit/delete
 */
function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    command: args[0] || "status",
    days: DEFAULT_REPORT_DAYS,
    date: toDateStr(),
  };

  // Parse optional flags
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "-d" || arg === "--days") && next) {
      const days = parseInt(next, 10);
      if (isNaN(days) || days < 1) {
        console.error("Error: --days must be a positive number");
        process.exit(1);
      }
      result.days = days;
      i++; // Skip next arg since we consumed it
    } else if ((arg === "-o" || arg === "--output") && next) {
      result.output = next;
      i++;
    } else if (arg === "--date" && next) {
      if (!isValidDate(next)) {
        console.error("Error: --date must be in YYYY-MM-DD format");
        process.exit(1);
      }
      result.date = next;
      i++;
    } else if (arg === "--start" && next) {
      if (!isValidTime(next)) {
        console.error("Error: --start must be in HH:MM format");
        process.exit(1);
      }
      result.start = next;
      i++;
    } else if (arg === "--end" && next) {
      if (!isValidTime(next)) {
        console.error("Error: --end must be in HH:MM format");
        process.exit(1);
      }
      result.end = next;
      i++;
    } else if (arg === "--id" && next) {
      result.id = next;
      i++;
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
function sessionDuration(session: Session): number {
  return minutesBetween(session.startTime, session.endTime);
}

/**
 * Groups sessions by their date.
 * Returns a Map where keys are dates (YYYY-MM-DD) and values are arrays of sessions.
 */
function groupByDate(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = map.get(session.date) || [];
    list.push(session);
    map.set(session.date, list);
  }
  return map;
}

// ============================================================================
// COMMANDS
// ============================================================================

/** Shows current work session status */
async function status(): Promise<void> {
  const { currentSession } = await load();

  if (!currentSession) {
    console.log("Status: Not working\n\nNo active session.");
    return;
  }

  console.log("Status: Working");
  console.log(`Started: ${toTimeStr(currentSession.startTime)}`);
  console.log(`Duration: ${formatDuration(sessionDuration(currentSession))}`);
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

  if (todaySessions.length === 0) {
    console.log("No work recorded today");
    return;
  }

  const totalMinutes = todaySessions.reduce((sum, s) => sum + sessionDuration(s), 0);

  console.log(`Date: ${date}`);
  console.log(`Total: ${formatDuration(totalMinutes)} (${(totalMinutes / 60).toFixed(2)} hours)\n`);
  console.log("Sessions:");

  for (const session of todaySessions) {
    const endTime = session.endTime ? toTimeStr(session.endTime) : "ongoing";
    const duration = formatDuration(sessionDuration(session));
    console.log(`  ${toTimeStr(session.startTime)} - ${endTime}: ${duration}`);
  }
}

/** Shows work report for the last N days */
async function report(days: number): Promise<void> {
  const store = await load();

  // Combine all sessions
  const allSessions = [
    ...store.sessions,
    ...(store.currentSession ? [store.currentSession] : []),
  ];

  const grouped = groupByDate(allSessions);
  const dates = [...grouped.keys()].sort().reverse().slice(0, days);

  if (dates.length === 0) {
    console.log("No work records found");
    return;
  }

  console.log(`Work Report (last ${days} days)\n`);
  console.log("Date        | Start | End   | Hours");
  console.log("------------|-------|-------|------");

  let totalMinutes = 0;

  for (const date of dates) {
    for (const session of grouped.get(date)!) {
      const endTime = session.endTime ? toTimeStr(session.endTime) : "now  ";
      const hours = (sessionDuration(session) / 60).toFixed(1).padStart(5);
      console.log(`${session.date} | ${toTimeStr(session.startTime)} | ${endTime} | ${hours}`);
      totalMinutes += sessionDuration(session);
    }
  }

  console.log("------------|-------|-------|------");
  console.log(`Total: ${formatDuration(totalMinutes)} over ${dates.length} days`);
  console.log(`Average: ${formatDuration(Math.round(totalMinutes / dates.length))} per day`);
}

/** Exports sessions to CSV format */
async function exportCsv(days: number, output?: string): Promise<void> {
  const store = await load();

  // Sort sessions by start time
  const sorted = [...store.sessions].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  // Filter to last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const filtered = sorted.filter(s => new Date(s.startTime) >= cutoffDate);

  // Build CSV
  const lines = ["Date,Start Time,End Time,Total Hours"];
  for (const session of filtered) {
    const hours = (sessionDuration(session) / 60).toFixed(2);
    const endTime = session.endTime ? toTimeStr(session.endTime) : "ongoing";
    lines.push(`${session.date},${toTimeStr(session.startTime)},${endTime},${hours}`);
  }

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
  const duration = formatDuration(sessionDuration(store.currentSession));

  store.sessions.push(store.currentSession);
  store.currentSession = null;
  await save(store);

  console.log(`Stopped. Duration: ${duration}`);
}

/** Adds a past work session manually */
async function add(date: string, startTime?: string, endTime?: string): Promise<void> {
  if (!startTime || !endTime) {
    fail("--start and --end required");
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
  const { sessions, currentSession } = await load();
  const filtered = sessions.filter(s => s.date === date);

  // Include current session if it matches the date
  if (currentSession && currentSession.date === date) {
    filtered.push(currentSession);
  }

  if (filtered.length === 0) {
    console.log(`No sessions for ${date}`);
    return;
  }

  // Calculate total hours
  const totalMinutes = filtered.reduce((sum, s) => sum + sessionDuration(s), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Table drawing
  const top    = "┌──────────┬───────┬───────┬───────┐";
  const header = "│    ID    │ Start │  End  │ Hours │";
  const sep    = "├──────────┼───────┼───────┼───────┤";

  console.log(`Sessions for ${date}:\n`);
  console.log(top);
  console.log(header);
  console.log(sep);

  for (let i = 0; i < filtered.length; i++) {
    const session = filtered[i];
    const id = session.id.padStart(8);
    const start = toTimeStr(session.startTime);
    const end = session.endTime ? toTimeStr(session.endTime) : "now  ";
    const hours = (sessionDuration(session) / 60).toFixed(1).padStart(5);
    console.log(`│ ${id} │ ${start} │ ${end} │ ${hours} │`);
    if (i < filtered.length - 1) {
      console.log(sep);
    }
  }

  console.log("├──────────┴───────┼───────┼───────┤");
  console.log(`                   │ Total │ ${totalHours.padStart(5)} │`);
  console.log("                   └───────┴───────┘");

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

  // Find session by ID prefix (user doesn't need to type full ID)
  const session = store.sessions.find(s => s.id.startsWith(id));
  if (!session) {
    fail(`Session not found: ${id}`);
  }

  // Update fields that were provided
  const targetDate = date || session.date;
  if (date) session.date = date;
  if (startTime) session.startTime = parseTimeToISO(targetDate, startTime);
  if (endTime) session.endTime = parseTimeToISO(targetDate, endTime);

  // Re-sort sessions by start time
  store.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
  await save(store);

  const endStr = session.endTime ? toTimeStr(session.endTime) : "ongoing";
  console.log(`Updated: ${session.date} ${toTimeStr(session.startTime)} - ${endStr}`);
}

/** Deletes a session */
async function del(id?: string): Promise<void> {
  if (!id) {
    fail("--id required");
  }

  const store = await load();

  // Find session by ID prefix
  const index = store.sessions.findIndex(s => s.id.startsWith(id));
  if (index === -1) {
    fail(`Session not found: ${id}`);
  }

  const [deleted] = store.sessions.splice(index, 1);
  await save(store);

  console.log(`Deleted: ${deleted.date} ${toTimeStr(deleted.startTime)}`);
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
work-tracker - Automatic work time tracker for macOS

Commands:
  status              Current session status
  today               Today's summary
  report [-d N]       Report for last N days (default: 7)
  export [-d N] [-o]  Export CSV
  start / stop        Manual session control
  add --date --start --end    Add past session
  list --date         List sessions for date
  edit --id [--start] [--end] Edit session
  delete --id         Delete session
  log                 Show event log
  daemon              Start background daemon

Options:
  -d, --days N        Number of days
  -o, --output FILE   Output file
  --date YYYY-MM-DD   Target date
  --start HH:MM       Start time
  --end HH:MM         End time
  --id ID             Session ID
`;

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  // Map of command names to their handler functions
  const commands: Record<string, () => Promise<void>> = {
    status,
    today,
    start,
    stop,
    log,
    report: () => report(args.days),
    export: () => exportCsv(args.days, args.output),
    add: () => add(args.date, args.start, args.end),
    list: () => list(args.date),
    edit: () => edit(args.id, args.date, args.start, args.end),
    delete: () => del(args.id),
    daemon: () => import("./daemon").then(() => {}),
    help: async () => console.log(HELP),
    "-h": async () => console.log(HELP),
    "--help": async () => console.log(HELP),
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
