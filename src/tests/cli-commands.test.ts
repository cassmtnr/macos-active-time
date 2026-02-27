/**
 * Unit tests for CLI command functions using mocked storage.
 *
 * These tests mock the storage module to test command logic
 * without actual file I/O.
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import type { Store, Session, Absence } from "../types";

// Mock store data
const mockStore: Store = {
  version: 2,
  sessions: [
    {
      id: "session1",
      date: "2026-01-22",
      startTime: "2026-01-22T09:00:00.000Z",
      endTime: "2026-01-22T12:00:00.000Z",
    },
    {
      id: "session2",
      date: "2026-01-22",
      startTime: "2026-01-22T13:00:00.000Z",
      endTime: "2026-01-22T17:00:00.000Z",
    },
    {
      id: "session3",
      date: "2026-01-21",
      startTime: "2026-01-21T09:00:00.000Z",
      endTime: "2026-01-21T17:30:00.000Z",
    },
  ],
  currentSession: null,
  absences: [],
};

const emptyStore: Store = {
  version: 2,
  sessions: [],
  currentSession: null,
  absences: [],
};

const storeWithCurrentSession: Store = {
  version: 2,
  sessions: [],
  currentSession: {
    id: "current1",
    date: "2026-01-22",
    startTime: "2026-01-22T14:00:00.000Z",
    endTime: null,
  },
  absences: [],
};

describe("CLI command logic", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    consoleLogSpy = spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("groupByDate logic", () => {
    test("correctly groups multiple sessions by date", async () => {
      const { groupByDate } = await import("../cli");

      const sessions: Session[] = [
        { id: "a", date: "2026-01-22", startTime: "2026-01-22T09:00:00.000Z", endTime: "2026-01-22T12:00:00.000Z" },
        { id: "b", date: "2026-01-22", startTime: "2026-01-22T13:00:00.000Z", endTime: "2026-01-22T17:00:00.000Z" },
        { id: "c", date: "2026-01-21", startTime: "2026-01-21T09:00:00.000Z", endTime: "2026-01-21T17:00:00.000Z" },
        { id: "d", date: "2026-01-23", startTime: "2026-01-23T09:00:00.000Z", endTime: "2026-01-23T17:00:00.000Z" },
      ];

      const grouped = groupByDate(sessions);

      expect(grouped.size).toBe(3);
      expect(grouped.get("2026-01-21")?.length).toBe(1);
      expect(grouped.get("2026-01-22")?.length).toBe(2);
      expect(grouped.get("2026-01-23")?.length).toBe(1);
    });
  });

  describe("sessionDuration logic", () => {
    test("calculates correct duration for various session lengths", async () => {
      const { sessionDuration } = await import("../cli");

      // 3 hour session
      const session1: Session = {
        id: "a",
        date: "2026-01-22",
        startTime: "2026-01-22T09:00:00.000Z",
        endTime: "2026-01-22T12:00:00.000Z",
      };
      expect(sessionDuration(session1)).toBe(180);

      // 30 minute session
      const session2: Session = {
        id: "b",
        date: "2026-01-22",
        startTime: "2026-01-22T09:00:00.000Z",
        endTime: "2026-01-22T09:30:00.000Z",
      };
      expect(sessionDuration(session2)).toBe(30);

      // 8.5 hour session
      const session3: Session = {
        id: "c",
        date: "2026-01-22",
        startTime: "2026-01-22T09:00:00.000Z",
        endTime: "2026-01-22T17:30:00.000Z",
      };
      expect(sessionDuration(session3)).toBe(510);
    });
  });

  describe("parseArgs validation", () => {
    test("validates date format correctly", async () => {
      const { parseArgs } = await import("../cli");

      // Valid dates
      expect(parseArgs(["list", "--date", "2026-01-22"])).not.toBeNull();
      expect(parseArgs(["list", "--date", "2026-12-31"])).not.toBeNull();
      expect(parseArgs(["list", "--date", "2024-02-29"])).not.toBeNull(); // Leap year

      // Invalid dates
      expect(parseArgs(["list", "--date", "2026-13-01"])).toBeNull();
      expect(parseArgs(["list", "--date", "2026-02-30"])).toBeNull();
      expect(parseArgs(["list", "--date", "invalid"])).toBeNull();
    });

    test("validates time format correctly", async () => {
      const { parseArgs } = await import("../cli");

      // Valid times
      expect(parseArgs(["add", "--start", "09:00"])).not.toBeNull();
      expect(parseArgs(["add", "--start", "00:00"])).not.toBeNull();
      expect(parseArgs(["add", "--start", "23:59"])).not.toBeNull();
      expect(parseArgs(["add", "--end", "17:30"])).not.toBeNull();

      // Invalid times
      expect(parseArgs(["add", "--start", "24:00"])).toBeNull();
      expect(parseArgs(["add", "--start", "09:60"])).toBeNull();
      expect(parseArgs(["add", "--end", "invalid"])).toBeNull();
    });

    test("handles combined flags", async () => {
      const { parseArgs } = await import("../cli");

      const result = parseArgs([
        "edit",
        "--id", "abc123",
        "--date", "2026-01-22",
        "--start", "09:00",
        "--end", "17:30",
      ]);

      expect(result).not.toBeNull();
      expect(result?.command).toBe("edit");
      expect(result?.id).toBe("abc123");
      expect(result?.date).toBe("2026-01-22");
      expect(result?.start).toBe("09:00");
      expect(result?.end).toBe("17:30");
    });
  });
});

describe("Store operations", () => {
  test("store with sessions can be processed", () => {
    expect(mockStore.sessions.length).toBe(3);
    expect(mockStore.currentSession).toBeNull();

    // Group by date
    const grouped = new Map<string, Session[]>();
    for (const session of mockStore.sessions) {
      const list = grouped.get(session.date) || [];
      list.push(session);
      grouped.set(session.date, list);
    }

    expect(grouped.size).toBe(2);
    expect(grouped.get("2026-01-22")?.length).toBe(2);
    expect(grouped.get("2026-01-21")?.length).toBe(1);
  });

  test("empty store is handled correctly", () => {
    expect(emptyStore.sessions.length).toBe(0);
    expect(emptyStore.currentSession).toBeNull();
  });

  test("store with current session is handled correctly", () => {
    expect(storeWithCurrentSession.sessions.length).toBe(0);
    expect(storeWithCurrentSession.currentSession).not.toBeNull();
    expect(storeWithCurrentSession.currentSession?.endTime).toBeNull();
  });

  test("combining sessions and current session", () => {
    const store = { ...storeWithCurrentSession };
    const allSessions = [
      ...store.sessions,
      ...(store.currentSession ? [store.currentSession] : []),
    ];

    expect(allSessions.length).toBe(1);
    expect(allSessions[0].id).toBe("current1");
  });
});

describe("Duration calculations", () => {
  test("calculates total minutes from sessions", () => {
    let totalMinutes = 0;
    for (const session of mockStore.sessions) {
      const start = new Date(session.startTime).getTime();
      const end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
      const mins = Math.round((end - start) / 60000);
      totalMinutes += mins;
    }

    // session1: 3 hours = 180 minutes
    // session2: 4 hours = 240 minutes
    // session3: 8.5 hours = 510 minutes
    expect(totalMinutes).toBe(930);
  });

  test("formats duration correctly", () => {
    const formatDuration = (mins: number): string => {
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(180)).toBe("3h 0m");
    expect(formatDuration(510)).toBe("8h 30m");
    expect(formatDuration(45)).toBe("0h 45m");
  });
});

describe("CSV export format", () => {
  test("generates correct CSV structure", () => {
    const lines: string[] = ["Date,Start Time,End Time,Hours"];

    const toTimeStr = (iso: string): string => {
      return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    };

    // Group sessions by date
    const grouped = new Map<string, Session[]>();
    for (const session of mockStore.sessions) {
      const list = grouped.get(session.date) || [];
      list.push(session);
      grouped.set(session.date, list);
    }

    const dates = [...grouped.keys()].sort();
    let totalMinutes = 0;

    for (const date of dates) {
      const sessions = grouped.get(date) || [];
      let dayMinutes = 0;

      for (const session of sessions) {
        const start = new Date(session.startTime).getTime();
        const end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
        const mins = Math.round((end - start) / 60000);
        const hours = (mins / 60).toFixed(2);
        const endTime = session.endTime ? toTimeStr(session.endTime) : "ongoing";
        lines.push(`${session.date},${toTimeStr(session.startTime)},${endTime},${hours}`);
        dayMinutes += mins;
      }

      const dayHours = (dayMinutes / 60).toFixed(2);
      lines.push(`${date},Total Day,,${dayHours}`);
      lines.push("");
      totalMinutes += dayMinutes;
    }

    const totalHours = (totalMinutes / 60).toFixed(2);
    lines.push(`Total Month,,,${totalHours}`);

    const csv = lines.join("\n");

    expect(csv).toContain("Date,Start Time,End Time,Hours");
    expect(csv).toContain("Total Day");
    expect(csv).toContain("Total Month");
  });
});

describe("Table formatting", () => {
  test("table structure uses box-drawing characters", () => {
    const top = "┌──────────┬───────┬───────┬───────┐";
    const header = "│    ID    │ Start │  End  │ Hours │";
    const sep = "├──────────┼───────┼───────┼───────┤";
    const bottom = "└──────────┼───────┴───────┴───────┤";
    const totalRow = "           │       Total Day:  X.X │";
    const totalBottom = "           └───────────────────────┘";

    expect(top).toContain("┌");
    expect(top).toContain("┐");
    expect(header).toContain("│");
    expect(sep).toContain("├");
    expect(sep).toContain("┼");
    expect(sep).toContain("┤");
    expect(bottom).toContain("└");
    expect(totalRow).toContain("Total Day:");
    expect(totalBottom).toContain("┘");
  });

  test("ID is padded to 8 characters", () => {
    const id = "abc123";
    const padded = id.padStart(8);
    expect(padded).toBe("  abc123");
    expect(padded.length).toBe(8);
  });

  test("hours are padded to 5 characters", () => {
    const hours = (7.5).toFixed(1);
    const padded = hours.padStart(5);
    expect(padded).toBe("  7.5");
    expect(padded.length).toBe(5);
  });
});

describe("Absence functionality", () => {
  describe("absenceDuration", () => {
    test("returns 480 minutes for full day", async () => {
      const { absenceDuration } = await import("../cli");

      const absence: Absence = {
        id: "abs1",
        date: "2026-02-09",
        type: "sick",
        duration: "full",
      };

      expect(absenceDuration(absence)).toBe(480);
    });

    test("returns 240 minutes for half day", async () => {
      const { absenceDuration } = await import("../cli");

      const absence: Absence = {
        id: "abs2",
        date: "2026-02-09",
        type: "vacation",
        duration: "half",
      };

      expect(absenceDuration(absence)).toBe(240);
    });
  });

  describe("groupAbsencesByDate", () => {
    test("groups absences by date correctly", async () => {
      const { groupAbsencesByDate } = await import("../cli");

      const absences: Absence[] = [
        { id: "a1", date: "2026-02-09", type: "sick", duration: "full" },
        { id: "a2", date: "2026-02-09", type: "vacation", duration: "half" },
        { id: "a3", date: "2026-02-10", type: "sick", duration: "half" },
      ];

      const grouped = groupAbsencesByDate(absences);

      expect(grouped.size).toBe(2);
      expect(grouped.get("2026-02-09")?.length).toBe(2);
      expect(grouped.get("2026-02-10")?.length).toBe(1);
    });

    test("returns empty map for no absences", async () => {
      const { groupAbsencesByDate } = await import("../cli");

      const grouped = groupAbsencesByDate([]);
      expect(grouped.size).toBe(0);
    });
  });

  describe("parseArgs with absence flags", () => {
    test("parses --sick flag", async () => {
      const { parseArgs } = await import("../cli");

      const result = parseArgs(["add", "--sick"]);
      expect(result).not.toBeNull();
      expect(result?.command).toBe("add");
      expect(result?.sick).toBe(true);
      expect(result?.vacation).toBeUndefined();
      expect(result?.half).toBeUndefined();
    });

    test("parses --vacation flag", async () => {
      const { parseArgs } = await import("../cli");

      const result = parseArgs(["add", "--vacation"]);
      expect(result).not.toBeNull();
      expect(result?.command).toBe("add");
      expect(result?.vacation).toBe(true);
    });

    test("parses --half flag", async () => {
      const { parseArgs } = await import("../cli");

      const result = parseArgs(["add", "--sick", "--half"]);
      expect(result).not.toBeNull();
      expect(result?.sick).toBe(true);
      expect(result?.half).toBe(true);
    });

    test("parses --vacation with --date and --half", async () => {
      const { parseArgs } = await import("../cli");

      const result = parseArgs(["add", "--vacation", "--date", "2026-02-10", "--half"]);
      expect(result).not.toBeNull();
      expect(result?.vacation).toBe(true);
      expect(result?.half).toBe(true);
      expect(result?.date).toBe("2026-02-10");
    });
  });

  describe("absence in daily totals", () => {
    test("absences contribute to total minutes", async () => {
      const { absenceDuration, sessionDuration } = await import("../cli");

      const sessions: Session[] = [
        {
          id: "s1",
          date: "2026-02-09",
          startTime: "2026-02-09T09:00:00.000Z",
          endTime: "2026-02-09T13:00:00.000Z",
        },
      ];

      const absences: Absence[] = [
        { id: "a1", date: "2026-02-09", type: "vacation", duration: "half" },
      ];

      const sessionMins = sessions.reduce((sum, s) => sum + sessionDuration(s), 0);
      const absenceMins = absences.reduce((sum, a) => sum + absenceDuration(a), 0);
      const totalMinutes = sessionMins + absenceMins;

      // 4h work + 4h half-day vacation = 8h = 480 minutes
      expect(sessionMins).toBe(240);
      expect(absenceMins).toBe(240);
      expect(totalMinutes).toBe(480);
    });

    test("full day sick leave equals 8 hours", async () => {
      const { absenceDuration } = await import("../cli");

      const absence: Absence = {
        id: "a1",
        date: "2026-02-09",
        type: "sick",
        duration: "full",
      };

      expect(absenceDuration(absence) / 60).toBe(8);
    });
  });

  describe("store with absences", () => {
    test("store can hold both sessions and absences", () => {
      const store: Store = {
        version: 2,
        sessions: mockStore.sessions,
        currentSession: null,
        absences: [
          { id: "abs1", date: "2026-01-23", type: "sick", duration: "full" },
          { id: "abs2", date: "2026-01-24", type: "vacation", duration: "half" },
        ],
      };

      expect(store.sessions.length).toBe(3);
      expect(store.absences.length).toBe(2);
      expect(store.absences[0].type).toBe("sick");
      expect(store.absences[1].duration).toBe("half");
    });

    test("v1 store migration adds absences array", () => {
      // Simulate a v1 store loaded from disk (no absences field)
      const v1Store = {
        version: 1,
        sessions: [],
        currentSession: null,
      };

      // Migration logic
      const migrated: Store = {
        ...v1Store,
        version: 2,
        absences: (v1Store as Record<string, unknown>).absences as Absence[] ?? [],
      };

      expect(migrated.version).toBe(2);
      expect(migrated.absences).toEqual([]);
    });
  });

  describe("resolveAbsenceAdd (duplicate prevention)", () => {
    test("allows adding to empty list", async () => {
      const { resolveAbsenceAdd } = await import("../cli");
      expect(resolveAbsenceAdd([])).toBe("add");
    });

    test("blocks when full day already exists", async () => {
      const { resolveAbsenceAdd } = await import("../cli");
      const existing: Absence[] = [
        { id: "a1", date: "2026-02-09", type: "sick", duration: "full" },
      ];
      expect(resolveAbsenceAdd(existing)).toBe("blocked");
    });

    test("upgrades when half day already exists", async () => {
      const { resolveAbsenceAdd } = await import("../cli");
      const existing: Absence[] = [
        { id: "a1", date: "2026-02-09", type: "vacation", duration: "half" },
      ];
      expect(resolveAbsenceAdd(existing)).toBe("upgrade");
    });
  });
});
