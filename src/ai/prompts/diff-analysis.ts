// src/ai/prompts/diff-analysis.ts
import type { DiffAnalysis } from "../../types/index.js";

export function buildDiffAnalysisPrompt(diff: DiffAnalysis): string {
  const fileList = diff.files
    .map((f) => `- ${f.path} (${f.category}, ${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  return `You are an expert frontend developer analyzing code changes to determine their user-visible impact.

## Changed Files
${fileList}

## Summary
- Total files: ${diff.summary.totalFiles}
- Additions: ${diff.summary.totalAdditions}, Deletions: ${diff.summary.totalDeletions}

## Raw Diff
\`\`\`diff
${diff.rawDiff}
\`\`\`

## Your Task

Analyze these changes and produce a UX map. For each change, determine:

1. **Affected routes**: Which pages/URLs are impacted? Consider:
   - Direct page file changes (page.tsx, layout.tsx, etc.)
   - Component changes — trace where the component is used
   - Style changes — which pages use the affected styles
   - Next.js app router conventions: page.tsx = route page, layout.tsx = shared layout, loading.tsx = loading state

2. **Changed components**: What UI components were modified and what changed visually?

3. **Behavior changes**: What's different from a user's perspective? New form fields, changed validation, different layout, new buttons, style changes, new pages, removed features.

Focus only on user-visible changes. Ignore test files, config changes, and pure refactors with no visual impact.`;
}
