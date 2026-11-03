import { assert, describe, test } from 'vitest';

import { benchmarks_json } from '#routes/docs/benchmarks/benchmarks.ts';
import { benchmarks_cross_runtime_json } from '#routes/docs/benchmarks/benchmarks_cross_runtime.ts';
import { benchmarks_formatters_json } from '#routes/docs/benchmarks/benchmarks_formatters.ts';
import { format_ratio_approx } from '#routes/docs/benchmarks/benchmark_display.ts';
import {
	benchmarks_cli,
	cli_memory_ratio_range,
	cli_scenario_find,
	cli_ratio_vs_tsv,
	cli_ratio_vs_tsv_npm,
	cli_tsv_npm_overhead_ms_range,
	cli_node_startup_ms,
	CLI_DELIVERY_KEY,
	CLI_SINGLE_FILE_KEY,
	CLI_SVELTE_KEY,
	CLI_TS_REPO_KEY,
	CLI_TSV_NPM_LABEL,
	CLI_TSV_WASM_LABEL
} from '#routes/docs/benchmarks/benchmarks_cli.ts';
import {
	derive_runtime_leads,
	derive_unstable_cells
} from '#routes/docs/benchmarks/benchmark_cross_runtime.ts';
import {
	INSTABILITY_NOTED,
	IN_PROCESS_PAIRS as IN_PROCESS_PAIRS_BY_KEY,
	type InProcessPairKey,
	UNRENDERED_PAIRS
} from '#routes/docs/benchmarks/benchmarks_prose.ts';
import {
	benchmark_speedup,
	derive_benchmark_groups,
	derive_corpus_counts,
	derive_corpus_origin_shares,
	derive_slow_row_groups,
	derive_sweep_stats,
	entry_instability,
	is_payload_matched,
	SLOW_ROW_FLOOR_MULTIPLE
} from '#routes/docs/benchmarks/benchmark_data.ts';

// The page's prose quotes ratios computed from the reports rather than
// hand-written numbers, so a renamed entry or a dropped scenario would render
// `—` mid-sentence instead of failing. These gate every pair the copy names.
/**
 * A ratio rendered inside a "~Nx faster than" (or "as long", "the memory") sentence
 * must clear 1 by enough to print as one: `format_ratio_approx` rounds to one decimal, so a ratio in
 * `[1, 1.05)` passes an `isAbove(1)` gate and still renders "~1.0x faster", a
 * claim of nothing.
 */
const assert_reads_faster = (ratio: number, label: string): void => {
	assert.isAbove(ratio, 1, label);
	assert.notStrictEqual(format_ratio_approx(ratio), '1.0x', `${label} renders as ~1.0x`);
};

/** The report's format groups, asserted non-empty so a loop over them can't pass on nothing. */
const format_groups = () => {
	const groups = derive_benchmark_groups(benchmarks_json).filter((g) => g.operation === 'format');
	assert.isNotEmpty(groups);
	return groups;
};

describe('prose ratios resolve', () => {
	// The copy says "X faster than" for the pairs tsv leads and "slower than" / "Y is
	// faster than tsv" for the ones it trails (yuku on TypeScript, the JS parsers on
	// CSS), so every ratio here must land above 1 or the sentence has flipped. The
	// table is the page's own, so a pairing added to the copy is gated by construction.
	const IN_PROCESS_PAIRS = Object.values(IN_PROCESS_PAIRS_BY_KEY);

	test('every in-process pair the TLDR quotes is present and runs the way the sentence reads', () => {
		for (const [group, slower, faster] of IN_PROCESS_PAIRS) {
			const ratio = benchmark_speedup(benchmarks_json, group, slower, faster);
			assert.isDefined(ratio, `${group}: ${slower} vs ${faster}`);
			assert_reads_faster(ratio, `${group}: ${slower} vs ${faster}`);
		}
	});

	test('tsv\'s "CLI outpaces theirs using less memory in every shared scenario"', () => {
		// the TLDR's absolute CLI claim spans every scenario Oxfmt or Biome is timed in,
		// not just the repo it quotes ratios for, through both the dispatcher and the bare binary
		let compared = 0;
		for (const scenario of benchmarks_cli.scenarios.filter((s) => !s.tsv_only)) {
			for (const label of ['oxfmt', 'biome']) {
				if (!scenario.results.some((r) => r.label === label)) continue;
				for (const ratio_vs of [cli_ratio_vs_tsv_npm, cli_ratio_vs_tsv]) {
					const ratio = ratio_vs(scenario.key, label, 'wall_ms');
					assert.isDefined(ratio, `${scenario.key}: ${label}`);
					assert.isAbove(ratio, 1, `${scenario.key}: ${label}`);
					compared++;
				}
			}
		}
		assert.isAbove(compared, 0);
	});

	test('tsv "formats its three languages faster … in every in-process pairing here"', () => {
		// The TLDR's absolute claim spans every timed format row, not just the pairs
		// it quotes: dprint and malva are timed too. Like for like is native-vs-native
		// and wasm-vs-wasm, and the JS rows face native tsv; gating tsv-wasm, tsv's
		// slower build, against every non-tsv row is the stronger check and holds
		for (const group of format_groups()) {
			// a disabled row is a mirrored placeholder or coverage-only, timed at 0
			const timed = group.entries.filter((e) => !e.disabled && e.mean_ns > 0);
			const tsv_wasm = timed.find((e) => e.name === 'tsv-wasm');
			assert(tsv_wasm, `${group.language}: no timed tsv-wasm row`);
			const others = timed.filter((e) => !e.name.startsWith('tsv'));
			assert.isNotEmpty(others, `${group.language}: nothing to pair against`);
			for (const other of others) {
				assert_reads_faster(other.mean_ns / tsv_wasm.mean_ns, `${group.language}: ${other.name}`);
			}
		}
	});

	test('a group that runs short of the corpus total has a note saying by how much', () => {
		// "a chart that runs short of the corpus total says beneath it what was left
		// out" — the note renders from `omissions`, so the sentence
		// holds exactly when every shortfall is an omission the report carries
		const groups = derive_benchmark_groups(benchmarks_json);
		assert.isNotEmpty(groups);
		for (const group of groups) {
			const key = `${group.operation}/${group.language}`;
			const total = benchmarks_json.corpus[group.language];
			assert.isDefined(total, group.language);
			assert.isNotNull(group.files_iterated, `${key}: no timed-set count`);
			assert.strictEqual(
				total - group.files_iterated,
				group.omissions?.omitted_files ?? 0,
				`${key}: the shortfall the heading shows is not the one the note states`
			);
		}
	});

	test('rsvelte\'s Svelte target is "a release apart" from the svelte/compiler row\'s', () => {
		// the parse note prints that sentence whenever the two differ, so the gap must
		// stay one minor release at most or the copy understates it
		const { svelte, rsvelte_parse_svelte_target } = benchmarks_json.versions;
		assert.isString(svelte);
		if (!rsvelte_parse_svelte_target || rsvelte_parse_svelte_target === svelte) return;
		const minor_of = (version: string): number => {
			const match = /^(\d+)\.(\d+)\./.exec(version);
			assert(match, `${version} is not a semver`);
			return Number(match[1]) * 1000 + Number(match[2]);
		};
		assert.isAtMost(
			Math.abs(minor_of(rsvelte_parse_svelte_target) - minor_of(svelte)),
			1,
			'more than one minor release apart'
		);
	});

	test('oxfmt formats Svelte at Prettier speed, as the note says it delegates', () => {
		// "delegates Svelte to its bundled Prettier", which the TLDR leans on to quote
		// only Prettier for Svelte — if a future oxfmt grows its own Svelte path the
		// two rows will part ways and both are stale
		const ratio = benchmark_speedup(benchmarks_json, 'format/svelte', 'oxfmt', 'prettier');
		assert.isDefined(ratio);
		assert.closeTo(ratio, 1, 0.1, 'oxfmt and prettier should be within 10% on format/svelte');
	});

	test('the CSS parse note reads the internal rows it points at', () => {
		// "the JSON hand-off is ~N% of tsv's time (the gap between its default and internal entries)",
		// offered as why the JS parsers finish ahead — the wire must cost more than the
		// engine, or the explanation is wrong
		const wire_share = benchmark_speedup(benchmarks_json, 'parse/css', 'tsv', 'tsv-internal');
		assert.isDefined(wire_share);
		assert.isAbove(wire_share, 2, 'tsv should cost at least twice tsv-internal on CSS');
	});

	test('every in-process pair over an unstable row clears its noise and is noted', () => {
		// A headline ratio divides two means, and an unstable row's mean may sit between
		// two levels (see `is_entry_unstable`). The copy may still quote it when the
		// ratio's lead outruns both rows' worst readings combined, so the direction holds
		// at the noise bound, and a printed ratio must carry its `(N% instability)` note.
		// Otherwise re-run the runtime (`deno task bench:node:run && deno task bench:compose`).
		for (const [key, [group, slower, faster]] of Object.entries(IN_PROCESS_PAIRS_BY_KEY)) {
			const readings = [slower, faster].map((name) => {
				const entry = benchmarks_json.entries.find((e) => e.group === group && e.name === name);
				assert(entry, `${group}/${name} is missing`);
				return entry_instability(entry) ?? 0;
			});
			const noise = readings[0]! + readings[1]!;
			if (noise === 0) continue;
			const ratio = benchmark_speedup(benchmarks_json, group, slower, faster);
			assert.isDefined(ratio);
			assert.isAbove(ratio - 1, noise, `${key}: the lead is inside the rows' instability`);
			const pair_key = key as InProcessPairKey;
			if (!UNRENDERED_PAIRS.has(pair_key)) {
				assert.isTrue(INSTABILITY_NOTED.has(pair_key), `${key} prints a ratio with no note`);
			}
		}
	});

	test('every noted pair is rendered', () => {
		for (const key of INSTABILITY_NOTED) assert.isFalse(UNRENDERED_PAIRS.has(key), key);
	});

	test('the pairings the copy compares by payload tier share one, and the ones it excludes do not', () => {
		// The page names the pairings that compare the same kind of PRODUCT and rules the
		// rest out ("swc's AST ... matches neither of tsv's outputs", and the `+locations`
		// entries carry a superset of Svelte's `loc`, not an equal one). Those are claims
		// about the report's `payload` tiers, so read them off it rather than trusting prose. A
		// shared tier is a shape, not a byte count: the copy says Oxc's span-only AST runs
		// larger than tsv's.
		const entry = (group: string, name: string) => {
			const found = benchmarks_json.entries.find((e) => e.group === group && e.name === name);
			assert(found, `${group}/${name} is missing`);
			return found;
		};
		const matched = (group: string, a: string, b: string) =>
			is_payload_matched(entry(group, a), entry(group, b));

		for (const [group, a, b] of [
			['parse/typescript', 'tsv', 'oxc-parser'],
			['parse/typescript', 'tsv', 'yuku-parser'],
			['parse/typescript', 'tsv-wasm', 'yuku-parser-wasm'],
			// "`{locations: true}` adds acorn's per-node line/column `loc`"
			['parse/typescript', 'tsv+locations', 'acorn-typescript'],
			// "Svelte's own `parseCss`, whose AST tsv reproduces" — neither carries a `loc`
			['parse/css', 'tsv', 'svelte/compiler']
		] as const) {
			assert.isTrue(matched(group, a, b), `${group}: ${a} vs ${b} is no longer payload-matched`);
		}

		for (const [group, a, b] of [
			// swc's own AST shape, ruled out against both wires
			['parse/typescript', 'tsv+locations', 'swc'],
			['parse/typescript', 'tsv', 'swc'],
			// "Oxc and swc, whose ASTs carry no `loc`"
			['parse/typescript', 'tsv+locations', 'oxc-parser'],
			// a superset of Svelte's `loc`, not an equal one, on Svelte's own wire and rsvelte's
			['parse/svelte', 'tsv+locations', 'svelte/compiler'],
			['parse/svelte', 'tsv+locations', 'rsvelte-parse'],
			// rsvelte's reduced wire "sits near tsv's span-only output without matching it"
			['parse/svelte', 'tsv', 'rsvelte-parse-skip-expr-loc']
		] as const) {
			assert.isFalse(matched(group, a, b), `${group}: ${a} vs ${b} is now payload-matched`);
		}
	});

	test('the runtimes where tsv overtakes `parseCss` are read against the Node report the CSS claims quote', () => {
		// the TLDR and the parse note say "under Node" and quote the per-runtime report,
		// then name the runtimes `derive_runtime_leads` finds against the combined
		// report's node column — so that column must be the same measurement
		assert.strictEqual(benchmarks_json.runtime, 'node');
		for (const name of ['svelte/compiler', 'tsv']) {
			const own = benchmarks_json.entries.find((e) => e.group === 'parse/css' && e.name === name);
			const combined = benchmarks_cross_runtime_json.rows.find(
				(r) => r.group === 'parse/css' && r.name === name
			);
			assert.isDefined(own?.mean_ns, name);
			assert.strictEqual(combined?.mean_ns.node, own.mean_ns, name);
		}
		const leads = derive_runtime_leads(
			benchmarks_cross_runtime_json,
			'parse/css',
			'svelte/compiler',
			'tsv'
		);
		for (const lead of leads) {
			assert.notStrictEqual(lead.runtime, 'node');
			// "with parseCss ~Nx slower there than under Node"
			assert_reads_faster(lead.slower_vs_base, `${lead.runtime}: parseCss vs node`);
		}
	});

	test('the cross-runtime unstable disclosure names only rows the tables carry', () => {
		// the disclosure can't point at a row or runtime a reader can't find
		const row_keys = new Set(benchmarks_cross_runtime_json.rows.map((r) => `${r.group}/${r.name}`));
		for (const cell of derive_unstable_cells(benchmarks_cross_runtime_json)) {
			assert(row_keys.has(`${cell.group}/${cell.name}`), `${cell.group}/${cell.name}`);
			assert(
				benchmarks_cross_runtime_json.runtimes.includes(cell.runtime),
				`${cell.runtime} is not a runtime the report carries`
			);
		}
	});

	test('the like-for-like dispatcher claims read the way the numbers run', () => {
		// The TLDR leads with tsv through its Node dispatcher against the
		// other tools' npm bins: "~Nx faster than Oxfmt and ~Mx faster than Biome ...
		// using less memory than either". The copy has no bare-binary fallback, so
		// every one must resolve or a sentence prints with a hole in it.
		for (const label of ['oxfmt', 'biome']) {
			const ratio = cli_ratio_vs_tsv_npm(CLI_TS_REPO_KEY, label, 'wall_ms');
			assert.isDefined(ratio, `${CLI_TS_REPO_KEY}: ${label}`);
			assert_reads_faster(ratio, `${CLI_TS_REPO_KEY}: ${label}`);
		}
		const memory = cli_memory_ratio_range({
			scenario_key: CLI_TS_REPO_KEY,
			labels: ['oxfmt', 'biome'],
			baseline_label: CLI_TSV_NPM_LABEL
		});
		assert.isDefined(memory);
		assert.isAbove(memory.min, 1);

		// the Svelte bullet's like-for-like pair: that scenario may be published
		// aborted, but the copy quotes the dispatcher ratio wherever it quotes the
		// bare-binary one, so the two must resolve together
		for (const metric of ['wall_ms', 'memory_mb'] as const) {
			const ratio = cli_ratio_vs_tsv_npm(CLI_SVELTE_KEY, 'rsvelte-fmt', metric);
			const bare = cli_ratio_vs_tsv(CLI_SVELTE_KEY, 'rsvelte-fmt', metric);
			assert.strictEqual(ratio !== undefined, bare !== undefined, `${CLI_SVELTE_KEY}: ${metric}`);
			if (ratio !== undefined) assert_reads_faster(ratio, `${CLI_SVELTE_KEY}: ${metric}`);
		}
	});

	test("the dispatcher row's peak is Node's, not the binary's, as the memory note implies", () => {
		// the harness reports the largest single process in the tree, so the memory note's
		// "understated" holds for the dispatcher row only while Node outgrows the binary
		for (const scenario of benchmarks_cli.scenarios) {
			const npm = scenario.results.find((r) => r.label === CLI_TSV_NPM_LABEL);
			const tsv = scenario.results.find((r) => r.label === 'tsv');
			if (npm?.memory_mb == null || tsv?.memory_mb == null) continue;
			assert.isAbove(npm.memory_mb, tsv.memory_mb, scenario.key);
		}
	});

	test('the CLI CPU-work note reads the way the numbers run', () => {
		// "in CPU time tsv leads Oxfmt ~C through the dispatcher and ~D as the bare binary",
		// against the TLDR's wall-clock ~A and ~B — the two CPU leads must sit inside the
		// wall-clock span: dispatcher wall < dispatcher CPU <= bare CPU < bare wall. Any
		// one flipping on a refresh leaves "adds little CPU" contradicting the table.
		const defined = (value: number | undefined, name: string): number => {
			assert.isDefined(value, `${CLI_TS_REPO_KEY}: ${name}`);
			return value;
		};
		for (const label of ['oxfmt']) {
			const npm = (metric: 'wall_ms' | 'cpu_ms') =>
				defined(cli_ratio_vs_tsv_npm(CLI_TS_REPO_KEY, label, metric), `${label} ${metric}`);
			const bare = (metric: 'wall_ms' | 'cpu_ms') =>
				defined(cli_ratio_vs_tsv(CLI_TS_REPO_KEY, label, metric), `${label} ${metric}`);
			assert.isAbove(
				npm('cpu_ms'),
				npm('wall_ms'),
				`${label}: like for like, CPU lead > wall lead`
			);
			assert.isAbove(
				bare('wall_ms'),
				bare('cpu_ms'),
				`${label}: bare binary, wall lead > CPU lead`
			);
			assert.isAtMost(npm('cpu_ms'), bare('cpu_ms'), `${label}: dispatcher CPU lead > bare`);
			// every one of the four renders inside a "~Nx faster than" sentence, and
			// `format_ratio_approx` is direction-blind, so each must also clear 1 — the
			// wall-clock dispatcher ratio is gated above, the other three here
			for (const [ratio, name] of [
				[npm('cpu_ms'), 'dispatcher cpu_ms'],
				[bare('wall_ms'), 'bare wall_ms'],
				[bare('cpu_ms'), 'bare cpu_ms']
			] as const) {
				assert_reads_faster(ratio, `${label}: ${name}`);
			}
		}
		// "even Prettier's CPU time exceeds its wall-clock time"
		for (const key of [CLI_SINGLE_FILE_KEY, CLI_TS_REPO_KEY]) {
			const prettier = cli_scenario_find(key)?.results.find((r) => r.label === 'prettier');
			assert(prettier, `${key} has no prettier row`);
			assert.isAbove(prettier.cpu_ms, prettier.wall_ms, `${key}: prettier CPU > wall`);
		}
	});

	test('the Node launch floor sits inside the dispatcher overhead', () => {
		// "a bare node -e '' takes ~N ms on this machine": Node's startup is one part
		// of what the dispatcher row pays over the bare binary, so it must not exceed
		// that gap — a floor above the overhead would mean the two measure different
		// things (a different node, a different PATH)
		const floor = cli_node_startup_ms();
		const overhead = cli_tsv_npm_overhead_ms_range();
		assert.isDefined(overhead);
		assert.isAbove(floor, 0);
		assert.isBelow(floor, overhead.max);
		// "Most of that is Node's own startup"
		assert.isAbove(floor, overhead.max / 2);
	});

	test('the dispatcher overhead is the "fixed" cost the CLI note calls it', () => {
		// "tsv's dispatcher adds a fixed ~N ms over the bare binary" — fixed means the
		// absolute figure barely moves between a one-file run and a repo, so the span
		// must stay tight around a positive cost
		const overhead = cli_tsv_npm_overhead_ms_range();
		assert.isDefined(overhead);
		assert.isAbove(overhead.min, 0);
		assert.isAtMost(overhead.max, overhead.min * 1.25, 'the dispatcher cost is not fixed');
	});

	test('the scenario descriptions state facts the report carries', () => {
		// the Svelte abort context: "rsvelte-fmt 0.7.x can abort when its stdout and stderr share a pipe"
		const rsvelte_version = benchmarks_cli.versions['rsvelte-fmt'];
		assert.isDefined(rsvelte_version);
		assert.match(rsvelte_version, /^0\.7\./, 'the Svelte copy names rsvelte-fmt 0.7.x');
	});

	test('the delivery caption places the wasm row among the single-file tools', () => {
		// "still finishes well ahead of both Prettier rows in the single-file table, but
		// behind Oxfmt and Biome" —
		// the delivery and single-file scenarios time the same file (the shape test
		// holds them to one corpus revision), so the wasm row reads against the other
		// tools' single-file times across the two tables
		const wasm = cli_scenario_find(CLI_DELIVERY_KEY)?.results.find(
			(r) => r.label === CLI_TSV_WASM_LABEL
		);
		assert(wasm, `${CLI_DELIVERY_KEY} has no ${CLI_TSV_WASM_LABEL} row`);
		const single = cli_scenario_find(CLI_SINGLE_FILE_KEY);
		assert(single, `no generated scenario has id "${CLI_SINGLE_FILE_KEY}"`);
		const wall = (label: string): number => {
			const row = single.results.find((r) => r.label === label);
			assert(row, `${CLI_SINGLE_FILE_KEY} has no ${label} row`);
			return row.wall_ms;
		};
		for (const label of ['prettier', 'prettier + oxc-parser']) {
			assert.isAbove(
				wall(label),
				wasm.wall_ms * 2,
				`${label}: the wasm row is no longer well ahead`
			);
		}
		for (const label of ['oxfmt', 'biome']) {
			assert.isBelow(wall(label), wasm.wall_ms, `${label}: the wasm row is no longer behind`);
		}
	});

	test('the CPU-work column counts system time, as the note says', () => {
		// "hyperfine's user plus system time" — a refresh that drops either half
		// would relabel a different metric under the same heading
		const scenario = benchmarks_formatters_json.scenarios.find((s) => s.id === CLI_TS_REPO_KEY);
		assert(scenario, `no generated scenario has id "${CLI_TS_REPO_KEY}"`);
		const tsv = scenario.timings.find((t) => t.name === 'tsv');
		assert(tsv);
		assert.isAbove(tsv.system_ms, 0);
		assert.closeTo(
			cli_scenario_find(CLI_TS_REPO_KEY)!.results.find((r) => r.label === 'tsv')!.cpu_ms,
			tsv.user_ms + tsv.system_ms,
			1e-9
		);
	});

	test('the corpus figures the Corpus section quotes resolve', () => {
		// the page has no fallback copy for them
		const counts = derive_corpus_counts(benchmarks_json);
		assert.isAbove(counts.harvested_css, 0);
		assert(counts.standalone_css !== undefined);
		assert.isAbove(counts.standalone_css, 0);
	});

	test("the parse note on oxc-parser's wasm row running an older release reads the report", () => {
		// "oxc-parser's wasm row runs an older release than its native row ... so the wasm-vs-wasm
		// pairing crosses oxc versions" — the bindings re-aligning makes the note a fiction
		const { versions } = benchmarks_json;
		assert.isDefined(versions.oxc_parser_wasm);
		assert.notStrictEqual(versions.oxc_parser_wasm, versions.oxc_parser, 'bindings re-aligned');
	});

	test('Prettier is a slow row in every format group, as Benchmarking details says', () => {
		// "fewer than twice the floor's sweeps. Prettier ... is among them in each format
		// group" — the list beneath renders from `derive_slow_row_groups`, so only this
		// lead-in is prose
		assert.strictEqual(SLOW_ROW_FLOOR_MULTIPLE, 2, 'the copy says "twice"');
		const slow = derive_slow_row_groups(benchmarks_json);
		assert.isNotEmpty(slow);
		const groups = format_groups();
		for (const group of groups) {
			const key = `${group.operation}/${group.language}`;
			const entry = slow.find((g) => g.group === key);
			assert(entry?.names.includes('prettier'), `${key}: prettier is not a slow row`);
		}
	});

	test('the cross-runtime noise check reads "a row\'s few passes"', () => {
		// the Cross-runtime section's caveat: each side's noise is the spread of the
		// row's pass means, a thin estimate, not a sweep-level cv over many timings
		const { passes } = derive_sweep_stats(benchmarks_json);
		assert.isDefined(passes);
		assert.isAtMost(passes, 5);
		for (const cell of benchmarks_cross_runtime_json.within_noise) {
			const key = `${cell.group}/${cell.name}`;
			assert.deepStrictEqual(cell.basis, ['passes', 'passes'], key);
		}
	});

	test('every row is timed against one floor and one pass count, as Benchmarking details says', () => {
		// the prose quotes a single per-pass floor and pass count for every row
		const timed = benchmarks_json.entries.filter((e) => e.min_iterations != null);
		assert.isNotEmpty(timed);
		const { floor, passes } = derive_sweep_stats(benchmarks_json);
		for (const entry of timed) {
			const key = `${entry.group}/${entry.name}`;
			assert.strictEqual(entry.min_iterations, floor, key);
			assert.strictEqual(entry.passes, passes, key);
		}
	});

	test('the corpus repos the Corpus section names are present', () => {
		// "the fuz.dev ecosystem ... and upstream framework source (Svelte, SvelteKit, and
		// the svelte.dev site)" — gate the names so the sentence can't outlive the corpus
		const slugs = new Set(
			(benchmarks_json.corpus_sources ?? []).map((s) => s.repo?.slug).filter(Boolean)
		);
		for (const slug of ['sveltejs/svelte', 'sveltejs/kit', 'sveltejs/svelte.dev']) {
			assert.ok(slugs.has(slug), `the page names ${slug} but the corpus lacks it`);
		}
		assert.ok(
			[...slugs].some((slug) => slug?.startsWith('fuzdev/')),
			'the page names the fuz.dev repos but the corpus has none'
		);
	});

	test("the corpus mixes the author's code with third-party code, as the tldr and Corpus section say", () => {
		// the Corpus section quotes each language's third-party share, so every language
		// the report times needs some of each
		const shares = derive_corpus_origin_shares(benchmarks_json);
		assert.ok(shares, 'the report records no corpus_by_origin');
		assert.isNotEmpty(shares);
		for (const { language, third_party_share } of shares) {
			assert.isAbove(third_party_share, 0, `${language} has no third-party code`);
			assert.isBelow(third_party_share, 1, `${language} has none of the author's code`);
		}
	});
});
