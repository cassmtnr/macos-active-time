/**
 * Integration tests for CLI commands.
 *
 * These tests run the actual CLI as a subprocess and verify output.
 * They test the complete flow from command to output.
 */

import { describe, test, expect } from "bun:test";
import { $ } from "bun";

describe("CLI Integration", () => {
  test("help command shows usage", async () => {
    const result = await $`bun run src/cli.ts help`.text();

    expect(result).toContain("work-tracker");
    expect(result).toContain("Commands:");
    expect(result).toContain("status");
    expect(result).toContain("today");
    expect(result).toContain("report");
    expect(result).toContain("export");
  });

  test("-h flag shows help", async () => {
    const result = await $`bun run src/cli.ts -h`.text();

    expect(result).toContain("work-tracker");
    expect(result).toContain("Commands:");
  });

  test("--help flag shows help", async () => {
    const result = await $`bun run src/cli.ts --help`.text();

    expect(result).toContain("work-tracker");
    expect(result).toContain("Commands:");
  });

  test("version command shows version", async () => {
    const result = await $`bun run src/cli.ts version`.text();

    expect(result).toContain("work-tracker");
    expect(result).toMatch(/v\d+\.\d+\.\d+/);
  });

  test("-v flag shows version", async () => {
    const result = await $`bun run src/cli.ts -v`.text();

    expect(result).toContain("work-tracker");
  });

  test("--version flag shows version", async () => {
    const result = await $`bun run src/cli.ts --version`.text();

    expect(result).toContain("work-tracker");
  });

  test("status command runs without error", async () => {
    const result = await $`bun run src/cli.ts status`.text();

    // Should show either sessions or "No sessions" message
    expect(result.includes("Sessions for") || result.includes("No sessions")).toBe(true);
  });

  test("today command runs without error", async () => {
    const result = await $`bun run src/cli.ts today`.text();

    // Should show either sessions or "No work recorded" message
    expect(result.includes("Date:") || result.includes("No work recorded")).toBe(true);
  });

  test("report command runs without error", async () => {
    const result = await $`bun run src/cli.ts report`.text();

    // Should show either work report or "No work records" message
    expect(result.includes("Work Report") || result.includes("No work records")).toBe(true);
  });

  test("export command runs without error", async () => {
    const result = await $`bun run src/cli.ts export`.text();

    // Should show CSV header or "No sessions" message
    expect(result.includes("Date,Start Time,End Time,Hours") || result.includes("No sessions")).toBe(true);
  });

  test("list command with --date flag", async () => {
    const result = await $`bun run src/cli.ts list --date 2026-01-01`.text();

    // Should show sessions or "No sessions" message
    expect(result.includes("Sessions for 2026-01-01") || result.includes("No sessions for 2026-01-01")).toBe(true);
  });

  test("log command runs without error", async () => {
    const result = await $`bun run src/cli.ts log`.text();

    // Should show events or "No event log" message
    expect(result.includes("Recent events") || result.includes("No event log")).toBe(true);
  });

  test("unknown command shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "unknowncommand"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(1);
    expect(stdout).toContain("Unknown command: unknowncommand");
  });

  test("invalid --date flag shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "list", "--date", "invalid"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("--date must be in YYYY-MM-DD format");
  });

  test("invalid --start flag shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "add", "--start", "invalid"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("--start must be in HH:MM format");
  });

  test("invalid --end flag shows error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "add", "--end", "25:00"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("--end must be in HH:MM format");
  });
});

describe("CLI Output Format", () => {
  test("status shows table with box-drawing characters", async () => {
    const result = await $`bun run src/cli.ts status`.text();

    if (result.includes("Sessions for")) {
      // Verify table structure
      expect(result).toContain("┌");
      expect(result).toContain("┐");
      expect(result).toContain("│");
      expect(result).toContain("└");
      expect(result).toContain("┘");
      expect(result).toContain("ID");
      expect(result).toContain("Start");
      expect(result).toContain("End");
      expect(result).toContain("Hours");
      expect(result).toContain("Total Day:");
    }
  });

  test("report shows Total Day and Total Month labels", async () => {
    const result = await $`bun run src/cli.ts report`.text();

    if (result.includes("Work Report") && !result.includes("No work records")) {
      expect(result).toContain("Total Day:");
      expect(result).toContain("Total Month:");
    }
  });

  test("export CSV has proper headers", async () => {
    const result = await $`bun run src/cli.ts export`.text();

    if (!result.includes("No sessions")) {
      expect(result).toContain("Date,Start Time,End Time,Hours");
    }
  });

  test("export CSV has Total Day and Total Month", async () => {
    const result = await $`bun run src/cli.ts export`.text();

    if (!result.includes("No sessions")) {
      expect(result).toContain("Total Day");
      expect(result).toContain("Total Month");
    }
  });
});
