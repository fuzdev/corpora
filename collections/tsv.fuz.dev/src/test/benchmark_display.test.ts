import { assert, describe, test } from 'vitest';

import {
	format_bytes,
	format_cli_corpus,
	format_commit,
	format_gzip_size,
	format_count,
	format_coverage_percent,
	format_label,
	format_percent,
	format_list_and,
	format_share_approx,
	format_share_ceil,
	format_speedup,
	format_count_maybe,
	format_report_date,
	format_group_label,
	format_group_omissions,
	format_mib,
	format_ms,
	format_ms_range,
	format_ns,
	format_ratio_approx,
	format_ratio_range,
	format_row_label,
	format_runtime_display,
	format_unstable_readings,
	format_untimed_reason,
	format_version_label
} from '#routes/docs/benchmarks/benchmark_display.ts';

describe('format_row_label', () => {
	test('a scope-gap placeholder takes the bare tool name; a real row keeps its binding', () => {
		assert.strictEqual(format_row_label('biome-wasm', true), 'biome');
		assert.strictEqual(format_row_label('biome-wasm', false), 'biome (wasm)');
		assert.strictEqual(format_row_label('oxc-parser', true), 'oxc-parser');
		assert.strictEqual(format_row_label('oxc-parser', false), format_label('oxc-parser'));
		assert.strictEqual(format_row_label('swc', true), 'swc');
	});

	test("a disabled row that is no scope gap keeps format_label's name", () => {
		// the size table's absent-build placeholder, and a coverage-only row
		assert.strictEqual(format_row_label('oxfmt (wasm)', true), format_label('oxfmt (wasm)'));
		assert.strictEqual(format_row_label('markup-fmt-wasm', true), 'markup_fmt (wasm)');
	});
});

describe('format_label', () => {
	test('overrides name the runtime and binding', () => {
		assert.strictEqual(format_label('tsv+locations'), 'tsv+locations (node napi)');
		assert.strictEqual(format_label('biome-wasm'), 'biome (wasm)');
	});

	test('hyphenated tool names keep their hyphens, only the suffix is spaced', () => {
		assert.strictEqual(format_label('tsv-wasm-internal'), 'tsv-wasm internal');
		assert.strictEqual(format_label('acorn-typescript'), 'acorn-typescript');
		assert.strictEqual(format_label('tsv-format-wasm'), 'tsv-format-wasm');
	});

	test('anything else is spaced out, and names without hyphens pass through', () => {
		assert.strictEqual(format_label('some-new-tool'), 'some new tool');
		assert.strictEqual(format_label('svelte/compiler'), 'svelte/compiler');
	});
});

describe('format_ns', () => {
	test('the µs tier never prints 1000', () => {
		assert.deepEqual(format_ns(999_499), { value: '999', unit: 'µs' });
		assert.deepEqual(format_ns(999_500), { value: '1.0', unit: 'ms' });
		assert.deepEqual(format_ns(1_000_000), { value: '1.0', unit: 'ms' });
	});

	test('a decimal step inside the µs tier never prints a digit more than it means to', () => {
		assert.deepEqual(format_ns(9_994), { value: '9.99', unit: 'µs' });
		assert.deepEqual(format_ns(9_995), { value: '10.0', unit: 'µs' });
		assert.deepEqual(format_ns(99_949), { value: '99.9', unit: 'µs' });
		assert.deepEqual(format_ns(99_950), { value: '100', unit: 'µs' });
	});

	test('the ms tier keeps one decimal under 10 ms and never prints 10.0', () => {
		// a 3.9 ms row against an 11.3 ms anchor must not print as `4` and `11`
		assert.deepEqual(format_ns(3_900_000), { value: '3.9', unit: 'ms' });
		assert.deepEqual(format_ns(9_949_999), { value: '9.9', unit: 'ms' });
		assert.deepEqual(format_ns(9_950_000), { value: '10', unit: 'ms' });
		assert.deepEqual(format_ns(1_234_000_000), { value: '1,234', unit: 'ms' });
	});
});

describe('CLI value formatting', () => {
	test('a duration is whole ms under a second, and never prints 1000 ms', () => {
		assert.strictEqual(format_ms(18.814), '19 ms');
		assert.strictEqual(format_ms(999.4), '999 ms');
		assert.strictEqual(format_ms(999.5), '1.0 s');
		assert.strictEqual(format_ms(1605.9), '1.6 s');
	});

	test('a span of ms collapses to its midpoint when the ends round at most 1 ms apart', () => {
		assert.strictEqual(format_ms_range({ min: 28.2, max: 33.9 }), '28–34 ms');
		assert.strictEqual(format_ms_range({ min: 30.3, max: 32.4 }), '30–32 ms');
		assert.strictEqual(format_ms_range({ min: 30.3, max: 31.3 }), '31 ms');
		assert.strictEqual(format_ms_range({ min: 30.3, max: 30.4 }), '30 ms');
		assert.strictEqual(format_ms_range(undefined), '—');
	});

	test('memory is whole MiB, a dash when unmeasured', () => {
		assert.strictEqual(format_mib(49.6), '50 MiB');
		assert.strictEqual(format_mib(null), '—');
		assert.strictEqual(format_mib(undefined), '—');
	});
});

describe('format_group_label', () => {
	test('names the operation and the language as the headings print them', () => {
		assert.strictEqual(format_group_label('format', 'typescript'), 'Format TypeScript/JS');
		assert.strictEqual(format_group_label('parse', 'css'), 'Parse CSS');
	});
});

describe('prose ratio formatting', () => {
	test('a missing figure is a dash rather than a throw mid-sentence', () => {
		assert.strictEqual(format_ratio_range(undefined), '—');
		assert.strictEqual(format_count_maybe(undefined), '—');
		assert.strictEqual(format_count_maybe(1106), '1,106');
	});

	test('approximate formatting drops digits as the ratio grows', () => {
		assert.strictEqual(format_ratio_approx(1.66), '1.7x');
		assert.strictEqual(format_ratio_approx(26.241), '26x');
		// a ratio that rounds to 10 reads as one, not `10.0x`
		assert.strictEqual(format_ratio_approx(9.97), '10x');
		assert.strictEqual(format_ratio_approx(9.94), '9.9x');
		assert.strictEqual(format_ratio_approx(undefined), '—');
	});

	test('a range is floored at both ends so the claim never overstates either bound', () => {
		assert.strictEqual(format_ratio_range({ min: 3.001, max: 9.89 }), '3.0–9.8x');
		assert.strictEqual(format_ratio_range({ min: 2.95, max: 4.62 }), '2.9–4.6x');
		// from 10 the decimal goes, as `format_ratio_approx` drops it
		assert.strictEqual(format_ratio_range({ min: 6.54, max: 21.21 }), '6.5–21x');
	});

	test('a range whose ends floor to the same figure collapses to one', () => {
		assert.strictEqual(format_ratio_range({ min: 2.91, max: 2.99 }), '2.9x');
		assert.strictEqual(format_ratio_range({ min: 12.1, max: 12.9 }), '12x');
	});
});

describe('format_bytes', () => {
	test('uses decimal units, as tsv’s own report does', () => {
		assert.deepEqual(format_bytes(999), { value: '999', unit: 'B' });
		assert.deepEqual(format_bytes(1_000), { value: '1', unit: 'KB' });
		assert.deepEqual(format_bytes(716_600), { value: '717', unit: 'KB' });
		assert.deepEqual(format_bytes(2_806_479), { value: '2.8', unit: 'MB' });
		assert.deepEqual(format_bytes(44_645_975), { value: '44.6', unit: 'MB' });
	});

	test('the KB tier ends where it would round to 1000', () => {
		assert.deepEqual(format_bytes(999_499), { value: '999', unit: 'KB' });
		assert.deepEqual(format_bytes(999_500), { value: '1.0', unit: 'MB' });
	});
});

describe('format_gzip_size', () => {
	test('a measured size reads with its unit, an unmeasured one is undefined', () => {
		assert.strictEqual(format_gzip_size(716_600), '717 KB gz');
		assert.isUndefined(format_gzip_size(null));
		assert.isUndefined(format_gzip_size(undefined));
	});
});

describe('format_percent', () => {
	test('rounds to one decimal', () => {
		assert.strictEqual(format_percent(41_125, 378_000), '10.9%');
		assert.strictEqual(format_percent(1, 3), '33.3%');
	});

	test('clamps both edges, so a nonzero share is never zero and a partial one never whole', () => {
		assert.strictEqual(format_percent(1, 3000), '<0.1%');
		assert.strictEqual(format_percent(2999, 3000), '>99.9%');
		assert.strictEqual(format_percent(1, 1000), '0.1%');
	});

	test('exact ends carry no decimal', () => {
		assert.strictEqual(format_percent(0, 3000), '0%');
		assert.strictEqual(format_percent(5, 5), '100%');
		assert.strictEqual(format_percent(0, 0), '0%');
	});
});

describe('format_list_and', () => {
	test('joins one, two, and three or more items as prose', () => {
		assert.strictEqual(format_list_and(['a']), 'a');
		assert.strictEqual(format_list_and(['a', 'b']), 'a and b');
		assert.strictEqual(format_list_and(['a', 'b', 'c']), 'a, b, and c');
	});
});

describe('format_share_approx', () => {
	test('rounds a fraction to a whole percentage, dash when missing', () => {
		assert.strictEqual(format_share_approx(0.3846), '38%');
		assert.strictEqual(format_share_approx(0.0667), '7%');
		assert.strictEqual(format_share_approx(1), '100%');
		assert.strictEqual(format_share_approx(undefined), '—');
	});
});

describe('format_share_ceil', () => {
	test('rounds a fraction up to a whole percentage, dash when missing', () => {
		assert.strictEqual(format_share_ceil(0.0275), '3%');
		assert.strictEqual(format_share_ceil(0.0301), '4%');
		assert.strictEqual(format_share_ceil(undefined), '—');
	});

	test('an exact percentage is not pushed up by float noise', () => {
		assert.strictEqual(format_share_ceil(0.07), '7%'); // 0.07 * 100 is 7.000000000000001
		assert.strictEqual(format_share_ceil(0.03), '3%');
	});
});

describe('format_speedup', () => {
	test('at or above the reference reads as a plain multiple', () => {
		assert.strictEqual(format_speedup(1), '1.00x');
		assert.strictEqual(format_speedup(2.5), '2.50x');
		assert.strictEqual(format_speedup(12.3), '12.3x'); // >= 10 drops to one decimal
		assert.strictEqual(format_speedup(9.996), '10.0x'); // the tier follows the rounded value
	});

	test('a worse row negates the reciprocal so the factor is directly legible', () => {
		assert.strictEqual(format_speedup(0.15), '−6.67x');
		assert.strictEqual(format_speedup(0.05), '−20.0x'); // >= 10 magnitude → one decimal
		assert.strictEqual(format_speedup(0.98), '−1.02x'); // near-parity sign flip
		assert.strictEqual(format_speedup(0.998), '1.00x'); // rounds to parity, so unsigned
	});
});
describe('format_count', () => {
	test('groups thousands in the pinned locale', () => {
		assert.strictEqual(format_count(44_220), '44,220');
		assert.strictEqual(format_count(7), '7');
	});
});

describe('format_version_label', () => {
	test('names the scoped packages whose bare tool name is a different release line', () => {
		assert.strictEqual(format_version_label('biome'), '@biomejs/wasm-bundler');
		assert.strictEqual(format_version_label('rsvelte_parse'), '@rsvelte/vite-plugin-svelte-native');
	});

	test('hyphenates every key the table does not name', () => {
		assert.strictEqual(format_version_label('oxc_parser'), 'oxc-parser');
		assert.strictEqual(format_version_label('svelte'), 'svelte');
	});
});

describe('format_coverage_percent', () => {
	test('floors — only exact totality reads 100%', () => {
		// 44219/44220 rounds to 100.00% but must not display as it: floor, so a
		// visibly non-total count never sits beside a "100.00%" label.
		assert.strictEqual(format_coverage_percent(44_219 / 44_220), '99.99%');
		assert.strictEqual(format_coverage_percent(1), '100.00%');
		assert.strictEqual(format_coverage_percent(0.998549), '99.85%');
		assert.strictEqual(format_coverage_percent(0), '0.00%');
	});
});

describe('format_unstable_readings', () => {
	test('names each reading, signs drift, and omits absent ones', () => {
		assert.strictEqual(
			format_unstable_readings({ cv: 0.478, cv_raw: 0.52, drift: 0.38 }),
			'cv 47.8%, raw cv 52.0%, drift +38.0%'
		);
		assert.strictEqual(
			format_unstable_readings({ cv: 0.1, drift: -0.05 }),
			'cv 10.0%, drift -5.0%'
		);
		assert.strictEqual(format_unstable_readings({ cv: null, cv_raw: null, drift: null }), '');
	});

	test("names a pass spread, and omits a one-pass run's zero", () => {
		assert.strictEqual(
			format_unstable_readings({ cv: 0.02, pass_spread: 0.061 }),
			'cv 2.0%, pass spread 6.1%'
		);
		assert.strictEqual(format_unstable_readings({ cv: 0.12, pass_spread: 0 }), 'cv 12.0%');
	});
});

describe('format_runtime_display', () => {
	test('names the runtime with its major version', () => {
		const machine = { cpu_model: 'cpu', os: 'linux', arch: 'x64', runtime_version: '24.14.1' };
		assert.strictEqual(format_runtime_display({ runtime: 'node', machine }), 'Node v24');
		assert.strictEqual(
			format_runtime_display({
				runtime: 'deno',
				machine: { ...machine, runtime_version: '2.5.0' }
			}),
			'Deno v2'
		);
	});
});

describe('format_group_omissions', () => {
	const omissions = {
		group: 'format/svelte',
		files_total: 951,
		bytes_total: 1000,
		omitted_files: 2,
		omitted_bytes: 112,
		by_tool: [
			{ name: 'biome-wasm', files: 2, bytes: 112, categories: {} },
			{ name: 'oxfmt', files: 1, bytes: 50, categories: {} }
		]
	};

	test('several files by several rows lists each row, flagging the overlap', () => {
		assert.strictEqual(
			format_group_omissions(omissions),
			"2 of 951 files (11.2% of the group's bytes) are left out of every row, because some rows fail them in this harness (per row, overlapping: biome (wasm) 2, oxfmt (node napi) 1)."
		);
	});

	test('one row is named outright, without a count', () => {
		assert.strictEqual(
			format_group_omissions({
				...omissions,
				by_tool: [{ name: 'biome-wasm', files: 2, bytes: 112, categories: {} }]
			}),
			"2 of 951 files (11.2% of the group's bytes) are left out of every row, because biome (wasm) fails them in this harness."
		);
	});

	test('one file takes a singular pronoun', () => {
		assert.strictEqual(
			format_group_omissions({
				...omissions,
				omitted_files: 1,
				by_tool: [{ name: 'oxfmt', files: 1, bytes: 112, categories: {} }]
			}),
			"1 of 951 files (11.2% of the group's bytes) is left out of every row, because oxfmt (node napi) fails it in this harness."
		);
	});
});

describe('format_report_date', () => {
	test('reads the day in UTC, whatever the local zone', () => {
		// a moment that is still the 22nd west of UTC
		assert.strictEqual(format_report_date('2026-09-23T01:44:33.674Z'), 'September 23, 2026');
	});
});

describe('format_commit', () => {
	test('abbreviates a full or longer-abbreviated SHA to one length', () => {
		assert.strictEqual(format_commit('b4c8d2862dc13b0e04512dc2c5dd5f79a6c74c1b'), 'b4c8d28');
		assert.strictEqual(format_commit('23392a6e'), '23392a6');
		assert.strictEqual(format_commit('abc1234'), 'abc1234');
	});
});

describe('format_cli_corpus', () => {
	test('a git corpus reads as a commit with its date', () => {
		assert.strictEqual(format_cli_corpus('8cf997c 2026-07-14'), 'commit 8cf997c (2026-07-14)');
	});

	test('a single file gets byte separators and keeps its content hash', () => {
		assert.strictEqual(
			format_cli_corpus('539588 bytes, sha256:dcddb577aa14'),
			'539,588 bytes, sha256:dcddb577aa14'
		);
	});

	test('a corpora snapshot abbreviates its commit and tree ids', () => {
		assert.strictEqual(
			format_cli_corpus(
				'fuzdev/corpora@1117b4829309 (collections tree 5f40c547c3ed), snapshot 6214069 2026-09-04'
			),
			'fuzdev/corpora@1117b48 (collections tree 5f40c54), snapshot 6214069 (2026-09-04)'
		);
	});

	test('an all-digit run is a number, not an id', () => {
		assert.strictEqual(format_cli_corpus('12345678 bytes'), '12,345,678 bytes');
	});

	test('an unrecognized line passes through', () => {
		assert.strictEqual(format_cli_corpus('unknown (ENOENT)'), 'unknown (ENOENT)');
	});
});

describe('format_untimed_reason', () => {
	test('a stated reason', () => {
		assert.strictEqual(format_untimed_reason('rsvelte-fmt'), 'no API');
	});

	test('falls back to not timed', () => {
		assert.strictEqual(format_untimed_reason('unknown-tool'), 'not timed');
	});
});
