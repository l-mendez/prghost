/** @type {import("./src/types/index.js").PrGhostConfig} */
const config = {
  devServer: {
    command: "pnpm dev",
    port: 3000,
    readyPattern: "Ready on",
    startTimeout: 30000,
  },
  baseUrl: "http://localhost:3000",
  video: {
    viewport: { width: 1280, height: 720 },
    format: "mp4",
    fps: 30,
  },
  timing: {
    typingDelay: { min: 50, max: 120 },
    clickPause: { min: 200, max: 500 },
    scrollSpeed: "smooth",
    sectionPause: 1000,
  },
  ai: {
    provider: "openai",
    model: "gpt-4o",
    maxExplorationSteps: 20,
  },
  selectors: {
    priority: ["data-testid", "aria-label", "role", "css", "text"],
  },
  ignore: ["/api/*", "/_next/*"],
  auth: {
    steps: [
      { action: "navigate", url: "/login" },
      { action: "type", selector: "#email", text: "test@example.com" },
      { action: "type", selector: "#password", text: "password123" },
      { action: "click", selector: "button[type=submit]", description: "Submit login" },
      { action: "wait", duration: 2000, reason: "Wait for auth redirect" },
    ],
  },
};

export default config;
