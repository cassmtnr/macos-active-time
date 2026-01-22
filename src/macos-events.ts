import type { EventType } from "./types";

/**
 * Check if screen is currently locked using CGSession
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
      const proc = Bun.spawn(["pgrep", "-x", "ScreenSaverEngine"], { stdout: "pipe" });
      await proc.exited;
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }
}

/**
 * Watch for screen lock/unlock events via polling
 */
export async function* watchSystemEvents(): AsyncGenerator<EventType> {
  let lastLocked = await isScreenLocked();

  // Emit startup event (if unlocked, start working)
  yield "startup";

  // Poll for lock/unlock changes every 5 seconds
  while (true) {
    await Bun.sleep(5000);

    const currentLocked = await isScreenLocked();

    if (!lastLocked && currentLocked) {
      yield "lock";
    } else if (lastLocked && !currentLocked) {
      yield "unlock";
    }

    lastLocked = currentLocked;
  }
}

/**
 * Swift helper for native macOS notifications (more reliable than polling)
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

        print("READY")
        fflush(stdout)
    }

    @objc func screenLocked() { print("EVENT:lock"); fflush(stdout) }
    @objc func screenUnlocked() { print("EVENT:unlock"); fflush(stdout) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;
}
