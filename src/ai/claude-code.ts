import { query, tool as sdkTool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodSchema } from "zod";
import type { AIClient, ExplorerToolDef } from "./client.js";

async function runQuery(prompt: string, maxTurns: number, extraOptions: Record<string, unknown> = {}): Promise<{ text: string; structured: unknown }> {
  let text = "";
  let structured: unknown = undefined;
  const abortController = new AbortController();
  const session = query({
    prompt,
    options: { maxTurns, abortController, ...extraOptions },
  });
  try {
    for await (const message of session) {
      if ("result" in message) {
        text = typeof message.result === "string" ? message.result : "";
      }
      if ("structured_output" in message && message.structured_output != null) {
        structured = message.structured_output;
      }
    }
  } finally {
    session.close();
  }
  return { text, structured };
}

async function runLightweightQuery(prompt: string): Promise<string> {
  const { text } = await runQuery(prompt, 3, {
    model: "claude-haiku-4-5-20251001",
    allowedTools: [] as string[],
  });
  return text;
}

export function createClaudeCodeClient(): AIClient {
  return {
    async generateObject<T>({ prompt, schema }: { prompt: string; schema: ZodSchema<T> }): Promise<T> {
      const jsonSchema = zodToJsonSchema(schema) as Record<string, unknown>;
      const noToolsOpts = {
        allowedTools: [] as string[],
        outputFormat: { type: "json_schema", schema: jsonSchema },
      };
      const { structured } = await runQuery(prompt, 10, noToolsOpts);

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

    async summarizeFileDiff(filePath: string, category: string, status: string, diff: string): Promise<string> {
      const prompt = `You are analyzing a code diff for a single file to summarize its user-visible impact concisely.

File: ${filePath}
Category: ${category}
Status: ${status}

Diff:
\`\`\`diff
${diff}
\`\`\`

In 2-4 sentences, describe: what changed, which UI elements or behaviors are affected, and which routes/pages are impacted. Focus only on user-visible changes. If the change has no user-visible impact (e.g. pure refactor, types only, backend logic), say so explicitly.`;
      return runLightweightQuery(prompt);
    },
  };
}
