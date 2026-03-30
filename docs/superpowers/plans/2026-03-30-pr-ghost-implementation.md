# PR Ghost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that generates video walkthroughs of PR changes by analyzing diffs, exploring the running app via AI agent, and recording human-like Playwright browser sessions.

**Architecture:** Two-phase pipeline — an AI exploration agent navigates the app and produces a ReconReport, then a single structured LLM call generates a WalkthroughScript, which a dumb recorder replays with human-like timing. Video post-processing via ffmpeg adds annotations, section titles, and intro/outro frames.

**Tech Stack:** Node.js, TypeScript (strict), pnpm, Commander.js, Playwright, ghost-cursor-playwright, Vercel AI SDK, fluent-ffmpeg, simple-git, @octokit/rest, Zod, vitest

---

## File Structure

```
pr-ghost/
├── src/
│   ├── cli/
│   │   ├── index.ts              # Commander CLI entrypoint, binary setup
│   │   └── commands/
│   │       ├── explore.ts         # explore command handler
│   │       ├── record.ts          # record command handler
│   │       ├── run.ts             # run command handler (full pipeline)
│   │       └── init.ts            # init command handler (config generator)
│   ├── core/
│   │   ├── diff-analyzer.ts       # Parse git diff, categorize changed files
│   │   ├── ux-mapper.ts           # Map code changes → UX-visible effects
│   │   ├── script-generator.ts    # Single generateObject() call → WalkthroughScript
│   │   ├── script-reviewer.ts     # Terminal review flow with NL editing
│   │   ├── explorer.ts            # AI agent recon loop with browser tools
│   │   ├── recorder.ts            # Execute WalkthroughScript with Playwright recording
│   │   ├── video-processor.ts     # ffmpeg post-processing pipeline
│   │   ├── github.ts              # Fetch PR diff via Octokit
│   │   └── dev-server.ts          # Dev server auto-start/stop
│   ├── ai/
│   │   ├── provider.ts            # Vercel AI SDK model instantiation
│   │   ├── prompts/
│   │   │   ├── diff-analysis.ts   # System prompt for diff → UX analysis
│   │   │   ├── exploration.ts     # System prompt for explorer agent
│   │   │   ├── walkthrough-plan.ts # System prompt for script generation
│   │   │   └── script-edit.ts     # System prompt for NL script edits
│   │   └── parsers.ts             # Zod schemas for all AI outputs
│   ├── browser/
│   │   ├── actions.ts             # Human-like action wrappers
│   │   ├── cursor.ts              # CursorController interface + ghost-cursor impl
│   │   ├── selectors.ts           # Selector resolution with priority strategy
│   │   └── timing.ts              # Timing profiles, easing, random delays
│   ├── config/
│   │   └── schema.ts              # Zod config schema, loader, defaults
│   └── types/
│       └── index.ts               # All shared TypeScript types
├── tests/
│   ├── core/
│   │   ├── diff-analyzer.test.ts
│   │   ├── ux-mapper.test.ts
│   │   ├── script-generator.test.ts
│   │   ├── script-reviewer.test.ts
│   │   ├── recorder.test.ts
│   │   ├── video-processor.test.ts
│   │   └── github.test.ts
│   ├── browser/
│   │   ├── actions.test.ts
│   │   ├── cursor.test.ts
│   │   ├── selectors.test.ts
│   │   └── timing.test.ts
│   ├── ai/
│   │   └── parsers.test.ts
│   └── config/
│       └── schema.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── prg.config.example.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `prg.config.example.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pr-ghost",
  "version": "0.1.0",
  "description": "Automated PR video walkthrough generator",
  "type": "module",
  "bin": {
    "prg": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsup src/cli/index.ts --format esm --dts --outDir dist",
    "dev": "tsx src/cli/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/openai": "^1.3.0",
    "@ai-sdk/anthropic": "^1.3.0",
    "@ai-sdk/google": "^1.3.0",
    "@octokit/rest": "^21.1.0",
    "ai": "^4.3.0",
    "chalk": "^5.4.1",
    "commander": "^13.1.0",
    "fluent-ffmpeg": "^2.1.3",
    "ghost-cursor-playwright": "^0.4.0",
    "ora": "^8.2.0",
    "playwright": "^1.52.0",
    "simple-git": "^3.27.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^22.14.0",
    "tsup": "^8.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 4: Create .env.example**

```bash
# AI Provider API Keys (pick one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# GitHub token for PR fetching (optional)
GITHUB_TOKEN=ghp_...
```

- [ ] **Step 5: Create prg.config.example.ts**

```typescript
import type { PrGhostConfig } from "./src/types/index.js";

const config: PrGhostConfig = {
  devServer: {
    command: "pnpm dev",
    port: 3000,
    readyPattern: "Ready on",
    startTimeout: 30000,
  },
  baseUrl: "http://localhost:3000",
  video: {
    viewport: { width: 1280, height: 720 },
    format: "mp4",
    fps: 30,
  },
  timing: {
    typingDelay: { min: 50, max: 120 },
    clickPause: { min: 200, max: 500 },
    scrollSpeed: "smooth",
    sectionPause: 1000,
  },
  ai: {
    provider: "openai",
    model: "gpt-4o",
    maxExplorationSteps: 20,
  },
  selectors: {
    priority: ["data-testid", "aria-label", "role", "css", "text"],
  },
  ignore: ["/api/*", "/_next/*"],
  auth: {
    steps: [
      { action: "navigate", url: "/login" },
      { action: "type", selector: "#email", text: "test@example.com" },
      { action: "type", selector: "#password", text: "password123" },
      { action: "click", selector: "button[type=submit]", description: "Submit login" },
      { action: "wait", duration: 2000, reason: "Wait for auth redirect" },
    ],
  },
};

export default config;
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, all deps installed

- [ ] **Step 7: Install Playwright Chromium**

Run: `npx playwright install chromium`
Expected: Chromium browser downloaded

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, clean exit)

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts .env.example prg.config.example.ts
git commit -m "chore: project scaffolding with dependencies"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write the types file**

```typescript
// --- Config Types ---

export interface Range {
  min: number;
  max: number;
}

export interface PrGhostConfig {
  devServer?: {
    command: string;
    port: number;
    readyPattern: string;
    startTimeout: number;
  };
  baseUrl: string;
  video: {
    viewport: { width: number; height: number };
    format: "mp4";
    fps: number;
  };
  timing: {
    typingDelay: Range;
    clickPause: Range;
    scrollSpeed: "smooth" | "fast";
    sectionPause: number;
  };
  ai: {
    provider: "openai" | "anthropic" | "google";
    model: string;
    maxExplorationSteps: number;
  };
  selectors: {
    priority: string[];
  };
  ignore: string[];
  auth?: {
    steps: WalkthroughStep[];
  };
}

// --- Walkthrough Script Types ---

export interface WalkthroughScript {
  metadata: {
    pr?: { number: number; repo: string; title: string };
    generatedAt: string;
    baseUrl: string;
    viewport: { width: number; height: number };
  };
  steps: WalkthroughStep[];
}

export type WalkthroughStep =
  | NavigateStep
  | ClickStep
  | TypeStep
  | ScrollStep
  | HoverStep
  | WaitStep
  | ScreenshotStep
  | ViewportStep
  | SectionStep;

export interface NavigateStep {
  action: "navigate";
  url: string;
  waitFor?: string;
  annotation?: string;
}

export interface ClickStep {
  action: "click";
  selector: string;
  description: string;
  annotation?: string;
}

export interface TypeStep {
  action: "type";
  selector: string;
  text: string;
  clearFirst?: boolean;
  annotation?: string;
}

export interface ScrollStep {
  action: "scroll";
  target: string | { x: number; y: number };
  annotation?: string;
}

export interface HoverStep {
  action: "hover";
  selector: string;
  description: string;
  annotation?: string;
}

export interface WaitStep {
  action: "wait";
  duration: number;
  reason: string;
  annotation?: string;
}

export interface ScreenshotStep {
  action: "screenshot";
  name: string;
  annotation?: string;
}

export interface ViewportStep {
  action: "viewport";
  width: number;
  height: number;
  annotation?: string;
}

export interface SectionStep {
  action: "section";
  title: string;
  description: string;
}

// --- Diff Analysis Types ---

export type FileCategory =
  | "component"
  | "page"
  | "style"
  | "util"
  | "api-route"
  | "test"
  | "config"
  | "other";

export interface FileChange {
  path: string;
  category: FileCategory;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  changes: string;
}

export interface DiffAnalysis {
  files: FileChange[];
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    categories: Record<FileCategory, number>;
  };
  rawDiff: string;
  source: { type: "local"; ref: string } | { type: "github"; pr: number; repo: string };
}

// --- UX Map Types ---

export interface AffectedRoute {
  path: string;
  description: string;
  changedFiles: string[];
}

export interface ChangedComponent {
  name: string;
  filePath: string;
  usedIn: string[];
  changeDescription: string;
}

export interface UXMap {
  affectedRoutes: AffectedRoute[];
  changedComponents: ChangedComponent[];
  behaviorChanges: string[];
}

// --- Recon Report Types ---

export interface PageVisit {
  url: string;
  title: string;
  screenshotBase64?: string;
}

export interface DiscoveredElement {
  selector: string;
  type: "button" | "link" | "input" | "select" | "textarea" | "other";
  label: string;
  page: string;
}

export interface ObservedBehavior {
  trigger: string;
  result: string;
  page: string;
}

export interface ReconFinding {
  description: string;
  page: string;
  relevantSelectors: string[];
}

export interface ReconReport {
  pagesVisited: PageVisit[];
  interactiveElements: DiscoveredElement[];
  observedBehaviors: ObservedBehavior[];
  findings: ReconFinding[];
  recommendedFlow: string[];
}

// --- Timestamp Sidecar Types ---

export interface StepTimestamp {
  stepIndex: number;
  action: string;
  annotation?: string;
  timestampMs: number;
}

export interface RecordingResult {
  videoPath: string;
  timestamps: StepTimestamp[];
  skippedSteps: number[];
  duration: number;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types for all pipeline artifacts"
```

---

### Task 3: Config Schema and Loader

**Files:**
- Create: `src/config/schema.ts`
- Create: `tests/config/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/config/schema.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configSchema, loadConfig, DEFAULT_CONFIG } from "@/config/schema.js";

describe("configSchema", () => {
  it("validates a complete config", () => {
    const result = configSchema.safeParse({
      baseUrl: "http://localhost:3000",
      video: { viewport: { width: 1280, height: 720 }, format: "mp4", fps: 30 },
      timing: {
        typingDelay: { min: 50, max: 120 },
        clickPause: { min: 200, max: 500 },
        scrollSpeed: "smooth",
        sectionPause: 1000,
      },
      ai: { provider: "openai", model: "gpt-4o", maxExplorationSteps: 20 },
      selectors: { priority: ["data-testid", "css"] },
      ignore: [],
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing optional fields", () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("http://localhost:3000");
      expect(result.data.video.viewport.width).toBe(1280);
      expect(result.data.ai.provider).toBe("openai");
      expect(result.data.ai.model).toBe("gpt-4o");
    }
  });

  it("rejects invalid provider", () => {
    const result = configSchema.safeParse({
      ai: { provider: "invalid", model: "gpt-4o", maxExplorationSteps: 20 },
    });
    expect(result.success).toBe(false);
  });

  it("validates auth steps when present", () => {
    const result = configSchema.safeParse({
      auth: {
        steps: [
          { action: "navigate", url: "/login" },
          { action: "click", selector: "#btn", description: "Click login" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects auth steps with invalid action", () => {
    const result = configSchema.safeParse({
      auth: {
        steps: [{ action: "invalid_action" }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig("/nonexistent/path");
    expect(config.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(config.ai.provider).toBe("openai");
  });

  it("CLI overrides take precedence", async () => {
    const config = await loadConfig("/nonexistent/path", {
      baseUrl: "http://localhost:8080",
    });
    expect(config.baseUrl).toBe("http://localhost:8080");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: FAIL — module `@/config/schema.js` not found

- [ ] **Step 3: Implement config schema and loader**

```typescript
// src/config/schema.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts tests/config/schema.test.ts
git commit -m "feat: config schema with Zod validation and file loader"
```

---

### Task 4: CLI Scaffolding

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/commands/explore.ts`
- Create: `src/cli/commands/record.ts`
- Create: `src/cli/commands/run.ts`
- Create: `src/cli/commands/init.ts`

- [ ] **Step 1: Create CLI entrypoint**

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { Command } from "commander";
import { exploreCommand } from "./commands/explore.js";
import { recordCommand } from "./commands/record.js";
import { runCommand } from "./commands/run.js";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
  .name("prg")
  .description("PR Ghost — Automated PR video walkthrough generator")
  .version("0.1.0");

program.addCommand(exploreCommand);
program.addCommand(recordCommand);
program.addCommand(runCommand);
program.addCommand(initCommand);

program.parse();
```

- [ ] **Step 2: Create explore command stub**

```typescript
// src/cli/commands/explore.ts
import { Command } from "commander";

export const exploreCommand = new Command("explore")
  .description("Analyze diff and generate a walkthrough script")
  .option("--pr <number>", "GitHub PR number")
  .option("--repo <owner/repo>", "GitHub repository")
  .option("--diff <ref>", "Local git ref to diff against (e.g., HEAD~1, main)")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output path for walkthrough script", "./walkthrough.json")
  .action(async (options) => {
    const { runExplore } = await import("../../core/explorer.js");
    await runExplore(options);
  });
```

- [ ] **Step 3: Create record command stub**

```typescript
// src/cli/commands/record.ts
import { Command } from "commander";

export const recordCommand = new Command("record")
  .description("Record a video from an existing walkthrough script")
  .requiredOption("--script <path>", "Path to walkthrough script JSON")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output video path", "./walkthrough.mp4")
  .action(async (options) => {
    const { runRecord } = await import("../../core/recorder.js");
    await runRecord(options);
  });
```

- [ ] **Step 4: Create run command stub**

```typescript
// src/cli/commands/run.ts
import { Command } from "commander";

export const runCommand = new Command("run")
  .description("Full pipeline: analyze diff → generate script → review → record video")
  .option("--pr <number>", "GitHub PR number")
  .option("--repo <owner/repo>", "GitHub repository")
  .option("--diff <ref>", "Local git ref to diff against")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output video path", "./walkthrough.mp4")
  .option("--no-review", "Skip interactive script review (CI mode)")
  .option("--script-only", "Stop after script generation")
  .action(async (options) => {
    const { runFullPipeline } = await import("./run-handler.js");
    await runFullPipeline(options);
  });
```

- [ ] **Step 5: Create init command stub**

```typescript
// src/cli/commands/init.ts
import { Command } from "commander";

export const initCommand = new Command("init")
  .description("Generate a pr-ghost config file for this project")
  .action(async () => {
    const { runInit } = await import("./init-handler.js");
    await runInit();
  });
```

- [ ] **Step 6: Verify CLI parses without errors**

Run: `npx tsx src/cli/index.ts --help`
Expected: Shows help with all four commands listed

Run: `npx tsx src/cli/index.ts explore --help`
Expected: Shows explore command help with --pr, --repo, --diff, --base-url, --output flags

- [ ] **Step 7: Commit**

```bash
git add src/cli/
git commit -m "feat: CLI scaffolding with Commander.js (explore, record, run, init)"
```

---

### Task 5: AI Provider Setup

**Files:**
- Create: `src/ai/provider.ts`

- [ ] **Step 1: Implement AI provider factory**

```typescript
// src/ai/provider.ts
import type { LanguageModelV1 } from "ai";
import type { PrGhostConfig } from "../types/index.js";

export function createModel(config: PrGhostConfig): LanguageModelV1 {
  const { provider, model } = config.ai;

  switch (provider) {
    case "openai": {
      const { createOpenAI } = require("@ai-sdk/openai");
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      return openai(model);
    }
    case "anthropic": {
      const { createAnthropic } = require("@ai-sdk/anthropic");
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(model);
    }
    case "google": {
      const { createGoogleGenerativeAI } = require("@ai-sdk/google");
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY,
      });
      return google(model);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ai/provider.ts
git commit -m "feat: AI provider factory supporting OpenAI, Anthropic, Google"
```

---

### Task 6: Zod Parsers for AI Outputs

**Files:**
- Create: `src/ai/parsers.ts`
- Create: `tests/ai/parsers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/ai/parsers.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ai/parsers.test.ts`
Expected: FAIL — module `@/ai/parsers.js` not found

- [ ] **Step 3: Implement parsers**

```typescript
// src/ai/parsers.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ai/parsers.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/ai/parsers.ts tests/ai/parsers.test.ts
git commit -m "feat: Zod schemas for all AI output types"
```

---

### Task 7: Diff Analyzer

**Files:**
- Create: `src/core/diff-analyzer.ts`
- Create: `tests/core/diff-analyzer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/diff-analyzer.test.ts
import { describe, it, expect } from "vitest";
import { parseDiff, categorizeFile } from "@/core/diff-analyzer.js";

describe("categorizeFile", () => {
  it("categorizes page files", () => {
    expect(categorizeFile("src/app/login/page.tsx")).toBe("page");
    expect(categorizeFile("src/pages/index.tsx")).toBe("page");
    expect(categorizeFile("src/app/dashboard/layout.tsx")).toBe("page");
    expect(categorizeFile("app/about/page.tsx")).toBe("page");
  });

  it("categorizes component files", () => {
    expect(categorizeFile("src/components/Button.tsx")).toBe("component");
    expect(categorizeFile("src/components/ui/Card.tsx")).toBe("component");
  });

  it("categorizes style files", () => {
    expect(categorizeFile("src/styles/globals.css")).toBe("style");
    expect(categorizeFile("src/app/page.module.css")).toBe("style");
    expect(categorizeFile("tailwind.config.ts")).toBe("style");
  });

  it("categorizes API route files", () => {
    expect(categorizeFile("src/app/api/users/route.ts")).toBe("api-route");
    expect(categorizeFile("src/pages/api/auth.ts")).toBe("api-route");
  });

  it("categorizes test files", () => {
    expect(categorizeFile("tests/login.test.ts")).toBe("test");
    expect(categorizeFile("src/__tests__/Button.test.tsx")).toBe("test");
    expect(categorizeFile("src/components/Button.spec.ts")).toBe("test");
  });

  it("categorizes config files", () => {
    expect(categorizeFile("next.config.js")).toBe("config");
    expect(categorizeFile("tsconfig.json")).toBe("config");
    expect(categorizeFile(".eslintrc.json")).toBe("config");
  });

  it("categorizes utility files", () => {
    expect(categorizeFile("src/lib/utils.ts")).toBe("util");
    expect(categorizeFile("src/utils/format.ts")).toBe("util");
    expect(categorizeFile("src/helpers/auth.ts")).toBe("util");
  });

  it("categorizes unknown files as other", () => {
    expect(categorizeFile("README.md")).toBe("other");
    expect(categorizeFile("Dockerfile")).toBe("other");
  });
});

describe("parseDiff", () => {
  it("parses a unified diff into FileChange objects", () => {
    const rawDiff = `diff --git a/src/app/login/page.tsx b/src/app/login/page.tsx
index abc1234..def5678 100644
--- a/src/app/login/page.tsx
+++ b/src/app/login/page.tsx
@@ -10,6 +10,8 @@ export default function LoginPage() {
   const [email, setEmail] = useState('');
+  const [error, setError] = useState('');
+  const [touched, setTouched] = useState(false);
   return (
diff --git a/src/components/Button.tsx b/src/components/Button.tsx
index 1111111..2222222 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,4 +1,4 @@
-export function Button({ children }) {
+export function Button({ children, variant = "primary" }) {
   return <button>{children}</button>;
 }`;

    const result = parseDiff(rawDiff);

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe("src/app/login/page.tsx");
    expect(result.files[0].category).toBe("page");
    expect(result.files[0].status).toBe("modified");
    expect(result.files[0].hunks).toHaveLength(1);

    expect(result.files[1].path).toBe("src/components/Button.tsx");
    expect(result.files[1].category).toBe("component");

    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.categories.page).toBe(1);
    expect(result.summary.categories.component).toBe(1);
  });

  it("handles new file diffs", () => {
    const rawDiff = `diff --git a/src/app/signup/page.tsx b/src/app/signup/page.tsx
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/app/signup/page.tsx
@@ -0,0 +1,10 @@
+export default function SignupPage() {
+  return <div>Signup</div>;
+}`;

    const result = parseDiff(rawDiff);
    expect(result.files[0].status).toBe("added");
    expect(result.files[0].additions).toBe(3);
    expect(result.files[0].deletions).toBe(0);
  });

  it("handles deleted file diffs", () => {
    const rawDiff = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export const old = true;
-export const unused = false;`;

    const result = parseDiff(rawDiff);
    expect(result.files[0].status).toBe("deleted");
    expect(result.files[0].deletions).toBe(2);
  });

  it("returns empty analysis for empty diff", () => {
    const result = parseDiff("");
    expect(result.files).toHaveLength(0);
    expect(result.summary.totalFiles).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/diff-analyzer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement diff analyzer**

```typescript
// src/core/diff-analyzer.ts
import type { DiffAnalysis, FileCategory, FileChange, DiffHunk } from "../types/index.js";

export function categorizeFile(filePath: string): FileCategory {
  const lower = filePath.toLowerCase();

  // Tests
  if (/\.(test|spec)\.[jt]sx?$/.test(lower) || lower.includes("__tests__")) {
    return "test";
  }

  // API routes
  if (/\/api\//.test(lower) && /route\.[jt]sx?$/.test(lower)) return "api-route";
  if (/\/pages\/api\//.test(lower)) return "api-route";

  // Pages/routes (Next.js app router + pages router)
  if (/\/(page|layout|loading|error|not-found|template)\.[jt]sx?$/.test(lower)) return "page";
  if (/\/pages\/(?!api\/)/.test(lower) && /\.[jt]sx?$/.test(lower)) return "page";

  // Styles
  if (/\.(css|scss|sass|less)$/.test(lower)) return "style";
  if (/tailwind\.config/.test(lower)) return "style";

  // Config
  if (/\.(config|rc)\.[jt]sx?$/.test(lower)) return "config";
  if (/^\./.test(filePath.split("/").pop() ?? "")) return "config";
  if (/tsconfig|package\.json|\.eslintrc|\.prettierrc/.test(lower)) return "config";

  // Components
  if (/\/components\//.test(lower)) return "component";

  // Utils
  if (/\/(lib|utils|helpers|hooks)\//.test(lower)) return "util";

  return "other";
}

export function parseDiff(rawDiff: string): Omit<DiffAnalysis, "source"> & { rawDiff: string } {
  const files: FileChange[] = [];
  const diffPattern = /diff --git a\/(.+?) b\/(.+?)$/gm;
  const diffSections = rawDiff.split(/(?=diff --git)/);

  for (const section of diffSections) {
    if (!section.trim()) continue;

    const headerMatch = section.match(/diff --git a\/(.+?) b\/(.+?)$/m);
    if (!headerMatch) continue;

    const filePath = headerMatch[2];

    let status: FileChange["status"] = "modified";
    if (section.includes("new file mode")) status = "added";
    else if (section.includes("deleted file mode")) status = "deleted";
    else if (section.includes("rename from")) status = "renamed";

    const hunks: DiffHunk[] = [];
    const hunkPattern = /^(@@.+?@@.*?)$([\s\S]*?)(?=^@@|\Z)/gm;
    let hunkMatch;
    while ((hunkMatch = hunkPattern.exec(section)) !== null) {
      hunks.push({
        header: hunkMatch[1].trim(),
        changes: hunkMatch[2].trim(),
      });
    }

    // If no hunks found via the regex, try a simpler approach
    if (hunks.length === 0) {
      const hunkStart = section.indexOf("@@");
      if (hunkStart !== -1) {
        const hunkContent = section.slice(hunkStart);
        const lines = hunkContent.split("\n");
        const header = lines[0].trim();
        const changes = lines.slice(1).join("\n").trim();
        if (header) {
          hunks.push({ header, changes });
        }
      }
    }

    let additions = 0;
    let deletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.changes.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
    }

    files.push({
      path: filePath,
      category: categorizeFile(filePath),
      status,
      additions,
      deletions,
      hunks,
    });
  }

  const categories: Record<FileCategory, number> = {
    component: 0,
    page: 0,
    style: 0,
    util: 0,
    "api-route": 0,
    test: 0,
    config: 0,
    other: 0,
  };
  for (const file of files) {
    categories[file.category]++;
  }

  return {
    files,
    summary: {
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      categories,
    },
    rawDiff,
  };
}

export async function analyzeDiffFromGit(ref: string, cwd?: string): Promise<DiffAnalysis> {
  const { simpleGit } = await import("simple-git");
  const git = simpleGit(cwd);
  const rawDiff = await git.diff([ref]);
  const parsed = parseDiff(rawDiff);
  return {
    ...parsed,
    source: { type: "local", ref },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/diff-analyzer.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/diff-analyzer.ts tests/core/diff-analyzer.test.ts
git commit -m "feat: diff analyzer with file categorization and unified diff parsing"
```

---

### Task 8: GitHub Integration

**Files:**
- Create: `src/core/github.ts`
- Create: `tests/core/github.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/github.test.ts
import { describe, it, expect, vi } from "vitest";
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/github.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement GitHub integration**

```typescript
// src/core/github.ts
import { Octokit } from "@octokit/rest";
import { parseDiff } from "./diff-analyzer.js";
import type { DiffAnalysis } from "../types/index.js";

export function parseRepoString(repoStr: string): { owner: string; repo: string } {
  const parts = repoStr.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repoStr}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export function buildPRDiffUrl(owner: string, repo: string, prNumber: number): string {
  return `/repos/${owner}/${repo}/pulls/${prNumber}`;
}

export async function fetchPRDiff(
  repoStr: string,
  prNumber: number,
): Promise<DiffAnalysis> {
  const { owner, repo } = parseRepoString(repoStr);
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required for fetching PR diffs. " +
      "Set it in your .env file or export it in your shell.",
    );
  }

  const octokit = new Octokit({ auth: token });

  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });

  // When requesting diff format, data is a string
  const rawDiff = pr as unknown as string;
  const parsed = parseDiff(rawDiff);

  return {
    ...parsed,
    source: { type: "github", pr: prNumber, repo: repoStr },
  };
}

export async function fetchPRMetadata(
  repoStr: string,
  prNumber: number,
): Promise<{ number: number; repo: string; title: string }> {
  const { owner, repo } = parseRepoString(repoStr);
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required.");
  }

  const octokit = new Octokit({ auth: token });
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: prNumber,
    repo: repoStr,
    title: pr.title,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/github.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/github.ts tests/core/github.test.ts
git commit -m "feat: GitHub integration for PR diff fetching via Octokit"
```

---

### Task 9: AI Prompts

**Files:**
- Create: `src/ai/prompts/diff-analysis.ts`
- Create: `src/ai/prompts/exploration.ts`
- Create: `src/ai/prompts/walkthrough-plan.ts`
- Create: `src/ai/prompts/script-edit.ts`

- [ ] **Step 1: Create diff analysis prompt**

```typescript
// src/ai/prompts/diff-analysis.ts
import type { DiffAnalysis } from "../../types/index.js";

export function buildDiffAnalysisPrompt(diff: DiffAnalysis): string {
  const fileList = diff.files
    .map((f) => `- ${f.path} (${f.category}, ${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  return `You are an expert frontend developer analyzing code changes to determine their user-visible impact.

## Changed Files
${fileList}

## Summary
- Total files: ${diff.summary.totalFiles}
- Additions: ${diff.summary.totalAdditions}, Deletions: ${diff.summary.totalDeletions}

## Raw Diff
\`\`\`diff
${diff.rawDiff}
\`\`\`

## Your Task

Analyze these changes and produce a UX map. For each change, determine:

1. **Affected routes**: Which pages/URLs are impacted? Consider:
   - Direct page file changes (page.tsx, layout.tsx, etc.)
   - Component changes — trace where the component is used
   - Style changes — which pages use the affected styles
   - Next.js app router conventions: page.tsx = route page, layout.tsx = shared layout, loading.tsx = loading state

2. **Changed components**: What UI components were modified and what changed visually?

3. **Behavior changes**: What's different from a user's perspective? New form fields, changed validation, different layout, new buttons, style changes, new pages, removed features.

Focus only on user-visible changes. Ignore test files, config changes, and pure refactors with no visual impact.`;
}
```

- [ ] **Step 2: Create exploration prompt**

```typescript
// src/ai/prompts/exploration.ts
import type { DiffAnalysis, UXMap } from "../../types/index.js";

export function buildExplorationPrompt(diff: DiffAnalysis, uxMap: UXMap): string {
  const routes = uxMap.affectedRoutes
    .map((r) => `- ${r.path}: ${r.description}`)
    .join("\n");

  const components = uxMap.changedComponents
    .map((c) => `- ${c.name} (${c.filePath}): ${c.changeDescription}. Used in: ${c.usedIn.join(", ")}`)
    .join("\n");

  const behaviors = uxMap.behaviorChanges.map((b) => `- ${b}`).join("\n");

  return `You are a QA engineer exploring a web application to document user-visible changes from a recent code update. Your goal is to build a comprehensive reconnaissance report that will be used to generate a video walkthrough.

## What Changed (from code analysis)

### Affected Routes
${routes || "None identified"}

### Changed Components
${components || "None identified"}

### Expected Behavior Changes
${behaviors || "None identified"}

## Your Mission

Explore the running application to verify and document these changes. Use the tools available to you:

1. **Navigate** to each affected route
2. **Inspect the DOM** to find the changed elements and understand page structure
3. **Get interactive elements** to discover buttons, inputs, links
4. **Take screenshots** of pages showing the changes
5. **Try interactions** to verify behavior changes — click buttons, fill forms, hover elements
6. **Report findings** as you discover things worth demonstrating

## Guidelines

- Start with the most important/visible changes
- For form changes: try both valid and invalid inputs to show validation
- For new UI elements: hover them, click them, document what happens
- For style changes: screenshot the area to capture the visual difference
- For new pages: explore the full page, interact with all new elements
- Use specific CSS selectors that will reliably find elements (prefer data-testid, aria-label, then CSS selectors)
- If a page requires setup (e.g., data in a form), note that in your findings

Report your findings as you go. Be thorough but efficient — focus on what a viewer needs to see to understand the change.`;
}
```

- [ ] **Step 3: Create walkthrough plan prompt**

```typescript
// src/ai/prompts/walkthrough-plan.ts
import type { DiffAnalysis, ReconReport } from "../../types/index.js";

export function buildWalkthroughPlanPrompt(
  recon: ReconReport,
  diff: DiffAnalysis,
  baseUrl: string,
  viewport: { width: number; height: number },
  prMeta?: { number: number; repo: string; title: string },
): string {
  const pages = recon.pagesVisited
    .map((p) => `- ${p.url} ("${p.title}")`)
    .join("\n");

  const elements = recon.interactiveElements
    .map((e) => `- [${e.type}] "${e.label}" → ${e.selector} (on ${e.page})`)
    .join("\n");

  const behaviors = recon.observedBehaviors
    .map((b) => `- ${b.trigger} → ${b.result} (on ${b.page})`)
    .join("\n");

  const findings = recon.findings
    .map((f) => `- ${f.description} (on ${f.page}, selectors: ${f.relevantSelectors.join(", ")})`)
    .join("\n");

  const flow = recon.recommendedFlow.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const prContext = prMeta
    ? `\n## PR Context\n- PR #${prMeta.number} in ${prMeta.repo}: "${prMeta.title}"\n`
    : "";

  return `You are a product demo expert creating a walkthrough script for a video that demonstrates recent code changes in a web application.
${prContext}
## Reconnaissance Findings

### Pages Explored
${pages}

### Interactive Elements Found
${elements}

### Observed Behaviors
${behaviors}

### Key Findings
${findings}

### Recommended Flow
${flow}

## Your Task

Generate a walkthrough script (a sequence of browser actions) that demonstrates every user-visible change. The script will be replayed by an automated browser with human-like timing.

## Rules

1. **Think like a product demo** — show the change, not the code. Imagine you're presenting to a stakeholder.
2. **Use verified selectors** — only use selectors from the reconnaissance findings above. They've been tested and work.
3. **Order logically** — navigate to a page before interacting with it. Complete one feature demo before starting the next.
4. **Add annotations** — for key moments, add an annotation string explaining what the viewer should notice. Keep them short (under 80 chars).
5. **Use section dividers** — separate distinct feature demonstrations with a "section" step.
6. **Be concise** — don't demonstrate unchanged features. Don't navigate to pages with no changes. Don't add unnecessary waits.
7. **Base URL**: ${baseUrl} — all navigate URLs should be relative paths from this base.
8. **Viewport**: ${viewport.width}x${viewport.height}

## Available Actions

- navigate: Go to a URL. Use relative paths (e.g., "/login", "/dashboard").
- click: Click an element. Requires a CSS selector and description.
- type: Type text into an input. Requires selector and text. Use clearFirst to clear existing text.
- scroll: Scroll to an element (CSS selector) or coordinates ({x, y}).
- hover: Hover over an element. Requires selector and description.
- wait: Pause for a duration (ms). Use sparingly, only when needed for animations/transitions.
- screenshot: Take a reference screenshot (not shown in video, for debugging).
- viewport: Change viewport size (for responsive demos).
- section: Visual divider with title and description. No browser action.`;
}
```

- [ ] **Step 4: Create script edit prompt**

```typescript
// src/ai/prompts/script-edit.ts
import type { WalkthroughScript } from "../../types/index.js";

export function buildScriptEditPrompt(
  script: WalkthroughScript,
  stepNumber: number | "all",
  userInstruction: string,
): string {
  const stepsDisplay = script.steps
    .map((step, i) => {
      const num = i + 1;
      const marker = stepNumber === num ? " ← TARGET STEP" : "";
      return `${num}. [${step.action}] ${formatStepSummary(step)}${marker}`;
    })
    .join("\n");

  const scope =
    stepNumber === "all"
      ? "Apply the change globally across all steps."
      : `Focus on step ${stepNumber}, but you may also adjust surrounding steps if needed for consistency.`;

  return `You are editing a video walkthrough script based on a user's natural language instruction.

## Current Script

${stepsDisplay}

## User's Instruction

"${userInstruction}"

## Scope

${scope}

## Rules

1. Return the COMPLETE modified script (all steps, not just the changed ones)
2. Preserve the metadata exactly as-is
3. Keep all unchanged steps identical
4. Only modify what the user asked for
5. If the user asks to remove a step, remove it and renumber
6. If the user asks to add a step, insert it at the logical position
7. If the user asks to reorder, move steps but keep their content intact
8. Keep selectors from the original — don't invent new ones`;
}

function formatStepSummary(step: WalkthroughScript["steps"][number]): string {
  switch (step.action) {
    case "navigate":
      return `Navigate to ${step.url}`;
    case "click":
      return `Click "${step.description}" (${step.selector})`;
    case "type":
      return `Type "${step.text}" into ${step.selector}`;
    case "scroll":
      return `Scroll to ${typeof step.target === "string" ? step.target : `(${step.target.x}, ${step.target.y})`}`;
    case "hover":
      return `Hover "${step.description}" (${step.selector})`;
    case "wait":
      return `Wait ${step.duration}ms (${step.reason})`;
    case "screenshot":
      return `Screenshot: ${step.name}`;
    case "viewport":
      return `Viewport: ${step.width}x${step.height}`;
    case "section":
      return `Section: ${step.title}`;
  }
}
```

- [ ] **Step 5: Verify all prompts compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ai/prompts/
git commit -m "feat: AI system prompts for diff analysis, exploration, script generation, and editing"
```

---

### Task 10: Browser Timing Module

**Files:**
- Create: `src/browser/timing.ts`
- Create: `tests/browser/timing.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/browser/timing.test.ts
import { describe, it, expect } from "vitest";
import { randomDelay, easeInOutCubic, getTypingDelay, getClickPause, TimingProfile } from "@/browser/timing.js";

describe("randomDelay", () => {
  it("returns a value within the specified range", () => {
    for (let i = 0; i < 100; i++) {
      const delay = randomDelay(50, 120);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(120);
    }
  });

  it("returns the exact value when min equals max", () => {
    expect(randomDelay(100, 100)).toBe(100);
  });
});

describe("easeInOutCubic", () => {
  it("starts at 0", () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it("ends at 1", () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("is at 0.5 at the midpoint", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it("is slow at start and end, fast in middle", () => {
    const earlySlope = easeInOutCubic(0.1) - easeInOutCubic(0);
    const midSlope = easeInOutCubic(0.55) - easeInOutCubic(0.45);
    expect(midSlope).toBeGreaterThan(earlySlope);
  });
});

describe("TimingProfile", () => {
  it("creates a profile from config", () => {
    const profile = new TimingProfile({
      typingDelay: { min: 50, max: 120 },
      clickPause: { min: 200, max: 500 },
      scrollSpeed: "smooth",
      sectionPause: 1000,
    });
    expect(profile.sectionPause).toBe(1000);
    expect(profile.scrollSpeed).toBe("smooth");
  });
});

describe("getTypingDelay", () => {
  it("returns delay within configured range", () => {
    const profile = new TimingProfile({
      typingDelay: { min: 50, max: 120 },
      clickPause: { min: 200, max: 500 },
      scrollSpeed: "smooth",
      sectionPause: 1000,
    });
    for (let i = 0; i < 50; i++) {
      const delay = getTypingDelay(profile);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(120);
    }
  });
});

describe("getClickPause", () => {
  it("returns pause within configured range", () => {
    const profile = new TimingProfile({
      typingDelay: { min: 50, max: 120 },
      clickPause: { min: 200, max: 500 },
      scrollSpeed: "smooth",
      sectionPause: 1000,
    });
    for (let i = 0; i < 50; i++) {
      const pause = getClickPause(profile);
      expect(pause).toBeGreaterThanOrEqual(200);
      expect(pause).toBeLessThanOrEqual(500);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/browser/timing.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement timing module**

```typescript
// src/browser/timing.ts
import type { PrGhostConfig } from "../types/index.js";

export function randomDelay(min: number, max: number): number {
  if (min === max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class TimingProfile {
  readonly typingDelay: { min: number; max: number };
  readonly clickPause: { min: number; max: number };
  readonly scrollSpeed: "smooth" | "fast";
  readonly sectionPause: number;

  constructor(timing: PrGhostConfig["timing"]) {
    this.typingDelay = timing.typingDelay;
    this.clickPause = timing.clickPause;
    this.scrollSpeed = timing.scrollSpeed;
    this.sectionPause = timing.sectionPause;
  }
}

export function getTypingDelay(profile: TimingProfile): number {
  return randomDelay(profile.typingDelay.min, profile.typingDelay.max);
}

export function getClickPause(profile: TimingProfile): number {
  return randomDelay(profile.clickPause.min, profile.clickPause.max);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/browser/timing.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/browser/timing.ts tests/browser/timing.test.ts
git commit -m "feat: timing profiles with easing functions and random delays"
```

---

### Task 11: Cursor Controller Abstraction

**Files:**
- Create: `src/browser/cursor.ts`
- Create: `tests/browser/cursor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/browser/cursor.test.ts
import { describe, it, expect, vi } from "vitest";
import { GhostCursorController, type CursorController } from "@/browser/cursor.js";

describe("CursorController interface", () => {
  it("GhostCursorController implements CursorController", () => {
    // Just verify the class exists and has the right methods
    const proto = GhostCursorController.prototype;
    expect(typeof proto.init).toBe("function");
    expect(typeof proto.moveTo).toBe("function");
    expect(typeof proto.click).toBe("function");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/browser/cursor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cursor abstraction**

```typescript
// src/browser/cursor.ts
import type { Page, ElementHandle } from "playwright";

export interface CursorController {
  init(page: Page): Promise<void>;
  moveTo(selector: string): Promise<void>;
  click(selector: string): Promise<void>;
}

export class GhostCursorController implements CursorController {
  private cursor: Awaited<ReturnType<typeof import("ghost-cursor-playwright")["createCursor"]>> | null = null;
  private page: Page | null = null;

  async init(page: Page): Promise<void> {
    this.page = page;
    const { createCursor } = await import("ghost-cursor-playwright");
    this.cursor = await createCursor(page);
  }

  async moveTo(selector: string): Promise<void> {
    if (!this.cursor || !this.page) throw new Error("Cursor not initialized. Call init() first.");
    const element = await this.page.waitForSelector(selector, { timeout: 5000 });
    if (!element) throw new Error(`Element not found: ${selector}`);
    await this.cursor.move(element);
  }

  async click(selector: string): Promise<void> {
    if (!this.cursor || !this.page) throw new Error("Cursor not initialized. Call init() first.");
    const element = await this.page.waitForSelector(selector, { timeout: 5000 });
    if (!element) throw new Error(`Element not found: ${selector}`);
    await this.cursor.click(element);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/browser/cursor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/browser/cursor.ts tests/browser/cursor.test.ts
git commit -m "feat: CursorController abstraction with ghost-cursor-playwright implementation"
```

---

### Task 12: Selector Resolution

**Files:**
- Create: `src/browser/selectors.ts`
- Create: `tests/browser/selectors.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/browser/selectors.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/browser/selectors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement selectors**

```typescript
// src/browser/selectors.ts
import type { Page } from "playwright";

/**
 * Given a selector string (which may be a CSS selector, data-testid, or plain text label),
 * generate an ordered list of candidate selectors to try based on the priority config.
 */
export function buildSelectorCandidates(
  input: string,
  selectorPriority: string[],
): string[] {
  const candidates: string[] = [];

  // If the input already looks like a CSS selector, include it as-is
  const looksLikeCSS =
    input.startsWith("#") ||
    input.startsWith(".") ||
    input.startsWith("[") ||
    input.includes(">") ||
    input.includes("::") ||
    /^[a-z]+[\[.#]/.test(input) ||
    /^[a-z]+$/.test(input);

  for (const strategy of selectorPriority) {
    switch (strategy) {
      case "data-testid":
        // Only if input looks like an identifier (no spaces, no CSS special chars)
        if (/^[\w-]+$/.test(input)) {
          candidates.push(`[data-testid='${input}']`);
        }
        break;
      case "aria-label":
        // If input contains spaces or looks like a label
        if (/\s/.test(input) || /^[A-Z]/.test(input)) {
          candidates.push(`[aria-label='${input}']`);
        }
        break;
      case "role":
        // Skip — role-based selectors need more context
        break;
      case "css":
        if (looksLikeCSS) {
          candidates.push(input);
        }
        break;
      case "text":
        if (/\s/.test(input) || /^[A-Z]/.test(input)) {
          candidates.push(`text=${input}`);
        }
        break;
    }
  }

  // Always include the raw input as a fallback
  if (!candidates.includes(input)) {
    candidates.push(input);
  }

  return candidates;
}

/**
 * Try each candidate selector in order, return the first one that finds an element.
 */
export async function resolveSelector(
  page: Page,
  input: string,
  selectorPriority: string[],
  timeout: number = 5000,
): Promise<string> {
  const candidates = buildSelectorCandidates(input, selectorPriority);

  for (const selector of candidates) {
    try {
      const element = await page.waitForSelector(selector, { timeout: Math.min(timeout, 2000) });
      if (element) return selector;
    } catch {
      // Try next candidate
    }
  }

  // If nothing worked, throw with the original input
  throw new Error(
    `Could not resolve selector "${input}". Tried: ${candidates.join(", ")}`,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/browser/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/browser/selectors.ts tests/browser/selectors.test.ts
git commit -m "feat: selector resolution with configurable priority strategy"
```

---

### Task 13: Browser Actions Module

**Files:**
- Create: `src/browser/actions.ts`
- Create: `tests/browser/actions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/browser/actions.test.ts
import { describe, it, expect, vi } from "vitest";

// We test the action functions' logic by mocking the Page and CursorController
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue({ click: vi.fn() }),
  waitForLoadState: vi.fn().mockResolvedValue(undefined),
  keyboard: {
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
  },
  evaluate: vi.fn().mockResolvedValue(undefined),
  setViewportSize: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
};

const mockCursor = {
  init: vi.fn().mockResolvedValue(undefined),
  moveTo: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/browser/timing.js", () => ({
  getTypingDelay: () => 0, // Zero delay for tests
  getClickPause: () => 0,
  sleep: vi.fn().mockResolvedValue(undefined),
  TimingProfile: class {
    typingDelay = { min: 0, max: 0 };
    clickPause = { min: 0, max: 0 };
    scrollSpeed = "smooth" as const;
    sectionPause = 0;
  },
}));

import { ActionExecutor } from "@/browser/actions.js";
import type { Page } from "playwright";
import type { CursorController } from "@/browser/cursor.js";
import { TimingProfile } from "@/browser/timing.js";

describe("ActionExecutor", () => {
  const profile = new TimingProfile({
    typingDelay: { min: 0, max: 0 },
    clickPause: { min: 0, max: 0 },
    scrollSpeed: "smooth",
    sectionPause: 0,
  });

  const executor = new ActionExecutor(
    mockPage as unknown as Page,
    mockCursor as unknown as CursorController,
    profile,
    ["data-testid", "css"],
  );

  it("executes a navigate action", async () => {
    await executor.execute({ action: "navigate", url: "/dashboard" }, "http://localhost:3000");
    expect(mockPage.goto).toHaveBeenCalledWith(
      "http://localhost:3000/dashboard",
      expect.any(Object),
    );
  });

  it("executes a click action", async () => {
    await executor.execute({ action: "click", selector: "#btn", description: "Click submit" }, "http://localhost:3000");
    expect(mockCursor.click).toHaveBeenCalledWith("#btn");
  });

  it("executes a type action", async () => {
    await executor.execute(
      { action: "type", selector: "#email", text: "test@test.com" },
      "http://localhost:3000",
    );
    expect(mockCursor.click).toHaveBeenCalledWith("#email");
    expect(mockPage.keyboard.type).toHaveBeenCalled();
  });

  it("executes a type action with clearFirst", async () => {
    await executor.execute(
      { action: "type", selector: "#email", text: "new@test.com", clearFirst: true },
      "http://localhost:3000",
    );
    expect(mockPage.keyboard.press).toHaveBeenCalledWith("Meta+a");
    expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
  });

  it("executes a hover action", async () => {
    await executor.execute(
      { action: "hover", selector: "#menu", description: "Hover menu" },
      "http://localhost:3000",
    );
    expect(mockCursor.moveTo).toHaveBeenCalledWith("#menu");
  });

  it("executes a viewport action", async () => {
    await executor.execute(
      { action: "viewport", width: 375, height: 812 },
      "http://localhost:3000",
    );
    expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 375, height: 812 });
  });

  it("executes a screenshot action", async () => {
    await executor.execute(
      { action: "screenshot", name: "test-shot" },
      "http://localhost:3000",
    );
    expect(mockPage.screenshot).toHaveBeenCalled();
  });

  it("returns a timestamp for each action", async () => {
    const result = await executor.execute(
      { action: "navigate", url: "/" },
      "http://localhost:3000",
    );
    expect(typeof result.timestampMs).toBe("number");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/browser/actions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement browser actions**

```typescript
// src/browser/actions.ts
import type { Page } from "playwright";
import type { CursorController } from "./cursor.js";
import type { WalkthroughStep } from "../types/index.js";
import { TimingProfile, getTypingDelay, getClickPause, sleep } from "./timing.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export interface ActionResult {
  timestampMs: number;
  skipped: boolean;
  error?: string;
}

export class ActionExecutor {
  private startTime: number = Date.now();

  constructor(
    private page: Page,
    private cursor: CursorController,
    private timing: TimingProfile,
    private selectorPriority: string[],
  ) {}

  resetTimer(): void {
    this.startTime = Date.now();
  }

  async execute(step: WalkthroughStep, baseUrl: string): Promise<ActionResult> {
    const timestampMs = Date.now() - this.startTime;

    try {
      switch (step.action) {
        case "navigate":
          await this.executeNavigate(step.url, baseUrl, step.waitFor);
          break;
        case "click":
          await this.executeClick(step.selector);
          break;
        case "type":
          await this.executeType(step.selector, step.text, step.clearFirst);
          break;
        case "scroll":
          await this.executeScroll(step.target);
          break;
        case "hover":
          await this.executeHover(step.selector);
          break;
        case "wait":
          await sleep(step.duration);
          break;
        case "screenshot":
          await this.executeScreenshot(step.name);
          break;
        case "viewport":
          await this.page.setViewportSize({ width: step.width, height: step.height });
          break;
        case "section":
          // No browser action — just a timestamp marker
          await sleep(this.timing.sectionPause);
          break;
      }
      return { timestampMs, skipped: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { timestampMs, skipped: true, error: message };
    }
  }

  private async executeNavigate(url: string, baseUrl: string, waitFor?: string): Promise<void> {
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    await this.page.goto(fullUrl, { waitUntil: "networkidle", timeout: 15000 });
    if (waitFor) {
      await this.page.waitForSelector(waitFor, { timeout: 10000 });
    }
  }

  private async executeClick(selector: string): Promise<void> {
    await sleep(getClickPause(this.timing));
    await this.cursor.click(selector);
  }

  private async executeType(selector: string, text: string, clearFirst?: boolean): Promise<void> {
    await this.cursor.click(selector);
    await sleep(getClickPause(this.timing));

    if (clearFirst) {
      await this.page.keyboard.press("Meta+a");
      await sleep(50);
      await this.page.keyboard.press("Backspace");
      await sleep(100);
    }

    // Type character by character with random delays
    for (const char of text) {
      await this.page.keyboard.type(char, { delay: 0 });
      await sleep(getTypingDelay(this.timing));
    }
  }

  private async executeScroll(target: string | { x: number; y: number }): Promise<void> {
    if (typeof target === "string") {
      // Scroll element into view
      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, target);
    } else {
      // Scroll to coordinates
      const steps = this.timing.scrollSpeed === "smooth" ? 20 : 5;
      const stepX = target.x / steps;
      const stepY = target.y / steps;
      for (let i = 0; i < steps; i++) {
        await this.page.evaluate(
          ([dx, dy]) => window.scrollBy(dx, dy),
          [stepX, stepY],
        );
        await sleep(this.timing.scrollSpeed === "smooth" ? 30 : 10);
      }
    }
  }

  private async executeHover(selector: string): Promise<void> {
    await sleep(getClickPause(this.timing));
    await this.cursor.moveTo(selector);
    await sleep(300); // Hold the hover briefly
  }

  private async executeScreenshot(name: string): Promise<void> {
    const dir = path.join(process.cwd(), ".prg-screenshots");
    await mkdir(dir, { recursive: true });
    await this.page.screenshot({ path: path.join(dir, `${name}.png`) });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/browser/actions.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/browser/actions.ts tests/browser/actions.test.ts
git commit -m "feat: human-like browser action executor with timing profiles"
```

---

### Task 14: UX Mapper

**Files:**
- Create: `src/core/ux-mapper.ts`
- Create: `tests/core/ux-mapper.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
      files: [
        {
          path: "src/app/login/page.tsx",
          category: "page",
          status: "modified",
          additions: 10,
          deletions: 2,
          hunks: [{ header: "@@ -1,5 +1,13 @@", changes: "+validation code" }],
        },
      ],
      summary: {
        totalFiles: 1,
        totalAdditions: 10,
        totalDeletions: 2,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/ux-mapper.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement UX mapper**

```typescript
// src/core/ux-mapper.ts
import { generateObject } from "ai";
import type { LanguageModelV1 } from "ai";
import { uxMapSchema } from "../ai/parsers.js";
import { buildDiffAnalysisPrompt } from "../ai/prompts/diff-analysis.js";
import type { DiffAnalysis, UXMap } from "../types/index.js";

export async function generateUXMap(
  diff: DiffAnalysis,
  model: LanguageModelV1,
): Promise<UXMap> {
  const prompt = buildDiffAnalysisPrompt(diff);

  const { object } = await generateObject({
    model,
    schema: uxMapSchema,
    prompt,
  });

  return object;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/ux-mapper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ux-mapper.ts tests/core/ux-mapper.test.ts
git commit -m "feat: UX mapper using LLM to infer user-visible impact from diffs"
```

---

### Task 15: Explorer Agent

**Files:**
- Create: `src/core/explorer.ts`
- Create: `tests/core/explorer.test.ts` (unit test for tool definitions)

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/explorer.test.ts
import { describe, it, expect, vi } from "vitest";

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

import { buildExplorerTools, runExplorationAgent } from "@/core/explorer.js";

describe("buildExplorerTools", () => {
  it("returns all six explorer tools", () => {
    const mockPage = {} as any;
    const tools = buildExplorerTools(mockPage);
    const toolNames = Object.keys(tools);

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
    const mockReport = {
      pagesVisited: [{ url: "/", title: "Home" }],
      interactiveElements: [],
      observedBehaviors: [],
      findings: [{ description: "Found a button", page: "/", relevantSelectors: ["#btn"] }],
      recommendedFlow: ["Go to /", "Click the button"],
    };

    // The agent accumulates findings via the reportFinding tool calls.
    // After generateText finishes, we collect findings into a ReconReport.
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/explorer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement explorer agent**

```typescript
// src/core/explorer.ts
import { generateText, tool } from "ai";
import type { LanguageModelV1 } from "ai";
import type { Page } from "playwright";
import { z } from "zod";
import { buildExplorationPrompt } from "../ai/prompts/exploration.js";
import type {
  DiffAnalysis,
  UXMap,
  ReconReport,
  PageVisit,
  DiscoveredElement,
  ObservedBehavior,
  ReconFinding,
} from "../types/index.js";

export function buildExplorerTools(page: Page) {
  // Accumulated data for the report
  const pagesVisited: PageVisit[] = [];
  const interactiveElements: DiscoveredElement[] = [];
  const observedBehaviors: ObservedBehavior[] = [];
  const findings: ReconFinding[] = [];

  const tools = {
    navigate: tool({
      description: "Navigate to a URL. Returns the page title and final URL after load.",
      parameters: z.object({
        url: z.string().describe("URL to navigate to"),
      }),
      execute: async ({ url }) => {
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
          const title = await page.title();
          const finalUrl = page.url();
          pagesVisited.push({ url: finalUrl, title });
          return { success: true, title, url: finalUrl };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    inspectDOM: tool({
      description: "Get a simplified DOM tree of the page or a subtree. Returns interactive elements, text content, and structure.",
      parameters: z.object({
        selector: z.string().optional().describe("Optional CSS selector to scope inspection to a subtree"),
      }),
      execute: async ({ selector }) => {
        try {
          const result = await page.evaluate((sel) => {
            function simplify(el: Element, depth: number = 0): string {
              if (depth > 4) return "...";
              const tag = el.tagName.toLowerCase();
              const id = el.id ? `#${el.id}` : "";
              const cls = el.className && typeof el.className === "string"
                ? `.${el.className.split(" ").filter(Boolean).slice(0, 2).join(".")}`
                : "";
              const role = el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "";
              const testId = el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : "";
              const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
                ? ` "${(el.textContent ?? "").slice(0, 50)}"`
                : "";
              const indent = "  ".repeat(depth);
              let result = `${indent}<${tag}${id}${cls}${role}${testId}${text}>\n`;
              for (const child of el.children) {
                result += simplify(child, depth + 1);
              }
              return result;
            }
            const root = sel ? document.querySelector(sel) : document.body;
            if (!root) return "Element not found";
            return simplify(root).slice(0, 3000); // Truncate for token management
          }, selector ?? null);
          return { success: true, dom: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getInteractiveElements: tool({
      description: "Get all interactive elements (buttons, links, inputs, selects) on the current page with their selectors and labels.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const elements = await page.evaluate(() => {
            const interactive = document.querySelectorAll(
              "button, a, input, select, textarea, [role=button], [role=link], [onclick]"
            );
            return Array.from(interactive).slice(0, 50).map((el) => {
              const tag = el.tagName.toLowerCase();
              let type: string = "other";
              if (tag === "button" || el.getAttribute("role") === "button") type = "button";
              else if (tag === "a" || el.getAttribute("role") === "link") type = "link";
              else if (tag === "input") type = "input";
              else if (tag === "select") type = "select";
              else if (tag === "textarea") type = "textarea";

              const testId = el.getAttribute("data-testid");
              const ariaLabel = el.getAttribute("aria-label");
              const id = el.id;
              const selector = testId
                ? `[data-testid='${testId}']`
                : id
                ? `#${id}`
                : ariaLabel
                ? `[aria-label='${ariaLabel}']`
                : `${tag}${el.className ? "." + (el.className as string).split(" ")[0] : ""}`;

              const label = ariaLabel
                ?? el.textContent?.trim().slice(0, 50)
                ?? el.getAttribute("placeholder")
                ?? selector;

              return { selector, type, label };
            });
          });

          const currentUrl = page.url();
          for (const el of elements) {
            interactiveElements.push({ ...el, page: currentUrl } as DiscoveredElement);
          }

          return { success: true, elements };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    screenshot: tool({
      description: "Take a screenshot of the current page. Returns base64-encoded image for visual analysis.",
      parameters: z.object({
        fullPage: z.boolean().optional().describe("Capture full page or just viewport"),
      }),
      execute: async ({ fullPage }) => {
        try {
          const buffer = await page.screenshot({ fullPage: fullPage ?? false });
          const base64 = buffer.toString("base64");
          // Store screenshot with page visit
          const currentUrl = page.url();
          const visit = pagesVisited.find((p) => p.url === currentUrl);
          if (visit) visit.screenshotBase64 = base64;
          return { success: true, base64, width: 1280, height: 720 };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    tryInteraction: tool({
      description: "Try an interaction (click, type, hover) on an element and report what changed.",
      parameters: z.object({
        action: z.enum(["click", "type", "hover"]).describe("Type of interaction"),
        selector: z.string().describe("CSS selector of the element"),
        text: z.string().optional().describe("Text to type (only for type action)"),
      }),
      execute: async ({ action, selector, text }) => {
        try {
          const beforeUrl = page.url();
          const beforeHTML = await page.evaluate(() => document.body.innerHTML.length);

          switch (action) {
            case "click":
              await page.click(selector, { timeout: 5000 });
              break;
            case "type":
              await page.fill(selector, text ?? "test input", { timeout: 5000 });
              break;
            case "hover":
              await page.hover(selector, { timeout: 5000 });
              break;
          }

          // Wait a moment for any reactions
          await page.waitForTimeout(500);

          const afterUrl = page.url();
          const afterHTML = await page.evaluate(() => document.body.innerHTML.length);
          const navigated = afterUrl !== beforeUrl;
          const domChanged = Math.abs(afterHTML - beforeHTML) > 10;

          const result = {
            navigated,
            newUrl: navigated ? afterUrl : undefined,
            domChanged,
            description: navigated
              ? `Navigated to ${afterUrl}`
              : domChanged
              ? "DOM content changed (possible modal, dropdown, or dynamic update)"
              : "No visible change detected",
          };

          observedBehaviors.push({
            trigger: `${action} ${selector}${text ? ` "${text}"` : ""}`,
            result: result.description,
            page: beforeUrl,
          });

          return { success: true, ...result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    reportFinding: tool({
      description: "Record a discovery or observation worth including in the walkthrough.",
      parameters: z.object({
        description: z.string().describe("What you found"),
        page: z.string().describe("URL of the page"),
        relevantSelectors: z.array(z.string()).describe("CSS selectors related to the finding"),
      }),
      execute: async ({ description, page: pageUrl, relevantSelectors }) => {
        findings.push({ description, page: pageUrl, relevantSelectors });
        return { success: true, recorded: true };
      },
    }),
  };

  return Object.assign(tools, {
    _getReport: (): Omit<ReconReport, "recommendedFlow"> => ({
      pagesVisited,
      interactiveElements,
      observedBehaviors,
      findings,
    }),
  });
}

export async function runExplorationAgent(
  model: LanguageModelV1,
  page: Page,
  diff: DiffAnalysis,
  uxMap: UXMap,
  maxSteps: number = 20,
): Promise<ReconReport> {
  const toolsWithReport = buildExplorerTools(page);
  const { _getReport, ...tools } = toolsWithReport;

  const prompt = buildExplorationPrompt(diff, uxMap);

  const { text } = await generateText({
    model,
    tools,
    maxSteps,
    system: prompt,
    prompt: "Begin exploring the application. Start by navigating to the most important affected route and systematically document what you find.",
  });

  const partialReport = _getReport();

  // Extract recommended flow from the agent's final text response
  const recommendedFlow: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) recommendedFlow.push(match[1]);
  }

  // If no numbered list, create a flow from findings
  if (recommendedFlow.length === 0) {
    for (const finding of partialReport.findings) {
      recommendedFlow.push(finding.description);
    }
  }

  return {
    ...partialReport,
    recommendedFlow,
  };
}

// Stub export for CLI command (will be wired in Task 18)
export async function runExplore(_options: Record<string, unknown>): Promise<void> {
  throw new Error("Not yet wired. Use the 'run' command or wait for Task 18.");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/explorer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/explorer.ts tests/core/explorer.test.ts
git commit -m "feat: AI exploration agent with browser tools for reconnaissance"
```

---

### Task 16: Script Generator

**Files:**
- Create: `src/core/script-generator.ts`
- Create: `tests/core/script-generator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/script-generator.test.ts
import { describe, it, expect, vi } from "vitest";

const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

import { generateWalkthroughScript } from "@/core/script-generator.js";
import type { ReconReport, DiffAnalysis } from "@/types/index.js";

describe("generateWalkthroughScript", () => {
  const mockRecon: ReconReport = {
    pagesVisited: [{ url: "http://localhost:3000/login", title: "Login" }],
    interactiveElements: [
      { selector: "#email", type: "input", label: "Email", page: "http://localhost:3000/login" },
      { selector: "#password", type: "input", label: "Password", page: "http://localhost:3000/login" },
      { selector: "button[type=submit]", type: "button", label: "Sign In", page: "http://localhost:3000/login" },
    ],
    observedBehaviors: [
      { trigger: "click button[type=submit]", result: "DOM content changed", page: "http://localhost:3000/login" },
    ],
    findings: [
      { description: "Email validation on blur", page: "http://localhost:3000/login", relevantSelectors: ["#email"] },
    ],
    recommendedFlow: ["Navigate to /login", "Test email validation", "Submit form"],
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
        { action: "type", selector: "#email", text: "invalid-email" },
        { action: "section", title: "Email Validation", description: "Shows the new blur validation" },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/script-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement script generator**

```typescript
// src/core/script-generator.ts
import { generateObject } from "ai";
import type { LanguageModelV1 } from "ai";
import { walkthroughScriptSchema } from "../ai/parsers.js";
import { buildWalkthroughPlanPrompt } from "../ai/prompts/walkthrough-plan.js";
import type {
  DiffAnalysis,
  ReconReport,
  WalkthroughScript,
} from "../types/index.js";

interface ScriptGeneratorOptions {
  baseUrl: string;
  viewport: { width: number; height: number };
  prMeta?: { number: number; repo: string; title: string };
}

export async function generateWalkthroughScript(
  model: LanguageModelV1,
  recon: ReconReport,
  diff: DiffAnalysis,
  options: ScriptGeneratorOptions,
): Promise<WalkthroughScript> {
  const prompt = buildWalkthroughPlanPrompt(
    recon,
    diff,
    options.baseUrl,
    options.viewport,
    options.prMeta,
  );

  try {
    const { object } = await generateObject({
      model,
      schema: walkthroughScriptSchema,
      prompt,
    });
    return object;
  } catch (firstError) {
    // One retry with the error appended
    const errorMessage =
      firstError instanceof Error ? firstError.message : String(firstError);

    try {
      const { object } = await generateObject({
        model,
        schema: walkthroughScriptSchema,
        prompt: `${prompt}\n\n## Previous Attempt Failed\n\nThe previous generation failed with this error:\n${errorMessage}\n\nPlease fix the issue and try again. Make sure your output matches the schema exactly.`,
      });
      return object;
    } catch (secondError) {
      throw new Error(
        `Script generation failed after 2 attempts. Last error: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
      );
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/script-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/script-generator.ts tests/core/script-generator.test.ts
git commit -m "feat: walkthrough script generator with retry on validation failure"
```

---

### Task 17: Script Reviewer

**Files:**
- Create: `src/core/script-reviewer.ts`
- Create: `tests/core/script-reviewer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/script-reviewer.test.ts
import { describe, it, expect, vi } from "vitest";
import { formatScriptForDisplay, applyNaturalLanguageEdit } from "@/core/script-reviewer.js";
import type { WalkthroughScript } from "@/types/index.js";

const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

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
      steps: [
        { action: "navigate", url: "/", annotation: "This is the home page" },
      ],
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
    const result = await applyNaturalLanguageEdit(
      model,
      baseScript,
      2,
      "remove this step",
    );

    expect(result.steps).toHaveLength(2);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/script-reviewer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement script reviewer**

```typescript
// src/core/script-reviewer.ts
import { generateObject } from "ai";
import type { LanguageModelV1 } from "ai";
import { createInterface } from "readline";
import chalk from "chalk";
import { walkthroughScriptSchema } from "../ai/parsers.js";
import { buildScriptEditPrompt } from "../ai/prompts/script-edit.js";
import type { WalkthroughScript, ReconReport, DiffAnalysis } from "../types/index.js";

export function formatScriptForDisplay(script: WalkthroughScript): string {
  const lines: string[] = [];
  lines.push(chalk.bold("\n=== Walkthrough Script ===\n"));
  lines.push(chalk.dim(`Base URL: ${script.metadata.baseUrl}`));
  lines.push(chalk.dim(`Viewport: ${script.metadata.viewport.width}x${script.metadata.viewport.height}`));
  if (script.metadata.pr) {
    lines.push(chalk.dim(`PR: #${script.metadata.pr.number} — ${script.metadata.pr.title}`));
  }
  lines.push("");

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const num = chalk.bold.white(`${i + 1}.`);

    switch (step.action) {
      case "navigate":
        lines.push(`${num} ${chalk.blue("[navigate]")} ${step.url}`);
        break;
      case "click":
        lines.push(`${num} ${chalk.green("[click]")} ${step.description} ${chalk.dim(`(${step.selector})`)}`);
        break;
      case "type":
        lines.push(`${num} ${chalk.yellow("[type]")} "${step.text}" ${chalk.dim(`→ ${step.selector}`)}${step.clearFirst ? chalk.dim(" (clear first)") : ""}`);
        break;
      case "scroll":
        lines.push(`${num} ${chalk.magenta("[scroll]")} ${typeof step.target === "string" ? step.target : `(${step.target.x}, ${step.target.y})`}`);
        break;
      case "hover":
        lines.push(`${num} ${chalk.cyan("[hover]")} ${step.description} ${chalk.dim(`(${step.selector})`)}`);
        break;
      case "wait":
        lines.push(`${num} ${chalk.gray("[wait]")} ${step.duration}ms — ${step.reason}`);
        break;
      case "screenshot":
        lines.push(`${num} ${chalk.gray("[screenshot]")} ${step.name}`);
        break;
      case "viewport":
        lines.push(`${num} ${chalk.gray("[viewport]")} ${step.width}x${step.height}`);
        break;
      case "section":
        lines.push(`\n${num} ${chalk.bold.underline(`[section] ${step.title}`)}`);
        lines.push(`   ${chalk.dim(step.description)}`);
        break;
    }

    if ("annotation" in step && step.annotation) {
      lines.push(`   ${chalk.italic.cyan(`> ${step.annotation}`)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export async function applyNaturalLanguageEdit(
  model: LanguageModelV1,
  script: WalkthroughScript,
  stepNumber: number | "all",
  instruction: string,
): Promise<WalkthroughScript> {
  const prompt = buildScriptEditPrompt(script, stepNumber, instruction);

  const { object } = await generateObject({
    model,
    schema: walkthroughScriptSchema,
    prompt,
  });

  return object;
}

function askQuestion(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

export type ReviewResult =
  | { action: "proceed"; script: WalkthroughScript }
  | { action: "regenerate" }
  | { action: "quit"; script: WalkthroughScript };

export async function reviewScript(
  model: LanguageModelV1,
  script: WalkthroughScript,
): Promise<ReviewResult> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentScript = script;

  try {
    while (true) {
      console.log(formatScriptForDisplay(currentScript));
      console.log(
        chalk.bold("[P]roceed  [E]dit  [R]egenerate  [S]ave & quit\n"),
      );

      const choice = (await askQuestion(rl, "Choice: ")).trim().toLowerCase();

      switch (choice) {
        case "p":
        case "proceed":
          return { action: "proceed", script: currentScript };

        case "e":
        case "edit": {
          const stepInput = await askQuestion(
            rl,
            'Step number to edit (or "all" for global change): ',
          );
          const stepNum =
            stepInput.trim().toLowerCase() === "all"
              ? ("all" as const)
              : parseInt(stepInput, 10);

          if (stepNum !== "all" && (isNaN(stepNum) || stepNum < 1 || stepNum > currentScript.steps.length)) {
            console.log(chalk.red(`Invalid step number. Must be 1-${currentScript.steps.length} or "all".`));
            continue;
          }

          const instruction = await askQuestion(rl, "Describe the change: ");
          if (!instruction.trim()) continue;

          console.log(chalk.dim("Applying edit..."));
          currentScript = await applyNaturalLanguageEdit(
            model,
            currentScript,
            stepNum,
            instruction.trim(),
          );
          break;
        }

        case "r":
        case "regenerate":
          return { action: "regenerate" };

        case "s":
        case "save":
          return { action: "quit", script: currentScript };

        default:
          console.log(chalk.red('Invalid choice. Enter P, E, R, or S.'));
      }
    }
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/script-reviewer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/script-reviewer.ts tests/core/script-reviewer.test.ts
git commit -m "feat: script reviewer with terminal display and natural language editing"
```

---

### Task 18: Recorder

**Files:**
- Create: `src/core/recorder.ts`
- Create: `tests/core/recorder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/recorder.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          waitForSelector: vi.fn().mockResolvedValue({ click: vi.fn() }),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          keyboard: { type: vi.fn(), press: vi.fn() },
          evaluate: vi.fn().mockResolvedValue(undefined),
          setViewportSize: vi.fn().mockResolvedValue(undefined),
          screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
          close: vi.fn().mockResolvedValue(undefined),
          video: vi.fn().mockReturnValue({
            path: vi.fn().mockResolvedValue("/tmp/video.webm"),
          }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("@/browser/cursor.js", () => ({
  GhostCursorController: class {
    init = vi.fn().mockResolvedValue(undefined);
    moveTo = vi.fn().mockResolvedValue(undefined);
    click = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@/browser/timing.js", () => ({
  TimingProfile: class {
    typingDelay = { min: 0, max: 0 };
    clickPause = { min: 0, max: 0 };
    scrollSpeed = "smooth" as const;
    sectionPause = 0;
  },
  getTypingDelay: () => 0,
  getClickPause: () => 0,
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { recordWalkthrough } from "@/core/recorder.js";
import type { WalkthroughScript, PrGhostConfig } from "@/types/index.js";

describe("recordWalkthrough", () => {
  const script: WalkthroughScript = {
    metadata: {
      generatedAt: "2026-03-30T12:00:00Z",
      baseUrl: "http://localhost:3000",
      viewport: { width: 1280, height: 720 },
    },
    steps: [
      { action: "navigate", url: "/" },
      { action: "section", title: "Test", description: "Test section" },
    ],
  };

  const config: PrGhostConfig = {
    baseUrl: "http://localhost:3000",
    video: { viewport: { width: 1280, height: 720 }, format: "mp4", fps: 30 },
    timing: {
      typingDelay: { min: 0, max: 0 },
      clickPause: { min: 0, max: 0 },
      scrollSpeed: "smooth",
      sectionPause: 0,
    },
    ai: { provider: "openai", model: "gpt-4o", maxExplorationSteps: 20 },
    selectors: { priority: ["css"] },
    ignore: [],
  };

  it("returns a RecordingResult with video path and timestamps", async () => {
    const result = await recordWalkthrough(script, config);
    expect(result).toHaveProperty("videoPath");
    expect(result).toHaveProperty("timestamps");
    expect(result.timestamps).toHaveLength(2);
    expect(result).toHaveProperty("skippedSteps");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/recorder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement recorder**

```typescript
// src/core/recorder.ts
import { chromium } from "playwright";
import { GhostCursorController } from "../browser/cursor.js";
import { ActionExecutor } from "../browser/actions.js";
import { TimingProfile } from "../browser/timing.js";
import type {
  WalkthroughScript,
  WalkthroughStep,
  PrGhostConfig,
  RecordingResult,
  StepTimestamp,
} from "../types/index.js";

export async function recordWalkthrough(
  script: WalkthroughScript,
  config: PrGhostConfig,
  outputDir?: string,
): Promise<RecordingResult> {
  const videoDir = outputDir ?? process.cwd();
  const { viewport } = script.metadata;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: videoDir,
      size: viewport,
    },
  });
  const page = await context.newPage();

  const cursor = new GhostCursorController();
  await cursor.init(page);

  const timing = new TimingProfile(config.timing);
  const executor = new ActionExecutor(page, cursor, timing, config.selectors.priority);

  // Execute auth steps if configured
  if (config.auth?.steps) {
    for (const step of config.auth.steps) {
      await executor.execute(step, script.metadata.baseUrl);
    }
  }

  // Reset timer after auth
  executor.resetTimer();

  // Execute walkthrough steps
  const timestamps: StepTimestamp[] = [];
  const skippedSteps: number[] = [];
  const startTime = Date.now();

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const result = await executor.execute(step, script.metadata.baseUrl);

    timestamps.push({
      stepIndex: i,
      action: step.action,
      annotation: "annotation" in step ? step.annotation : undefined,
      timestampMs: result.timestampMs,
    });

    if (result.skipped) {
      skippedSteps.push(i);
      console.warn(
        `Warning: Step ${i + 1} [${step.action}] skipped: ${result.error}`,
      );
    }
  }

  const duration = Date.now() - startTime;

  // Get the video path before closing
  const video = page.video();
  const videoPath = video ? await video.path() : "";

  await context.close();
  await browser.close();

  return {
    videoPath,
    timestamps,
    skippedSteps,
    duration,
  };
}

// Stub export for CLI command (will be wired in Task 20)
export async function runRecord(_options: Record<string, unknown>): Promise<void> {
  throw new Error("Not yet wired. Use the 'run' command or wait for Task 20.");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/recorder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/recorder.ts tests/core/recorder.test.ts
git commit -m "feat: walkthrough recorder with Playwright video capture and timestamp sidecar"
```

---

### Task 19: Video Processor

**Files:**
- Create: `src/core/video-processor.ts`
- Create: `tests/core/video-processor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/video-processor.test.ts
import { describe, it, expect, vi } from "vitest";
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
    expect(filter).not.toContain("navigate"); // No annotation on step 0
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/video-processor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement video processor**

```typescript
// src/core/video-processor.ts
import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import path from "path";
import type { StepTimestamp, RecordingResult } from "../types/index.js";

export async function checkFfmpeg(): Promise<boolean> {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function buildAnnotationFilter(timestamps: StepTimestamp[]): string {
  const annotated = timestamps.filter((t) => t.annotation);
  if (annotated.length === 0) return "";

  const filters = annotated.map((t, index) => {
    const startSec = t.timestampMs / 1000;
    // Find next step to determine end time
    const nextStep = timestamps.find((ts) => ts.stepIndex > t.stepIndex);
    const endSec = nextStep ? nextStep.timestampMs / 1000 : startSec + 3;

    // Escape special characters for ffmpeg drawtext
    const text = (t.annotation ?? "")
      .replace(/'/g, "\u2019")
      .replace(/:/g, "\\:");

    return `drawtext=text='${text}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.6:boxborderw=10:enable='between(t,${startSec},${endSec})'`;
  });

  return filters.join(",");
}

function buildSectionFilter(timestamps: StepTimestamp[]): string {
  const sections = timestamps.filter((t) => t.action === "section");
  if (sections.length === 0) return "";

  // Section titles are handled differently — we'd need to create title card segments
  // For now, overlay the section title briefly
  const filters = sections.map((t) => {
    const startSec = t.timestampMs / 1000;
    const endSec = startSec + 1.5;
    const text = (t.annotation ?? "Section")
      .replace(/'/g, "\u2019")
      .replace(/:/g, "\\:");

    return `drawtext=text='${text}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.8:boxborderw=20:enable='between(t,${startSec},${endSec})'`;
  });

  return filters.join(",");
}

export interface ProcessingOptions {
  introText?: string;
  outroText?: string;
}

export async function processVideo(
  recording: RecordingResult,
  outputPath: string,
  options: ProcessingOptions = {},
): Promise<string> {
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    console.warn(
      "Warning: ffmpeg not installed. Outputting raw WebM video.\n" +
      "Install ffmpeg for MP4 conversion and annotations: https://ffmpeg.org/download.html",
    );
    return recording.videoPath;
  }

  const annotationFilter = buildAnnotationFilter(recording.timestamps);
  const sectionFilter = buildSectionFilter(recording.timestamps);

  const allFilters = [annotationFilter, sectionFilter].filter(Boolean).join(",");

  return new Promise((resolve, reject) => {
    let command = ffmpeg(recording.videoPath)
      .outputOptions("-c:v", "libx264")
      .outputOptions("-pix_fmt", "yuv420p")
      .outputOptions("-movflags", "+faststart");

    if (allFilters) {
      command = command.videoFilters(allFilters);
    }

    command
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => {
        console.warn(`Warning: ffmpeg processing failed: ${err.message}`);
        console.warn("Preserving raw video at:", recording.videoPath);
        resolve(recording.videoPath);
      })
      .run();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/video-processor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/video-processor.ts tests/core/video-processor.test.ts
git commit -m "feat: video post-processor with ffmpeg annotation burn-in"
```

---

### Task 20: Dev Server Manager

**Files:**
- Create: `src/core/dev-server.ts`

- [ ] **Step 1: Implement dev server manager**

```typescript
// src/core/dev-server.ts
import { spawn, type ChildProcess } from "child_process";
import { createConnection } from "net";
import type { PrGhostConfig } from "../types/index.js";

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

export async function startDevServer(
  config: NonNullable<PrGhostConfig["devServer"]>,
): Promise<ChildProcess> {
  const alreadyRunning = await isPortInUse(config.port);
  if (alreadyRunning) {
    throw new Error(`Port ${config.port} is already in use — dev server may already be running.`);
  }

  const [cmd, ...args] = config.command.split(" ");
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    detached: false,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `Dev server did not become ready within ${config.startTimeout}ms. ` +
          `Looking for pattern: "${config.readyPattern}"`,
        ),
      );
    }, config.startTimeout);

    const checkOutput = (data: Buffer) => {
      const text = data.toString();
      if (text.includes(config.readyPattern)) {
        clearTimeout(timeout);
        resolve(child);
      }
    };

    child.stdout?.on("data", checkOutput);
    child.stderr?.on("data", checkOutput);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start dev server: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

export function stopDevServer(child: ChildProcess): void {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/dev-server.ts
git commit -m "feat: dev server auto-start/stop with port detection and ready pattern"
```

---

### Task 21: Wire CLI Commands

**Files:**
- Create: `src/cli/commands/run-handler.ts`
- Create: `src/cli/commands/init-handler.ts`
- Modify: `src/cli/commands/explore.ts`
- Modify: `src/cli/commands/record.ts`

- [ ] **Step 1: Implement the run handler (full pipeline)**

```typescript
// src/cli/commands/run-handler.ts
import chalk from "chalk";
import ora from "ora";
import { writeFile, readFile } from "fs/promises";
import path from "path";
import { loadConfig } from "../../config/schema.js";
import { createModel } from "../../ai/provider.js";
import { analyzeDiffFromGit } from "../../core/diff-analyzer.js";
import { fetchPRDiff, fetchPRMetadata } from "../../core/github.js";
import { generateUXMap } from "../../core/ux-mapper.js";
import { runExplorationAgent } from "../../core/explorer.js";
import { generateWalkthroughScript } from "../../core/script-generator.js";
import { reviewScript, formatScriptForDisplay } from "../../core/script-reviewer.js";
import { recordWalkthrough } from "../../core/recorder.js";
import { processVideo } from "../../core/video-processor.js";
import { startDevServer, stopDevServer, isPortInUse } from "../../core/dev-server.js";
import { chromium } from "playwright";
import type { ChildProcess } from "child_process";
import type { DiffAnalysis, WalkthroughScript } from "../../types/index.js";

interface RunOptions {
  pr?: string;
  repo?: string;
  diff?: string;
  baseUrl?: string;
  output?: string;
  review?: boolean;
  scriptOnly?: boolean;
}

export async function runFullPipeline(options: RunOptions): Promise<void> {
  const config = await loadConfig(process.cwd(), {
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });

  const baseUrl = options.baseUrl ?? config.baseUrl;
  const outputPath = options.output ?? "./walkthrough.mp4";
  const doReview = options.review !== false;

  const model = createModel(config);
  let devServerProcess: ChildProcess | undefined;

  try {
    // Step 1: Start dev server if needed
    if (config.devServer) {
      const portBusy = await isPortInUse(config.devServer.port);
      if (!portBusy) {
        const spinner = ora("Starting dev server...").start();
        devServerProcess = await startDevServer(config.devServer);
        spinner.succeed("Dev server started");
      }
    }

    // Step 2: Get diff
    let spinner = ora("Analyzing diff...").start();
    let diff: DiffAnalysis;
    let prMeta: { number: number; repo: string; title: string } | undefined;

    if (options.pr && options.repo) {
      const prNum = parseInt(options.pr, 10);
      diff = await fetchPRDiff(options.repo, prNum);
      prMeta = await fetchPRMetadata(options.repo, prNum);
    } else if (options.pr) {
      throw new Error("--repo is required when using --pr");
    } else {
      const ref = options.diff ?? "HEAD~1";
      diff = await analyzeDiffFromGit(ref);
    }
    spinner.succeed(`Analyzed ${diff.summary.totalFiles} changed files`);

    if (diff.files.length === 0) {
      console.log(chalk.yellow("No file changes found. Nothing to walk through."));
      return;
    }

    // Step 3: Generate UX map
    spinner = ora("Mapping code changes to UX impact...").start();
    const uxMap = await generateUXMap(diff, model);
    spinner.succeed(`Found ${uxMap.affectedRoutes.length} affected routes, ${uxMap.behaviorChanges.length} behavior changes`);

    if (uxMap.affectedRoutes.length === 0 && uxMap.behaviorChanges.length === 0) {
      console.log(chalk.yellow("No user-visible changes detected. Consider skipping video generation."));
    }

    // Step 4: AI exploration
    spinner = ora("Exploring the application...").start();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: config.video.viewport,
    });
    const explorerPage = await context.newPage();

    const recon = await runExplorationAgent(
      model,
      explorerPage,
      diff,
      uxMap,
      config.ai.maxExplorationSteps,
    );

    await context.close();
    await browser.close();
    spinner.succeed(`Explored ${recon.pagesVisited.length} pages, found ${recon.findings.length} findings`);

    // Step 5: Generate walkthrough script
    spinner = ora("Generating walkthrough script...").start();
    let script = await generateWalkthroughScript(model, recon, diff, {
      baseUrl,
      viewport: config.video.viewport,
      prMeta,
    });
    spinner.succeed(`Generated script with ${script.steps.length} steps`);

    // Step 6: Review (if interactive)
    if (doReview && !options.scriptOnly) {
      const result = await reviewScript(model, script);

      switch (result.action) {
        case "proceed":
          script = result.script;
          break;
        case "regenerate":
          spinner = ora("Regenerating walkthrough script...").start();
          script = await generateWalkthroughScript(model, recon, diff, {
            baseUrl,
            viewport: config.video.viewport,
            prMeta,
          });
          spinner.succeed(`Regenerated script with ${script.steps.length} steps`);
          break;
        case "quit":
          const savePath = outputPath.replace(/\.\w+$/, ".json");
          await writeFile(savePath, JSON.stringify(result.script, null, 2));
          console.log(chalk.green(`Script saved to ${savePath}`));
          return;
      }
    }

    // Step 6b: Save script if --script-only
    if (options.scriptOnly) {
      const scriptPath = outputPath.replace(/\.\w+$/, ".json");
      await writeFile(scriptPath, JSON.stringify(script, null, 2));
      console.log(chalk.green(`Script saved to ${scriptPath}`));
      return;
    }

    // Step 7: Record
    spinner = ora("Recording walkthrough video...").start();
    const recording = await recordWalkthrough(script, config);
    spinner.succeed(`Recorded ${(recording.duration / 1000).toFixed(1)}s video`);

    if (recording.skippedSteps.length > 0) {
      console.log(
        chalk.yellow(`Warning: ${recording.skippedSteps.length} steps were skipped due to errors.`),
      );
    }

    // Step 8: Post-process
    spinner = ora("Processing video...").start();
    const finalPath = await processVideo(recording, outputPath, {
      introText: prMeta ? `PR #${prMeta.number}: ${prMeta.title}` : undefined,
    });
    spinner.succeed(`Video saved to ${chalk.bold(finalPath)}`);

  } finally {
    if (devServerProcess) {
      stopDevServer(devServerProcess);
    }
  }
}
```

- [ ] **Step 2: Update explore command to wire through to the pipeline**

```typescript
// src/cli/commands/explore.ts
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFile } from "fs/promises";
import { loadConfig } from "../../config/schema.js";
import { createModel } from "../../ai/provider.js";
import { analyzeDiffFromGit } from "../../core/diff-analyzer.js";
import { fetchPRDiff, fetchPRMetadata } from "../../core/github.js";
import { generateUXMap } from "../../core/ux-mapper.js";
import { runExplorationAgent } from "../../core/explorer.js";
import { generateWalkthroughScript } from "../../core/script-generator.js";
import { startDevServer, stopDevServer, isPortInUse } from "../../core/dev-server.js";
import { chromium } from "playwright";
import type { ChildProcess } from "child_process";
import type { DiffAnalysis } from "../../types/index.js";

export const exploreCommand = new Command("explore")
  .description("Analyze diff and generate a walkthrough script")
  .option("--pr <number>", "GitHub PR number")
  .option("--repo <owner/repo>", "GitHub repository")
  .option("--diff <ref>", "Local git ref to diff against (e.g., HEAD~1, main)")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output path for walkthrough script", "./walkthrough.json")
  .action(async (options) => {
    const config = await loadConfig(process.cwd(), {
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });

    const baseUrl = options.baseUrl ?? config.baseUrl;
    const model = createModel(config);
    let devServerProcess: ChildProcess | undefined;

    try {
      // Start dev server if needed
      if (config.devServer) {
        const portBusy = await isPortInUse(config.devServer.port);
        if (!portBusy) {
          const spinner = ora("Starting dev server...").start();
          devServerProcess = await startDevServer(config.devServer);
          spinner.succeed("Dev server started");
        }
      }

      // Get diff
      let spinner = ora("Analyzing diff...").start();
      let diff: DiffAnalysis;
      let prMeta: { number: number; repo: string; title: string } | undefined;

      if (options.pr && options.repo) {
        const prNum = parseInt(options.pr, 10);
        diff = await fetchPRDiff(options.repo, prNum);
        prMeta = await fetchPRMetadata(options.repo, prNum);
      } else if (options.pr) {
        throw new Error("--repo is required when using --pr");
      } else {
        diff = await analyzeDiffFromGit(options.diff ?? "HEAD~1");
      }
      spinner.succeed(`Analyzed ${diff.summary.totalFiles} changed files`);

      // Generate UX map
      spinner = ora("Mapping code changes to UX impact...").start();
      const uxMap = await generateUXMap(diff, model);
      spinner.succeed("UX map generated");

      // Explore
      spinner = ora("Exploring the application...").start();
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: config.video.viewport });
      const explorerPage = await context.newPage();

      const recon = await runExplorationAgent(
        model,
        explorerPage,
        diff,
        uxMap,
        config.ai.maxExplorationSteps,
      );

      await context.close();
      await browser.close();
      spinner.succeed("Exploration complete");

      // Generate script
      spinner = ora("Generating walkthrough script...").start();
      const script = await generateWalkthroughScript(model, recon, diff, {
        baseUrl,
        viewport: config.video.viewport,
        prMeta,
      });
      spinner.succeed(`Generated script with ${script.steps.length} steps`);

      // Save
      await writeFile(options.output, JSON.stringify(script, null, 2));
      console.log(chalk.green(`Walkthrough script saved to ${options.output}`));

    } finally {
      if (devServerProcess) stopDevServer(devServerProcess);
    }
  });
```

- [ ] **Step 3: Update record command to wire through to recorder**

```typescript
// src/cli/commands/record.ts
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile } from "fs/promises";
import { loadConfig } from "../../config/schema.js";
import { walkthroughScriptSchema } from "../../ai/parsers.js";
import { recordWalkthrough } from "../../core/recorder.js";
import { processVideo } from "../../core/video-processor.js";
import { startDevServer, stopDevServer, isPortInUse } from "../../core/dev-server.js";
import type { ChildProcess } from "child_process";

export const recordCommand = new Command("record")
  .description("Record a video from an existing walkthrough script")
  .requiredOption("--script <path>", "Path to walkthrough script JSON")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output video path", "./walkthrough.mp4")
  .action(async (options) => {
    const config = await loadConfig(process.cwd(), {
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });

    let devServerProcess: ChildProcess | undefined;

    try {
      // Start dev server if needed
      if (config.devServer) {
        const portBusy = await isPortInUse(config.devServer.port);
        if (!portBusy) {
          const spinner = ora("Starting dev server...").start();
          devServerProcess = await startDevServer(config.devServer);
          spinner.succeed("Dev server started");
        }
      }

      // Load script
      let spinner = ora("Loading walkthrough script...").start();
      const raw = await readFile(options.script, "utf-8");
      const parsed = walkthroughScriptSchema.safeParse(JSON.parse(raw));

      if (!parsed.success) {
        spinner.fail("Invalid walkthrough script");
        console.error(chalk.red(parsed.error.message));
        process.exit(1);
      }

      const script = parsed.data;

      // Override base URL if provided
      if (options.baseUrl) {
        script.metadata.baseUrl = options.baseUrl;
      }

      spinner.succeed(`Loaded script with ${script.steps.length} steps`);

      // Record
      spinner = ora("Recording walkthrough video...").start();
      const recording = await recordWalkthrough(script, config);
      spinner.succeed(`Recorded ${(recording.duration / 1000).toFixed(1)}s video`);

      if (recording.skippedSteps.length > 0) {
        console.log(
          chalk.yellow(`Warning: ${recording.skippedSteps.length} steps skipped.`),
        );
      }

      // Process
      spinner = ora("Processing video...").start();
      const finalPath = await processVideo(recording, options.output);
      spinner.succeed(`Video saved to ${chalk.bold(finalPath)}`);

    } finally {
      if (devServerProcess) stopDevServer(devServerProcess);
    }
  });
```

- [ ] **Step 4: Implement init handler**

```typescript
// src/cli/commands/init-handler.ts
import { createInterface } from "readline";
import { writeFile, access } from "fs/promises";
import path from "path";
import chalk from "chalk";

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultVal?: string): Promise<string> {
  const prompt = defaultVal ? `${question} (${defaultVal}): ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

export async function runInit(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(chalk.bold("\nPR Ghost Configuration\n"));

    const baseUrl = await ask(rl, "Base URL of your app", "http://localhost:3000");
    const devCommand = await ask(rl, "Dev server command (leave empty to skip)", "");
    const port = devCommand ? await ask(rl, "Dev server port", "3000") : "";
    const readyPattern = devCommand ? await ask(rl, "Stdout pattern when server is ready", "Ready on") : "";
    const provider = await ask(rl, "AI provider (openai/anthropic/google)", "openai");
    const model = await ask(rl, "Model name", provider === "openai" ? "gpt-4o" : provider === "anthropic" ? "claude-sonnet-4-20250514" : "gemini-2.0-flash");

    const devServerBlock = devCommand
      ? `  devServer: {
    command: "${devCommand}",
    port: ${port},
    readyPattern: "${readyPattern}",
    startTimeout: 30000,
  },\n`
      : "";

    const configContent = `/** @type {import("./src/types/index.js").PrGhostConfig} */
export default {
${devServerBlock}  baseUrl: "${baseUrl}",
  video: {
    viewport: { width: 1280, height: 720 },
    format: "mp4",
    fps: 30,
  },
  timing: {
    typingDelay: { min: 50, max: 120 },
    clickPause: { min: 200, max: 500 },
    scrollSpeed: "smooth",
    sectionPause: 1000,
  },
  ai: {
    provider: "${provider}",
    model: "${model}",
    maxExplorationSteps: 20,
  },
  selectors: {
    priority: ["data-testid", "aria-label", "role", "css", "text"],
  },
  ignore: ["/api/*", "/_next/*"],
};
`;

    const outputPath = path.join(process.cwd(), "prg.config.ts");

    try {
      await access(outputPath);
      const overwrite = await ask(rl, "prg.config.ts already exists. Overwrite? (y/n)", "n");
      if (overwrite.toLowerCase() !== "y") {
        console.log(chalk.yellow("Aborted."));
        return;
      }
    } catch {
      // File doesn't exist, proceed
    }

    await writeFile(outputPath, configContent);
    console.log(chalk.green(`\nConfig written to ${outputPath}`));
    console.log(chalk.dim("Edit the file to customize further, or run `prg run` to start."));
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 5: Verify CLI compiles and shows help**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npx tsx src/cli/index.ts --help`
Expected: Shows all four commands

- [ ] **Step 6: Commit**

```bash
git add src/cli/
git commit -m "feat: wire all CLI commands to the pipeline"
```

---

### Task 22: Remove Stub Exports and Final Cleanup

**Files:**
- Modify: `src/core/explorer.ts` — remove `runExplore` stub
- Modify: `src/core/recorder.ts` — remove `runRecord` stub

- [ ] **Step 1: Remove stub exports from explorer.ts**

Delete the `runExplore` stub function at the bottom of `src/core/explorer.ts`.

- [ ] **Step 2: Remove stub exports from recorder.ts**

Delete the `runRecord` stub function at the bottom of `src/core/recorder.ts`.

- [ ] **Step 3: Verify full project compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Verify CLI works end-to-end (smoke test)**

Run: `npx tsx src/cli/index.ts --help`
Expected: Shows help with version 0.1.0

Run: `npx tsx src/cli/index.ts explore --help`
Expected: Shows explore flags

Run: `npx tsx src/cli/index.ts record --help`
Expected: Shows record flags with --script required

Run: `npx tsx src/cli/index.ts run --help`
Expected: Shows run flags

- [ ] **Step 6: Commit**

```bash
git add src/core/explorer.ts src/core/recorder.ts
git commit -m "chore: remove stub exports, final cleanup"
```

---

## Task Dependency Summary

Tasks can be parallelized in these groups:

**Sequential (must be in order):**
1 → 2 → 3 → 4 (scaffolding → types → config → CLI)

**Parallel after Task 4:**
- Tasks 5, 6, 9, 10 (AI provider, parsers, prompts, timing) — independent of each other
- Task 7 depends on Task 2 (types)
- Task 8 depends on Task 7 (github depends on diff-analyzer)

**Parallel after Tasks 5-10:**
- Tasks 11, 12 (cursor, selectors) — independent
- Task 13 depends on Tasks 10, 11 (actions needs timing, cursor)
- Task 14 depends on Tasks 5, 6, 9 (UX mapper needs AI provider, parsers, prompts)
- Task 15 depends on Tasks 5, 6, 9 (explorer needs AI, parsers, prompts)
- Task 16 depends on Tasks 5, 6, 9 (script generator needs AI, parsers, prompts)

**After Tasks 13-16:**
- Task 17 depends on Task 16 (reviewer needs script generator schema)
- Task 18 depends on Task 13 (recorder needs actions)
- Task 19 (video processor) — mostly independent

**Final:**
- Task 20 (dev server) — independent
- Task 21 depends on all prior tasks (wiring)
- Task 22 depends on Task 21 (cleanup)
