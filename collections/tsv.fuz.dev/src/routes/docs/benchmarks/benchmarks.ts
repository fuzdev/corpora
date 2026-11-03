import type { BenchmarkBaseline } from './benchmark_data.ts';

import json from './benchmarks.json' with { type: 'json' };

export const benchmarks_json: BenchmarkBaseline = json as BenchmarkBaseline;
