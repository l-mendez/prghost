import type { Page } from "playwright";

export function buildSelectorCandidates(
  input: string,
  selectorPriority: string[],
): string[] {
  const candidates: string[] = [];

  const looksLikeCSS =
    input.startsWith("#") ||
    input.startsWith(".") ||
    input.startsWith("[") ||
    input.includes(">") ||
    input.includes("::") ||
    /^[a-z]+[\[.#]/.test(input) ||
    /^[a-z]+$/.test(input);

  for (const strategy of selectorPriority) {
    switch (strategy) {
      case "data-testid":
        if (/^[\w-]+$/.test(input)) {
          candidates.push(`[data-testid='${input}']`);
        }
        break;
      case "aria-label":
        if (/\s/.test(input) || /^[A-Z]/.test(input)) {
          candidates.push(`[aria-label='${input}']`);
        }
        break;
      case "role":
        break;
      case "css":
        if (looksLikeCSS) {
          candidates.push(input);
        }
        break;
      case "text":
        if (/\s/.test(input) || /^[A-Z]/.test(input)) {
          candidates.push(`text=${input}`);
        }
        break;
    }
  }

  if (!candidates.includes(input)) {
    candidates.push(input);
  }

  return candidates;
}

export async function resolveSelector(
  page: Page,
  input: string,
  selectorPriority: string[],
  timeout: number = 5000,
): Promise<string> {
  const candidates = buildSelectorCandidates(input, selectorPriority);

  for (const selector of candidates) {
    try {
      const element = await page.waitForSelector(selector, { timeout: Math.min(timeout, 2000) });
      if (element) return selector;
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    `Could not resolve selector "${input}". Tried: ${candidates.join(", ")}`,
  );
}
