import { describe, it, expect } from "vitest";
import { randomDelay, easeInOutCubic, getTypingDelay, getClickPause, TimingProfile } from "@/browser/timing.js";

describe("randomDelay", () => {
  it("returns a value within the specified range", () => {
    for (let i = 0; i < 100; i++) {
      const delay = randomDelay(50, 120);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(120);
    }
  });

  it("returns the exact value when min equals max", () => {
    expect(randomDelay(100, 100)).toBe(100);
  });
});

describe("easeInOutCubic", () => {
  it("starts at 0", () => { expect(easeInOutCubic(0)).toBe(0); });
  it("ends at 1", () => { expect(easeInOutCubic(1)).toBe(1); });
  it("is at 0.5 at the midpoint", () => { expect(easeInOutCubic(0.5)).toBe(0.5); });
  it("is slow at start and end, fast in middle", () => {
    const earlySlope = easeInOutCubic(0.1) - easeInOutCubic(0);
    const midSlope = easeInOutCubic(0.55) - easeInOutCubic(0.45);
    expect(midSlope).toBeGreaterThan(earlySlope);
  });
});

describe("TimingProfile", () => {
  it("creates a profile from config", () => {
    const profile = new TimingProfile({
      typingDelay: { min: 50, max: 120 },
      clickPause: { min: 200, max: 500 },
      scrollSpeed: "smooth",
      sectionPause: 1000,
    });
    expect(profile.sectionPause).toBe(1000);
    expect(profile.scrollSpeed).toBe("smooth");
  });
});

describe("getTypingDelay", () => {
  it("returns delay within configured range", () => {
    const profile = new TimingProfile({
      typingDelay: { min: 50, max: 120 },
      clickPause: { min: 200, max: 500 },
      scrollSpeed: "smooth",
      sectionPause: 1000,
    });
    for (let i = 0; i < 50; i++) {
      const delay = getTypingDelay(profile);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(120);
    }
  });
});

describe("getClickPause", () => {
  it("returns pause within configured range", () => {
    const profile = new TimingProfile({
      typingDelay: { min: 50, max: 120 },
      clickPause: { min: 200, max: 500 },
      scrollSpeed: "smooth",
      sectionPause: 1000,
    });
    for (let i = 0; i < 50; i++) {
      const pause = getClickPause(profile);
      expect(pause).toBeGreaterThanOrEqual(200);
      expect(pause).toBeLessThanOrEqual(500);
    }
  });
});
