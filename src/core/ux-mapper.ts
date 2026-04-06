// src/core/ux-mapper.ts
import { uxMapSchema } from "../ai/parsers.js";
import { buildDiffAnalysisPrompt } from "../ai/prompts/diff-analysis.js";
import type { AIClient } from "../ai/client.js";
import type { DiffAnalysis, FileChange, UXMap } from "../types/index.js";

const MAX_CHUNK_CHARS = 15_000;
const SKIP_CATEGORIES = new Set(["test", "config"]);

function reconstructFileDiff(file: FileChange): string {
  return file.hunks.map((h) => `${h.header}\n${h.changes}`).join("\n");
}

function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

async function analyzeFilesInParallel(
  files: FileChange[],
  summarize: NonNullable<AIClient["summarizeFileDiff"]>,
): Promise<Array<{ label: string; summary: string }>> {
  const tasks: Array<{ label: string; filePath: string; category: string; status: string; diff: string }> = [];

  for (const file of files) {
    if (SKIP_CATEGORIES.has(file.category)) continue;
    const fileDiff = reconstructFileDiff(file);
    if (!fileDiff.trim()) continue;

    if (fileDiff.length <= MAX_CHUNK_CHARS) {
      tasks.push({ label: file.path, filePath: file.path, category: file.category, status: file.status, diff: fileDiff });
    } else {
      const chunks = chunkString(fileDiff, MAX_CHUNK_CHARS);
      chunks.forEach((chunk, i) => {
        tasks.push({
          label: `${file.path} [chunk ${i + 1}/${chunks.length}]`,
          filePath: file.path,
          category: file.category,
          status: file.status,
          diff: chunk,
        });
      });
    }
  }

  const results = await Promise.all(
    tasks.map(async (task) => {
      const summary = await summarize(task.filePath, task.category, task.status, task.diff);
      return { label: task.label, summary };
    }),
  );

  return results;
}

function buildOrchestratorPrompt(
  fileSummaries: Array<{ label: string; summary: string }>,
  totalSummary: DiffAnalysis["summary"],
): string {
  const summaryList = fileSummaries
    .map((s) => `### ${s.label}\n${s.summary}`)
    .join("\n\n");

  return `You are synthesizing per-file change summaries into a unified UX impact map.

## Overall Stats
- Total files changed: ${totalSummary.totalFiles}
- Additions: ${totalSummary.totalAdditions}, Deletions: ${totalSummary.totalDeletions}

## Per-File Summaries
${summaryList}

## Your Task

Based on the summaries above, produce a UX map identifying:

1. **Affected routes**: Which pages/URLs are impacted? Group related file changes per route.
2. **Changed components**: Which UI components changed and what is different visually?
3. **Behavior changes**: What is different from a user's perspective?

Focus only on user-visible changes. Ignore files marked as "no user-visible impact".`;
}

export async function generateUXMap(diff: DiffAnalysis, client: AIClient): Promise<UXMap> {
  if (client.summarizeFileDiff) {
    const fileSummaries = await analyzeFilesInParallel(diff.files, client.summarizeFileDiff.bind(client));

    if (fileSummaries.length === 0) {
      return { affectedRoutes: [], changedComponents: [], behaviorChanges: [] };
    }

    const prompt = buildOrchestratorPrompt(fileSummaries, diff.summary);
    return client.generateObject({ prompt, schema: uxMapSchema });
  }

  // Fallback for non-claude-code providers: single-query approach
  const prompt = buildDiffAnalysisPrompt(diff);
  return client.generateObject({ prompt, schema: uxMapSchema });
}
