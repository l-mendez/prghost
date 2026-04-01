import type { Page } from "playwright";
import type { CursorController } from "./cursor.js";
import type { WalkthroughStep } from "../types/index.js";
import { TimingProfile, getTypingDelay, getClickPause, sleep } from "./timing.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export interface ActionResult {
  timestampMs: number;
  skipped: boolean;
  error?: string;
}

export class ActionExecutor {
  private startTime: number = Date.now();

  constructor(
    private page: Page,
    private cursor: CursorController,
    private timing: TimingProfile,
    private selectorPriority: string[],
  ) {}

  resetTimer(): void {
    this.startTime = Date.now();
  }

  async execute(step: WalkthroughStep, baseUrl: string): Promise<ActionResult> {
    const timestampMs = Date.now() - this.startTime;

    try {
      switch (step.action) {
        case "navigate":
          await this.executeNavigate(step.url, baseUrl, step.waitFor);
          break;
        case "click":
          await this.executeClick(step.selector);
          break;
        case "type":
          await this.executeType(step.selector, step.text, step.clearFirst);
          break;
        case "scroll":
          await this.executeScroll(step.target);
          break;
        case "hover":
          await this.executeHover(step.selector);
          break;
        case "wait":
          await sleep(step.duration);
          break;
        case "screenshot":
          await this.executeScreenshot(step.name);
          break;
        case "viewport":
          await this.page.setViewportSize({ width: step.width, height: step.height });
          break;
        case "section":
          await sleep(this.timing.sectionPause);
          break;
      }
      return { timestampMs, skipped: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { timestampMs, skipped: true, error: message };
    }
  }

  private async executeNavigate(url: string, baseUrl: string, waitFor?: string): Promise<void> {
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    await this.page.goto(fullUrl, { waitUntil: "networkidle", timeout: 15000 });
    if (waitFor) {
      await this.page.waitForSelector(waitFor, { timeout: 10000 });
    }
  }

  private async executeClick(selector: string): Promise<void> {
    await sleep(getClickPause(this.timing));
    try {
      await this.cursor.click(selector);
    } catch (e) {
      if (String(e).includes("strict mode violation") || String(e).includes("resolved to")) {
        await this.page.locator(selector).first().click();
      } else {
        throw e;
      }
    }
  }

  private async executeType(selector: string, text: string, clearFirst?: boolean): Promise<void> {
    await this.cursor.click(selector);
    await sleep(getClickPause(this.timing));

    if (clearFirst) {
      await this.page.keyboard.press("Meta+a");
      await sleep(50);
      await this.page.keyboard.press("Backspace");
      await sleep(100);
    }

    for (const char of text) {
      await this.page.keyboard.type(char, { delay: 0 });
      await sleep(getTypingDelay(this.timing));
    }
  }

  private async executeScroll(target: string | { x: number; y: number }): Promise<void> {
    if (typeof target === "string") {
      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, target);
    } else {
      const steps = this.timing.scrollSpeed === "smooth" ? 20 : 5;
      const stepX = target.x / steps;
      const stepY = target.y / steps;
      for (let i = 0; i < steps; i++) {
        await this.page.evaluate(
          ([dx, dy]) => window.scrollBy(dx, dy),
          [stepX, stepY],
        );
        await sleep(this.timing.scrollSpeed === "smooth" ? 30 : 10);
      }
    }
  }

  private async executeHover(selector: string): Promise<void> {
    await sleep(getClickPause(this.timing));
    try {
      await this.cursor.moveTo(selector);
    } catch (e) {
      if (String(e).includes("strict mode violation") || String(e).includes("resolved to")) {
        const box = await this.page.locator(selector).first().boundingBox();
        if (box) await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        throw e;
      }
    }
    await sleep(300);
  }

  private async executeScreenshot(name: string): Promise<void> {
    const dir = path.join(process.cwd(), ".prg-screenshots");
    await mkdir(dir, { recursive: true });
    await this.page.screenshot({ path: path.join(dir, `${name}.png`) });
  }
}
