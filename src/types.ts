export interface WorkSession {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // ISO timestamp
  endTime: string | null; // ISO timestamp, null if ongoing
  breaks: Break[];
  totalMinutes: number | null; // Calculated when session ends
}

export interface Break {
  startTime: string; // ISO timestamp
  endTime: string | null; // ISO timestamp
  reason: "lock" | "sleep" | "idle" | "manual";
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

export interface DaemonState {
  isWorking: boolean;
  lastActivity: string; // ISO timestamp
  lastEvent: "wake" | "sleep" | "lock" | "unlock" | "idle" | "startup";
}

export type EventType = "wake" | "sleep" | "lock" | "unlock" | "idle_start" | "idle_end" | "startup" | "shutdown";
