/**
 * Regression tests for cli.ts helper functions and argument parsing.
 *
 * Tests cover:
 * - Session duration calculation
 * - Grouping sessions by date
 * - Argument parsing
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { sessionDuration, groupByDate, parseArgs } from "../cli";
import type { Session } from "../types";

/**
 * Creates a test session.
 */
function createTestSession(
  date: string,
  startTime: string,
  endTime: string | null,
  id = "test1234"
): Session {
  return { id, date, startTime, endTime };
}

describe("sessionDuration", () => {
  test("calculates duration for completed session", () => {
    const session = createTestSession(
      "2026-01-22",
      "2026-01-22T09:00:00.000Z",
      "2026-01-22T17:30:00.000Z"
    );

    expect(sessionDuration(session)).toBe(510); // 8.5 hours in minutes
  });

  test("calculates duration for short session", () => {
    const session = createTestSession(
      "2026-01-22",
      "2026-01-22T14:00:00.000Z",
      "2026-01-22T14:30:00.000Z"
    );

    expect(sessionDuration(session)).toBe(30);
  });

  test("returns 0 for zero-duration session", () => {
    const session = createTestSession(
      "2026-01-22",
      "2026-01-22T09:00:00.000Z",
      "2026-01-22T09:00:00.000Z"
    );

    expect(sessionDuration(session)).toBe(0);
  });

  test("handles ongoing session (null endTime)", () => {
    const startTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const session = createTestSession("2026-01-22", startTime, null);

    const duration = sessionDuration(session);
    expect(duration).toBeGreaterThanOrEqual(59); // At least 59 minutes
    expect(duration).toBeLessThanOrEqual(61); // At most 61 minutes
  });

  test("handles multi-hour session", () => {
    const session = createTestSession(
      "2026-01-22",
      "2026-01-22T09:00:00.000Z",
      "2026-01-22T18:00:00.000Z"
    );

    expect(sessionDuration(session)).toBe(540); // 9 hours
  });
});

describe("groupByDate", () => {
  test("groups sessions by date", () => {
    const sessions: Session[] = [
      createTestSession("2026-01-22", "2026-01-22T09:00:00.000Z", "2026-01-22T12:00:00.000Z", "a"),
      createTestSession("2026-01-22", "2026-01-22T13:00:00.000Z", "2026-01-22T17:00:00.000Z", "b"),
      createTestSession("2026-01-23", "2026-01-23T09:00:00.000Z", "2026-01-23T17:00:00.000Z", "c"),
    ];

    const grouped = groupByDate(sessions);

    expect(grouped.size).toBe(2);
    expect(grouped.get("2026-01-22")).toHaveLength(2);
    expect(grouped.get("2026-01-23")).toHaveLength(1);
  });

  test("returns empty map for empty sessions", () => {
    const grouped = groupByDate([]);

    expect(grouped.size).toBe(0);
  });

  test("handles single session", () => {
    const sessions: Session[] = [
      createTestSession("2026-01-22", "2026-01-22T09:00:00.000Z", "2026-01-22T17:00:00.000Z"),
    ];

    const grouped = groupByDate(sessions);

    expect(grouped.size).toBe(1);
    expect(grouped.get("2026-01-22")).toHaveLength(1);
  });

  test("handles multiple days", () => {
    const sessions: Session[] = [
      createTestSession("2026-01-20", "2026-01-20T09:00:00.000Z", "2026-01-20T17:00:00.000Z", "a"),
      createTestSession("2026-01-21", "2026-01-21T09:00:00.000Z", "2026-01-21T17:00:00.000Z", "b"),
      createTestSession("2026-01-22", "2026-01-22T09:00:00.000Z", "2026-01-22T17:00:00.000Z", "c"),
      createTestSession("2026-01-23", "2026-01-23T09:00:00.000Z", "2026-01-23T17:00:00.000Z", "d"),
      createTestSession("2026-01-24", "2026-01-24T09:00:00.000Z", "2026-01-24T17:00:00.000Z", "e"),
    ];

    const grouped = groupByDate(sessions);

    expect(grouped.size).toBe(5);
    for (const date of ["2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24"]) {
      expect(grouped.has(date)).toBe(true);
      expect(grouped.get(date)).toHaveLength(1);
    }
  });

  test("preserves session order within day", () => {
    const sessions: Session[] = [
      createTestSession("2026-01-22", "2026-01-22T09:00:00.000Z", "2026-01-22T12:00:00.000Z", "first"),
      createTestSession("2026-01-22", "2026-01-22T13:00:00.000Z", "2026-01-22T15:00:00.000Z", "second"),
      createTestSession("2026-01-22", "2026-01-22T16:00:00.000Z", "2026-01-22T18:00:00.000Z", "third"),
    ];

    const grouped = groupByDate(sessions);
    const daySessions = grouped.get("2026-01-22");

    expect(daySessions?.[0].id).toBe("first");
    expect(daySessions?.[1].id).toBe("second");
    expect(daySessions?.[2].id).toBe("third");
  });

  test("handles sessions with same id but different dates", () => {
    // Edge case: theoretically shouldn't happen, but test resilience
    const sessions: Session[] = [
      createTestSession("2026-01-22", "2026-01-22T09:00:00.000Z", "2026-01-22T17:00:00.000Z", "same"),
      createTestSession("2026-01-23", "2026-01-23T09:00:00.000Z", "2026-01-23T17:00:00.000Z", "same"),
    ];

    const grouped = groupByDate(sessions);

    expect(grouped.size).toBe(2);
    expect(grouped.get("2026-01-22")?.[0].id).toBe("same");
    expect(grouped.get("2026-01-23")?.[0].id).toBe("same");
  });
});

describe("parseArgs", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("defaults to status command with no arguments", () => {
    const result = parseArgs([]);

    expect(result).not.toBeNull();
    expect(result?.command).toBe("status");
  });

  test("parses command as first argument", () => {
    expect(parseArgs(["today"])?.command).toBe("today");
    expect(parseArgs(["report"])?.command).toBe("report");
    expect(parseArgs(["export"])?.command).toBe("export");
    expect(parseArgs(["start"])?.command).toBe("start");
    expect(parseArgs(["stop"])?.command).toBe("stop");
  });

  test("parses -o output flag", () => {
    const result = parseArgs(["export", "-o", "output.csv"]);

    expect(result?.command).toBe("export");
    expect(result?.output).toBe("output.csv");
  });

  test("parses --output flag", () => {
    const result = parseArgs(["export", "--output", "output.csv"]);

    expect(result?.command).toBe("export");
    expect(result?.output).toBe("output.csv");
  });

  test("parses --date flag with valid date", () => {
    const result = parseArgs(["list", "--date", "2026-01-22"]);

    expect(result?.command).toBe("list");
    expect(result?.date).toBe("2026-01-22");
  });

  test("returns null for invalid --date format", () => {
    const result = parseArgs(["list", "--date", "invalid"]);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: --date must be in YYYY-MM-DD format");
  });

  test("parses --start flag with valid time", () => {
    const result = parseArgs(["add", "--start", "09:00"]);

    expect(result?.command).toBe("add");
    expect(result?.start).toBe("09:00");
  });

  test("returns null for invalid --start format", () => {
    const result = parseArgs(["add", "--start", "invalid"]);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: --start must be in HH:MM format");
  });

  test("parses --end flag with valid time", () => {
    const result = parseArgs(["add", "--end", "17:30"]);

    expect(result?.command).toBe("add");
    expect(result?.end).toBe("17:30");
  });

  test("returns null for invalid --end format", () => {
    const result = parseArgs(["add", "--end", "25:00"]);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: --end must be in HH:MM format");
  });

  test("parses --id flag", () => {
    const result = parseArgs(["edit", "--id", "abc12345"]);

    expect(result?.command).toBe("edit");
    expect(result?.id).toBe("abc12345");
  });

  test("parses multiple flags together", () => {
    const result = parseArgs([
      "add",
      "--date", "2026-01-22",
      "--start", "09:00",
      "--end", "17:30",
    ]);

    expect(result?.command).toBe("add");
    expect(result?.date).toBe("2026-01-22");
    expect(result?.start).toBe("09:00");
    expect(result?.end).toBe("17:30");
  });

  test("parses edit command with all flags", () => {
    const result = parseArgs([
      "edit",
      "--id", "abc12345",
      "--date", "2026-01-22",
      "--start", "08:00",
      "--end", "18:00",
    ]);

    expect(result?.command).toBe("edit");
    expect(result?.id).toBe("abc12345");
    expect(result?.date).toBe("2026-01-22");
    expect(result?.start).toBe("08:00");
    expect(result?.end).toBe("18:00");
  });

  test("ignores flags without values", () => {
    const result = parseArgs(["list", "--date"]);

    expect(result?.command).toBe("list");
    expect(result?.date).not.toBe(undefined); // Should have default date
  });

  test("handles help flags", () => {
    expect(parseArgs(["help"])?.command).toBe("help");
    expect(parseArgs(["-h"])?.command).toBe("-h");
    expect(parseArgs(["--help"])?.command).toBe("--help");
  });

  test("handles version flags", () => {
    expect(parseArgs(["version"])?.command).toBe("version");
    expect(parseArgs(["-v"])?.command).toBe("-v");
    expect(parseArgs(["--version"])?.command).toBe("--version");
  });
});
