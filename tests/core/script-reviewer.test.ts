import { describe, it, expect, vi } from "vitest";

const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

import { formatScriptForDisplay, applyNaturalLanguageEdit } from "@/core/script-reviewer.js";
import type { WalkthroughScript } from "@/types/index.js";

const baseScript: WalkthroughScript = {
  metadata: {
    generatedAt: "2026-03-30T12:00:00Z",
    baseUrl: "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
  },
  steps: [
    { action: "navigate", url: "/login" },
    { action: "type", selector: "#email", text: "test@test.com" },
    { action: "click", selector: "#submit", description: "Submit form" },
  ],
};

describe("formatScriptForDisplay", () => {
  it("formats each step with number and description", () => {
    const output = formatScriptForDisplay(baseScript);
    expect(output).toContain("1.");
    expect(output).toContain("navigate");
    expect(output).toContain("/login");
    expect(output).toContain("2.");
    expect(output).toContain("type");
    expect(output).toContain("3.");
    expect(output).toContain("click");
  });

  it("shows annotations when present", () => {
    const script: WalkthroughScript = {
      ...baseScript,
      steps: [{ action: "navigate", url: "/", annotation: "This is the home page" }],
    };
    const output = formatScriptForDisplay(script);
    expect(output).toContain("This is the home page");
  });
});

describe("applyNaturalLanguageEdit", () => {
  it("sends current script and instruction to LLM", async () => {
    const editedScript: WalkthroughScript = {
      ...baseScript,
      steps: [
        { action: "navigate", url: "/login" },
        { action: "click", selector: "#submit", description: "Submit form" },
      ],
    };
    mockGenerateObject.mockResolvedValue({ object: editedScript });

    const model = {} as any;
    const result = await applyNaturalLanguageEdit(model, baseScript, 2, "remove this step");
    expect(result.steps).toHaveLength(2);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });
});
