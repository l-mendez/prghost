import { spawn, type ChildProcess } from "child_process";
import { createConnection } from "net";
import type { PrGhostConfig } from "../types/index.js";

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

export async function startDevServer(
  config: NonNullable<PrGhostConfig["devServer"]>,
): Promise<ChildProcess> {
  const alreadyRunning = await isPortInUse(config.port);
  if (alreadyRunning) {
    throw new Error(`Port ${config.port} is already in use — dev server may already be running.`);
  }

  const [cmd, ...args] = config.command.split(" ");
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    detached: false,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(
        `Dev server did not become ready within ${config.startTimeout}ms. Looking for pattern: "${config.readyPattern}"`,
      ));
    }, config.startTimeout);

    const checkOutput = (data: Buffer) => {
      const text = data.toString();
      if (text.includes(config.readyPattern)) {
        clearTimeout(timeout);
        resolve(child);
      }
    };

    child.stdout?.on("data", checkOutput);
    child.stderr?.on("data", checkOutput);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start dev server: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

export function stopDevServer(child: ChildProcess): void {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}
