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
  getDataDir,
  getLogFile,
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
  log             Show recent event log
  daemon          Start the background daemon
  help            Show this help message

OPTIONS:
  --days, -d <n>  Number of days for report/export (default: 7)
  --output, -o    Output file for export

EXAMPLES:
  work-tracker status
  work-tracker report --days 30
  work-tracker export --days 30 --output hours.csv
`;

async function showStatus() {
  const data = await loadData();

  if (!data.currentSession) {
    console.log("Status: Not working");
    console.log("\nNo active session. Start the daemon or run 'work-tracker start'");
    return;
  }

  const session = data.currentSession;
  const minutes = calculateSessionMinutes(session);
  const activeBreak = session.breaks.find((b) => !b.endTime);

  console.log(`Status: ${activeBreak ? "On break" : "Working"}`);
  console.log(`Started: ${formatTime(session.startTime)}`);
  console.log(`Duration: ${formatMinutes(minutes)}`);

  if (session.breaks.length > 0) {
    const totalBreakMins = session.breaks.reduce((sum, b) => {
      const start = new Date(b.startTime);
      const end = b.endTime ? new Date(b.endTime) : new Date();
      return sum + Math.round((end.getTime() - start.getTime()) / 60000);
    }, 0);
    console.log(`Breaks: ${session.breaks.length} (${formatMinutes(totalBreakMins)} total)`);
  }

  if (activeBreak) {
    console.log(`\nCurrent break started: ${formatTime(activeBreak.startTime)} (${activeBreak.reason})`);
  }
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
    const mins = session.totalMinutes ?? calculateSessionMinutes(session);
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
  console.log("Date        | Hours | Sessions");
  console.log("------------|-------|----------");

  let totalMinutes = 0;
  let totalDays = 0;

  for (const record of records) {
    const hours = (record.totalMinutes / 60).toFixed(1).padStart(5);
    console.log(`${record.date} | ${hours} | ${record.sessions.length}`);
    totalMinutes += record.totalMinutes;
    totalDays++;
  }

  console.log("------------|-------|----------");
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
  data.currentSession.totalMinutes = calculateSessionMinutes(data.currentSession);

  const minutes = data.currentSession.totalMinutes;
  data.sessions.push(data.currentSession);
  data.currentSession = null;

  await saveData(data);
  console.log(`Stopped work session. Duration: ${formatMinutes(minutes)}`);
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
  // Import and run the daemon
  const daemon = await import("./daemon");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  // Parse options
  let days = 7;
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--days" || args[i] === "-d") && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    }
    if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
      outputFile = args[i + 1];
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
