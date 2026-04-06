// src/cli/commands/run-handler.ts
import chalk from "chalk";
import ora from "ora";
import { writeFile } from "fs/promises";
import { loadConfig, configExists } from "../../config/schema.js";
import { createAIClient } from "../../ai/provider.js";
import { analyzeDiffFromGit } from "../../core/diff-analyzer.js";
import { fetchPRDiff, fetchPRMetadata } from "../../core/github.js";
import { generateUXMap } from "../../core/ux-mapper.js";
import { runExplorationAgent } from "../../core/explorer.js";
import { generateWalkthroughScript } from "../../core/script-generator.js";
import { reviewScript } from "../../core/script-reviewer.js";
import { recordWalkthrough } from "../../core/recorder.js";
import { processVideo } from "../../core/video-processor.js";
import { startDevServer, stopDevServer, isPortInUse } from "../../core/dev-server.js";
import { ActionExecutor } from "../../browser/actions.js";
import { GhostCursorController } from "../../browser/cursor.js";
import { TimingProfile } from "../../browser/timing.js";
import { chromium } from "playwright";
import type { Page } from "playwright";
import type { ChildProcess } from "child_process";
import type { DiffAnalysis } from "../../types/index.js";

interface RunOptions {
  pr?: string;
  repo?: string;
  diff?: string;
  baseUrl?: string;
  output?: string;
  review?: boolean;
  scriptOnly?: boolean;
}

async function runAuthSteps(page: Page, config: import("../../types/index.js").PrGhostConfig, baseUrl: string): Promise<void> {
  if (!config.auth?.steps?.length) return;
  const cursor = new GhostCursorController();
  await cursor.init(page);
  const executor = new ActionExecutor(page, cursor, new TimingProfile(config.timing), config.selectors.priority);
  for (const step of config.auth.steps) {
    await executor.execute(step, baseUrl);
  }
}

export async function runFullPipeline(options: RunOptions): Promise<void> {
  if (!configExists(process.cwd())) {
    console.log(chalk.yellow("No config file found. Using defaults. Run `prg init` to customize.\n"));
  }

  const config = await loadConfig(process.cwd(), {
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });

  const baseUrl = options.baseUrl ?? config.baseUrl;
  const outputPath = options.output ?? "./walkthrough.mp4";
  const doReview = options.review !== false;

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
      console.log(chalk.yellow("No file changes found. Nothing to walk through."));
      return;
    }

    // Generate UX map
    spinner = ora("Mapping code changes to UX impact...").start();
    const uxMap = await generateUXMap(diff, client);
    spinner.succeed(`Found ${uxMap.affectedRoutes.length} affected routes, ${uxMap.behaviorChanges.length} behavior changes`);

    if (uxMap.affectedRoutes.length === 0 && uxMap.behaviorChanges.length === 0) {
      console.log(chalk.yellow("No user-visible changes detected. Consider skipping video generation."));
    }

    // AI exploration
    spinner = ora("Exploring the application...").start();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: config.video.viewport });
    const explorerPage = await context.newPage();

    await runAuthSteps(explorerPage, config, baseUrl);
    const recon = await runExplorationAgent(client, explorerPage, diff, uxMap, config.ai.maxExplorationSteps);

    await context.close();
    await browser.close();
    spinner.succeed(`Explored ${recon.pagesVisited.length} pages, found ${recon.findings.length} findings`);

    // Generate walkthrough script
    spinner = ora("Generating walkthrough script...").start();
    let script = await generateWalkthroughScript(client, recon, diff, {
      baseUrl, viewport: config.video.viewport, prMeta, uxMap,
    });
    spinner.succeed(`Generated script with ${script.steps.length} steps`);

    // Review (if interactive)
    if (doReview && !options.scriptOnly) {
      const result = await reviewScript(client, script);
      switch (result.action) {
        case "proceed":
          script = result.script;
          break;
        case "regenerate":
          spinner = ora("Regenerating walkthrough script...").start();
          script = await generateWalkthroughScript(client, recon, diff, {
            baseUrl, viewport: config.video.viewport, prMeta, uxMap,
          });
          spinner.succeed(`Regenerated script with ${script.steps.length} steps`);
          break;
        case "quit": {
          const savePath = outputPath.replace(/\.\w+$/, ".json");
          await writeFile(savePath, JSON.stringify(result.script, null, 2));
          console.log(chalk.green(`Script saved to ${savePath}`));
          return;
        }
      }
    }

    // Save script if --script-only
    if (options.scriptOnly) {
      const scriptPath = outputPath.replace(/\.\w+$/, ".json");
      await writeFile(scriptPath, JSON.stringify(script, null, 2));
      console.log(chalk.green(`Script saved to ${scriptPath}`));
      return;
    }

    // Record
    spinner = ora("Recording walkthrough video...").start();
    const recording = await recordWalkthrough(script, config);
    spinner.succeed(`Recorded ${(recording.duration / 1000).toFixed(1)}s video`);

    if (recording.skippedSteps.length > 0) {
      console.log(chalk.yellow(`Warning: ${recording.skippedSteps.length} steps were skipped due to errors.`));
    }

    // Post-process
    spinner = ora("Processing video...").start();
    const finalPath = await processVideo(recording, outputPath, {
      introText: prMeta ? `PR #${prMeta.number}: ${prMeta.title}` : undefined,
    });
    spinner.succeed(`Video saved to ${chalk.bold(finalPath)}`);

  } finally {
    if (devServerProcess) {
      stopDevServer(devServerProcess);
    }
  }
}
