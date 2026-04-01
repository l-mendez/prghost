import { describe, it, expect } from "vitest";
import { GhostCursorController } from "@/browser/cursor.js";

describe("CursorController interface", () => {
  it("GhostCursorController implements CursorController", () => {
    const proto = GhostCursorController.prototype;
    expect(typeof proto.init).toBe("function");
    expect(typeof proto.moveTo).toBe("function");
    expect(typeof proto.click).toBe("function");
  });
});
