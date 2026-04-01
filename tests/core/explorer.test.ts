// tests/core/explorer.test.ts
import { describe, it, expect, vi } from "vitest";

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  tool: vi.fn((config) => config),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
}));

import { buildExplorerTools, runExplorationAgent } from "@/core/explorer.js";

describe("buildExplorerTools", () => {
  it("returns all six explorer tools", () => {
    const mockPage = {} as any;
    const tools = buildExplorerTools(mockPage);
    const toolNames = Object.keys(tools).filter(k => !k.startsWith("_"));
    expect(toolNames).toContain("navigate");
    expect(toolNames).toContain("inspectDOM");
    expect(toolNames).toContain("getInteractiveElements");
    expect(toolNames).toContain("screenshot");
    expect(toolNames).toContain("tryInteraction");
    expect(toolNames).toContain("reportFinding");
    expect(toolNames).toHaveLength(6);
  });
});

describe("runExplorationAgent", () => {
  it("calls generateText with tools and returns a ReconReport", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Exploration complete.",
      toolCalls: [],
      toolResults: [],
    });

    const model = {} as any;
    const page = {} as any;
    const diff = { files: [], summary: { totalFiles: 0, totalAdditions: 0, totalDeletions: 0, categories: {} }, rawDiff: "", source: { type: "local" as const, ref: "HEAD" } } as any;
    const uxMap = { affectedRoutes: [], changedComponents: [], behaviorChanges: [] };

    const result = await runExplorationAgent(model, page, diff, uxMap, 5);
    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(result).toHaveProperty("pagesVisited");
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("recommendedFlow");
  });
});
