import { describe, it, expect } from "vitest";
import { buildAnnotationFilter, checkFfmpeg } from "@/core/video-processor.js";
import type { StepTimestamp } from "@/types/index.js";

describe("buildAnnotationFilter", () => {
  it("generates drawtext filter for annotated steps", () => {
    const timestamps: StepTimestamp[] = [
      { stepIndex: 0, action: "navigate", timestampMs: 0 },
      { stepIndex: 1, action: "click", annotation: "Notice the new button", timestampMs: 2000 },
      { stepIndex: 2, action: "type", timestampMs: 4000 },
    ];
    const filter = buildAnnotationFilter(timestamps);
    expect(filter).toContain("drawtext");
    expect(filter).toContain("Notice the new button");
  });

  it("returns empty string when no annotations", () => {
    const timestamps: StepTimestamp[] = [
      { stepIndex: 0, action: "navigate", timestampMs: 0 },
    ];
    const filter = buildAnnotationFilter(timestamps);
    expect(filter).toBe("");
  });
});

describe("checkFfmpeg", () => {
  it("returns a boolean", async () => {
    const result = await checkFfmpeg();
    expect(typeof result).toBe("boolean");
  });
});
