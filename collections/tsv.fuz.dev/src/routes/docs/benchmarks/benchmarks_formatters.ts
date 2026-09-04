import type { FormatterBenchmarks } from "./formatter_benchmark_data.ts";

import json from "./benchmarks_formatters.json" with { type: "json" };

export const benchmarks_formatters_json: FormatterBenchmarks =
  json as FormatterBenchmarks;
