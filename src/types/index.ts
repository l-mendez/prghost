// --- Config Types ---

export interface Range {
  min: number;
  max: number;
}

export interface PrGhostConfig {
  devServer?: {
    command: string;
    port: number;
    readyPattern: string;
    startTimeout: number;
  };
  baseUrl: string;
  video: {
    viewport: { width: number; height: number };
    format: "mp4";
    fps: number;
  };
  timing: {
    typingDelay: Range;
    clickPause: Range;
    scrollSpeed: "smooth" | "fast";
    sectionPause: number;
  };
  ai: {
    provider: "openai" | "anthropic" | "google" | "claude-code";
    model: string;
    maxExplorationSteps: number;
  };
  selectors: {
    priority: string[];
  };
  ignore: string[];
  auth?: {
    steps: WalkthroughStep[];
  };
}

// --- Walkthrough Script Types ---

export interface WalkthroughScript {
  metadata: {
    pr?: { number: number; repo: string; title: string };
    generatedAt: string;
    baseUrl: string;
    viewport: { width: number; height: number };
  };
  steps: WalkthroughStep[];
}

export type WalkthroughStep =
  | NavigateStep
  | ClickStep
  | TypeStep
  | ScrollStep
  | HoverStep
  | WaitStep
  | ScreenshotStep
  | ViewportStep
  | SectionStep;

export interface NavigateStep {
  action: "navigate";
  url: string;
  waitFor?: string;
  annotation?: string;
}

export interface ClickStep {
  action: "click";
  selector: string;
  description: string;
  annotation?: string;
}

export interface TypeStep {
  action: "type";
  selector: string;
  text: string;
  clearFirst?: boolean;
  annotation?: string;
}

export interface ScrollStep {
  action: "scroll";
  target: string | { x: number; y: number };
  annotation?: string;
}

export interface HoverStep {
  action: "hover";
  selector: string;
  description: string;
  annotation?: string;
}

export interface WaitStep {
  action: "wait";
  duration: number;
  reason: string;
  annotation?: string;
}

export interface ScreenshotStep {
  action: "screenshot";
  name: string;
  annotation?: string;
}

export interface ViewportStep {
  action: "viewport";
  width: number;
  height: number;
  annotation?: string;
}

export interface SectionStep {
  action: "section";
  title: string;
  description: string;
}

// --- Diff Analysis Types ---

export type FileCategory =
  | "component"
  | "page"
  | "style"
  | "util"
  | "api-route"
  | "test"
  | "config"
  | "other";

export interface FileChange {
  path: string;
  category: FileCategory;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  changes: string;
}

export interface DiffAnalysis {
  files: FileChange[];
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    categories: Record<FileCategory, number>;
  };
  rawDiff: string;
  source: { type: "local"; ref: string } | { type: "github"; pr: number; repo: string };
}

// --- UX Map Types ---

export interface AffectedRoute {
  path: string;
  description: string;
  changedFiles: string[];
}

export interface ChangedComponent {
  name: string;
  filePath: string;
  usedIn: string[];
  changeDescription: string;
}

export interface UXMap {
  affectedRoutes: AffectedRoute[];
  changedComponents: ChangedComponent[];
  behaviorChanges: string[];
}

// --- Recon Report Types ---

export interface PageVisit {
  url: string;
  title: string;
  screenshotBase64?: string;
}

export interface DiscoveredElement {
  selector: string;
  type: "button" | "link" | "input" | "select" | "textarea" | "other";
  label: string;
  page: string;
}

export interface ObservedBehavior {
  trigger: string;
  result: string;
  page: string;
}

export interface ReconFinding {
  description: string;
  page: string;
  relevantSelectors: string[];
}

export interface ReconReport {
  pagesVisited: PageVisit[];
  interactiveElements: DiscoveredElement[];
  observedBehaviors: ObservedBehavior[];
  findings: ReconFinding[];
  recommendedFlow: string[];
}

// --- Timestamp Sidecar Types ---

export interface StepTimestamp {
  stepIndex: number;
  action: string;
  annotation?: string;
  timestampMs: number;
}

export interface RecordingResult {
  videoPath: string;
  timestamps: StepTimestamp[];
  skippedSteps: number[];
  duration: number;
}
