import { describe, it, expect } from "vitest";
import { generateBotName } from "@/lib/names";

describe("generateBotName", () => {
  it("returns a name in the format adj-noun-number", () => {
    const name = generateBotName();
    const parts = name.split("-");
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(Number(parts[2])).toBeGreaterThanOrEqual(100);
    expect(Number(parts[2])).toBeLessThan(1000);
  });

  it("generates unique names", () => {
    const names = new Set(Array.from({ length: 50 }, () => generateBotName()));
    // With 20*20*900=360k combinations, 50 should be unique
    expect(names.size).toBe(50);
  });
});
