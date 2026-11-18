import { describe, expect, it } from "vitest";
import english from "./en.json";
import tamil from "./ta.json";

function sortedKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    sortedKeys(child, prefix ? `${prefix}.${key}` : key),
  ).sort();
}

describe("locale resources", () => {
  it("contains a Tamil value for every English UI key", () => {
    expect(sortedKeys(tamil)).toEqual(sortedKeys(english));
  });
});
