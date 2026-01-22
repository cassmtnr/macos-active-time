#!/usr/bin/env bun

import {
  loadData,
  saveData,
  createSession,
  calculateSessionMinutes,
  logEvent,
  getDateString,
} from "./storage";
import { watchSystemEvents, getSwiftNotificationWatcher } from "./macos-events";
import type { EventType, WorkData, WorkSession } from "./types";
import { join } from "path";
import { homedir } from "os";

const SWIFT_HELPER_PATH = join(homedir(), ".work-tracker", "event-watcher");

async function compileSwiftHelper(): Promise<boolean> {
  const swiftCode = getSwiftNotificationWatcher();
  const swiftFile = join(homedir(), ".work-tracker", "event-watcher.swift");

  await Bun.write(swiftFile, swiftCode);

  console.log("Compiling Swift event watcher...");
  const proc = Bun.spawn(["swiftc", "-o", SWIFT_HELPER_PATH, swiftFile], {
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  return exitCode === 0;
}

async function startSwiftWatcher(): Promise<AsyncGenerator<EventType> | null> {
  // Check if helper exists, compile if not
  const helperFile = Bun.file(SWIFT_HELPER_PATH);
  if (!(await helperFile.exists())) {
    const compiled = await compileSwiftHelper();
    if (!compiled) {
      console.log("Failed to compile Swift helper, falling back to polling");
      return null;
    }
  }

  const proc = Bun.spawn([SWIFT_HELPER_PATH], {
    stdout: "pipe",
    stderr: "inherit",
  });

  async function* eventGenerator(): AsyncGenerator<EventType> {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Wait for READY signal
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("READY")) {
        buffer = buffer.replace("READY", "").trim();
        yield "startup";
        break;
      }
    }

    // Process events
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("EVENT:")) {
          const event = line.replace("EVENT:", "").trim() as EventType;
          yield event;
        }
      }
    }
  }

  return eventGenerator();
}

async function handleEvent(event: EventType, data: WorkData): Promise<WorkData> {
  const now = new Date();
  const today = getDateString(now);

  await logEvent(event);

  switch (event) {
    case "startup":
    case "wake":
    case "unlock":
    case "idle_end": {
      // Start or resume work
      if (!data.currentSession) {
        // Start new session
        data.currentSession = createSession(now);
        console.log(`[${now.toISOString()}] Started new work session`);
      } else if (data.currentSession.breaks.length > 0) {
        // End current break
        const lastBreak = data.currentSession.breaks[data.currentSession.breaks.length - 1];
        if (!lastBreak.endTime) {
          lastBreak.endTime = now.toISOString();
          console.log(`[${now.toISOString()}] Resumed work (break ended)`);
        }
      }
      // Check if session is from a different day
      if (data.currentSession && data.currentSession.date !== today) {
        // End old session at midnight
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);

        data.currentSession.endTime = midnight.toISOString();
        data.currentSession.totalMinutes = calculateSessionMinutes(data.currentSession);
        data.sessions.push(data.currentSession);

        // Start new session for today
        data.currentSession = createSession(now);
        console.log(`[${now.toISOString()}] New day - started new session`);
      }
      break;
    }

    case "sleep":
    case "lock":
    case "idle_start": {
      // Start a break or end session
      if (data.currentSession) {
        const reason = event === "sleep" ? "sleep" : event === "lock" ? "lock" : "idle";
        data.currentSession.breaks.push({
          startTime: now.toISOString(),
          endTime: null,
          reason,
        });
        console.log(`[${now.toISOString()}] Break started (${reason})`);
      }
      break;
    }

    case "shutdown": {
      // End the current session
      if (data.currentSession) {
        data.currentSession.endTime = now.toISOString();
        data.currentSession.totalMinutes = calculateSessionMinutes(data.currentSession);
        data.sessions.push(data.currentSession);
        data.currentSession = null;
        console.log(`[${now.toISOString()}] Session ended (shutdown)`);
      }
      break;
    }
  }

  return data;
}

async function endSessionsWithOpenBreaks(data: WorkData): Promise<WorkData> {
  // If current session has a break that's been open for more than 4 hours, end the session
  if (data.currentSession && data.currentSession.breaks.length > 0) {
    const lastBreak = data.currentSession.breaks[data.currentSession.breaks.length - 1];
    if (!lastBreak.endTime) {
      const breakStart = new Date(lastBreak.startTime);
      const now = new Date();
      const breakDurationMs = now.getTime() - breakStart.getTime();

      // If break is longer than 4 hours, end the session at break start
      if (breakDurationMs > 4 * 60 * 60 * 1000) {
        data.currentSession.breaks.pop(); // Remove the long break
        data.currentSession.endTime = lastBreak.startTime;
        data.currentSession.totalMinutes = calculateSessionMinutes(data.currentSession);
        data.sessions.push(data.currentSession);
        data.currentSession = null;
        console.log(`Auto-ended stale session`);
      }
    }
  }
  return data;
}

async function main() {
  console.log("Work Tracker Daemon starting...");
  console.log(`Data directory: ${join(homedir(), ".work-tracker")}`);

  let data = await loadData();

  // Clean up any stale sessions
  data = await endSessionsWithOpenBreaks(data);
  await saveData(data);

  // Try to use Swift watcher first (more reliable), fall back to polling
  let eventStream = await startSwiftWatcher();

  if (!eventStream) {
    console.log("Using polling-based event detection");
    eventStream = watchSystemEvents();
  } else {
    console.log("Using native macOS event notifications");
  }

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    data = await handleEvent("shutdown", data);
    await saveData(data);
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\nShutting down...");
    data = await handleEvent("shutdown", data);
    await saveData(data);
    process.exit(0);
  });

  // Main event loop
  for await (const event of eventStream) {
    data = await handleEvent(event, data);
    await saveData(data);
  }
}

main().catch(console.error);
