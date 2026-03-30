// src/core/github.ts
import { Octokit } from "@octokit/rest";
import { parseDiff } from "./diff-analyzer.js";
import type { DiffAnalysis } from "../types/index.js";

export function parseRepoString(repoStr: string): { owner: string; repo: string } {
  const parts = repoStr.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repoStr}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export function buildPRDiffUrl(owner: string, repo: string, prNumber: number): string {
  return `/repos/${owner}/${repo}/pulls/${prNumber}`;
}

export async function fetchPRDiff(
  repoStr: string,
  prNumber: number,
): Promise<DiffAnalysis> {
  const { owner, repo } = parseRepoString(repoStr);
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required for fetching PR diffs. " +
      "Set it in your .env file or export it in your shell.",
    );
  }

  const octokit = new Octokit({ auth: token });

  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });

  // When requesting diff format, data is a string
  const rawDiff = pr as unknown as string;
  const parsed = parseDiff(rawDiff);

  return {
    ...parsed,
    source: { type: "github", pr: prNumber, repo: repoStr },
  };
}

export async function fetchPRMetadata(
  repoStr: string,
  prNumber: number,
): Promise<{ number: number; repo: string; title: string }> {
  const { owner, repo } = parseRepoString(repoStr);
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required.");
  }

  const octokit = new Octokit({ auth: token });
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: prNumber,
    repo: repoStr,
    title: pr.title,
  };
}
