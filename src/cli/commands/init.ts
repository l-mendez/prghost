import { Command } from "commander";

export const initCommand = new Command("init")
  .description("Generate a pr-ghost config file for this project")
  .action(async () => {
    console.log("Init command not yet implemented.");
  });
