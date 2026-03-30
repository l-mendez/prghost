import { Command } from "commander";

export const exploreCommand = new Command("explore")
  .description("Analyze diff and generate a walkthrough script")
  .option("--pr <number>", "GitHub PR number")
  .option("--repo <owner/repo>", "GitHub repository")
  .option("--diff <ref>", "Local git ref to diff against (e.g., HEAD~1, main)")
  .option("--base-url <url>", "Base URL of the running app")
  .option("--output <path>", "Output path for walkthrough script", "./walkthrough.json")
  .action(async (options) => {
    console.log("Explore command not yet implemented. Options:", options);
  });
