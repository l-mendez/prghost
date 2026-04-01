import type { PrGhostConfig } from "../types/index.js";
import type { AIClient } from "./client.js";

export async function createAIClient(config: PrGhostConfig): Promise<AIClient> {
  const { provider, model } = config.ai;

  if (provider === "claude-code") {
    const { createClaudeCodeClient } = await import("./claude-code.js");
    return createClaudeCodeClient();
  }

  const { createVercelClient } = await import("./vercel-client.js");

  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return createVercelClient(openai(model));
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return createVercelClient(anthropic(model));
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
      return createVercelClient(google(model));
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
