/**
 * Regression tests for daemon.ts processEvent state machine.
 *
 * Tests cover:
 * - Event handling (startup, lock, unlock)
 * - Session lifecycle (creation, ending)
 * - Day change handling
 * - Edge cases (duplicate events, zero-duration sessions)
 */

import { describe, test, expect } from "bun:test";
import { processEvent } from "../daemon";
import type { Store } from "../types";

/**
 * Creates an empty store for testing.
 */
function emptyStore(): Store {
  return {
    version: 1,
    sessions: [],
    currentSession: null,
    absences: [],
  };
}

/**
 * Creates a store with an active session.
 */
function storeWithSession(date: string, startTime: string, id = "test1234"): Store {
  return {
    version: 1,
    sessions: [],
    currentSession: {
      id,
      date,
      startTime,
      endTime: null,
    },
    absences: [],
  };
}

describe("processEvent - startup", () => {
  test("starts a new session when no active session", () => {
    const store = emptyStore();
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("startup", store, now);

    expect(result.currentSession).not.toBeNull();
    expect(result.currentSession?.date).toBe("2026-01-22");
    expect(result.currentSession?.startTime).toBe("2026-01-22T09:00:00.000Z");
    expect(result.currentSession?.endTime).toBeNull();
    expect(result.sessions).toHaveLength(0);
  });

  test("does nothing when session already active for same day", () => {
    const store = storeWithSession("2026-01-22", "2026-01-22T08:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("startup", store, now);

    // Should keep the existing session
    expect(result.currentSession?.startTime).toBe("2026-01-22T08:00:00.000Z");
    expect(result.sessions).toHaveLength(0);
  });

  test("handles day change - closes old session and starts new one", () => {
    const store = storeWithSession("2026-01-21", "2026-01-21T08:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("startup", store, now);

    // Old session should be ended at midnight and saved
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].date).toBe("2026-01-21");
    expect(result.sessions[0].endTime).toBe("2026-01-22T00:00:00.000Z");

    // New session should start now
    expect(result.currentSession?.date).toBe("2026-01-22");
    expect(result.currentSession?.startTime).toBe("2026-01-22T09:00:00.000Z");
  });
});

describe("processEvent - unlock", () => {
  test("starts a new session when no active session", () => {
    const store = emptyStore();
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("unlock", store, now);

    expect(result.currentSession).not.toBeNull();
    expect(result.currentSession?.date).toBe("2026-01-22");
    expect(result.currentSession?.startTime).toBe("2026-01-22T09:00:00.000Z");
  });

  test("does nothing when session already active for same day", () => {
    const store = storeWithSession("2026-01-22", "2026-01-22T08:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("unlock", store, now);

    expect(result.currentSession?.startTime).toBe("2026-01-22T08:00:00.000Z");
    expect(result.sessions).toHaveLength(0);
  });

  test("handles day change - closes old session and starts new one", () => {
    const store = storeWithSession("2026-01-21", "2026-01-21T17:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("unlock", store, now);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].endTime).toBe("2026-01-22T00:00:00.000Z");
    expect(result.currentSession?.date).toBe("2026-01-22");
  });
});

describe("processEvent - lock", () => {
  test("ends current session and saves it", () => {
    const store = storeWithSession("2026-01-22", "2026-01-22T09:00:00.000Z");
    const now = new Date("2026-01-22T17:30:00.000Z");

    const result = processEvent("lock", store, now);

    expect(result.currentSession).toBeNull();
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].startTime).toBe("2026-01-22T09:00:00.000Z");
    expect(result.sessions[0].endTime).toBe("2026-01-22T17:30:00.000Z");
  });

  test("does nothing when no active session", () => {
    const store = emptyStore();
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("lock", store, now);

    expect(result.currentSession).toBeNull();
    expect(result.sessions).toHaveLength(0);
  });

  test("does not save zero-duration sessions", () => {
    const store = storeWithSession("2026-01-22", "2026-01-22T09:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z"); // Same time as start

    const result = processEvent("lock", store, now);

    expect(result.currentSession).toBeNull();
    expect(result.sessions).toHaveLength(0); // Session not saved due to zero duration
  });
});

describe("processEvent - immutability", () => {
  test("does not mutate the original store", () => {
    const store = emptyStore();
    const originalSessions = store.sessions;
    const now = new Date("2026-01-22T09:00:00.000Z");

    processEvent("startup", store, now);

    expect(store.currentSession).toBeNull();
    expect(store.sessions).toBe(originalSessions);
    expect(store.sessions).toHaveLength(0);
  });

  test("does not mutate sessions array", () => {
    const store = storeWithSession("2026-01-22", "2026-01-22T09:00:00.000Z");
    const originalSessions = store.sessions;
    const now = new Date("2026-01-22T17:00:00.000Z");

    const result = processEvent("lock", store, now);

    expect(store.sessions).toBe(originalSessions);
    expect(store.sessions).toHaveLength(0);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions).not.toBe(originalSessions);
  });
});

describe("processEvent - complex scenarios", () => {
  test("full work day simulation", () => {
    let store = emptyStore();

    // 9:00 AM - Unlock (start work)
    store = processEvent("unlock", store, new Date("2026-01-22T09:00:00.000Z"));
    expect(store.currentSession).not.toBeNull();
    expect(store.sessions).toHaveLength(0);

    // 12:00 PM - Lock (lunch break)
    store = processEvent("lock", store, new Date("2026-01-22T12:00:00.000Z"));
    expect(store.currentSession).toBeNull();
    expect(store.sessions).toHaveLength(1);

    // 1:00 PM - Unlock (back from lunch)
    store = processEvent("unlock", store, new Date("2026-01-22T13:00:00.000Z"));
    expect(store.currentSession).not.toBeNull();
    expect(store.sessions).toHaveLength(1);

    // 6:00 PM - Lock (end of day)
    store = processEvent("lock", store, new Date("2026-01-22T18:00:00.000Z"));
    expect(store.currentSession).toBeNull();
    expect(store.sessions).toHaveLength(2);

    // Verify sessions
    expect(store.sessions[0].startTime).toBe("2026-01-22T09:00:00.000Z");
    expect(store.sessions[0].endTime).toBe("2026-01-22T12:00:00.000Z");
    expect(store.sessions[1].startTime).toBe("2026-01-22T13:00:00.000Z");
    expect(store.sessions[1].endTime).toBe("2026-01-22T18:00:00.000Z");
  });

  test("overnight session across days", () => {
    // Start working at 11 PM
    let store = processEvent("unlock", emptyStore(), new Date("2026-01-21T23:00:00.000Z"));

    // Next day at 9 AM, unlock again (this should handle day change)
    store = processEvent("unlock", store, new Date("2026-01-22T09:00:00.000Z"));

    // The old session should be closed at midnight
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0].date).toBe("2026-01-21");
    expect(store.sessions[0].endTime).toBe("2026-01-22T00:00:00.000Z");

    // New session should be created
    expect(store.currentSession?.date).toBe("2026-01-22");
    expect(store.currentSession?.startTime).toBe("2026-01-22T09:00:00.000Z");
  });

  test("multiple duplicate unlock events", () => {
    let store = emptyStore();

    // First unlock
    store = processEvent("unlock", store, new Date("2026-01-22T09:00:00.000Z"));
    const firstSessionId = store.currentSession?.id;

    // Duplicate unlock (should be ignored)
    store = processEvent("unlock", store, new Date("2026-01-22T09:05:00.000Z"));

    // Session should remain unchanged
    expect(store.currentSession?.id).toBe(firstSessionId);
    expect(store.currentSession?.startTime).toBe("2026-01-22T09:00:00.000Z");
  });

  test("multiple duplicate lock events", () => {
    let store = storeWithSession("2026-01-22", "2026-01-22T09:00:00.000Z");

    // First lock
    store = processEvent("lock", store, new Date("2026-01-22T17:00:00.000Z"));
    expect(store.sessions).toHaveLength(1);

    // Duplicate lock (should be ignored)
    store = processEvent("lock", store, new Date("2026-01-22T17:05:00.000Z"));

    // Still only one session
    expect(store.sessions).toHaveLength(1);
    expect(store.currentSession).toBeNull();
  });

  test("preserves existing sessions", () => {
    const store: Store = {
      version: 1,
      sessions: [
        {
          id: "existing1",
          date: "2026-01-21",
          startTime: "2026-01-21T09:00:00.000Z",
          endTime: "2026-01-21T17:00:00.000Z",
        },
      ],
      currentSession: null,
      absences: [],
    };

    // Start new session
    const result = processEvent("unlock", store, new Date("2026-01-22T09:00:00.000Z"));

    // Existing session should be preserved
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("existing1");
    expect(result.currentSession).not.toBeNull();
  });
});

describe("processEvent - day change edge cases", () => {
  test("does not save zero-duration session on day change", () => {
    // Session starts at exactly midnight
    const store = storeWithSession("2026-01-21", "2026-01-22T00:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("unlock", store, now);

    // The old session has zero duration (started at midnight, ended at midnight)
    // It should not be saved
    expect(result.sessions).toHaveLength(0);
    expect(result.currentSession?.date).toBe("2026-01-22");
  });

  test("saves session with duration on day change", () => {
    // Session started before midnight
    const store = storeWithSession("2026-01-21", "2026-01-21T23:00:00.000Z");
    const now = new Date("2026-01-22T09:00:00.000Z");

    const result = processEvent("unlock", store, now);

    // The old session has 1 hour duration (23:00 to 00:00)
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].endTime).toBe("2026-01-22T00:00:00.000Z");
  });
});
