import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFile } from "fs/promises";
import { loadConfig } from "../../config/schema.js";
import { createAIClient } from "../../ai/provider.js";
import { analyzeDiffFromGit } from "../../core/diff-analyzer.js";
import { fetchPRDiff, fetchPRMetadata } from "../../core/github.js";
import { generateUXMap } from "../../core/ux-mapper.js";
import { runExplorationAgent } from "../../core/explorer.js";
import { generateWalkthroughScript } from "../../core/script-generator.js";
import { startDevServer, stopDevServer, isPortInUse } from "../../core/dev-server.js";
import { chromium } from "playwright";
import type { ChildProcess } from "child_process";
import type { DiffAnalysis } from "../../types/index.js";

export const exploreCommand = new Command("explore")
  .description("Analyze diff and generate a walkthrough script")
  .option("--pr <number>", "GitHub PR number")
  .option("--repo <owner/repo>", "GitHub repository")
  .option("--diff <ref>", "Local git ref to diff against (e.g., HEAD~1, main)")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output path for walkthrough script", "./walkthrough.json")
  .action(async (options) => {
    const config = await loadConfig(process.cwd(), {
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });

    const baseUrl = options.baseUrl ?? config.baseUrl;
    const outputPath = options.output ?? "./walkthrough.json";

    const client = await createAIClient(config);
    let devServerProcess: ChildProcess | undefined;

    try {
      // Start dev server if needed
      if (config.devServer) {
        const portBusy = await isPortInUse(config.devServer.port);
        if (!portBusy) {
          const spinner = ora("Starting dev server...").start();
          devServerProcess = await startDevServer(config.devServer);
          spinner.succeed("Dev server started");
        }
      }

      // Get diff
      let spinner = ora("Analyzing diff...").start();
      let diff: DiffAnalysis;
      let prMeta: { number: number; repo: string; title: string } | undefined;

      if (options.pr && options.repo) {
        const prNum = parseInt(options.pr, 10);
        diff = await fetchPRDiff(options.repo, prNum);
        prMeta = await fetchPRMetadata(options.repo, prNum);
      } else if (options.pr) {
        throw new Error("--repo is required when using --pr");
      } else {
        const ref = options.diff ?? "HEAD~1";
        diff = await analyzeDiffFromGit(ref);
      }
      spinner.succeed(`Analyzed ${diff.summary.totalFiles} changed files`);

      if (diff.files.length === 0) {
        console.log(chalk.yellow("No file changes found. Nothing to explore."));
        return;
      }

      // Generate UX map
      spinner = ora("Mapping code changes to UX impact...").start();
      const uxMap = await generateUXMap(diff, client);
      spinner.succeed(`Found ${uxMap.affectedRoutes.length} affected routes, ${uxMap.behaviorChanges.length} behavior changes`);

      // AI exploration
      spinner = ora("Exploring the application...").start();
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: config.video.viewport });
      const explorerPage = await context.newPage();

      const recon = await runExplorationAgent(client, explorerPage, diff, uxMap, config.ai.maxExplorationSteps);

      await context.close();
      await browser.close();
      spinner.succeed(`Explored ${recon.pagesVisited.length} pages, found ${recon.findings.length} findings`);

      // Generate walkthrough script
      spinner = ora("Generating walkthrough script...").start();
      const script = await generateWalkthroughScript(client, recon, diff, {
        baseUrl, viewport: config.video.viewport, prMeta,
      });
      spinner.succeed(`Generated script with ${script.steps.length} steps`);

      // Save script
      await writeFile(outputPath, JSON.stringify(script, null, 2));
      console.log(chalk.green(`Script saved to ${outputPath}`));

    } finally {
      if (devServerProcess) {
        stopDevServer(devServerProcess);
      }
    }
  });
