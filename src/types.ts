export interface WorkSession {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // ISO timestamp
  endTime: string | null; // ISO timestamp, null if ongoing
}

export interface DailyRecord {
  date: string;
  sessions: WorkSession[];
  totalMinutes: number;
}

export interface WorkData {
  version: number;
  sessions: WorkSession[];
  currentSession: WorkSession | null;
}

export type EventType = "lock" | "unlock" | "startup" | "shutdown";
