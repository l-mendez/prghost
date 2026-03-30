import { Command } from "commander";

export const recordCommand = new Command("record")
  .description("Record a video from an existing walkthrough script")
  .requiredOption("--script <path>", "Path to walkthrough script JSON")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output video path", "./walkthrough.mp4")
  .action(async (options) => {
    console.log("Record command not yet implemented. Options:", options);
  });
