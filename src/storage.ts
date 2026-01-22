import { homedir } from "os";
import { join } from "path";
import type { WorkData, WorkSession, DailyRecord } from "./types";

const DATA_DIR = join(homedir(), ".work-tracker");
const DATA_FILE = join(DATA_DIR, "sessions.json");
const LOG_FILE = join(DATA_DIR, "events.log");

export function getDataDir(): string {
  return DATA_DIR;
}

export function getLogFile(): string {
  return LOG_FILE;
}

async function ensureDataDir(): Promise<void> {
  try {
    await Bun.write(join(DATA_DIR, ".keep"), "");
  } catch {
    const proc = Bun.spawn(["mkdir", "-p", DATA_DIR]);
    await proc.exited;
  }
}

export async function loadData(): Promise<WorkData> {
  await ensureDataDir();

  const file = Bun.file(DATA_FILE);
  const exists = await file.exists();

  if (!exists) {
    const initial: WorkData = {
      version: 1,
      sessions: [],
      currentSession: null,
    };
    await saveData(initial);
    return initial;
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as WorkData;
  } catch {
    const backup = `${DATA_FILE}.backup.${Date.now()}`;
    await Bun.write(backup, await file.text());
    const initial: WorkData = {
      version: 1,
      sessions: [],
      currentSession: null,
    };
    await saveData(initial);
    return initial;
  }
}

export async function saveData(data: WorkData): Promise<void> {
  await ensureDataDir();
  await Bun.write(DATA_FILE, JSON.stringify(data, null, 2));
}

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function getDateString(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

export function createSession(startTime: Date = new Date()): WorkSession {
  return {
    id: generateSessionId(),
    date: getDateString(startTime),
    startTime: startTime.toISOString(),
    endTime: null,
  };
}

export function calculateSessionMinutes(session: WorkSession): number {
  const start = new Date(session.startTime);
  const end = session.endTime ? new Date(session.endTime) : new Date();
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function getDailyRecords(days: number = 30): Promise<DailyRecord[]> {
  const data = await loadData();
  const records: Map<string, DailyRecord> = new Map();

  for (const session of data.sessions) {
    const existing = records.get(session.date);
    const sessionMinutes = calculateSessionMinutes(session);

    if (existing) {
      existing.sessions.push(session);
      existing.totalMinutes += sessionMinutes;
    } else {
      records.set(session.date, {
        date: session.date,
        sessions: [session],
        totalMinutes: sessionMinutes,
      });
    }
  }

  if (data.currentSession) {
    const existing = records.get(data.currentSession.date);
    const sessionMinutes = calculateSessionMinutes(data.currentSession);

    if (existing) {
      existing.sessions.push(data.currentSession);
      existing.totalMinutes += sessionMinutes;
    } else {
      records.set(data.currentSession.date, {
        date: data.currentSession.date,
        sessions: [data.currentSession],
        totalMinutes: sessionMinutes,
      });
    }
  }

  return Array.from(records.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);
}

export async function logEvent(event: string, details?: string): Promise<void> {
  await ensureDataDir();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${event}${details ? `: ${details}` : ""}\n`;

  const file = Bun.file(LOG_FILE);
  const existing = (await file.exists()) ? await file.text() : "";
  await Bun.write(LOG_FILE, existing + line);
}

export async function exportToCsv(days: number = 30): Promise<string> {
  const records = await getDailyRecords(days);

  const lines = ["Date,Start Time,End Time,Total Hours"];

  for (const record of records.reverse()) {
    for (const session of record.sessions) {
      const totalHours = (calculateSessionMinutes(session) / 60).toFixed(2);
      lines.push(
        `${session.date},${formatTime(session.startTime)},${session.endTime ? formatTime(session.endTime) : "ongoing"},${totalHours}`
      );
    }
  }

  return lines.join("\n");
}
