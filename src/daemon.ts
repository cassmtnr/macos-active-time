#!/usr/bin/env bun
/**
 * Work Tracker Daemon - background process that monitors screen lock/unlock.
 *
 * This is the main background service that:
 * 1. Monitors screen lock/unlock events
 * 2. Creates work sessions when you unlock (start working)
 * 3. Ends work sessions when you lock (stop working)
 * 4. Saves everything to disk
 *
 * HOW TO RUN:
 *   bun run src/daemon.ts
 *   OR: work-tracker daemon
 *
 * The daemon is typically started automatically via LaunchAgent at login.
 */

import { load, save, createSession, appendLog, toDateStr } from "./storage";
import { watchEvents } from "./macos-events";
import { DATA_DIR } from "./config";
import type { Store, Event } from "./types";

/**
 * Processes a single event and returns the updated store.
 *
 * This function is PURE - it doesn't modify the input, it returns a new object.
 * This makes it easier to reason about and test.
 *
 * @param event - The event that occurred
 * @param store - Current state
 * @returns New state after processing the event
 */
function processEvent(event: Event, store: Store): Store {
  const now = new Date();
  const today = toDateStr(now);

  // Create a copy of the store (don't mutate the original)
  const updated: Store = {
    ...store,
    sessions: [...store.sessions],
    currentSession: store.currentSession,
  };

  // Handle work START events (startup or unlock)
  if (event === "startup" || event === "unlock") {
    if (!updated.currentSession) {
      // No active session - start a new one
      updated.currentSession = createSession(now);
      console.log(`[${now.toISOString()}] Work started`);
    } else if (updated.currentSession.date !== today) {
      // Day changed while we were working - close old session, start new one
      // This handles the case where you leave your computer unlocked overnight
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);

      updated.currentSession.endTime = midnight.toISOString();
      updated.sessions.push(updated.currentSession);
      updated.currentSession = createSession(now);
      console.log(`[${now.toISOString()}] New day - new session`);
    }
    // If we already have a session for today, do nothing (already working)
  }

  // Handle work END events (lock)
  if (event === "lock") {
    if (updated.currentSession) {
      // End the current session
      updated.currentSession.endTime = now.toISOString();
      updated.sessions.push(updated.currentSession);
      updated.currentSession = null;
      console.log(`[${now.toISOString()}] Work ended`);
    }
    // If no active session, do nothing (already not working)
  }

  return updated;
}

/**
 * Gracefully shuts down the daemon.
 * Ensures current session is saved before exiting.
 */
async function shutdown(store: Store): Promise<void> {
  console.log("\nShutting down...");

  // If there's an active session, end it now
  if (store.currentSession) {
    store.currentSession.endTime = new Date().toISOString();
    store.sessions.push(store.currentSession);
    store.currentSession = null;
  }

  await save(store);
  process.exit(0);
}

/**
 * Main entry point for the daemon.
 */
async function main(): Promise<void> {
  console.log("Work Tracker Daemon starting...");
  console.log(`Data: ${DATA_DIR}`);

  // Load existing data
  let store = await load();

  // Set up graceful shutdown handlers
  // These ensure we save data when the process is killed
  const handleShutdown = () => shutdown(store);
  process.on("SIGINT", handleShutdown);  // Ctrl+C
  process.on("SIGTERM", handleShutdown); // kill command

  // Main event loop - runs forever
  for await (const event of watchEvents()) {
    // Log the event for debugging
    await appendLog(event);

    // Process the event and update state
    store = processEvent(event, store);

    // Save to disk after every event
    await save(store);
  }
}

// Start the daemon
main().catch(console.error);
