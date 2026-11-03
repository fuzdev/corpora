import { assert, describe, test } from 'vitest';

import { benchmarks_json } from '#routes/docs/benchmarks/benchmarks.ts';
import { benchmarks_cross_runtime_json } from '#routes/docs/benchmarks/benchmarks_cross_runtime.ts';
import {
	CORPUS_SOURCE_LABELS,
	categorize_row,
	derive_corpus_source_table,
	derive_benchmark_groups
} from '#routes/docs/benchmarks/benchmark_data.ts';
import { UNTIMED_REASONS, VERSION_LABELS } from '#routes/docs/benchmarks/benchmark_display.ts';
import { conformance_json } from '#routes/docs/conformance/conformance.ts';
import { CONFORMANCE_SOURCE_LABELS } from '#routes/docs/conformance/conformance_data.ts';
import { categorize_size } from '#routes/docs/benchmarks/benchmark_sizes.ts';

import { REPORT_VERSION } from './benchmark_test_helpers.ts';

// Shape gate for the committed benchmarks.json: the bench report format drifts,
// and `benchmarks.ts` casts the JSON, so typechecking alone won't catch a renamed
// key — it renders as `undefined` instead.
// When `npm run update-benchmarks` pulls in a new shape, these fail loudly.
describe('benchmarks.json shape', () => {
	test('baseline version is current', () => {
		// pinned exactly: a bump in tsv's `REPORT_SCHEMA_VERSION` must be a deliberate
		// re-pin of `REPORT_VERSION`, after `benchmark_data.ts` gains the new fields' version-notes
		assert.strictEqual(benchmarks_json.version, REPORT_VERSION);
	});

	test('versions carries the keys the meta component renders', () => {
		const { versions } = benchmarks_json;
		assert.isString(versions.svelte);
		assert.isString(versions.acorn_ts);
		assert.isString(versions.prettier);
		assert.isString(versions.prettier_svelte);
	});

	test('omissions account for exactly what each timed set leaves out', () => {
		// every timed group is listed. Required rather than skipped when absent: the
		// producer also omits the field on a `BENCH_MODE=union` run, and a report copied
		// from one must fail here rather than switch the gate off
		const { omissions } = benchmarks_json;
		assert.isDefined(omissions, 'an intersection-mode perf report carries omissions');
		for (const group of derive_benchmark_groups(benchmarks_json)) {
			const key = `${group.operation}/${group.language}`;
			const reported = omissions.find((o) => o.group === key);
			assert.ok(reported, `${key} has no omissions entry`);
			// the timed set is the group's files minus the ones some timed row failed
			assert.strictEqual(
				reported.files_total - reported.omitted_files,
				group.files_iterated,
				`${key}: files_total − omitted_files is the timed set`
			);
			// no omit tolerates a failure of tsv's own — every one excuses a rival's gap
			for (const tool of reported.by_tool) {
				assert.notProperty(tool.categories, 'tsv_failure', `${key}/${tool.name}`);
				assert.notProperty(tool.categories, 'unlisted', `${key}/${tool.name}`);
			}
		}
	});

	test('corpus covers every benchmarked language', () => {
		for (const language of ['svelte', 'typescript', 'css']) {
			assert.isAbove(benchmarks_json.corpus[language] ?? 0, 0, language);
		}
	});

	test('every group leads with its canonical entry (the default anchor) and a timed-set count', () => {
		const groups = derive_benchmark_groups(benchmarks_json);
		assert.isAtLeast(groups.length, 6); // format+parse × svelte/typescript/css
		for (const group of groups) {
			const key = `${group.operation}/${group.language}`;
			assert.ok(group.canonical_entry, `${key} has no canonical entry`);
			// the canonical reference sorts first, so it's the default 1.0x anchor the
			// shared component reads off the leading row
			assert.strictEqual(group.entries[0]?.category, 'canonical', `${key} canonical leads`);
			assert.isNotNull(group.files_iterated, `${key} has no files_iterated`);
			// the timed set is the group's intersection, so every timed row saw the
			// same count — the one the chart heading quotes
			for (const entry of benchmarks_json.entries) {
				if (entry.group !== key || entry.files_iterated == null) continue;
				assert.strictEqual(entry.files_iterated, group.files_iterated, `${key}/${entry.name}`);
			}
			for (const entry of group.entries) {
				if (entry.disabled) continue;
				// measured entries render the whole-sweep mean (total corpus time); a
				// zero would misread as an instantaneous run
				assert.isAbove(entry.mean_ns, 0, `${key}/${entry.name} has no mean`);
			}
		}
	});

	test('the css parse group gets one disabled oxc placeholder, svelte none, typescript keeps real ones', () => {
		const groups = derive_benchmark_groups(benchmarks_json);
		const parse = (language: string) =>
			groups.find((g) => g.operation === 'parse' && g.language === language);

		// typescript actually runs oxc-parser — its oxc entries are real, not placeholders
		const ts = parse('typescript');
		const ts_oxc = ts?.entries.filter((e) => e.category === 'oxc') ?? [];
		assert.isNotEmpty(ts_oxc);
		for (const e of ts_oxc) assert.isNotOk(e.disabled, `${e.name} should be a real entry`);

		// a Svelte parser is nothing oxc claims, so that group holds no slot for it
		assert.isEmpty(parse('svelte')?.entries.filter((e) => e.category === 'oxc'));

		// css holds ONE disabled oxc slot — the tool, whatever bindings it has — in a
		// fixed slot: directly after the biome placeholder (both lead the cross-tool
		// comparisons, right after the canonical row), which the tier-order test below
		// holds ahead of tsv's json wires
		const group = parse('css');
		assert.ok(group, `css parse group missing`);
		const oxc = group.entries.filter((e) => e.category === 'oxc');
		assert.strictEqual(oxc.length, 1, `css oxc placeholder count`);
		for (const e of oxc) {
			assert.ok(e.disabled, `css ${e.name} should be disabled`);
			assert.strictEqual(e.bar_fraction, 0, `css ${e.name} bar`);
		}
		const names = group.entries.map((e) => e.name);
		const first_biome = names.findIndex((n) => n.includes('biome'));
		const first_oxc = names.findIndex((n) => n.includes('oxc'));
		assert.strictEqual(first_oxc, first_biome + 1, `css oxc directly after biome`);
	});

	test('yuku appears in the typescript parse group only, and is never mirrored elsewhere', () => {
		const groups = derive_benchmark_groups(benchmarks_json);

		// The page's yuku prose is unconditional, so the copied report must carry the
		// rows it describes — this failing means the report needs a refresh.
		const ts = groups.find((g) => g.operation === 'parse' && g.language === 'typescript');
		const ts_yuku = ts?.entries.filter((e) => e.category === 'yuku') ?? [];
		assert.isNotEmpty(ts_yuku, 'typescript parse must carry yuku rows');
		for (const e of ts_yuku) assert.isNotOk(e.disabled, `${e.name} should be a real entry`);

		// A grayed-out slot says a tool with WIDER scope is missing this language —
		// true of biome and oxc, not of a parser that claims nothing wider.
		for (const group of groups) {
			if (group.operation !== 'parse' || group.language === 'typescript') continue;
			assert.isEmpty(
				group.entries.filter((e) => e.category === 'yuku'),
				`${group.language} parse must hold no yuku slot`
			);
		}
	});

	test('every parse group gets a disabled biome placeholder, since biome never exposes a parser to JS', () => {
		const groups = derive_benchmark_groups(benchmarks_json);
		for (const language of ['svelte', 'typescript', 'css']) {
			const group = groups.find((g) => g.operation === 'parse' && g.language === language);
			assert.ok(group, `${language} parse group missing`);
			const biome = group.entries.filter((e) => e.category === 'biome');
			assert.strictEqual(biome.length, 1, `${language} biome placeholder count`);
			const [entry] = biome;
			assert.ok(entry, `${language} biome entry missing`);
			assert.ok(entry.disabled, `${language} biome entry should be disabled`);
			assert.strictEqual(entry.bar_fraction, 0, `${language} biome bar`);

			// biome leads the cross-tool comparisons: directly after the single canonical
			// row (index 0)
			const names = group.entries.map((e) => e.name);
			const first_biome = names.findIndex((n) => n.includes('biome'));
			assert.strictEqual(first_biome, 1, `${language} biome directly after the canonical row`);
		}
	});

	test('typescript keeps dprint and css keeps malva real; svelte gets no timed or placeholder dprint row', () => {
		const groups = derive_benchmark_groups(benchmarks_json);
		const format = (language: string) =>
			groups.find((g) => g.operation === 'format' && g.language === language);
		const dprint_rows = (language: string) =>
			format(language)?.entries.filter((e) => e.category === 'dprint') ?? [];

		// typescript actually runs dprint — its entry is real, not a placeholder
		// (the page's dprint note is unconditional, so the report must carry the row)
		const ts_dprint = dprint_rows('typescript');
		assert.isNotEmpty(ts_dprint, 'typescript format must carry a dprint row');
		for (const e of ts_dprint) assert.isNotOk(e.disabled, `${e.name} should be a real entry`);

		// css runs dprint's own CSS plugin, malva, through the same Wasm host — a REAL
		// row that shares dprint's category (see CATEGORY_BY_NAME), so css gets no
		// placeholder: the mirror only fills a group with no dprint-category entry
		const css_dprint = dprint_rows('css');
		assert.deepEqual(
			css_dprint.map((e) => e.name),
			['malva-wasm'],
			'css carries malva-wasm and no dprint placeholder'
		);
		for (const e of css_dprint) assert.isNotOk(e.disabled, `${e.name} should be a real entry`);

		// `@dprint/typescript` claims nothing about Svelte, so no slot is mirrored there;
		// the one dprint-category row svelte may carry is markup_fmt's, which is
		// coverage-only (never timed) — present once a report includes it
		for (const e of dprint_rows('svelte')) {
			assert.strictEqual(e.name, 'markup-fmt-wasm', `svelte holds no dprint slot but markup_fmt's`);
			assert.ok(e.coverage_only, `${e.name} should be coverage-only`);
		}

		// the dprint-category row sits directly after biome in the shared cross-tool
		// ordering
		for (const language of ['typescript', 'css']) {
			const names = format(language)!.entries.map((e) => e.name);
			const first_biome = names.findIndex((n) => n.includes('biome'));
			const first_dprint = names.findIndex((n) => n.includes('dprint') || n.includes('malva'));
			assert.strictEqual(
				first_dprint,
				first_biome + 1,
				`${language} dprint-category row directly after biome`
			);
		}
	});

	test('the coverage-only rsvelte-fmt row is inert but keeps its real coverage', () => {
		const groups = derive_benchmark_groups(benchmarks_json);
		const svelte_format = groups.find((g) => g.operation === 'format' && g.language === 'svelte');
		assert.ok(svelte_format, 'svelte format group missing');
		// the page's rsvelte-fmt note is unconditional, so the report must carry the row
		const rsvelte = svelte_format.entries.find((e) => e.name === 'rsvelte-fmt');
		assert.ok(rsvelte, 'svelte format must carry the rsvelte-fmt row');

		// Inert: no bar, and never the ratio anchor — it has no timing to anchor on.
		assert.ok(rsvelte.disabled, 'rsvelte-fmt should render inert');
		assert.ok(rsvelte.coverage_only, 'rsvelte-fmt should be flagged coverage-only');
		assert.strictEqual(rsvelte.bar_fraction, 0, 'rsvelte-fmt bar');

		// ...but unlike a plain placeholder it DID run, so its coverage is real.
		assert.isNumber(rsvelte.files_processed, 'rsvelte-fmt coverage should be present');
		assert.isNumber(rsvelte.files_total, 'rsvelte-fmt total should be present');

		// It must not have become the group's bar scale: an untimed row coerces to
		// mean_ns 0, so a regression that let it into `slowest` would silently
		// rescale every real bar in the group.
		const timed = svelte_format.entries.filter((e) => !e.disabled);
		assert.ok(
			timed.some((e) => e.bar_fraction === 1),
			'some timed row must still be the full-width bar'
		);

		// Only format/svelte carries it — it formats nothing else here.
		for (const group of groups) {
			if (group === svelte_format) continue;
			assert.isEmpty(
				group.entries.filter((e) => e.name === 'rsvelte-fmt'),
				`${group.operation}/${group.language} should carry no rsvelte-fmt row`
			);
		}
	});

	test('every coverage-only row states why it went untimed', () => {
		const untimed = derive_benchmark_groups(benchmarks_json)
			.flatMap((g) => g.entries)
			.filter((e) => e.coverage_only)
			.map((e) => e.name);
		for (const name of untimed) {
			assert.ok(name in UNTIMED_REASONS, `${name} needs an UNTIMED_REASONS entry`);
		}
		// and no reason outlives its row
		for (const name of Object.keys(UNTIMED_REASONS)) {
			assert.include(untimed, name, `UNTIMED_REASONS names ${name}, no coverage-only row`);
		}
	});

	test('format/parse rows follow the fixed canonical → biome → dprint → oxc → postcss → rsvelte → swc → yuku → json → internal order', () => {
		// independently mirrors the requested row order (`speed_entry_rank`) so a
		// regression in the derivation's comparator fails here
		const tier = (name: string, category: string): number => {
			if (category === 'canonical') return 0;
			if (category === 'biome') return 1;
			if (category === 'dprint') return 2;
			if (category === 'oxc') return 3;
			if (category === 'postcss') return 4;
			if (category === 'rsvelte') return 5;
			if (category === 'swc') return 6;
			if (category === 'yuku') return 7;
			if (category.endsWith('_json')) return name.endsWith('+locations') ? 9 : 8; // tsv json: span-only, then `+locations`
			return 10; // tsv's engine rows (`tsv`/`tsv-wasm` formatting, `-internal`)
		};
		for (const group of derive_benchmark_groups(benchmarks_json)) {
			const key = `${group.operation}/${group.language}`;
			const tiers = group.entries.map((e) => tier(e.name, e.category));
			assert.deepEqual(
				tiers,
				[...tiers].toSorted((a, b) => a - b),
				`${key} tier order`
			);
			// wasm precedes native within a tier
			for (let i = 1; i < group.entries.length; i++) {
				if (tiers[i] !== tiers[i - 1]) continue;
				const prev_wasm = group.entries[i - 1]!.name.includes('wasm');
				const curr_wasm = group.entries[i]!.name.includes('wasm');
				assert.isFalse(!prev_wasm && curr_wasm, `${key} native precedes wasm within a tier`);
			}
		}
	});

	test('flagship report is the node runtime', () => {
		// the headline detailed view switched to N-API under Node; guards against an
		// `update-benchmarks` that pulls the wrong runtime's sibling report
		assert.strictEqual(benchmarks_json.runtime, 'node');
	});

	test('the report records no binding disagreement, load failure, or ungraded output', () => {
		// each is `[]`/`{}` when healthy, and `benchmark_data.ts` calls a non-empty one a
		// bug in the producing bench — a load failure removes the impl's rows from the
		// charts with no placeholder, and a native/wasm disagreement means the byte-parity
		// claim is false. This is the gate, rather than a reviewer's eye on the copied
		// report's diff.
		assert.deepStrictEqual(benchmarks_json.variant_parity, []);
		assert.deepStrictEqual(benchmarks_json.unavailable, []);
		assert.deepStrictEqual(benchmarks_json.output_digest_ungraded, {});
		// the size table's composition disclosure: a build the bench expected but
		// didn't find on disk drops its row silently, and the page renders no note
		// for it, so an absent one has to fail here
		assert.deepStrictEqual(benchmarks_json.binary_sizes_absent ?? [], []);
	});

	test('every timed row carries the sweep counts the details prose quotes', () => {
		// `+page.svelte` reads the sweep floor and the cleaned sample-size span off
		// every timed entry; a report without them would print `Infinity` mid-sentence
		for (const entry of benchmarks_json.entries) {
			if (entry.mean_ns == null) continue;
			const label = `${entry.group}/${entry.name}`;
			assert.isAbove(entry.min_iterations ?? 0, 0, label);
			assert.isAbove(entry.sample_size ?? 0, 0, label);
		}
	});

	test('every report row and size label maps to an explicit category', () => {
		// `categorize_row` and `categorize_size` fall back to `'oxc'` for anything they
		// don't recognize, so a new upstream row would silently render in oxc's hue
		// rather than fail. Only the genuinely-oxc names may land on that fallback.
		for (const entry of benchmarks_json.entries) {
			assert.ok(
				categorize_row(entry.group, entry.name) !== 'oxc' ||
					entry.name.includes('oxc') ||
					entry.name === 'oxfmt',
				`${entry.group}/${entry.name} falls back to the oxc hue`
			);
		}
		for (const row of benchmarks_cross_runtime_json.rows) {
			assert.ok(
				categorize_row(row.group, row.name) !== 'oxc' ||
					row.name.includes('oxc') ||
					row.name === 'oxfmt',
				`${row.group}/${row.name} falls back to the oxc hue`
			);
		}
		for (const { label } of benchmarks_json.binary_sizes) {
			assert.ok(
				categorize_size(label) !== 'oxc' || label.startsWith('oxc') || label.startsWith('oxfmt'),
				`${label} falls back to the oxc hue`
			);
		}
	});
});

describe('corpus source tables over the committed reports', () => {
	const tables = [
		['benchmarks', derive_corpus_source_table(benchmarks_json, CORPUS_SOURCE_LABELS)],
		['conformance', derive_corpus_source_table(conformance_json, CONFORMANCE_SOURCE_LABELS)]
	] as const;

	test("the source rows sum to the report's own totals", () => {
		// the table prints both, so a source the report's totals count but its
		// `corpus_sources` dropped would show as a sum that doesn't add up
		for (const [name, table] of tables) {
			assert.isNotEmpty(table.rows, name);
			assert.strictEqual(
				table.rows.reduce((sum, row) => sum + row.files, 0),
				table.totals.files,
				name
			);
			table.languages.forEach((language, i) => {
				assert.strictEqual(
					table.rows.reduce((sum, row) => sum + (row.by_language[i] ?? 0), 0),
					table.totals.by_language[i],
					`${name} ${language}`
				);
			});
		}
	});

	test('no raw source path reaches readers', () => {
		for (const [name, table] of tables) {
			for (const row of table.rows) {
				assert.notStrictEqual(row.label, row.path, `${name} ${row.path} has no label`);
			}
		}
	});

	test('every hand-stated label names a source its report carries', () => {
		// a label for a source tsv dropped can never render
		const labeled = [
			['benchmarks', benchmarks_json, CORPUS_SOURCE_LABELS],
			['conformance', conformance_json, CONFORMANCE_SOURCE_LABELS]
		] as const;
		for (const [name, report, labels] of labeled) {
			const paths = new Set(report.corpus_sources.map((s) => s.path));
			for (const path of Object.keys(labels)) {
				assert.ok(paths.has(path), `${name}: "${path}" is labeled but no source carries it`);
			}
		}
	});

	test('rows read apart', () => {
		// svelte.dev contributes several subpaths of one repo, which the subpath splits
		for (const [name, table] of tables) {
			const keys = table.rows.map((row) => `${row.label} ${row.subpath ?? ''}`);
			assert.strictEqual(new Set(keys).size, keys.length, name);
		}
	});

	test('every perf source with a repo is pinned, as the Corpus section says', () => {
		// "each source below links its upstream at the commit the snapshot vendored"
		const [, table] = tables[0];
		for (const row of table.rows) {
			if (row.url) assert.isDefined(row.commit, row.path);
		}
		assert.isDefined(benchmarks_json.corpus_snapshot);
	});

	test('the perf report records its corpus by origin', () => {
		// the Corpus section's third-party shares render from it
		assert.isDefined(benchmarks_json.corpus_by_origin);
	});
});

describe('VERSION_LABELS', () => {
	test('every named key is one the report actually carries', () => {
		// a key the report dropped is a label that can never render, and one whose
		// bare name would otherwise have been shown hyphenated and wrong
		const keys = new Set([
			...Object.keys(benchmarks_json.versions),
			...Object.keys(conformance_json.versions)
		]);
		for (const key of Object.keys(VERSION_LABELS)) {
			assert.ok(keys.has(key), `"${key}" is named but no report carries it`);
		}
	});
});
