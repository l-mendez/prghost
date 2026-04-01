import { Command } from "commander";
import { runInit } from "./init-handler.js";

export const initCommand = new Command("init")
  .description("Generate a pr-ghost config file for this project")
  .action(async () => {
    await runInit();
  });
