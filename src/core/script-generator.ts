// src/core/script-generator.ts
import { walkthroughScriptSchema } from "../ai/parsers.js";
import { buildWalkthroughPlanPrompt } from "../ai/prompts/walkthrough-plan.js";
import type { AIClient } from "../ai/client.js";
import type { DiffAnalysis, ReconReport, WalkthroughScript } from "../types/index.js";

interface ScriptGeneratorOptions {
  baseUrl: string;
  viewport: { width: number; height: number };
  prMeta?: { number: number; repo: string; title: string };
}

export async function generateWalkthroughScript(
  client: AIClient,
  recon: ReconReport,
  diff: DiffAnalysis,
  options: ScriptGeneratorOptions,
): Promise<WalkthroughScript> {
  const prompt = buildWalkthroughPlanPrompt(
    recon, diff, options.baseUrl, options.viewport, options.prMeta,
  );

  try {
    return await client.generateObject({ prompt, schema: walkthroughScriptSchema });
  } catch (firstError) {
    const errorMessage = firstError instanceof Error ? firstError.message : String(firstError);
    try {
      return await client.generateObject({
        prompt: `${prompt}\n\n## Previous Attempt Failed\n\nError:\n${errorMessage}\n\nPlease fix and try again.`,
        schema: walkthroughScriptSchema,
      });
    } catch (secondError) {
      throw new Error(
        `Script generation failed after 2 attempts. Last error: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
      );
    }
  }
}
