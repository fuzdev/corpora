import type { CrossRuntimeReport } from "./benchmark_data.ts";

import json from "./benchmarks_cross_runtime.json" with { type: "json" };

export const benchmarks_cross_runtime_json: CrossRuntimeReport =
  json as CrossRuntimeReport;
