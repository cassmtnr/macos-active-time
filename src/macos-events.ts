/**
 * macOS Event Detection - monitors screen lock/unlock state.
 *
 * HOW IT WORKS:
 * 1. Uses Swift + Quartz framework to check if screen is locked
 * 2. Polls every 5 seconds to detect changes
 * 3. Yields events when lock state changes
 *
 * WHY SWIFT?
 * macOS doesn't expose screen lock state through simple shell commands.
 * Swift is pre-installed on macOS and provides direct access to
 * CGSessionCopyCurrentDictionary which contains the lock state.
 */

import { POLL_INTERVAL_MS } from "./config";
import type { Event } from "./types";

/**
 * Swift code that checks if the screen is locked.
 * Returns "1" if locked, "0" if unlocked.
 *
 * CGSessionCopyCurrentDictionary returns a dictionary with session info.
 * The "CGSSessionScreenIsLocked" key tells us if the screen is locked.
 */
const SWIFT_CHECK_LOCK = `
import Quartz
if let d = CGSessionCopyCurrentDictionary() as? [String: Any],
   let locked = d["CGSSessionScreenIsLocked"] as? Int, locked == 1 {
    print("1")
} else {
    print("0")
}
`;

/** Track if we've already logged a Swift error to avoid spam */
let swiftErrorLogged = false;

/**
 * Checks if the macOS screen is currently locked.
 *
 * Spawns a Swift process to query the Quartz framework.
 * Returns false on any error (fail-safe).
 */
async function isLocked(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["swift", "-e", SWIFT_CHECK_LOCK], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      if (!swiftErrorLogged) {
        const stderr = await new Response(proc.stderr).text();
        console.error(`Warning: Swift lock detection failed (exit ${exitCode}): ${stderr.trim()}`);
        swiftErrorLogged = true;
      }
      return false;
    }

    swiftErrorLogged = false; // Reset on success
    return output.trim() === "1";
  } catch (err) {
    if (!swiftErrorLogged) {
      console.error(`Warning: Swift lock detection error: ${err}`);
      swiftErrorLogged = true;
    }
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
