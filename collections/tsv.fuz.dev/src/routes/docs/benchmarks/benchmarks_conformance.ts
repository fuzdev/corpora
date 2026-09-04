import type { BenchmarkBaseline } from "./benchmark_data.ts";

import json from "./benchmarks_conformance.json" with { type: "json" };

export const benchmarks_conformance_json: BenchmarkBaseline =
  json as BenchmarkBaseline;
