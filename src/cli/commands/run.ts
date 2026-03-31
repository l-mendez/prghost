import { Command } from "commander";
import { runFullPipeline } from "./run-handler.js";

export const runCommand = new Command("run")
  .description("Full pipeline: analyze diff → generate script → review → record video")
  .option("--pr <number>", "GitHub PR number")
  .option("--repo <owner/repo>", "GitHub repository")
  .option("--diff <ref>", "Local git ref to diff against")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output video path", "./walkthrough.mp4")
  .option("--no-review", "Skip interactive script review (CI mode)")
  .option("--script-only", "Stop after script generation")
  .action(async (options) => {
    await runFullPipeline(options);
  });
