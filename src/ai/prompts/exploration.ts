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
