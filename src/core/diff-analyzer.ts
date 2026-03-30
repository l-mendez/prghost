// src/core/diff-analyzer.ts
import type { DiffAnalysis, FileCategory, FileChange, DiffHunk } from "../types/index.js";

export function categorizeFile(filePath: string): FileCategory {
  const lower = filePath.toLowerCase();

  // Tests
  if (/\.(test|spec)\.[jt]sx?$/.test(lower) || lower.includes("__tests__")) {
    return "test";
  }

  // API routes
  if (/\/api\//.test(lower) && /route\.[jt]sx?$/.test(lower)) return "api-route";
  if (/\/pages\/api\//.test(lower)) return "api-route";

  // Pages/routes (Next.js app router + pages router)
  if (/\/(page|layout|loading|error|not-found|template)\.[jt]sx?$/.test(lower)) return "page";
  if (/\/pages\/(?!api\/)/.test(lower) && /\.[jt]sx?$/.test(lower)) return "page";

  // Styles
  if (/\.(css|scss|sass|less)$/.test(lower)) return "style";
  if (/tailwind\.config/.test(lower)) return "style";

  // Config
  if (/\.(config|rc)\.[jt]sx?$/.test(lower)) return "config";
  if (/^\./.test(filePath.split("/").pop() ?? "")) return "config";
  if (/tsconfig|package\.json|\.eslintrc|\.prettierrc/.test(lower)) return "config";

  // Components
  if (/\/components\//.test(lower)) return "component";

  // Utils
  if (/\/(lib|utils|helpers|hooks)\//.test(lower)) return "util";

  return "other";
}

export function parseDiff(rawDiff: string): Omit<DiffAnalysis, "source"> & { rawDiff: string } {
  const files: FileChange[] = [];
  const diffSections = rawDiff.split(/(?=diff --git)/);

  for (const section of diffSections) {
    if (!section.trim()) continue;

    const headerMatch = section.match(/diff --git a\/(.+?) b\/(.+?)$/m);
    if (!headerMatch) continue;

    const filePath = headerMatch[2];

    let status: FileChange["status"] = "modified";
    if (section.includes("new file mode")) status = "added";
    else if (section.includes("deleted file mode")) status = "deleted";
    else if (section.includes("rename from")) status = "renamed";

    const hunks: DiffHunk[] = [];
    const hunkStart = section.indexOf("@@");
    if (hunkStart !== -1) {
      const hunkContent = section.slice(hunkStart);
      // Split on hunk headers
      const hunkParts = hunkContent.split(/(?=^@@)/m);
      for (const part of hunkParts) {
        if (!part.trim()) continue;
        const lines = part.split("\n");
        const header = lines[0].trim();
        const changes = lines.slice(1).join("\n").trim();
        if (header.startsWith("@@")) {
          hunks.push({ header, changes });
        }
      }
    }

    let additions = 0;
    let deletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.changes.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
    }

    files.push({
      path: filePath,
      category: categorizeFile(filePath),
      status,
      additions,
      deletions,
      hunks,
    });
  }

  const categories: Record<FileCategory, number> = {
    component: 0, page: 0, style: 0, util: 0,
    "api-route": 0, test: 0, config: 0, other: 0,
  };
  for (const file of files) {
    categories[file.category]++;
  }

  return {
    files,
    summary: {
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      categories,
    },
    rawDiff,
  };
}

export async function analyzeDiffFromGit(ref: string, cwd?: string): Promise<DiffAnalysis> {
  const { simpleGit } = await import("simple-git");
  const git = simpleGit(cwd);
  const rawDiff = await git.diff([ref]);
  const parsed = parseDiff(rawDiff);
  return {
    ...parsed,
    source: { type: "local", ref },
  };
}
