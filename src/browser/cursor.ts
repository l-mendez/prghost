import type { Page } from "playwright";

export interface CursorController {
  init(page: Page): Promise<void>;
  moveTo(selector: string): Promise<void>;
  click(selector: string): Promise<void>;
}

export class GhostCursorController implements CursorController {
  private cursor: any = null;
  private page: Page | null = null;

  async init(page: Page): Promise<void> {
    this.page = page;
    const { createCursor } = await import("ghost-cursor-playwright");
    this.cursor = await createCursor(page as any);
  }

  async moveTo(selector: string): Promise<void> {
    if (!this.cursor || !this.page) {
      throw new Error("Cursor not initialized. Call init() first.");
    }
    await this.cursor.actions.move(selector);
  }

  async click(selector: string): Promise<void> {
    if (!this.cursor || !this.page) {
      throw new Error("Cursor not initialized. Call init() first.");
    }
    await this.cursor.actions.click({ target: selector });
  }
}
