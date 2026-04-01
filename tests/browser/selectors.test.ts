import { describe, it, expect } from "vitest";
import { buildSelectorCandidates } from "@/browser/selectors.js";

describe("buildSelectorCandidates", () => {
  it("generates candidates for a data-testid", () => {
    const candidates = buildSelectorCandidates("submit-btn", ["data-testid", "css"]);
    expect(candidates).toContain("[data-testid='submit-btn']");
  });

  it("passes through CSS selectors unchanged", () => {
    const candidates = buildSelectorCandidates("#my-button", ["data-testid", "css"]);
    expect(candidates).toContain("#my-button");
  });

  it("passes through complex selectors unchanged", () => {
    const candidates = buildSelectorCandidates("button.primary[type=submit]", ["css"]);
    expect(candidates).toContain("button.primary[type=submit]");
  });

  it("generates aria-label candidate for plain text", () => {
    const candidates = buildSelectorCandidates("Submit Form", ["aria-label", "text", "css"]);
    expect(candidates).toContain("[aria-label='Submit Form']");
    expect(candidates.some((c) => c.includes("text="))).toBe(true);
  });
});
