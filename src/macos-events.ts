import type { EventType } from "./types";

const IDLE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export interface SystemState {
  isLocked: boolean;
  isSleeping: boolean;
  idleTimeMs: number;
}

/**
 * Get current idle time in milliseconds using ioreg
 */
export async function getIdleTime(): Promise<number> {
  try {
    const proc = Bun.spawn(["ioreg", "-c", "IOHIDSystem"], {
      stdout: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Look for HIDIdleTime in nanoseconds
    const match = output.match(/"HIDIdleTime"\s*=\s*(\d+)/);
    if (match) {
      const nanoseconds = BigInt(match[1]);
      return Number(nanoseconds / BigInt(1000000)); // Convert to ms
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Check if screen is currently locked
 * Uses the CGSession dictionary
 */
export async function isScreenLocked(): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["python3", "-c", `
import Quartz
session = Quartz.CGSessionCopyCurrentDictionary()
if session:
    locked = session.get("CGSSessionScreenIsLocked", 0)
    print(1 if locked else 0)
else:
    print(0)
`],
      { stdout: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim() === "1";
  } catch {
    // Fallback: check if screensaver is active
    try {
      const proc = Bun.spawn(
        ["pgrep", "-x", "ScreenSaverEngine"],
        { stdout: "pipe" }
      );
      await proc.exited;
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }
}

/**
 * Check if system is about to sleep or just woke
 * Uses pmset to check power state
 */
export async function getLastPowerEvent(): Promise<{ event: "wake" | "sleep" | null; time: Date | null }> {
  try {
    const proc = Bun.spawn(
      ["pmset", "-g", "log"],
      { stdout: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = output.split("\n").reverse();

    for (const line of lines) {
      // Look for sleep/wake events
      if (line.includes("Wake from")) {
        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        return {
          event: "wake",
          time: dateMatch ? new Date(dateMatch[1]) : new Date(),
        };
      }
      if (line.includes("Entering Sleep") || line.includes("Sleep")) {
        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        return {
          event: "sleep",
          time: dateMatch ? new Date(dateMatch[1]) : new Date(),
        };
      }
    }

    return { event: null, time: null };
  } catch {
    return { event: null, time: null };
  }
}

/**
 * Get complete system state
 */
export async function getSystemState(): Promise<SystemState> {
  const [idleTimeMs, isLocked] = await Promise.all([
    getIdleTime(),
    isScreenLocked(),
  ]);

  return {
    isLocked,
    isSleeping: false, // Can't really detect if sleeping while running!
    idleTimeMs,
  };
}

/**
 * Check if user is considered "idle" (away from computer)
 */
export function isIdle(state: SystemState): boolean {
  return state.idleTimeMs > IDLE_THRESHOLD_MS;
}

/**
 * Watch for display sleep/wake using a notification approach
 * This uses caffeinate to keep script running and monitors for changes
 */
export async function* watchSystemEvents(): AsyncGenerator<EventType> {
  let lastState = await getSystemState();
  let lastLocked = lastState.isLocked;
  let lastIdle = isIdle(lastState);
  let lastIdleTime = lastState.idleTimeMs;

  // Emit startup event
  yield "startup";

  // Poll for changes every 5 seconds
  while (true) {
    await Bun.sleep(5000);

    const currentState = await getSystemState();
    const currentLocked = currentState.isLocked;
    const currentIdle = isIdle(currentState);

    // Detect wake (idle time reset to low value after being high)
    if (lastIdleTime > 60000 && currentState.idleTimeMs < 5000) {
      yield "wake";
    }

    // Detect lock/unlock
    if (!lastLocked && currentLocked) {
      yield "lock";
    } else if (lastLocked && !currentLocked) {
      yield "unlock";
    }

    // Detect idle state changes
    if (!lastIdle && currentIdle) {
      yield "idle_start";
    } else if (lastIdle && !currentIdle) {
      yield "idle_end";
    }

    lastState = currentState;
    lastLocked = currentLocked;
    lastIdle = currentIdle;
    lastIdleTime = currentState.idleTimeMs;
  }
}

/**
 * Alternative: Use distributed notifications via Swift helper
 * This is more reliable but requires compilation
 */
export function getSwiftNotificationWatcher(): string {
  return `
import Cocoa
import Foundation

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        let dnc = DistributedNotificationCenter.default()

        dnc.addObserver(self, selector: #selector(screenLocked),
            name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)
        dnc.addObserver(self, selector: #selector(screenUnlocked),
            name: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil)

        NSWorkspace.shared.notificationCenter.addObserver(self,
            selector: #selector(willSleep),
            name: NSWorkspace.willSleepNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self,
            selector: #selector(didWake),
            name: NSWorkspace.didWakeNotification, object: nil)

        print("READY")
        fflush(stdout)
    }

    @objc func screenLocked() { print("EVENT:lock"); fflush(stdout) }
    @objc func screenUnlocked() { print("EVENT:unlock"); fflush(stdout) }
    @objc func willSleep() { print("EVENT:sleep"); fflush(stdout) }
    @objc func didWake() { print("EVENT:wake"); fflush(stdout) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;
}
