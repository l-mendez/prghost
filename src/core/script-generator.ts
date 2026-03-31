// src/core/script-generator.ts
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { walkthroughScriptSchema } from "../ai/parsers.js";
import { buildWalkthroughPlanPrompt } from "../ai/prompts/walkthrough-plan.js";
import type { DiffAnalysis, ReconReport, WalkthroughScript } from "../types/index.js";

interface ScriptGeneratorOptions {
  baseUrl: string;
  viewport: { width: number; height: number };
  prMeta?: { number: number; repo: string; title: string };
}

export async function generateWalkthroughScript(
  model: LanguageModel,
  recon: ReconReport,
  diff: DiffAnalysis,
  options: ScriptGeneratorOptions,
): Promise<WalkthroughScript> {
  const prompt = buildWalkthroughPlanPrompt(
    recon, diff, options.baseUrl, options.viewport, options.prMeta,
  );

  try {
    const { object } = await generateObject({ model, schema: walkthroughScriptSchema, prompt });
    return object;
  } catch (firstError) {
    const errorMessage = firstError instanceof Error ? firstError.message : String(firstError);
    try {
      const { object } = await generateObject({
        model, schema: walkthroughScriptSchema,
        prompt: `${prompt}\n\n## Previous Attempt Failed\n\nError:\n${errorMessage}\n\nPlease fix and try again.`,
      });
      return object;
    } catch (secondError) {
      throw new Error(
        `Script generation failed after 2 attempts. Last error: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
      );
    }
  }
}
