# PR Ghost — Design Specification

**Date:** 2026-03-30
**Status:** Approved

## Overview

PR Ghost is a CLI tool that automatically generates video walkthroughs of pull request changes. Given a GitHub PR or local git diff, it analyzes what changed, explores the running app via an AI agent, generates a walkthrough script, and records a Playwright browser session with human-like interactions.

## Architecture

### Pipeline

```
Git Diff → Diff Analyzer → UX Mapper → Explorer Agent → Script Generator → Recorder → Video Processor
                                         (recon)          (structured)      (replay)    (ffmpeg)
```

### Key Artifacts

Three typed, serializable artifacts flow through the pipeline:

1. **DiffAnalysis** — structured representation of code changes (files, hunks, categories)
2. **ReconReport** — explorer agent findings: pages with changes, interactive elements, screenshots, observed behaviors
3. **WalkthroughScript** — final JSON script that drives recording

The pipeline is composable — you can resume from any artifact (e.g., hand-edit a WalkthroughScript and re-record).

### Core Principle

The recorder is dumb. It takes a WalkthroughScript and executes it mechanically with human-like timing. All intelligence lives in the exploration and script generation phases.

## Tech Stack

- **Runtime:** Node.js with TypeScript (strict mode)
- **Package manager:** pnpm
- **CLI framework:** Commander.js
- **Browser automation:** Playwright (Chromium)
- **Human-like cursor:** ghost-cursor-playwright (behind abstraction layer)
- **LLM integration:** Vercel AI SDK (`ai` package) — provider-agnostic
- **Primary LLM target:** OpenAI GPT-4o
- **Video:** Playwright built-in recording + ffmpeg post-processing
- **Git/GitHub:** simple-git + @octokit/rest

## Project Structure

```
pr-ghost/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entrypoint (Commander setup)
│   │   └── commands/
│   │       ├── explore.ts         # Generate walkthrough script from diff
│   │       ├── record.ts          # Record video from walkthrough script
│   │       ├── run.ts             # Full pipeline (explore → review → record)
│   │       └── init.ts            # Generate config file
│   ├── core/
│   │   ├── diff-analyzer.ts       # Parse git diff, categorize changes
│   │   ├── ux-mapper.ts           # Map code changes to UX-visible effects
│   │   ├── script-generator.ts    # Generate walkthrough script from recon report
│   │   ├── script-reviewer.ts     # Terminal review flow with LLM-powered editing
│   │   ├── explorer.ts            # AI exploration agent (reconnaissance phase)
│   │   ├── recorder.ts            # Replay engine (execute script + record video)
│   │   ├── video-processor.ts     # ffmpeg post-processing
│   │   └── github.ts              # GitHub integration (fetch PR diff)
│   ├── ai/
│   │   ├── provider.ts            # Vercel AI SDK setup, model config
│   │   ├── prompts/
│   │   │   ├── diff-analysis.ts   # System prompt for analyzing diffs
│   │   │   ├── walkthrough-plan.ts # System prompt for script generation
│   │   │   ├── exploration.ts     # System prompt for the exploration agent
│   │   │   └── script-edit.ts     # System prompt for natural language script edits
│   │   └── parsers.ts             # Zod schemas for AI output validation
│   ├── browser/
│   │   ├── actions.ts             # Human-like browser actions
│   │   ├── cursor.ts              # CursorController abstraction over ghost-cursor
│   │   ├── selectors.ts           # Selector strategies
│   │   └── timing.ts              # Timing profiles and easing functions
│   ├── config/
│   │   └── schema.ts              # Config file schema and loader
│   └── types/
│       └── index.ts               # Shared TypeScript types
├── package.json
├── tsconfig.json
└── prg.config.example.ts
```

## Detailed Design

### 1. Diff Analyzer

Uses `simple-git` for local diffs, `@octokit/rest` for GitHub PR diffs.

**Output (DiffAnalysis):**
- Changed files categorized as: components, pages/routes, styles, utils, API routes, tests, config, other
- Per-file change details: added/removed/modified functions, JSX elements, props, state changes, CSS classes
- Summary metadata: total files changed, insertions, deletions

### 2. UX Mapper

Bridge module that infers user-visible impact from code changes.

**Maps:**
- Changed page/route files → affected URLs
- Changed components → where they're used (via import tracing)
- Style changes → visual impact description
- Next.js app router conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, etc.

**Output (UXMap):**
- Affected routes with descriptions of expected visual changes
- Changed components with their usage locations
- Inferred user-visible behavior changes (new form field, changed validation, layout shift, etc.)

### 3. Explorer Agent (Reconnaissance Phase)

Agentic tool-use loop via Vercel AI SDK `generateText()` with tools. The agent explores the running app to build a mental model of what to demonstrate.

**Tools available to the agent:**

| Tool | Purpose |
|------|---------|
| `navigate(url)` | Go to a URL, return page title + URL after load |
| `inspectDOM(selector?)` | Simplified DOM tree (interactive elements, text, structure). Optional selector scopes to subtree |
| `getInteractiveElements()` | All clickable/typeable elements with selectors, labels, types |
| `screenshot(fullPage?)` | Screenshot as base64 for AI analysis |
| `tryInteraction(action, selector)` | Perform click/type/hover, report what changed (new elements, navigation, modals, errors) |
| `reportFinding(finding)` | Record a discovery for the recon report |

**Agent receives:**
- DiffAnalysis
- UXMap
- Instructions to explore like a QA engineer: visit affected pages, find changed elements, interact, document what to demonstrate

**Token management:**
- Max iteration cap: configurable, default 20 tool calls
- DOM inspection returns simplified/truncated trees, not raw HTML
- Screenshots resized before sending

**Output (ReconReport):**
- Pages visited with screenshots
- Interactive elements discovered with verified selectors
- Observed behaviors (what happens on interactions)
- Recommended demonstration flow (ordered list)

### 4. Script Generator

Single `generateObject()` call — no agentic loop.

**Inputs:**
- ReconReport
- DiffAnalysis (for context)
- PR metadata if available
- Config (viewport, timing, base URL)

**Prompt instructs the AI to:**
- Think like a product demo presenter — show the change, not the code
- Order steps logically
- Include annotations explaining what viewers should notice
- Use selectors the explorer already verified
- Add section dividers between distinct features
- Keep it concise

**Output validation:** Zod schema validation. One retry with error appended on failure. Second failure dumps raw output for debugging.

### 5. Script Reviewer (Terminal Flow)

Interactive terminal review after script generation:

1. Pretty-print each step with number, action type, description, and annotations (colored)
2. Prompt: `[P]roceed / [E]dit / [R]egenerate / [S]ave & quit`
3. **Edit flow (natural language):**
   - User selects step number or "all" for global changes
   - User describes desired change in plain English
   - LLM call receives current script + user instruction, returns modified script via `generateObject()`
   - Updated script pretty-printed with changes highlighted
   - Back to the main prompt
4. **Regenerate:** Re-runs the script generator with the same ReconReport
5. **Save & quit:** Saves script to file, exits without recording

### 6. Walkthrough Script Format

```typescript
interface WalkthroughScript {
  metadata: {
    pr?: { number: number; repo: string; title: string };
    generatedAt: string;
    baseUrl: string;
    viewport: { width: number; height: number };
  };
  steps: WalkthroughStep[];
}

type WalkthroughStep =
  | { action: "navigate"; url: string; waitFor?: string; annotation?: string }
  | { action: "click"; selector: string; description: string; annotation?: string }
  | { action: "type"; selector: string; text: string; clearFirst?: boolean; annotation?: string }
  | { action: "scroll"; target: string | { x: number; y: number }; annotation?: string }
  | { action: "hover"; selector: string; description: string; annotation?: string }
  | { action: "wait"; duration: number; reason: string; annotation?: string }
  | { action: "screenshot"; name: string; annotation?: string }
  | { action: "viewport"; width: number; height: number; annotation?: string }
  | { action: "section"; title: string; description: string };
```

### 7. Recorder

Dumb execution engine. Takes WalkthroughScript, replays with human-like timing.

**Browser setup:**
- Launch Chromium via Playwright with `recordVideo` enabled
- Set viewport from script metadata
- Execute auth steps first (if configured) using the same action engine
- Video records clean — no overlays

**Action engine (`actions.ts`) — each action wraps Playwright with human timing:**

| Action | Behavior |
|--------|----------|
| `click` | Bezier cursor move → random offset from center → pause 200-500ms → click |
| `type` | Click field first → character-by-character, 50-120ms per keystroke (randomized). `clearFirst`: select all + delete |
| `scroll` | `window.scrollBy` with easing, small increments |
| `hover` | Bezier cursor move → hold for a beat |
| `navigate` | `page.goto()` → wait for `networkidle` or custom `waitFor` selector |
| `wait` | Literal pause |
| `screenshot` | `page.screenshot()` to disk (debug reference, not in video) |
| `viewport` | `page.setViewportSize()` |
| `section` | No browser action. Stores timestamp marker for ffmpeg |

**Cursor abstraction (`CursorController` interface):**
- Default implementation: ghost-cursor-playwright
- Interface allows swapping to custom implementation
- All mouse movement goes through this abstraction

**Timestamp sidecar:** The recorder logs `{ stepIndex, action, annotation, timestampMs }` for each executed step. Passed to the video processor.

**Error handling:**
- Selector not found (5s timeout): warn, skip step, continue
- Navigation timeout: retry once with longer timeout, then skip
- Browser crash: exit with error, preserve partial video

### 8. Video Processor

All visual polish via ffmpeg (fluent-ffmpeg). Takes raw video + timestamp sidecar.

**Pipeline:**

1. **Format conversion** — WebM → MP4 (H.264)
2. **Annotation burn-in** — `drawtext` filter with `enable='between(t,start,end)'` for each annotated step. Semi-transparent bar at bottom, white text.
3. **Section titles** — full-frame title card (dark background, centered text, ~1.5s) or fade-in/out heading
4. **Intro frame** — PR title, repo name, date. ~2s hold.
5. **Outro frame** — "Generated by pr-ghost". Optional.

**Fallback:** If ffmpeg not installed, output raw WebM with warning and install instructions. Tool remains usable without ffmpeg.

### 9. CLI Commands

| Command | Purpose |
|---------|---------|
| `prg run` | Full pipeline: diff → explore → review → record → process |
| `prg explore` | Exploration + script generation only. Outputs WalkthroughScript |
| `prg record` | Record + process from existing script file |
| `prg init` | Interactive config file generator |

**`prg run` / `prg explore` flags:**
- `--pr <number>` — GitHub PR number (requires `--repo` or inferred from git remote)
- `--repo <owner/repo>` — GitHub repo
- `--diff <ref>` — local git ref to diff against (e.g., `HEAD~1`, `main`)
- `--base-url <url>` — app URL (overrides config)
- `--output <path>` — output path (default: `./walkthrough.mp4` for run, `./walkthrough.json` for explore)
- `--no-review` — skip interactive review (CI mode)
- `--script-only` — stop after script generation

**`prg record` flags:**
- `--script <path>` — path to walkthrough script JSON
- `--base-url <url>` — app URL

**`prg init`:** Interactive prompts for framework, dev server command, base URL, AI provider, auth. Writes `prg.config.ts`.

### 10. Config

**Loading priority:** CLI flags > env vars > `prg.config.ts` / `.prghostrc.json` > defaults

**Config schema:**

```typescript
interface PrGhostConfig {
  devServer?: {
    command: string;
    port: number;
    readyPattern: string;
    startTimeout: number;  // ms, default 30000
  };
  baseUrl: string;  // default "http://localhost:3000"
  video: {
    viewport: { width: number; height: number };  // default 1280x720
    format: "mp4";
    fps: number;  // default 30
  };
  timing: {
    typingDelay: { min: number; max: number };  // default 50-120ms
    clickPause: { min: number; max: number };    // default 200-500ms
    scrollSpeed: "smooth" | "fast";              // default "smooth"
    sectionPause: number;                        // default 1000ms
  };
  ai: {
    provider: "openai" | "anthropic" | "google";  // default "openai"
    model: string;                                 // default "gpt-4o"
    maxExplorationSteps: number;                   // default 20
  };
  selectors: {
    priority: string[];  // default ["data-testid", "aria-label", "role", "css", "text"]
  };
  ignore: string[];  // route patterns to skip, default ["/api/*", "/_next/*"]
  auth?: {
    steps: WalkthroughStep[];  // executed before walkthrough via same action engine
  };
}
```

**Dev server management:** `prg run` checks if `devServer.port` is in use. If not, spawns the server, waits for `readyPattern` on stdout (up to `startTimeout`), and kills on exit.

## Error Handling Strategy

**General principle:** Degrade gracefully. Partial result > no result. Always preserve intermediate artifacts.

| Failure | Behavior |
|---------|----------|
| App unreachable | Fail fast before exploration with clear error |
| Explorer hits max iterations | Produce ReconReport with findings so far |
| No UX-visible changes found | Report to user, suggest skipping video |
| Script Zod validation fails | One retry with error appended. Second failure dumps raw output |
| Selector not found during recording | Warn, skip step, continue. Summary at end |
| Navigation timeout during recording | Retry once, then skip |
| Browser crash | Exit with error, preserve partial video |
| ffmpeg not installed | Output raw WebM with warning |
| ffmpeg processing error | Preserve raw video, report error |
| GitHub rate limiting | Respect Retry-After, retry once |
| GitHub auth failure | Clear error pointing to GITHUB_TOKEN |

## Scope Boundaries

**In scope (Phase 1):**
- Full CLI with all four commands
- Diff analysis from local git and GitHub PRs
- UX mapper for Next.js app router + generic component tracing
- Full AI agent exploration with browser tools
- Script generation with Zod validation
- Natural language script editing
- Human-like recording with cursor abstraction
- ffmpeg video post-processing with annotations
- Config-based auth
- Dev server auto-start

**Out of scope:**
- Web UI
- GitHub PR comment posting
- GitHub Action / CI integration
- Multiple viewport recording
- Script validator (dry-run)
- Retry with alternative selectors during recording
