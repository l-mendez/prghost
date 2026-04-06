// src/ai/prompts/walkthrough-plan.ts
import type { DiffAnalysis, ReconReport, UXMap } from "../../types/index.js";

export function buildWalkthroughPlanPrompt(
  recon: ReconReport,
  diff: DiffAnalysis,
  uxMap: UXMap,
  baseUrl: string,
  viewport: { width: number; height: number },
  prMeta?: { number: number; repo: string; title: string },
): string {
  const pages = recon.pagesVisited
    .map((p) => `- ${p.url} ("${p.title}")`)
    .join("\n") || "(none explored)";

  const elements = recon.interactiveElements
    .map((e) => `- [${e.type}] "${e.label}" → ${e.selector} (on ${e.page})`)
    .join("\n") || "(none found)";

  const behaviors = recon.observedBehaviors
    .map((b) => `- ${b.trigger} → ${b.result} (on ${b.page})`)
    .join("\n") || "(none observed)";

  const findings = recon.findings
    .map((f) => `- ${f.description} (on ${f.page}, selectors: ${f.relevantSelectors.join(", ")})`)
    .join("\n") || "(none found)";

  const flow = recon.recommendedFlow.map((s, i) => `${i + 1}. ${s}`).join("\n") || "(none)";

  const affectedRoutes = uxMap.affectedRoutes
    .map((r) => `- ${r.path}: ${r.description}`)
    .join("\n") || "(unknown)";

  const behaviorChanges = uxMap.behaviorChanges.map((b, i) => `${i + 1}. ${b}`).join("\n") || "(none)";

  const prContext = prMeta
    ? `\n## PR Context\n- PR #${prMeta.number} in ${prMeta.repo}: "${prMeta.title}"\n`
    : "";

  // Step budget: proportional to change size, capped to keep videos short
  const totalChanges = diff.summary.totalAdditions + diff.summary.totalDeletions;
  const changeScale = totalChanges < 50 ? "tiny" : totalChanges < 200 ? "small" : totalChanges < 500 ? "medium" : "large";
  const maxSteps = changeScale === "tiny" ? 10 : changeScale === "small" ? 15 : changeScale === "medium" ? 25 : 40;
  const targetSeconds = maxSteps * 4;

  return `You are a product demo expert creating a walkthrough script for a video that demonstrates recent code changes in a web application.
${prContext}
## What Changed (UX Impact)

### Affected Routes — navigate to these directly
${affectedRoutes}

### Behavior Changes to Demo
${behaviorChanges}

## Reconnaissance Findings

### Pages Explored
${pages}

### Interactive Elements Found (verified selectors — prefer these)
${elements}

### Observed Behaviors
${behaviors}

### Key Findings
${findings}

### Recommended Flow
${flow}

## Your Task

Generate a walkthrough script that demonstrates ONLY the behavior changes listed above. Navigate directly to the affected routes using their paths. Do not click through discovery flows.

## Constraints — strictly follow these

- **Max steps: ${maxSteps}** (change size: ${changeScale}, ~${totalChanges} lines changed)
- **Target duration: ~${targetSeconds} seconds** — keep waits minimal, no redundant screenshots
- **Navigate directly** to affected routes. Do not click through the app to discover pages.
- **Prefer verified selectors** from reconnaissance findings. If none exist for an element, use stable attributes: data-testid, aria-label, role, id — in that order.
- **No login steps** — authentication is handled before recording starts.
- **Show only the change** — do not demo unrelated features.

## Rules

1. **Think like a product demo** — show the change, not the code. Imagine you're presenting to a stakeholder.
2. **Order logically** — navigate to a page before interacting with it.
3. **Add annotations** — for key moments, add an annotation string explaining what the viewer should notice. Keep them short (under 80 chars).
4. **Use section dividers** — at most 2-3 sections for distinct parts of the change.
5. **Base URL**: ${baseUrl} — all navigate URLs should be relative paths from this base.
6. **Viewport**: ${viewport.width}x${viewport.height}

## Available Actions

- navigate: Go to a URL. Use relative paths (e.g., "/dashboard", "/settings").
- click: Click an element. Requires a CSS selector and description.
- type: Type text into an input. Requires selector and text. Use clearFirst to clear existing text.
- scroll: Scroll to an element (CSS selector) or coordinates ({x, y}).
- hover: Hover over an element. Requires selector and description.
- wait: Pause for a duration (ms). Use sparingly — only for animations. Max 1000ms per wait.
- screenshot: Take a reference screenshot (not shown in video, for debugging).
- viewport: Change viewport size (for responsive demos).
- section: Visual divider with title and description. No browser action.`;
}
