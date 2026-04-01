import { defineConfig } from "tsup";
import { writeFileSync, readFileSync, chmodSync } from "fs";

export default defineConfig({
  entry: {
    cli: "src/cli/index.ts",
    index: "src/index.ts",
  },
  format: "esm",
  dts: true,
  outDir: "dist",
  clean: true,
  onSuccess: async () => {
    // Add shebang to CLI entry and make it executable
    const cliPath = "dist/cli.js";
    const content = readFileSync(cliPath, "utf-8");
    if (!content.startsWith("#!")) {
      writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
    }
    chmodSync(cliPath, 0o755);
  },
});
