import { afterEach, describe, expect, it, vi } from "vitest";
import { hasStorageWarning, readStorageItem, removeStorageItem, writeStorageItem } from "./safeStorage";

describe("safe storage fallback", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  it("keeps a write in memory and reports unavailable browser storage", () => {
    const dispatchEvent = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage(): never {
          throw new Error("storage blocked");
        },
        dispatchEvent,
      },
    });

    expect(writeStorageItem("blocked-storage-test", "kept")).toBe(false);
    expect(readStorageItem("blocked-storage-test")).toBe("kept");
    expect(hasStorageWarning()).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it("uses the latest in-memory value when browser storage is full", () => {
    const saved = "old";
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => key === "full-storage-test" ? saved : null,
          setItem: () => { throw new DOMException("quota exceeded", "QuotaExceededError"); },
          removeItem: () => { throw new DOMException("storage unavailable", "SecurityError"); },
        },
        dispatchEvent: vi.fn(),
      },
    });

    expect(writeStorageItem("full-storage-test", "new")).toBe(false);
    expect(readStorageItem("full-storage-test")).toBe("new");
    expect(readStorageItem("unwritten-full-storage-test")).toBeNull();
    expect(removeStorageItem("full-storage-test")).toBe(false);
    expect(readStorageItem("full-storage-test")).toBeNull();
  });
});
