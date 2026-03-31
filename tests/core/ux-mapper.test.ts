// tests/core/ux-mapper.test.ts
import { describe, it, expect, vi } from "vitest";

const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

import { generateUXMap } from "@/core/ux-mapper.js";
import type { DiffAnalysis } from "@/types/index.js";

describe("generateUXMap", () => {
  it("calls generateObject with diff analysis and returns UX map", async () => {
    const mockUXMap = {
      affectedRoutes: [
        { path: "/login", description: "Login page modified", changedFiles: ["src/app/login/page.tsx"] },
      ],
      changedComponents: [],
      behaviorChanges: ["Login form now validates email on blur"],
    };

    mockGenerateObject.mockResolvedValue({ object: mockUXMap });

    const diff: DiffAnalysis = {
      files: [{
        path: "src/app/login/page.tsx",
        category: "page",
        status: "modified",
        additions: 10,
        deletions: 2,
        hunks: [{ header: "@@ -1,5 +1,13 @@", changes: "+validation code" }],
      }],
      summary: {
        totalFiles: 1, totalAdditions: 10, totalDeletions: 2,
        categories: { page: 1, component: 0, style: 0, util: 0, "api-route": 0, test: 0, config: 0, other: 0 },
      },
      rawDiff: "diff content",
      source: { type: "local", ref: "HEAD~1" },
    };

    const model = {} as any;
    const result = await generateUXMap(diff, model);
    expect(result).toEqual(mockUXMap);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });
});
