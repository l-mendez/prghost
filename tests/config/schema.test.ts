import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configSchema, loadConfig, DEFAULT_CONFIG } from "@/config/schema.js";

describe("configSchema", () => {
  it("validates a complete config", () => {
    const result = configSchema.safeParse({
      baseUrl: "http://localhost:3000",
      video: { viewport: { width: 1280, height: 720 }, format: "mp4", fps: 30 },
      timing: {
        typingDelay: { min: 50, max: 120 },
        clickPause: { min: 200, max: 500 },
        scrollSpeed: "smooth",
        sectionPause: 1000,
      },
      ai: { provider: "openai", model: "gpt-4o", maxExplorationSteps: 20 },
      selectors: { priority: ["data-testid", "css"] },
      ignore: [],
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing optional fields", () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("http://localhost:3000");
      expect(result.data.video.viewport.width).toBe(1280);
      expect(result.data.ai.provider).toBe("openai");
      expect(result.data.ai.model).toBe("gpt-4o");
    }
  });

  it("rejects invalid provider", () => {
    const result = configSchema.safeParse({
      ai: { provider: "invalid", model: "gpt-4o", maxExplorationSteps: 20 },
    });
    expect(result.success).toBe(false);
  });

  it("validates auth steps when present", () => {
    const result = configSchema.safeParse({
      auth: {
        steps: [
          { action: "navigate", url: "/login" },
          { action: "click", selector: "#btn", description: "Click login" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects auth steps with invalid action", () => {
    const result = configSchema.safeParse({
      auth: {
        steps: [{ action: "invalid_action" }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig("/nonexistent/path");
    expect(config.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(config.ai.provider).toBe("openai");
  });

  it("CLI overrides take precedence", async () => {
    const config = await loadConfig("/nonexistent/path", {
      baseUrl: "http://localhost:8080",
    });
    expect(config.baseUrl).toBe("http://localhost:8080");
  });
});
