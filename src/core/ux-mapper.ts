// src/core/ux-mapper.ts
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { uxMapSchema } from "../ai/parsers.js";
import { buildDiffAnalysisPrompt } from "../ai/prompts/diff-analysis.js";
import type { DiffAnalysis, UXMap } from "../types/index.js";

export async function generateUXMap(
  diff: DiffAnalysis,
  model: LanguageModel,
): Promise<UXMap> {
  const prompt = buildDiffAnalysisPrompt(diff);
  const { object } = await generateObject({
    model,
    schema: uxMapSchema,
    prompt,
  });
  return object;
}
