// src/core/explorer.ts
import { generateText, tool } from "ai";
import type { LanguageModel } from "ai";
import type { Page } from "playwright";
import { z } from "zod";
import { buildExplorationPrompt } from "../ai/prompts/exploration.js";
import type {
  DiffAnalysis, UXMap, ReconReport,
  PageVisit, DiscoveredElement, ObservedBehavior, ReconFinding,
} from "../types/index.js";

export function buildExplorerTools(page: Page) {
  const pagesVisited: PageVisit[] = [];
  const interactiveElements: DiscoveredElement[] = [];
  const observedBehaviors: ObservedBehavior[] = [];
  const findings: ReconFinding[] = [];

  const tools = {
    navigate: tool({
      description: "Navigate to a URL. Returns the page title and final URL after load.",
      parameters: z.object({ url: z.string().describe("URL to navigate to") }),
      execute: async ({ url }) => {
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
          const title = await page.title();
          const finalUrl = page.url();
          pagesVisited.push({ url: finalUrl, title });
          return { success: true, title, url: finalUrl };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    inspectDOM: tool({
      description: "Get a simplified DOM tree. Returns interactive elements, text, structure.",
      parameters: z.object({
        selector: z.string().optional().describe("Optional CSS selector to scope inspection"),
      }),
      execute: async ({ selector }) => {
        try {
          const result = await page.evaluate((sel) => {
            function simplify(el: Element, depth: number = 0): string {
              if (depth > 4) return "...";
              const tag = el.tagName.toLowerCase();
              const id = el.id ? `#${el.id}` : "";
              const cls = el.className && typeof el.className === "string"
                ? `.${el.className.split(" ").filter(Boolean).slice(0, 2).join(".")}` : "";
              const role = el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "";
              const testId = el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : "";
              const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
                ? ` "${(el.textContent ?? "").slice(0, 50)}"` : "";
              const indent = "  ".repeat(depth);
              let result = `${indent}<${tag}${id}${cls}${role}${testId}${text}>\n`;
              for (const child of el.children) {
                result += simplify(child, depth + 1);
              }
              return result;
            }
            const root = sel ? document.querySelector(sel) : document.body;
            if (!root) return "Element not found";
            return simplify(root).slice(0, 3000);
          }, selector ?? null);
          return { success: true, dom: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    getInteractiveElements: tool({
      description: "Get all interactive elements on the current page with their selectors and labels.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const elements = await page.evaluate(() => {
            const interactive = document.querySelectorAll(
              "button, a, input, select, textarea, [role=button], [role=link], [onclick]"
            );
            return Array.from(interactive).slice(0, 50).map((el) => {
              const tag = el.tagName.toLowerCase();
              let type: string = "other";
              if (tag === "button" || el.getAttribute("role") === "button") type = "button";
              else if (tag === "a" || el.getAttribute("role") === "link") type = "link";
              else if (tag === "input") type = "input";
              else if (tag === "select") type = "select";
              else if (tag === "textarea") type = "textarea";
              const testId = el.getAttribute("data-testid");
              const ariaLabel = el.getAttribute("aria-label");
              const id = el.id;
              const selector = testId ? `[data-testid='${testId}']`
                : id ? `#${id}`
                : ariaLabel ? `[aria-label='${ariaLabel}']`
                : `${tag}${el.className ? "." + (el.className as string).split(" ")[0] : ""}`;
              const label = ariaLabel ?? el.textContent?.trim().slice(0, 50) ?? el.getAttribute("placeholder") ?? selector;
              return { selector, type, label };
            });
          });
          const currentUrl = page.url();
          for (const el of elements) {
            interactiveElements.push({ ...el, page: currentUrl } as DiscoveredElement);
          }
          return { success: true, elements };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    screenshot: tool({
      description: "Take a screenshot of the current page.",
      parameters: z.object({
        fullPage: z.boolean().optional().describe("Capture full page or just viewport"),
      }),
      execute: async ({ fullPage }) => {
        try {
          const buffer = await page.screenshot({ fullPage: fullPage ?? false });
          const base64 = buffer.toString("base64");
          const currentUrl = page.url();
          const visit = pagesVisited.find((p) => p.url === currentUrl);
          if (visit) visit.screenshotBase64 = base64;
          return { success: true, base64, width: 1280, height: 720 };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    tryInteraction: tool({
      description: "Try an interaction and report what changed.",
      parameters: z.object({
        action: z.enum(["click", "type", "hover"]),
        selector: z.string(),
        text: z.string().optional().describe("Text to type (for type action only)"),
      }),
      execute: async ({ action, selector, text }) => {
        try {
          const beforeUrl = page.url();
          const beforeHTML = await page.evaluate(() => document.body.innerHTML.length);
          switch (action) {
            case "click": await page.click(selector, { timeout: 5000 }); break;
            case "type": await page.fill(selector, text ?? "test input", { timeout: 5000 }); break;
            case "hover": await page.hover(selector, { timeout: 5000 }); break;
          }
          await page.waitForTimeout(500);
          const afterUrl = page.url();
          const afterHTML = await page.evaluate(() => document.body.innerHTML.length);
          const navigated = afterUrl !== beforeUrl;
          const domChanged = Math.abs(afterHTML - beforeHTML) > 10;
          const description = navigated ? `Navigated to ${afterUrl}`
            : domChanged ? "DOM content changed (possible modal, dropdown, or dynamic update)"
            : "No visible change detected";
          observedBehaviors.push({
            trigger: `${action} ${selector}${text ? ` "${text}"` : ""}`,
            result: description, page: beforeUrl,
          });
          return { success: true, navigated, newUrl: navigated ? afterUrl : undefined, domChanged, description };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),

    reportFinding: tool({
      description: "Record a discovery worth including in the walkthrough.",
      parameters: z.object({
        description: z.string(),
        page: z.string(),
        relevantSelectors: z.array(z.string()),
      }),
      execute: async ({ description, page: pageUrl, relevantSelectors }) => {
        findings.push({ description, page: pageUrl, relevantSelectors });
        return { success: true, recorded: true };
      },
    }),
  };

  return Object.assign(tools, {
    _getReport: (): Omit<ReconReport, "recommendedFlow"> => ({
      pagesVisited, interactiveElements, observedBehaviors, findings,
    }),
  });
}

export async function runExplorationAgent(
  model: LanguageModel,
  page: Page,
  diff: DiffAnalysis,
  uxMap: UXMap,
  maxSteps: number = 20,
): Promise<ReconReport> {
  const toolsWithReport = buildExplorerTools(page);
  const { _getReport, ...tools } = toolsWithReport;

  const prompt = buildExplorationPrompt(diff, uxMap);

  const { text } = await generateText({
    model,
    tools,
    maxSteps,
    system: prompt,
    prompt: "Begin exploring the application. Start by navigating to the most important affected route and systematically document what you find.",
  });

  const partialReport = _getReport();
  const recommendedFlow: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) recommendedFlow.push(match[1]);
  }
  if (recommendedFlow.length === 0) {
    for (const finding of partialReport.findings) {
      recommendedFlow.push(finding.description);
    }
  }

  return { ...partialReport, recommendedFlow };
}
