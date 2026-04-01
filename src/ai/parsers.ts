import { z } from "zod";
import { walkthroughStepSchema } from "../config/schema.js";

export const walkthroughScriptSchema = z.object({
  metadata: z.object({
    pr: z
      .object({
        number: z.number(),
        repo: z.string(),
        title: z.string(),
      })
      .optional(),
    generatedAt: z.string(),
    baseUrl: z.string(),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
    }),
  }),
  steps: z.array(walkthroughStepSchema),
});

export const reconReportSchema = z.object({
  pagesVisited: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      screenshotBase64: z.string().optional(),
    }),
  ),
  interactiveElements: z.array(
    z.object({
      selector: z.string(),
      type: z.enum(["button", "link", "input", "select", "textarea", "other"]),
      label: z.string(),
      page: z.string(),
    }),
  ),
  observedBehaviors: z.array(
    z.object({
      trigger: z.string(),
      result: z.string(),
      page: z.string(),
    }),
  ),
  findings: z.array(
    z.object({
      description: z.string(),
      page: z.string(),
      relevantSelectors: z.array(z.string()),
    }),
  ),
  recommendedFlow: z.array(z.string()),
});

export const uxMapSchema = z.object({
  affectedRoutes: z.array(
    z.object({
      path: z.string(),
      description: z.string(),
      changedFiles: z.array(z.string()),
    }),
  ),
  changedComponents: z.array(
    z.object({
      name: z.string(),
      filePath: z.string(),
      usedIn: z.array(z.string()),
      changeDescription: z.string(),
    }),
  ),
  behaviorChanges: z.array(z.string()),
});

const fileCategorySchema = z.enum([
  "component",
  "page",
  "style",
  "util",
  "api-route",
  "test",
  "config",
  "other",
]);

export const diffAnalysisSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      category: fileCategorySchema,
      status: z.enum(["added", "modified", "deleted", "renamed"]),
      additions: z.number(),
      deletions: z.number(),
      hunks: z.array(
        z.object({
          header: z.string(),
          changes: z.string(),
        }),
      ),
    }),
  ),
  summary: z.object({
    totalFiles: z.number(),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
    categories: z.record(fileCategorySchema, z.number()),
  }),
  rawDiff: z.string(),
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("local"), ref: z.string() }),
    z.object({ type: z.literal("github"), pr: z.number(), repo: z.string() }),
  ]),
});
