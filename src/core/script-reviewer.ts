import { createInterface } from "readline";
import chalk from "chalk";
import { walkthroughScriptSchema } from "../ai/parsers.js";
import { buildScriptEditPrompt } from "../ai/prompts/script-edit.js";
import type { AIClient } from "../ai/client.js";
import type { WalkthroughScript } from "../types/index.js";

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
  client: AIClient,
  script: WalkthroughScript,
  stepNumber: number | "all",
  instruction: string,
): Promise<WalkthroughScript> {
  const prompt = buildScriptEditPrompt(script, stepNumber, instruction);
  return client.generateObject({ prompt, schema: walkthroughScriptSchema });
}

function askQuestion(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => { rl.question(question, resolve); });
}

export type ReviewResult =
  | { action: "proceed"; script: WalkthroughScript }
  | { action: "regenerate" }
  | { action: "quit"; script: WalkthroughScript };

export async function reviewScript(
  client: AIClient,
  script: WalkthroughScript,
): Promise<ReviewResult> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let currentScript = script;

  try {
    while (true) {
      console.log(formatScriptForDisplay(currentScript));
      console.log(chalk.bold("[P]roceed  [E]dit  [R]egenerate  [S]ave & quit\n"));
      const choice = (await askQuestion(rl, "Choice: ")).trim().toLowerCase();

      switch (choice) {
        case "p": case "proceed":
          return { action: "proceed", script: currentScript };
        case "e": case "edit": {
          const stepInput = await askQuestion(rl, 'Step number to edit (or "all" for global change): ');
          const stepNum = stepInput.trim().toLowerCase() === "all"
            ? ("all" as const)
            : parseInt(stepInput, 10);
          if (stepNum !== "all" && (isNaN(stepNum) || stepNum < 1 || stepNum > currentScript.steps.length)) {
            console.log(chalk.red(`Invalid step number. Must be 1-${currentScript.steps.length} or "all".`));
            continue;
          }
          const instruction = await askQuestion(rl, "Describe the change: ");
          if (!instruction.trim()) continue;
          console.log(chalk.dim("Applying edit..."));
          currentScript = await applyNaturalLanguageEdit(client, currentScript, stepNum, instruction.trim());
          break;
        }
        case "r": case "regenerate":
          return { action: "regenerate" };
        case "s": case "save":
          return { action: "quit", script: currentScript };
        default:
          console.log(chalk.red('Invalid choice. Enter P, E, R, or S.'));
      }
    }
  } finally {
    rl.close();
  }
}
