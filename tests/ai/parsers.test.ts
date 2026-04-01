import { describe, it, expect } from "vitest";
import {
  walkthroughScriptSchema,
  reconReportSchema,
  uxMapSchema,
  diffAnalysisSchema,
} from "@/ai/parsers.js";

describe("walkthroughScriptSchema", () => {
  it("validates a complete walkthrough script", () => {
    const script = {
      metadata: {
        generatedAt: "2026-03-30T12:00:00Z",
        baseUrl: "http://localhost:3000",
        viewport: { width: 1280, height: 720 },
      },
      steps: [
        { action: "navigate", url: "/dashboard" },
        { action: "click", selector: "#btn", description: "Click submit" },
        { action: "type", selector: "#email", text: "test@test.com" },
        { action: "section", title: "Login Flow", description: "Demonstrate the new login" },
        { action: "wait", duration: 1000, reason: "Wait for animation" },
      ],
    };
    const result = walkthroughScriptSchema.safeParse(script);
    expect(result.success).toBe(true);
  });

  it("validates script with PR metadata", () => {
    const script = {
      metadata: {
        pr: { number: 142, repo: "owner/repo", title: "Add login page" },
        generatedAt: "2026-03-30T12:00:00Z",
        baseUrl: "http://localhost:3000",
        viewport: { width: 1280, height: 720 },
      },
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = walkthroughScriptSchema.safeParse(script);
    expect(result.success).toBe(true);
  });

  it("rejects script with unknown action", () => {
    const script = {
      metadata: {
        generatedAt: "2026-03-30T12:00:00Z",
        baseUrl: "http://localhost:3000",
        viewport: { width: 1280, height: 720 },
      },
      steps: [{ action: "fly", target: "moon" }],
    };
    const result = walkthroughScriptSchema.safeParse(script);
    expect(result.success).toBe(false);
  });
});

describe("reconReportSchema", () => {
  it("validates a complete recon report", () => {
    const report = {
      pagesVisited: [{ url: "/", title: "Home" }],
      interactiveElements: [
        { selector: "#btn", type: "button", label: "Submit", page: "/" },
      ],
      observedBehaviors: [
        { trigger: "click #btn", result: "form submitted", page: "/" },
      ],
      findings: [
        {
          description: "New validation on email field",
          page: "/login",
          relevantSelectors: ["#email"],
        },
      ],
      recommendedFlow: ["Navigate to /login", "Fill in email", "Submit"],
    };
    const result = reconReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });
});

describe("uxMapSchema", () => {
  it("validates a UX map", () => {
    const map = {
      affectedRoutes: [
        { path: "/login", description: "Login page redesigned", changedFiles: ["src/app/login/page.tsx"] },
      ],
      changedComponents: [
        { name: "LoginForm", filePath: "src/components/LoginForm.tsx", usedIn: ["/login"], changeDescription: "Added email validation" },
      ],
      behaviorChanges: ["Email field now validates on blur"],
    };
    const result = uxMapSchema.safeParse(map);
    expect(result.success).toBe(true);
  });
});

describe("diffAnalysisSchema", () => {
  it("validates a diff analysis", () => {
    const analysis = {
      files: [
        {
          path: "src/app/login/page.tsx",
          category: "page",
          status: "modified",
          additions: 15,
          deletions: 3,
          hunks: [{ header: "@@ -1,10 +1,22 @@", changes: "+  const [error, setError] = useState('');" }],
        },
      ],
      summary: {
        totalFiles: 1,
        totalAdditions: 15,
        totalDeletions: 3,
        categories: { page: 1, component: 0, style: 0, util: 0, "api-route": 0, test: 0, config: 0, other: 0 },
      },
      rawDiff: "diff --git a/src/app/login/page.tsx ...",
      source: { type: "local", ref: "HEAD~1" },
    };
    const result = diffAnalysisSchema.safeParse(analysis);
    expect(result.success).toBe(true);
  });
});
