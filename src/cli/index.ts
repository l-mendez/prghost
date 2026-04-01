#!/usr/bin/env node
import { Command } from "commander";
import { exploreCommand } from "./commands/explore.js";
import { recordCommand } from "./commands/record.js";
import { runCommand } from "./commands/run.js";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
  .name("prg")
  .description("PR Ghost — Automated PR video walkthrough generator")
  .version("0.1.0");

program.addCommand(exploreCommand);
program.addCommand(recordCommand);
program.addCommand(runCommand);
program.addCommand(initCommand);

program.parse();
