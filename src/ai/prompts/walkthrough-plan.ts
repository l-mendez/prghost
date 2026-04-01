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
