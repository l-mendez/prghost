import { describe, it, expect, vi } from "vitest";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          waitForSelector: vi.fn().mockResolvedValue({ click: vi.fn() }),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          keyboard: { type: vi.fn(), press: vi.fn() },
          evaluate: vi.fn().mockResolvedValue(undefined),
          setViewportSize: vi.fn().mockResolvedValue(undefined),
          screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
          close: vi.fn().mockResolvedValue(undefined),
          video: vi.fn().mockReturnValue({
            path: vi.fn().mockResolvedValue("/tmp/video.webm"),
          }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("@/browser/cursor.js", () => ({
  GhostCursorController: class {
    init = vi.fn().mockResolvedValue(undefined);
    moveTo = vi.fn().mockResolvedValue(undefined);
    click = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@/browser/timing.js", () => ({
  TimingProfile: class {
    typingDelay = { min: 0, max: 0 };
    clickPause = { min: 0, max: 0 };
    scrollSpeed = "smooth" as const;
    sectionPause = 0;
  },
  getTypingDelay: () => 0,
  getClickPause: () => 0,
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { recordWalkthrough } from "@/core/recorder.js";
import type { WalkthroughScript, PrGhostConfig } from "@/types/index.js";

describe("recordWalkthrough", () => {
  const script: WalkthroughScript = {
    metadata: {
      generatedAt: "2026-03-30T12:00:00Z",
      baseUrl: "http://localhost:3000",
      viewport: { width: 1280, height: 720 },
    },
    steps: [
      { action: "navigate", url: "/" },
      { action: "section", title: "Test", description: "Test section" },
    ],
  };

  const config: PrGhostConfig = {
    baseUrl: "http://localhost:3000",
    video: { viewport: { width: 1280, height: 720 }, format: "mp4", fps: 30 },
    timing: { typingDelay: { min: 0, max: 0 }, clickPause: { min: 0, max: 0 }, scrollSpeed: "smooth", sectionPause: 0 },
    ai: { provider: "openai", model: "gpt-4o", maxExplorationSteps: 20 },
    selectors: { priority: ["css"] },
    ignore: [],
  };

  it("returns a RecordingResult with video path and timestamps", async () => {
    const result = await recordWalkthrough(script, config);
    expect(result).toHaveProperty("videoPath");
    expect(result).toHaveProperty("timestamps");
    expect(result.timestamps).toHaveLength(2);
    expect(result).toHaveProperty("skippedSteps");
  });
});
