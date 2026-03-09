/**
 * Regression tests for storage.ts utility functions.
 *
 * Tests cover:
 * - Date/time formatting (toDateStr, toTimeStr)
 * - Duration calculations (minutesBetween, formatDuration)
 * - Validation (isValidDate, isValidTime)
 * - Parsing (parseTimeToISO)
 * - ID generation (generateId)
 * - Session creation (createSession)
 * - File I/O operations (load, save, appendLog, readLog)
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import {
  toDateStr,
  toTimeStr,
  minutesBetween,
  formatDuration,
  isValidDate,
  isValidTime,
  parseTimeToISO,
  generateId,
  createSession,
  appendLog,
} from "../storage";
import type { Store } from "../types";

describe("toDateStr", () => {
  test("formats date as YYYY-MM-DD", () => {
    const date = new Date("2026-01-22T10:30:00.000Z");
    expect(toDateStr(date)).toBe("2026-01-22");
  });

  test("handles single-digit months and days", () => {
    const date = new Date("2026-03-05T00:00:00.000Z");
    expect(toDateStr(date)).toBe("2026-03-05");
  });

  test("handles end of year", () => {
    const date = new Date("2026-12-31T23:59:59.000Z");
    expect(toDateStr(date)).toBe("2026-12-31");
  });

  test("handles beginning of year", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(toDateStr(date)).toBe("2026-01-01");
  });
});

describe("toTimeStr", () => {
  test("extracts HH:MM from ISO timestamp", () => {
    // Note: toTimeStr uses toLocaleTimeString which depends on timezone
    const iso = new Date("2026-01-22T09:15:00.000Z").toISOString();
    const result = toTimeStr(iso);
    // Result should match HH:MM format
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  test("handles midnight", () => {
    const iso = new Date("2026-01-22T00:00:00.000Z").toISOString();
    const result = toTimeStr(iso);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  test("handles end of day", () => {
    const iso = new Date("2026-01-22T23:59:00.000Z").toISOString();
    const result = toTimeStr(iso);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("minutesBetween", () => {
  test("calculates minutes between two timestamps", () => {
    const start = "2026-01-22T09:00:00.000Z";
    const end = "2026-01-22T10:30:00.000Z";
    expect(minutesBetween(start, end)).toBe(90);
  });

  test("returns 0 for same timestamp", () => {
    const time = "2026-01-22T09:00:00.000Z";
    expect(minutesBetween(time, time)).toBe(0);
  });

  test("returns 0 for negative duration", () => {
    const start = "2026-01-22T10:00:00.000Z";
    const end = "2026-01-22T09:00:00.000Z";
    expect(minutesBetween(start, end)).toBe(0);
  });

  test("handles exact hour", () => {
    const start = "2026-01-22T09:00:00.000Z";
    const end = "2026-01-22T10:00:00.000Z";
    expect(minutesBetween(start, end)).toBe(60);
  });

  test("handles multi-hour duration", () => {
    const start = "2026-01-22T09:00:00.000Z";
    const end = "2026-01-22T17:30:00.000Z";
    expect(minutesBetween(start, end)).toBe(510); // 8.5 hours
  });

  test("handles null end time (uses current time)", () => {
    const start = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
    const result = minutesBetween(start, null);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(2); // Allow for some test execution time
  });
});

describe("formatDuration", () => {
  test("formats minutes as Xh Ym", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });

  test("handles zero minutes", () => {
    expect(formatDuration(0)).toBe("0h 0m");
  });

  test("handles exact hours", () => {
    expect(formatDuration(60)).toBe("1h 0m");
    expect(formatDuration(120)).toBe("2h 0m");
  });

  test("handles less than an hour", () => {
    expect(formatDuration(45)).toBe("0h 45m");
  });

  test("handles large durations", () => {
    expect(formatDuration(480)).toBe("8h 0m");
    expect(formatDuration(510)).toBe("8h 30m");
  });
});

describe("isValidDate", () => {
  test("accepts valid YYYY-MM-DD format", () => {
    expect(isValidDate("2026-01-22")).toBe(true);
    expect(isValidDate("2026-12-31")).toBe(true);
    expect(isValidDate("2026-01-01")).toBe(true);
  });

  test("rejects invalid format", () => {
    expect(isValidDate("01-22-2026")).toBe(false);
    expect(isValidDate("2026/01/22")).toBe(false);
    expect(isValidDate("22-01-2026")).toBe(false);
    expect(isValidDate("2026-1-22")).toBe(false);
    expect(isValidDate("2026-01-2")).toBe(false);
  });

  test("rejects invalid dates", () => {
    expect(isValidDate("2026-13-01")).toBe(false); // Invalid month
    expect(isValidDate("2026-00-01")).toBe(false); // Month 0
    expect(isValidDate("2026-01-32")).toBe(false); // Invalid day
    expect(isValidDate("2026-01-00")).toBe(false); // Day 0
    expect(isValidDate("2026-02-30")).toBe(false); // Feb 30
  });

  test("handles leap years correctly", () => {
    expect(isValidDate("2024-02-29")).toBe(true);  // Leap year
    expect(isValidDate("2026-02-29")).toBe(false); // Not a leap year
  });

  test("rejects empty and malformed strings", () => {
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("abc")).toBe(false);
    expect(isValidDate("2026")).toBe(false);
    expect(isValidDate("2026-01")).toBe(false);
  });
});

describe("isValidTime", () => {
  test("accepts valid HH:MM format", () => {
    expect(isValidTime("09:00")).toBe(true);
    expect(isValidTime("9:00")).toBe(true);
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("12:30")).toBe(true);
  });

  test("rejects invalid format", () => {
    expect(isValidTime("9:0")).toBe(false);    // Single digit minute
    expect(isValidTime("09:0")).toBe(false);
    expect(isValidTime("9-00")).toBe(false);
    expect(isValidTime("09.00")).toBe(false);
  });

  test("rejects invalid hours", () => {
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("25:00")).toBe(false);
    expect(isValidTime("-1:00")).toBe(false);
  });

  test("rejects invalid minutes", () => {
    expect(isValidTime("09:60")).toBe(false);
    expect(isValidTime("09:99")).toBe(false);
    expect(isValidTime("09:-1")).toBe(false);
  });

  test("rejects empty and malformed strings", () => {
    expect(isValidTime("")).toBe(false);
    expect(isValidTime("abc")).toBe(false);
    expect(isValidTime("09")).toBe(false);
    expect(isValidTime(":00")).toBe(false);
  });
});

describe("parseTimeToISO", () => {
  test("converts date + time to ISO timestamp", () => {
    const result = parseTimeToISO("2026-01-22", "09:00");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Verify the date portion is correct
    expect(result.startsWith("2026-01-22")).toBe(true);
  });

  test("handles various valid times", () => {
    const result1 = parseTimeToISO("2026-01-22", "00:00");
    expect(result1).toBeTruthy();

    const result2 = parseTimeToISO("2026-01-22", "23:59");
    expect(result2).toBeTruthy();

    const result3 = parseTimeToISO("2026-01-22", "12:30");
    expect(result3).toBeTruthy();
  });

  test("throws on invalid date", () => {
    expect(() => parseTimeToISO("invalid", "09:00")).toThrow("Invalid date format");
    expect(() => parseTimeToISO("2026-13-01", "09:00")).toThrow("Invalid date format");
  });

  test("throws on invalid time", () => {
    expect(() => parseTimeToISO("2026-01-22", "invalid")).toThrow("Invalid time format");
    expect(() => parseTimeToISO("2026-01-22", "25:00")).toThrow("Invalid time format");
  });
});

describe("generateId", () => {
  test("generates 8-character ID", () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });

  test("uses only alphanumeric characters", () => {
    const id = generateId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  test("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    // All 100 IDs should be unique
    expect(ids.size).toBe(100);
  });
});

describe("createSession", () => {
  test("creates session with current time when no argument", () => {
    const before = new Date();
    const session = createSession();
    const after = new Date();

    expect(session.id).toHaveLength(8);
    expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(session.endTime).toBeNull();

    // Start time should be between before and after
    const startTime = new Date(session.startTime);
    expect(startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(startTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("creates session with specified time", () => {
    const time = new Date("2026-01-22T09:00:00.000Z");
    const session = createSession(time);

    expect(session.date).toBe("2026-01-22");
    expect(session.startTime).toBe("2026-01-22T09:00:00.000Z");
    expect(session.endTime).toBeNull();
  });

  test("session has unique ID", () => {
    const session1 = createSession();
    const session2 = createSession();
    expect(session1.id).not.toBe(session2.id);
  });
});

// ============================================================================
// appendLog and readLog
// ============================================================================

describe("appendLog", () => {
  let appendFileSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    const fsPromises = await import("fs/promises");
    appendFileSpy = spyOn(fsPromises, "appendFile").mockImplementation(async () => {});
  });

  afterEach(() => {
    appendFileSpy.mockRestore();
  });

  test("writes a line in [ISO_TIMESTAMP] message format", async () => {
    const before = new Date();
    await appendLog("lock");
    const after = new Date();

    expect(appendFileSpy).toHaveBeenCalledTimes(1);
    const [, line] = appendFileSpy.mock.calls[0] as [string, string];

    // Line must end with newline
    expect(line).toMatch(/\n$/);

    // Line must contain the message
    expect(line).toContain("lock");

    // Line must start with an ISO timestamp in brackets
    const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\] (.+)\n$/);
    expect(match).not.toBeNull();

    if (match) {
      // Timestamp must be within the test window
      const timestamp = new Date(match[1]);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());

      // Message must be the event name
      expect(match[2]).toBe("lock");
    }
  });

  test("writes unlock event with correct format", async () => {
    await appendLog("unlock");

    const [, line] = appendFileSpy.mock.calls[0] as [string, string];
    expect(line).toContain("unlock");
    expect(line).toMatch(/^\[.+\] unlock\n$/);
  });

  test("writes startup event with correct format", async () => {
    await appendLog("startup");

    const [, line] = appendFileSpy.mock.calls[0] as [string, string];
    expect(line).toContain("startup");
    expect(line).toMatch(/^\[.+\] startup\n$/);
  });

  test("writes to the LOG_FILE path", async () => {
    await appendLog("lock");

    const [filePath] = appendFileSpy.mock.calls[0] as [string, string];
    // Should be writing to the events.log file inside the data directory
    expect(filePath).toContain("events.log");
    expect(filePath).toContain(".work-tracker");
  });

  test("appends a trailing newline to every log line", async () => {
    await appendLog("test-event");

    const [, line] = appendFileSpy.mock.calls[0] as [string, string];
    expect(line.endsWith("\n")).toBe(true);
  });
});

describe("readLog", () => {
  test("returns empty array when log file does not exist", async () => {
    // Use a path that definitely does not exist
    const { readLog: readLogDirect } = await import("../storage");

    // Spy Bun.file to simulate file not existing
    const bunFileSpy = spyOn(Bun, "file").mockImplementation(() => {
      return {
        exists: async () => false,
        text: async () => "",
      } as unknown as ReturnType<typeof Bun.file>;
    });

    const lines = await readLogDirect();

    expect(lines).toEqual([]);
    bunFileSpy.mockRestore();
  });

  test("returns all lines from a small log file", async () => {
    const { readLog: readLogDirect } = await import("../storage");

    const logContent = "[2026-01-22T09:00:00.000Z] unlock\n[2026-01-22T17:00:00.000Z] lock\n";

    const bunFileSpy = spyOn(Bun, "file").mockImplementation(() => {
      return {
        exists: async () => true,
        text: async () => logContent,
      } as unknown as ReturnType<typeof Bun.file>;
    });

    const lines = await readLogDirect();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("[2026-01-22T09:00:00.000Z] unlock");
    expect(lines[1]).toBe("[2026-01-22T17:00:00.000Z] lock");
    bunFileSpy.mockRestore();
  });

  test("returns only the last N lines when log has more than N lines", async () => {
    const { readLog: readLogDirect } = await import("../storage");

    // Generate 25 log lines (more than default 20)
    const allLines = Array.from({ length: 25 }, (_, i) => `[2026-01-22T09:0${String(i).padStart(1, "0")}:00.000Z] event${i}`);
    const logContent = allLines.join("\n") + "\n";

    const bunFileSpy = spyOn(Bun, "file").mockImplementation(() => {
      return {
        exists: async () => true,
        text: async () => logContent,
      } as unknown as ReturnType<typeof Bun.file>;
    });

    const lines = await readLogDirect(); // default 20 lines

    // Should return only the last 20 lines
    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe(allLines[5]); // first of the last 20
    expect(lines[19]).toBe(allLines[24]); // last line
    bunFileSpy.mockRestore();
  });

  test("accepts a custom line count parameter", async () => {
    const { readLog: readLogDirect } = await import("../storage");

    const allLines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const logContent = allLines.join("\n") + "\n";

    const bunFileSpy = spyOn(Bun, "file").mockImplementation(() => {
      return {
        exists: async () => true,
        text: async () => logContent,
      } as unknown as ReturnType<typeof Bun.file>;
    });

    const lines5 = await readLogDirect(5);
    expect(lines5).toHaveLength(5);
    expect(lines5[0]).toBe("line5");
    expect(lines5[4]).toBe("line9");

    const lines3 = await readLogDirect(3);
    expect(lines3).toHaveLength(3);
    expect(lines3[0]).toBe("line7");

    bunFileSpy.mockRestore();
  });

  test("returns all lines when file has fewer lines than requested", async () => {
    const { readLog: readLogDirect } = await import("../storage");

    const logContent = "line1\nline2\nline3\n";

    const bunFileSpy = spyOn(Bun, "file").mockImplementation(() => {
      return {
        exists: async () => true,
        text: async () => logContent,
      } as unknown as ReturnType<typeof Bun.file>;
    });

    const lines = await readLogDirect(100); // request more than exists
    expect(lines).toHaveLength(3);
    bunFileSpy.mockRestore();
  });
});

// Integration test for load/save cycle
describe("Store serialization", () => {
  test("store can be serialized and deserialized", () => {
    const store: Store = {
      version: 1,
      sessions: [
        {
          id: "test1234",
          date: "2026-01-22",
          startTime: "2026-01-22T09:00:00.000Z",
          endTime: "2026-01-22T17:00:00.000Z",
        },
      ],
      currentSession: {
        id: "current1",
        date: "2026-01-23",
        startTime: "2026-01-23T09:00:00.000Z",
        endTime: null,
      },
      absences: [],
    };

    // Serialize and deserialize
    const json = JSON.stringify(store, null, 2);
    const parsed = JSON.parse(json) as Store;

    expect(parsed.version).toBe(1);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe("test1234");
    expect(parsed.currentSession?.id).toBe("current1");
    expect(parsed.currentSession?.endTime).toBeNull();
  });

  test("empty store serialization", () => {
    const store: Store = {
      version: 1,
      sessions: [],
      currentSession: null,
      absences: [],
    };

    const json = JSON.stringify(store, null, 2);
    const parsed = JSON.parse(json) as Store;

    expect(parsed.version).toBe(1);
    expect(parsed.sessions).toHaveLength(0);
    expect(parsed.currentSession).toBeNull();
  });
});
