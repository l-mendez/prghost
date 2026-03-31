// tests/core/script-generator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

import { generateWalkthroughScript } from "@/core/script-generator.js";
import type { ReconReport, DiffAnalysis } from "@/types/index.js";

describe("generateWalkthroughScript", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const mockRecon: ReconReport = {
    pagesVisited: [{ url: "http://localhost:3000/login", title: "Login" }],
    interactiveElements: [
      { selector: "#email", type: "input", label: "Email", page: "http://localhost:3000/login" },
    ],
    observedBehaviors: [
      { trigger: "click button", result: "DOM changed", page: "http://localhost:3000/login" },
    ],
    findings: [
      { description: "Email validation on blur", page: "/login", relevantSelectors: ["#email"] },
    ],
    recommendedFlow: ["Navigate to /login", "Test email validation"],
  };

  const mockDiff: DiffAnalysis = {
    files: [],
    summary: { totalFiles: 0, totalAdditions: 0, totalDeletions: 0, categories: {} as any },
    rawDiff: "",
    source: { type: "local", ref: "HEAD~1" },
  };

  it("generates a walkthrough script from recon report", async () => {
    const mockScript = {
      metadata: {
        generatedAt: "2026-03-30T12:00:00Z",
        baseUrl: "http://localhost:3000",
        viewport: { width: 1280, height: 720 },
      },
      steps: [
        { action: "navigate", url: "/login" },
        { action: "click", selector: "#email", description: "Focus email field" },
      ],
    };
    mockGenerateObject.mockResolvedValue({ object: mockScript });

    const model = {} as any;
    const result = await generateWalkthroughScript(model, mockRecon, mockDiff, {
      baseUrl: "http://localhost:3000",
      viewport: { width: 1280, height: 720 },
    });
    expect(result.metadata.baseUrl).toBe("http://localhost:3000");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });

  it("retries once on validation failure", async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error("Validation failed"))
      .mockResolvedValueOnce({
        object: {
          metadata: {
            generatedAt: "2026-03-30T12:00:00Z",
            baseUrl: "http://localhost:3000",
            viewport: { width: 1280, height: 720 },
          },
          steps: [{ action: "navigate", url: "/" }],
        },
      });

    const model = {} as any;
    const result = await generateWalkthroughScript(model, mockRecon, mockDiff, {
      baseUrl: "http://localhost:3000",
      viewport: { width: 1280, height: 720 },
    });
    expect(result.steps).toHaveLength(1);
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });
});
