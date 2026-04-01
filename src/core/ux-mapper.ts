// src/core/ux-mapper.ts
import { uxMapSchema } from "../ai/parsers.js";
import { buildDiffAnalysisPrompt } from "../ai/prompts/diff-analysis.js";
import type { AIClient } from "../ai/client.js";
import type { DiffAnalysis, UXMap } from "../types/index.js";

export async function generateUXMap(
  diff: DiffAnalysis,
  client: AIClient,
): Promise<UXMap> {
  const prompt = buildDiffAnalysisPrompt(diff);
  return client.generateObject({ prompt, schema: uxMapSchema });
}
