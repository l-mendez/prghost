import { describe, it, expect, vi } from "vitest";

// Mock Page and CursorController
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue({ click: vi.fn() }),
  waitForLoadState: vi.fn().mockResolvedValue(undefined),
  keyboard: {
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  },
  evaluate: vi.fn().mockResolvedValue(undefined),
  setViewportSize: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
};

const mockCursor = {
  init: vi.fn().mockResolvedValue(undefined),
  moveTo: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/browser/timing.js", () => ({
  getTypingDelay: () => 0,
  getClickPause: () => 0,
  sleep: vi.fn().mockResolvedValue(undefined),
  TimingProfile: class {
    typingDelay = { min: 0, max: 0 };
    clickPause = { min: 0, max: 0 };
    scrollSpeed = "smooth" as const;
    sectionPause = 0;
  },
}));

import { ActionExecutor } from "@/browser/actions.js";
import type { Page } from "playwright";
import type { CursorController } from "@/browser/cursor.js";
import { TimingProfile } from "@/browser/timing.js";

describe("ActionExecutor", () => {
  const profile = new TimingProfile({
    typingDelay: { min: 0, max: 0 },
    clickPause: { min: 0, max: 0 },
    scrollSpeed: "smooth",
    sectionPause: 0,
  });

  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const executor = new ActionExecutor(
    mockPage as unknown as Page,
    mockCursor as unknown as CursorController,
    profile,
    ["data-testid", "css"],
  );

  it("executes a navigate action", async () => {
    await executor.execute({ action: "navigate", url: "/dashboard" }, "http://localhost:3000");
    expect(mockPage.goto).toHaveBeenCalledWith(
      "http://localhost:3000/dashboard",
      expect.any(Object),
    );
  });

  it("executes a click action", async () => {
    await executor.execute({ action: "click", selector: "#btn", description: "Click submit" }, "http://localhost:3000");
    expect(mockCursor.click).toHaveBeenCalledWith("#btn");
  });

  it("executes a type action", async () => {
    await executor.execute(
      { action: "type", selector: "#email", text: "test@test.com" },
      "http://localhost:3000",
    );
    expect(mockCursor.click).toHaveBeenCalledWith("#email");
    expect(mockPage.keyboard.type).toHaveBeenCalled();
  });

  it("executes a type action with clearFirst", async () => {
    await executor.execute(
      { action: "type", selector: "#email", text: "new@test.com", clearFirst: true },
      "http://localhost:3000",
    );
    expect(mockPage.keyboard.press).toHaveBeenCalledWith("Meta+a");
    expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
  });

  it("executes a hover action", async () => {
    await executor.execute(
      { action: "hover", selector: "#menu", description: "Hover menu" },
      "http://localhost:3000",
    );
    expect(mockCursor.moveTo).toHaveBeenCalledWith("#menu");
  });

  it("executes a viewport action", async () => {
    await executor.execute(
      { action: "viewport", width: 375, height: 812 },
      "http://localhost:3000",
    );
    expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 375, height: 812 });
  });

  it("executes a screenshot action", async () => {
    await executor.execute(
      { action: "screenshot", name: "test-shot" },
      "http://localhost:3000",
    );
    expect(mockPage.screenshot).toHaveBeenCalled();
  });

  it("returns a timestamp for each action", async () => {
    const result = await executor.execute(
      { action: "navigate", url: "/" },
      "http://localhost:3000",
    );
    expect(typeof result.timestampMs).toBe("number");
  });
});
