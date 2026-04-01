// Public API
export type {
  PrGhostConfig,
  WalkthroughScript,
  WalkthroughStep,
  DiffAnalysis,
  FileChange,
  FileCategory,
  DiffHunk,
  UXMap,
  AffectedRoute,
  ChangedComponent,
  ReconReport,
  RecordingResult,
  StepTimestamp,
} from "./types/index.js";

export { configSchema, loadConfig, configExists, DEFAULT_CONFIG } from "./config/schema.js";
export { parseDiff, analyzeDiffFromGit, categorizeFile } from "./core/diff-analyzer.js";
