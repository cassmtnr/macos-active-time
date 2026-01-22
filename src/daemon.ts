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
import type { EventType, WorkData } from "./types";
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
    case "unlock": {
      // Start work session
      if (!data.currentSession) {
        data.currentSession = createSession(now);
        console.log(`[${now.toISOString()}] Work started`);
      }
      // Handle day change
      if (data.currentSession && data.currentSession.date !== today) {
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);

        data.currentSession.endTime = midnight.toISOString();
        data.sessions.push(data.currentSession);

        data.currentSession = createSession(now);
        console.log(`[${now.toISOString()}] New day - new session`);
      }
      break;
    }

    case "lock":
    case "shutdown": {
      // End work session
      if (data.currentSession) {
        data.currentSession.endTime = now.toISOString();
        data.sessions.push(data.currentSession);
        data.currentSession = null;
        console.log(`[${now.toISOString()}] Work ended`);
      }
      break;
    }
  }

  return data;
}

async function main() {
  console.log("Work Tracker Daemon starting...");
  console.log(`Data: ${join(homedir(), ".work-tracker")}`);

  let data = await loadData();

  let eventStream = await startSwiftWatcher();
  if (!eventStream) {
    console.log("Using polling-based detection");
    eventStream = watchSystemEvents();
  } else {
    console.log("Using native macOS notifications");
  }

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

  for await (const event of eventStream) {
    data = await handleEvent(event, data);
    await saveData(data);
  }
}

main().catch(console.error);
