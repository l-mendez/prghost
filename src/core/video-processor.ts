import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import type { StepTimestamp, RecordingResult } from "../types/index.js";

export async function checkFfmpeg(): Promise<boolean> {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function buildAnnotationFilter(timestamps: StepTimestamp[]): string {
  const annotated = timestamps.filter((t) => t.annotation);
  if (annotated.length === 0) return "";

  const filters = annotated.map((t) => {
    const startSec = t.timestampMs / 1000;
    const nextStep = timestamps.find((ts) => ts.stepIndex > t.stepIndex);
    const endSec = nextStep ? nextStep.timestampMs / 1000 : startSec + 3;
    const text = (t.annotation ?? "").replace(/'/g, "\u2019").replace(/:/g, "\\:");
    return `drawtext=text='${text}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.6:boxborderw=10:enable='between(t,${startSec},${endSec})'`;
  });

  return filters.join(",");
}


export interface ProcessingOptions {
  introText?: string;
  outroText?: string;
}

export async function processVideo(
  recording: RecordingResult,
  outputPath: string,
  options: ProcessingOptions = {},
): Promise<string> {
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    console.warn(
      "Warning: ffmpeg not installed. Outputting raw WebM video.\n" +
      "Install ffmpeg for MP4 conversion and annotations: https://ffmpeg.org/download.html",
    );
    return recording.videoPath;
  }

  const allFilters = buildAnnotationFilter(recording.timestamps);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(recording.videoPath)
      .outputOptions("-c:v", "libx264")
      .outputOptions("-pix_fmt", "yuv420p")
      .outputOptions("-movflags", "+faststart");

    if (allFilters) {
      command = command.videoFilters(allFilters);
    }

    command
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => {
        console.warn(`Warning: ffmpeg processing failed: ${err.message}`);
        console.warn("Preserving raw video at:", recording.videoPath);
        resolve(recording.videoPath);
      })
      .run();
  });
}
