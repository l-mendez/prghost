// src/cli/commands/init-handler.ts
import { createInterface } from "readline";
import { writeFile, access } from "fs/promises";
import path from "path";
import chalk from "chalk";

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultVal?: string): Promise<string> {
  const prompt = defaultVal ? `${question} (${defaultVal}): ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

export async function runInit(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(chalk.bold("\nPR Ghost Configuration\n"));

    const baseUrl = await ask(rl, "Base URL of your app", "http://localhost:3000");
    const devCommand = await ask(rl, "Dev server command (leave empty to skip)", "");
    const port = devCommand ? await ask(rl, "Dev server port", "3000") : "";
    const readyPattern = devCommand ? await ask(rl, "Stdout pattern when server is ready", "Ready on") : "";
    const provider = await ask(rl, "AI provider (openai/anthropic/google)", "openai");
    const model = await ask(rl, "Model name", provider === "openai" ? "gpt-4o" : provider === "anthropic" ? "claude-sonnet-4-20250514" : "gemini-2.0-flash");

    const devServerBlock = devCommand
      ? `  devServer: {
    command: "${devCommand}",
    port: ${port},
    readyPattern: "${readyPattern}",
    startTimeout: 30000,
  },\n`
      : "";

    const configContent = `/** @type {import("./src/types/index.js").PrGhostConfig} */
export default {
${devServerBlock}  baseUrl: "${baseUrl}",
  video: {
    viewport: { width: 1280, height: 720 },
    format: "mp4",
    fps: 30,
  },
  timing: {
    typingDelay: { min: 50, max: 120 },
    clickPause: { min: 200, max: 500 },
    scrollSpeed: "smooth",
    sectionPause: 1000,
  },
  ai: {
    provider: "${provider}",
    model: "${model}",
    maxExplorationSteps: 20,
  },
  selectors: {
    priority: ["data-testid", "aria-label", "role", "css", "text"],
  },
  ignore: ["/api/*", "/_next/*"],
};
`;

    const outputPath = path.join(process.cwd(), "prg.config.ts");

    try {
      await access(outputPath);
      const overwrite = await ask(rl, "prg.config.ts already exists. Overwrite? (y/n)", "n");
      if (overwrite.toLowerCase() !== "y") {
        console.log(chalk.yellow("Aborted."));
        return;
      }
    } catch {
      // File doesn't exist, proceed
    }

    await writeFile(outputPath, configContent);
    console.log(chalk.green(`\nConfig written to ${outputPath}`));
    console.log(chalk.dim("Edit the file to customize further, or run `prg run` to start."));
  } finally {
    rl.close();
  }
}
