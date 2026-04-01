import { generateObject, generateText, tool, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import type { AIClient, ExplorerToolDef } from "./client.js";

export function createVercelClient(model: LanguageModel): AIClient {
  return {
    async generateObject<T>({ prompt, schema }: { prompt: string; schema: any }): Promise<T> {
      const { object } = await generateObject({ model, schema, prompt });
      return object as T;
    },

    async generateText({ system, prompt, tools: toolDefs, maxSteps }) {
      const tools = Object.fromEntries(
        Object.entries(toolDefs).map(([name, def]: [string, ExplorerToolDef]) => [
          name,
          tool({ description: def.description, inputSchema: def.inputSchema, execute: def.execute }),
        ]),
      );

      const { text } = await generateText({
        model,
        tools,
        stopWhen: stepCountIs(maxSteps),
        system,
        prompt,
      });
      return text;
    },
  };
}
