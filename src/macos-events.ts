/**
 * macOS Event Detection - monitors screen lock/unlock state.
 *
 * HOW IT WORKS:
 * 1. Uses Python + PyObjC (Quartz framework) to check if screen is locked
 * 2. Polls every 5 seconds to detect changes
 * 3. Yields events when lock state changes
 *
 * WHY PYTHON?
 * macOS doesn't expose screen lock state through simple shell commands.
 * Python's Quartz bindings (pre-installed on macOS) provide easy access
 * to CGSessionCopyCurrentDictionary which contains the lock state.
 */

import { POLL_INTERVAL_MS } from "./config";
import type { Event } from "./types";

/**
 * Python script that checks if the screen is locked.
 * Returns "1" if locked, "0" if unlocked.
 *
 * CGSessionCopyCurrentDictionary returns a dictionary with session info.
 * The "CGSSessionScreenIsLocked" key tells us if the screen is locked.
 */
const PYTHON_CHECK_LOCK = `
import Quartz
s = Quartz.CGSessionCopyCurrentDictionary()
print(1 if s and s.get("CGSSessionScreenIsLocked", 0) else 0)
`;

/**
 * Checks if the macOS screen is currently locked.
 *
 * Spawns a Python process to query the Quartz framework.
 * Returns false on any error (fail-safe).
 */
async function isLocked(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["python3", "-c", PYTHON_CHECK_LOCK], { stdout: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim() === "1";
  } catch {
    // If Python fails, assume not locked (fail-safe)
    return false;
  }
}

/**
 * Async generator that yields events when screen lock state changes.
 *
 * USAGE:
 *   for await (const event of watchEvents()) {
 *     console.log(event); // "startup", "lock", or "unlock"
 *   }
 *
 * EVENTS:
 * - "startup": Yielded once when watching begins
 * - "lock": User locked their screen
 * - "unlock": User unlocked their screen
 *
 * This function runs forever (infinite loop) - it's meant to be the
 * main loop of the daemon process.
 */
export async function* watchEvents(): AsyncGenerator<Event> {
  // Check initial state
  let wasLocked = await isLocked();

  // Always emit startup event first
  yield "startup";

  // Poll forever, yielding events when state changes
  while (true) {
    await Bun.sleep(POLL_INTERVAL_MS);

    const locked = await isLocked();

    // Only yield if state actually changed
    if (wasLocked !== locked) {
      yield locked ? "lock" : "unlock";
      wasLocked = locked;
    }
  }
}
