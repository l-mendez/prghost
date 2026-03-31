import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile } from "fs/promises";
import { loadConfig } from "../../config/schema.js";
import { recordWalkthrough } from "../../core/recorder.js";
import { processVideo } from "../../core/video-processor.js";
import { startDevServer, stopDevServer, isPortInUse } from "../../core/dev-server.js";
import type { ChildProcess } from "child_process";
import type { WalkthroughScript } from "../../types/index.js";

export const recordCommand = new Command("record")
  .description("Record a video from an existing walkthrough script")
  .requiredOption("--script <path>", "Path to walkthrough script JSON")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output video path", "./walkthrough.mp4")
  .action(async (options) => {
    const config = await loadConfig(process.cwd(), {
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });

    const outputPath = options.output ?? "./walkthrough.mp4";
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

      // Read and validate script file
      let spinner = ora(`Reading script from ${options.script}...`).start();
      const raw = await readFile(options.script, "utf-8");
      const script: WalkthroughScript = JSON.parse(raw);

      if (!script.steps || !Array.isArray(script.steps)) {
        throw new Error("Invalid script file: missing or invalid 'steps' array.");
      }
      spinner.succeed(`Loaded script with ${script.steps.length} steps`);

      // Record
      spinner = ora("Recording walkthrough video...").start();
      const recording = await recordWalkthrough(script, config);
      spinner.succeed(`Recorded ${(recording.duration / 1000).toFixed(1)}s video`);

      if (recording.skippedSteps.length > 0) {
        console.log(chalk.yellow(`Warning: ${recording.skippedSteps.length} steps were skipped due to errors.`));
      }

      // Post-process
      spinner = ora("Processing video...").start();
      const prMeta = script.metadata.pr;
      const finalPath = await processVideo(recording, outputPath, {
        introText: prMeta ? `PR #${prMeta.number}: ${prMeta.title}` : undefined,
      });
      spinner.succeed(`Video saved to ${chalk.bold(finalPath)}`);

    } finally {
      if (devServerProcess) {
        stopDevServer(devServerProcess);
      }
    }
  });
