// tests/core/github.test.ts
import { describe, it, expect } from "vitest";
import { parseRepoString, buildPRDiffUrl } from "@/core/github.js";

describe("parseRepoString", () => {
  it("parses owner/repo format", () => {
    const result = parseRepoString("facebook/react");
    expect(result).toEqual({ owner: "facebook", repo: "react" });
  });

  it("throws on invalid format", () => {
    expect(() => parseRepoString("invalid")).toThrow();
    expect(() => parseRepoString("")).toThrow();
  });
});

describe("buildPRDiffUrl", () => {
  it("builds the correct API URL", () => {
    const url = buildPRDiffUrl("facebook", "react", 142);
    expect(url).toBe("/repos/facebook/react/pulls/142");
  });
});
