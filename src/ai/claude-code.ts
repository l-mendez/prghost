import { query, tool as sdkTool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodSchema } from "zod";
import type { AIClient, ExplorerToolDef } from "./client.js";

async function runQuery(prompt: string, maxTurns: number, extraOptions: object = {}): Promise<{ text: string; structured: unknown }> {
  let text = "";
  let structured: unknown = undefined;
  for await (const message of query({
    prompt,
    options: { maxTurns, ...extraOptions },
  })) {
    if ("result" in message) {
      text = typeof message.result === "string" ? message.result : "";
    }
    if ("structured_output" in message && message.structured_output != null) {
      structured = message.structured_output;
    }
  }
  return { text, structured };
}

export function createClaudeCodeClient(): AIClient {
  return {
    async generateObject<T>({ prompt, schema }: { prompt: string; schema: ZodSchema<T> }): Promise<T> {
      const jsonSchema = zodToJsonSchema(schema) as Record<string, unknown>;
      const noToolsOpts = {
        allowedTools: [] as string[],
        outputFormat: { type: "json_schema", schema: jsonSchema },
      };
      const { structured } = await runQuery(prompt, 5, noToolsOpts);

      if (structured != null) {
        return schema.parse(structured);
      }

      // Fallback: ask for raw JSON text when structured_output is unavailable
      const fallbackPrompt = `${prompt}\n\nReturn ONLY a valid JSON object. No markdown, no explanation.`;
      const { text } = await runQuery(fallbackPrompt, 3, { allowedTools: [] as string[] });
      const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, text];
      return schema.parse(JSON.parse((jsonMatch[1] ?? text).trim()));
    },

    async generateText({ system, prompt, tools, maxSteps }) {
      const mcpTools = Object.entries(tools).map(([name, def]: [string, ExplorerToolDef]) =>
        sdkTool(
          name,
          def.description,
          def.inputSchema.shape,
          async (args: any) => {
            const result = await def.execute(args);
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          },
        ),
      );

      const server = createSdkMcpServer({ name: "explorer", tools: mcpTools });

      const { text } = await runQuery(`${system}\n\n${prompt}`, maxSteps, {
        mcpServers: { explorer: server },
        disallowedTools: ["Bash", "Write", "Edit", "Read", "Glob", "Grep", "WebSearch", "WebFetch"],
      });
      return text;
    },
  };
}
