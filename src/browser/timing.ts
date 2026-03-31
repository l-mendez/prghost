import type { PrGhostConfig } from "../types/index.js";

export function randomDelay(min: number, max: number): number {
  if (min === max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class TimingProfile {
  readonly typingDelay: { min: number; max: number };
  readonly clickPause: { min: number; max: number };
  readonly scrollSpeed: "smooth" | "fast";
  readonly sectionPause: number;

  constructor(timing: PrGhostConfig["timing"]) {
    this.typingDelay = timing.typingDelay;
    this.clickPause = timing.clickPause;
    this.scrollSpeed = timing.scrollSpeed;
    this.sectionPause = timing.sectionPause;
  }
}

export function getTypingDelay(profile: TimingProfile): number {
  return randomDelay(profile.typingDelay.min, profile.typingDelay.max);
}

export function getClickPause(profile: TimingProfile): number {
  return randomDelay(profile.clickPause.min, profile.clickPause.max);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
