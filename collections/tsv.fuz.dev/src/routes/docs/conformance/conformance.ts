import type { BenchmarkBaseline } from '../benchmarks/benchmark_data.ts';

import json from './conformance.json' with { type: 'json' };

export const conformance_json: BenchmarkBaseline = json as BenchmarkBaseline;
