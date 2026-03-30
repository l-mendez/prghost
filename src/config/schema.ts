import { z } from "zod";
import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import type { PrGhostConfig } from "../types/index.js";

const rangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

const walkthroughStepSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("navigate"),
    url: z.string(),
    waitFor: z.string().optional(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("click"),
    selector: z.string(),
    description: z.string(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("type"),
    selector: z.string(),
    text: z.string(),
    clearFirst: z.boolean().optional(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("scroll"),
    target: z.union([z.string(), z.object({ x: z.number(), y: z.number() })]),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("hover"),
    selector: z.string(),
    description: z.string(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("wait"),
    duration: z.number(),
    reason: z.string(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("screenshot"),
    name: z.string(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("viewport"),
    width: z.number(),
    height: z.number(),
    annotation: z.string().optional(),
  }),
  z.object({
    action: z.literal("section"),
    title: z.string(),
    description: z.string(),
  }),
]);

export { walkthroughStepSchema };

export const configSchema = z.object({
  devServer: z
    .object({
      command: z.string(),
      port: z.number(),
      readyPattern: z.string(),
      startTimeout: z.number().default(30000),
    })
    .optional(),
  baseUrl: z.string().default("http://localhost:3000"),
  video: z
    .object({
      viewport: z
        .object({
          width: z.number().default(1280),
          height: z.number().default(720),
        })
        .default({}),
      format: z.literal("mp4").default("mp4"),
      fps: z.number().default(30),
    })
    .default({}),
  timing: z
    .object({
      typingDelay: rangeSchema.default({ min: 50, max: 120 }),
      clickPause: rangeSchema.default({ min: 200, max: 500 }),
      scrollSpeed: z.enum(["smooth", "fast"]).default("smooth"),
      sectionPause: z.number().default(1000),
    })
    .default({}),
  ai: z
    .object({
      provider: z.enum(["openai", "anthropic", "google"]).default("openai"),
      model: z.string().default("gpt-4o"),
      maxExplorationSteps: z.number().default(20),
    })
    .default({}),
  selectors: z
    .object({
      priority: z
        .array(z.string())
        .default(["data-testid", "aria-label", "role", "css", "text"]),
    })
    .default({}),
  ignore: z.array(z.string()).default(["/api/*", "/_next/*"]),
  auth: z
    .object({
      steps: z.array(walkthroughStepSchema),
    })
    .optional(),
});

export const DEFAULT_CONFIG: PrGhostConfig = configSchema.parse({});

const CONFIG_FILES = ["prg.config.ts", "prg.config.js", ".prghostrc.json"];

async function loadConfigFile(
  dir: string,
): Promise<Partial<PrGhostConfig> | null> {
  for (const filename of CONFIG_FILES) {
    const filePath = path.join(dir, filename);
    if (!existsSync(filePath)) continue;

    if (filename.endsWith(".json")) {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content);
    }

    // For .ts/.js files, use dynamic import
    const fileUrl = pathToFileURL(filePath).href;
    const mod = await import(fileUrl);
    return mod.default ?? mod;
  }
  return null;
}

export async function loadConfig(
  dir: string,
  cliOverrides?: Partial<PrGhostConfig>,
): Promise<PrGhostConfig> {
  const fileConfig = await loadConfigFile(dir);
  const merged = {
    ...fileConfig,
    ...cliOverrides,
  };
  return configSchema.parse(merged);
}
