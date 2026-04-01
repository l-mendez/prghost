import type { ZodSchema, ZodObject } from "zod";

export type ExplorerToolDef = {
  description: string;
  inputSchema: ZodObject<any>;
  execute: (input: any) => Promise<any>;
};

export interface AIClient {
  generateObject<T>(opts: { prompt: string; schema: ZodSchema<T> }): Promise<T>;
  generateText(opts: {
    system: string;
    prompt: string;
    tools: Record<string, ExplorerToolDef>;
    maxSteps: number;
  }): Promise<string>;
}
