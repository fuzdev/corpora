import type { Gen } from "@fuzdev/gro/gen.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse_formatter_benchmarks } from "./formatter_benchmark_data.ts";

// The formatter comparison harness lives in a sibling checkout and publishes its
// results only as prose — see `formatter_benchmark_data.ts`.
const README_PATH = "../oxc-bench-formatter/README.md";

/**
 * Generate `benchmarks_formatters.json` from the sibling formatter-benchmark
 * harness's README.
 *
 * A MISSING sibling checkout is the one tolerated case — it's an optional repo,
 * so generation is skipped, the committed JSON stands, and `gro gen --check`
 * passes on a machine (or CI) that has only this repo. A README that IS present
 * but doesn't parse fails the task instead: the alternative is quietly publishing
 * stale or scenario-stripped numbers.
 */
export const gen: Gen = {
  generate: async ({ log }) => {
    const path = resolve(README_PATH);

    let readme;
    try {
      readme = await readFile(path, "utf8");
    } catch (error) {
      // only "it isn't there" is benign; an unreadable file is a real problem
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      log.info(`skipping formatter benchmarks, no readme at ${path}`);
      return null;
    }

    const benchmarks = parse_formatter_benchmarks(readme);
    log.info(
      `parsed ${benchmarks.scenarios.length} tsv scenario(s) from ${path}`,
    );
    return JSON.stringify(benchmarks);
  },
  dependencies: { files: [resolve(README_PATH)] },
};
