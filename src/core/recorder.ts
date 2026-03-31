import { chromium } from "playwright";
import { GhostCursorController } from "../browser/cursor.js";
import { ActionExecutor } from "../browser/actions.js";
import { TimingProfile } from "../browser/timing.js";
import type { WalkthroughScript, PrGhostConfig, RecordingResult, StepTimestamp } from "../types/index.js";

export async function recordWalkthrough(
  script: WalkthroughScript,
  config: PrGhostConfig,
  outputDir?: string,
): Promise<RecordingResult> {
  const videoDir = outputDir ?? process.cwd();
  const { viewport } = script.metadata;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: videoDir, size: viewport },
  });
  const page = await context.newPage();

  const cursor = new GhostCursorController();
  await cursor.init(page);

  const timing = new TimingProfile(config.timing);
  const executor = new ActionExecutor(page, cursor, timing, config.selectors.priority);

  // Execute auth steps if configured
  if (config.auth?.steps) {
    for (const step of config.auth.steps) {
      await executor.execute(step, script.metadata.baseUrl);
    }
  }

  executor.resetTimer();

  const timestamps: StepTimestamp[] = [];
  const skippedSteps: number[] = [];
  const startTime = Date.now();

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    const result = await executor.execute(step, script.metadata.baseUrl);
    timestamps.push({
      stepIndex: i,
      action: step.action,
      annotation: "annotation" in step ? step.annotation : undefined,
      timestampMs: result.timestampMs,
    });
    if (result.skipped) {
      skippedSteps.push(i);
      console.warn(`Warning: Step ${i + 1} [${step.action}] skipped: ${result.error}`);
    }
  }

  const duration = Date.now() - startTime;
  const video = page.video();
  const videoPath = video ? await video.path() : "";

  await context.close();
  await browser.close();

  return { videoPath, timestamps, skippedSteps, duration };
}
