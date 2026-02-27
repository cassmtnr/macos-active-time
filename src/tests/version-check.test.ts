import { describe, test, expect } from "bun:test";
import { isNewerVersion } from "../version-check";

describe("isNewerVersion", () => {
  test("returns true when remote major is higher", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  test("returns true when remote minor is higher", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  test("returns true when remote patch is higher", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  test("returns false when versions are equal", () => {
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
  });

  test("returns false when local is newer", () => {
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  test("returns false when local minor is higher", () => {
    expect(isNewerVersion("1.1.0", "1.0.9")).toBe(false);
  });

  test("handles 0.x versions", () => {
    expect(isNewerVersion("0.0.1", "0.0.2")).toBe(true);
    expect(isNewerVersion("0.0.2", "0.0.1")).toBe(false);
  });
});
