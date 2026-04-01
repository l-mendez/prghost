// src/cli/commands/init-handler.ts
import { createInterface } from "readline";
import { writeFile, readFile, access } from "fs/promises";
import path from "path";
import chalk from "chalk";

interface Choice {
  label: string;
  value: string;
  hint?: string;
}

function createPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  async function ask(question: string, defaultVal?: string): Promise<string> {
    const suffix = defaultVal ? chalk.dim(` (${defaultVal})`) : "";
    return new Promise((resolve) => {
      rl.question(`  ${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultVal || "");
      });
    });
  }

  async function select(question: string, choices: Choice[]): Promise<string> {
    console.log(`\n  ${question}\n`);
    for (let i = 0; i < choices.length; i++) {
      const hint = choices[i].hint ? chalk.dim(` — ${choices[i].hint}`) : "";
      console.log(`    ${chalk.cyan(`${i + 1})`)} ${choices[i].label}${hint}`);
    }
    console.log();
    const answer = await ask("Pick a number", "1");
    const index = parseInt(answer, 10) - 1;
    if (index >= 0 && index < choices.length) {
      return choices[index].value;
    }
    console.log(chalk.yellow(`  Invalid choice, using default: ${choices[0].label}`));
    return choices[0].value;
  }

  async function confirm(question: string, defaultVal = true): Promise<boolean> {
    const hint = defaultVal ? "Y/n" : "y/N";
    const answer = await ask(`${question} (${hint})`);
    if (!answer) return defaultVal;
    return answer.toLowerCase().startsWith("y");
  }

  function close() {
    rl.close();
  }

  return { ask, select, confirm, close };
}

function detectDevCommand(pkg: Record<string, unknown>): string | null {
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts) return null;
  if (scripts.dev) return `npm run dev`;
  if (scripts.start) return `npm start`;
  return null;
}

function detectPort(pkg: Record<string, unknown>): number {
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts) return 3000;
  const devScript = scripts.dev ?? scripts.start ?? "";
  const portMatch = devScript.match(/(?:--port|PORT=)\s*(\d+)/);
  if (portMatch) return parseInt(portMatch[1], 10);
  return 3000;
}

function detectFramework(pkg: Record<string, unknown>): string | null {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  if (deps["next"]) return "Next.js";
  if (deps["vite"]) return "Vite";
  if (deps["@remix-run/react"]) return "Remix";
  if (deps["nuxt"]) return "Nuxt";
  if (deps["@angular/core"]) return "Angular";
  if (deps["svelte"] || deps["@sveltejs/kit"]) return "SvelteKit";
  return null;
}

function readyPatternFor(framework: string | null): string {
  switch (framework) {
    case "Next.js": return "Ready on";
    case "Vite": return "Local:";
    case "Remix": return "started at";
    case "Nuxt": return "Listening on";
    case "Angular": return "compiled successfully";
    case "SvelteKit": return "Local:";
    default: return "ready";
  }
}

const AI_PROVIDERS: Choice[] = [
  { label: "Claude Code", value: "claude-code", hint: "uses your active Claude Code session" },
  { label: "OpenAI", value: "openai", hint: "gpt-4o" },
  { label: "Anthropic API", value: "anthropic", hint: "claude-sonnet" },
  { label: "Google", value: "google", hint: "gemini-2.0-flash" },
];

function defaultModel(provider: string): string {
  switch (provider) {
    case "claude-code": return "claude-opus-4-6";
    case "openai": return "gpt-4o";
    case "anthropic": return "claude-sonnet-4-20250514";
    case "google": return "gemini-2.0-flash";
    default: return "gpt-4o";
  }
}

const VIEWPORT_PRESETS: Choice[] = [
  { label: "1280 × 720", value: "1280x720", hint: "720p — default" },
  { label: "1920 × 1080", value: "1920x1080", hint: "1080p" },
  { label: "Custom", value: "custom" },
];

export async function runInit(): Promise<void> {
  const prompt = createPrompt();

  try {
    console.log();
    console.log(chalk.bold("  ✦ PR Ghost Setup"));
    console.log(chalk.dim("  ─────────────────────────────────────"));
    console.log();

    // Try to read package.json for auto-detection
    let pkg: Record<string, unknown> = {};
    try {
      const raw = await readFile(path.join(process.cwd(), "package.json"), "utf-8");
      pkg = JSON.parse(raw);
    } catch {
      // No package.json, that's fine
    }

    const framework = detectFramework(pkg);
    if (framework) {
      console.log(chalk.dim(`  Detected: ${chalk.white(framework)}\n`));
    }

    // --- AI Provider ---
    const provider = await prompt.select("Which AI agent should generate walkthroughs?", AI_PROVIDERS);
    const model = defaultModel(provider);

    // --- Base URL ---
    const baseUrl = await prompt.ask("\n  Base URL of your app", "http://localhost:3000");

    // --- Dev Server ---
    const detectedCmd = detectDevCommand(pkg);
    let devCommand = "";
    let devPort = 3000;
    let readyPattern = "";

    const wantDevServer = await prompt.confirm(
      "\n  Should PR Ghost start your dev server automatically?",
      !!detectedCmd,
    );

    if (wantDevServer) {
      devCommand = await prompt.ask("  Dev server command", detectedCmd ?? "npm run dev");
      const detectedPort = detectPort(pkg);
      const portStr = await prompt.ask("  Port", String(detectedPort));
      devPort = parseInt(portStr, 10) || 3000;
      readyPattern = await prompt.ask("  Stdout pattern when ready", readyPatternFor(framework));
    }

    // --- Viewport ---
    const viewportChoice = await prompt.select("Video resolution?", VIEWPORT_PRESETS);
    let vpWidth = 1280;
    let vpHeight = 720;
    if (viewportChoice === "custom") {
      const w = await prompt.ask("  Width", "1280");
      const h = await prompt.ask("  Height", "720");
      vpWidth = parseInt(w, 10) || 1280;
      vpHeight = parseInt(h, 10) || 720;
    } else {
      const [w, h] = viewportChoice.split("x").map(Number);
      vpWidth = w;
      vpHeight = h;
    }

    // --- Build config ---
    const devServerBlock = devCommand
      ? `  devServer: {
    command: "${devCommand}",
    port: ${devPort},
    readyPattern: "${readyPattern}",
    startTimeout: 30000,
  },\n`
      : "";

    const configContent = `import type { PrGhostConfig } from "@lolomendez/pr-ghost";

const config: PrGhostConfig = {
${devServerBlock}  baseUrl: "${baseUrl}",
  video: {
    viewport: { width: ${vpWidth}, height: ${vpHeight} },
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

export default config;
`;

    const outputPath = path.join(process.cwd(), "prg.config.ts");

    try {
      await access(outputPath);
      const overwrite = await prompt.confirm(
        "\n  prg.config.ts already exists. Overwrite?",
        false,
      );
      if (!overwrite) {
        console.log(chalk.yellow("\n  Aborted.\n"));
        return;
      }
    } catch {
      // File doesn't exist, proceed
    }

    await writeFile(outputPath, configContent);

    console.log();
    console.log(chalk.dim("  ─────────────────────────────────────"));
    console.log(chalk.green("  Config written to ") + chalk.white("prg.config.ts"));
    console.log();
    console.log(chalk.dim("  Next steps:"));
    console.log(chalk.dim("    1. ") + `prg run --diff HEAD~1`);
    console.log(chalk.dim("    2. ") + `prg run --pr 42 --repo owner/repo`);
    console.log();
  } finally {
    prompt.close();
  }
}
