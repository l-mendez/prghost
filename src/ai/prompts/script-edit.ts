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
