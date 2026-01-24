#!/usr/bin/env bun

import {
  loadData,
  saveData,
  getDailyRecords,
  exportToCsv,
  formatMinutes,
  formatTime,
  calculateSessionMinutes,
  createSession,
  getLogFile,
  generateSessionId,
} from "./storage";

const HELP = `
work-tracker - Automatic work time tracker for macOS

USAGE:
  work-tracker <command> [options]

COMMANDS:
  status          Show current session status
  today           Show today's work summary
  report          Show work report (default: last 7 days)
  export          Export to CSV format
  start           Manually start a work session
  stop            Manually stop the current session
  add             Add a past work session
  edit            Edit an existing session
  delete          Delete a session
  list            List sessions for a date (for editing/deleting)
  log             Show recent event log
  daemon          Start the background daemon
  help            Show this help message

OPTIONS:
  --days, -d <n>      Number of days for report/export (default: 7)
  --output, -o        Output file for export
  --date              Date for add/edit/delete (YYYY-MM-DD, default: today)
  --start             Start time (HH:MM)
  --end               End time (HH:MM)
  --id                Session ID for edit/delete

EXAMPLES:
  work-tracker status
  work-tracker report --days 30
  work-tracker export --days 30 --output hours.csv

  # Add a past session
  work-tracker add --date 2026-01-20 --start 09:00 --end 17:30

  # List sessions for a date to get IDs
  work-tracker list --date 2026-01-20

  # Edit a session (use ID from list)
  work-tracker edit --id 1706012345-abc --start 09:30
  work-tracker edit --id 1706012345-abc --end 18:00

  # Delete a session
  work-tracker delete --id 1706012345-abc
`;

function parseTime(date: string, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

async function showStatus() {
  const data = await loadData();

  if (!data.currentSession) {
    console.log("Status: Not working");
    console.log("\nNo active session. Start the daemon or run 'work-tracker start'");
    return;
  }

  const session = data.currentSession;
  const minutes = calculateSessionMinutes(session);

  console.log("Status: Working");
  console.log(`Started: ${formatTime(session.startTime)}`);
  console.log(`Duration: ${formatMinutes(minutes)}`);
}

async function showToday() {
  const records = await getDailyRecords(1);
  const today = new Date().toISOString().split("T")[0];

  const todayRecord = records.find((r) => r.date === today);

  if (!todayRecord) {
    console.log("No work recorded today");
    return;
  }

  console.log(`Date: ${todayRecord.date}`);
  console.log(`Total: ${formatMinutes(todayRecord.totalMinutes)} (${(todayRecord.totalMinutes / 60).toFixed(2)} hours)`);
  console.log(`\nSessions:`);

  for (const session of todayRecord.sessions) {
    const endStr = session.endTime ? formatTime(session.endTime) : "ongoing";
    const mins = calculateSessionMinutes(session);
    console.log(`  ${formatTime(session.startTime)} - ${endStr}: ${formatMinutes(mins)}`);
  }
}

async function showReport(days: number) {
  const records = await getDailyRecords(days);

  if (records.length === 0) {
    console.log("No work records found");
    return;
  }

  console.log(`Work Report (last ${days} days)\n`);
  console.log("Date        | Start | End   | Hours");
  console.log("------------|-------|-------|------");

  let totalMinutes = 0;
  let totalDays = 0;

  for (const record of records) {
    for (const session of record.sessions) {
      const start = formatTime(session.startTime);
      const end = session.endTime ? formatTime(session.endTime) : "now  ";
      const hours = (calculateSessionMinutes(session) / 60).toFixed(1).padStart(5);
      console.log(`${session.date} | ${start} | ${end} | ${hours}`);
    }
    totalMinutes += record.totalMinutes;
    totalDays++;
  }

  console.log("------------|-------|-------|------");
  console.log(`Total: ${formatMinutes(totalMinutes)} over ${totalDays} days`);
  console.log(`Average: ${formatMinutes(Math.round(totalMinutes / totalDays))} per day`);
}

async function exportData(days: number, outputFile?: string) {
  const csv = await exportToCsv(days);

  if (outputFile) {
    await Bun.write(outputFile, csv);
    console.log(`Exported to ${outputFile}`);
  } else {
    console.log(csv);
  }
}

async function manualStart() {
  const data = await loadData();

  if (data.currentSession) {
    console.log("Session already active. Use 'work-tracker status' to see details.");
    return;
  }

  data.currentSession = createSession();
  await saveData(data);
  console.log(`Started work session at ${formatTime(data.currentSession.startTime)}`);
}

async function manualStop() {
  const data = await loadData();

  if (!data.currentSession) {
    console.log("No active session to stop.");
    return;
  }

  const now = new Date();
  data.currentSession.endTime = now.toISOString();
  const minutes = calculateSessionMinutes(data.currentSession);

  data.sessions.push(data.currentSession);
  data.currentSession = null;

  await saveData(data);
  console.log(`Stopped work session. Duration: ${formatMinutes(minutes)}`);
}

async function addSession(date: string, startTime: string, endTime: string) {
  if (!startTime || !endTime) {
    console.log("Error: --start and --end are required for add command");
    console.log("Example: work-tracker add --date 2026-01-20 --start 09:00 --end 17:30");
    process.exit(1);
  }

  const data = await loadData();

  const session = {
    id: generateSessionId(),
    date,
    startTime: parseTime(date, startTime),
    endTime: parseTime(date, endTime),
  };

  data.sessions.push(session);
  data.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

  await saveData(data);

  const minutes = calculateSessionMinutes(session);
  console.log(`Added session: ${date} ${startTime} - ${endTime} (${formatMinutes(minutes)})`);
}

async function listSessions(date: string) {
  const data = await loadData();
  const sessions = data.sessions.filter((s) => s.date === date);

  if (sessions.length === 0) {
    console.log(`No sessions found for ${date}`);
    return;
  }

  console.log(`Sessions for ${date}:\n`);
  console.log("ID                      | Start | End   | Hours");
  console.log("------------------------|-------|-------|------");

  for (const session of sessions) {
    const start = formatTime(session.startTime);
    const end = session.endTime ? formatTime(session.endTime) : "now  ";
    const hours = (calculateSessionMinutes(session) / 60).toFixed(1).padStart(5);
    const shortId = session.id.substring(0, 22).padEnd(22);
    console.log(`${shortId} | ${start} | ${end} | ${hours}`);
  }

  console.log("\nUse the ID with --id flag for edit/delete commands");
}

async function editSession(id: string, date?: string, startTime?: string, endTime?: string) {
  if (!id) {
    console.log("Error: --id is required for edit command");
    console.log("Use 'work-tracker list --date YYYY-MM-DD' to find session IDs");
    process.exit(1);
  }

  const data = await loadData();
  const session = data.sessions.find((s) => s.id.startsWith(id));

  if (!session) {
    console.log(`Error: Session not found with ID starting with '${id}'`);
    process.exit(1);
  }

  const sessionDate = date || session.date;

  if (date) {
    session.date = date;
  }
  if (startTime) {
    session.startTime = parseTime(sessionDate, startTime);
  }
  if (endTime) {
    session.endTime = parseTime(sessionDate, endTime);
  }

  data.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
  await saveData(data);

  const minutes = calculateSessionMinutes(session);
  console.log(`Updated session: ${session.date} ${formatTime(session.startTime)} - ${session.endTime ? formatTime(session.endTime) : "ongoing"} (${formatMinutes(minutes)})`);
}

async function deleteSession(id: string) {
  if (!id) {
    console.log("Error: --id is required for delete command");
    console.log("Use 'work-tracker list --date YYYY-MM-DD' to find session IDs");
    process.exit(1);
  }

  const data = await loadData();
  const index = data.sessions.findIndex((s) => s.id.startsWith(id));

  if (index === -1) {
    console.log(`Error: Session not found with ID starting with '${id}'`);
    process.exit(1);
  }

  const session = data.sessions[index];
  data.sessions.splice(index, 1);

  await saveData(data);

  console.log(`Deleted session: ${session.date} ${formatTime(session.startTime)} - ${session.endTime ? formatTime(session.endTime) : "ongoing"}`);
}

async function showLog(lines: number = 20) {
  const logFile = getLogFile();
  const file = Bun.file(logFile);

  if (!(await file.exists())) {
    console.log("No event log found");
    return;
  }

  const content = await file.text();
  const allLines = content.trim().split("\n");
  const recentLines = allLines.slice(-lines);

  console.log(`Recent events (last ${recentLines.length}):\n`);
  for (const line of recentLines) {
    console.log(line);
  }
}

async function startDaemon() {
  await import("./daemon");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  // Parse options
  let days = 7;
  let outputFile: string | undefined;
  let date = getTodayDate();
  let startTime: string | undefined;
  let endTime: string | undefined;
  let id: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--days" || args[i] === "-d") && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    }
    if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    }
    if (args[i] === "--date" && args[i + 1]) {
      date = args[i + 1];
      i++;
    }
    if (args[i] === "--start" && args[i + 1]) {
      startTime = args[i + 1];
      i++;
    }
    if (args[i] === "--end" && args[i + 1]) {
      endTime = args[i + 1];
      i++;
    }
    if (args[i] === "--id" && args[i + 1]) {
      id = args[i + 1];
      i++;
    }
  }

  switch (command) {
    case "status":
      await showStatus();
      break;
    case "today":
      await showToday();
      break;
    case "report":
      await showReport(days);
      break;
    case "export":
      await exportData(days, outputFile);
      break;
    case "start":
      await manualStart();
      break;
    case "stop":
      await manualStop();
      break;
    case "add":
      await addSession(date, startTime!, endTime!);
      break;
    case "list":
      await listSessions(date);
      break;
    case "edit":
      await editSession(id!, date, startTime, endTime);
      break;
    case "delete":
      await deleteSession(id!);
      break;
    case "log":
      await showLog();
      break;
    case "daemon":
      await startDaemon();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch(console.error);
