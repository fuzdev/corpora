<script lang="ts">
	// the classes this page's components share, which scoped `<style>` can't reach
	// across — imported here so they ship with this route, not with every one
	import './benchmarks.css';

	import { page } from '$app/state';
	import Details from '@fuzdev/fuz_ui/Details.svelte';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { DOCS_PATH, docs_slugify } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	import { benchmarks_json } from './benchmarks.ts';
	import { benchmarks_cross_runtime_json } from './benchmarks_cross_runtime.ts';
	import { derive_runtime_leads } from './benchmark_cross_runtime.ts';
	import {
		benchmarks_cli,
		cli_scenario_find,
		cli_ratio_vs_tsv,
		cli_ratio_vs_tsv_npm,
		CLI_TS_REPO_KEY,
		CLI_SVELTE_KEY
	} from './benchmarks_cli.ts';
	import {
		benchmark_speedup,
		benchmark_time_share_beyond,
		corpus_repo_ref_commit,
		corpus_repo_ref_url,
		CORPUS_SOURCE_LABELS,
		derive_benchmark_groups,
		derive_corpus_counts,
		derive_corpus_origin_shares,
		derive_corpus_source_table,
		derive_slow_row_groups,
		derive_sweep_stats,
		derive_unstable_entries,
		entry_instability,
		parse_group_key,
		UNSTABLE_PASS_SPREAD_THRESHOLD
	} from './benchmark_data.ts';
	import {
		format_count,
		format_count_maybe,
		format_group_label,
		format_language,
		format_list_and,
		format_ratio_approx,
		format_runtime_display,
		format_runtime_name,
		format_share_approx,
		format_share_ceil,
		format_unstable_readings
	} from './benchmark_display.ts';
	// the size-chart row names the notes below refer to, from the module that
	// builds the rows, so prose and chart can't drift apart
	import {
		derive_size_targets,
		OXC_FULL_LABEL,
		OXFMT_NATIVE_LABEL,
		RSVELTE_LABEL
	} from './benchmark_sizes.ts';
	import { derive_tool_matrix } from './benchmark_tools.ts';
	import { IN_PROCESS_PAIRS, type InProcessPairKey } from './benchmarks_prose.ts';
	import BenchmarksGroup from './BenchmarksGroup.svelte';
	import BenchmarksSizes from './BenchmarksSizes.svelte';
	import BenchmarksMeta from './BenchmarksMeta.svelte';
	import BenchmarksCorpus from './BenchmarksCorpus.svelte';
	import BenchmarksCrossRuntime from './BenchmarksCrossRuntime.svelte';
	import BenchmarksCliSection from './BenchmarksCliSection.svelte';
	import BenchmarksTools from './BenchmarksTools.svelte';

	const LIBRARY_ITEM_NAME = 'benchmarks';

	const tome = tome_get_by_slug(LIBRARY_ITEM_NAME);

	// the `/docs` index renders every tome, so there this one is a link, as the playground's is
	const at_root = $derived(page.url.pathname === DOCS_PATH);

	// Section titles referenced by in-page anchors, slugified the same way
	// `TomeSectionHeader` builds its ids so a rename can't orphan a link.
	const LANGUAGE_SECTION_TITLE = 'Language support';
	const FORMAT_SECTION_TITLE = 'Format speed';
	const PARSE_SECTION_TITLE = 'Parse speed';
	const CLI_SECTION_TITLE = 'End-to-end CLI benchmark';
	const DETAILS_SECTION_TITLE = 'Benchmarking details';
	const CORPUS_SECTION_TITLE = 'Corpus';
	const CROSS_RUNTIME_SECTION_TITLE = 'Cross-runtime';

	// The benchmarked runtime and its version, read from the report itself so the
	// prose tracks each data refresh.
	const node_display = format_runtime_display(benchmarks_json);

	const groups = derive_benchmark_groups(benchmarks_json);
	// what each tool parses and formats, with the cells this page times marked from the reports
	const tool_matrix = derive_tool_matrix(benchmarks_json, benchmarks_cli);
	const size_targets = derive_size_targets(benchmarks_json.binary_sizes);
	const corpus = benchmarks_json.corpus;
	// Read off the report so the Corpus section's figures can't drift from the
	// copied data; the harvest is disclosed beside the file count rather than netted
	// out of it, and quoted only when the report distinguishes it.
	const corpus_counts = derive_corpus_counts(benchmarks_json);
	const corpus_source_table = derive_corpus_source_table(benchmarks_json, CORPUS_SOURCE_LABELS);
	// the one repo that vendors every source, linked at the commit the report measured
	const corpus_snapshot = benchmarks_json.corpus_snapshot;
	const corpus_snapshot_url = corpus_snapshot
		? corpus_repo_ref_url(corpus_snapshot)
		: 'https://github.com/fuzdev/corpora';
	const corpus_snapshot_commit = corpus_snapshot && corpus_repo_ref_commit(corpus_snapshot);
	// what share of each language's corpus the author didn't write (the shape test
	// requires the field)
	const corpus_origin_shares = derive_corpus_origin_shares(benchmarks_json);
	const corpus_third_party_shares =
		corpus_origin_shares &&
		format_list_and(
			corpus_origin_shares.map(
				(s) => `~${format_share_approx(s.third_party_share)} of the ${format_language(s.language)}`
			)
		);
	// The rows the report itself flagged as unstable (see `is_entry_unstable`) —
	// disclosed above the format charts, since every ratio through one divides its mean.
	const unstable_entries = derive_unstable_entries(benchmarks_json);
	const format_groups = groups.filter((g) => g.operation === 'format');
	const parse_groups = groups.filter((g) => g.operation === 'parse');
	// How many timed sweeps stand behind each row: the bench's per-pass floor, the
	// passes, and the span of cleaned counts it actually kept — the slow rows stop near
	// the floor in each pass, so a quiet cv there rests on a few dozen timings.
	// (the shape tests require every timed row to carry the fields; the `—`
	// fallback keeps a report without them readable)
	const sweeps = derive_sweep_stats(benchmarks_json);
	// which rows run near that floor, read off the report so the list can't go stale
	const slow_row_groups = derive_slow_row_groups(benchmarks_json);
	// how far two fresh processes of one row sat apart — the bound a small ratio is read against
	const process_noise = benchmarks_json.process_noise ?? undefined;

	// Every ratio the TLDR and the section notes quote, computed from the same
	// reports the charts render so the prose can't drift from them. The pairings and
	// their directions live in `benchmarks_prose.ts`, which the prose test gates.
	const speedup = (key: InProcessPairKey) => {
		const [group, slower, faster] = IN_PROCESS_PAIRS[key];
		return format_ratio_approx(benchmark_speedup(benchmarks_json, group, slower, faster));
	};
	// ` (N% instability)` beside a ratio that divides an unstable row, the worst
	// reading of its two; empty while both are stable. Only the pairs in
	// `INSTABILITY_NOTED` carry a slot, which the prose test enforces.
	const instability_note = (key: InProcessPairKey): string => {
		const [group, ...names] = IN_PROCESS_PAIRS[key];
		const worst = Math.max(
			0,
			...names.map((name) => {
				const entry = benchmarks_json.entries.find((e) => e.group === group && e.name === name);
				return (entry && entry_instability(entry)) ?? 0;
			})
		);
		return worst > 0 ? ` (${format_share_ceil(worst)} instability)` : '';
	};
	const format_ts_vs_oxfmt = speedup('format_ts_vs_oxfmt');
	const format_ts_vs_prettier = speedup('format_ts_vs_prettier');
	const format_ts_wasm_vs_prettier = speedup('format_ts_wasm_vs_prettier');
	const format_ts_vs_biome = speedup('format_ts_vs_biome');
	const format_svelte_vs_prettier = speedup('format_svelte_vs_prettier');
	const format_svelte_wasm_vs_prettier = speedup('format_svelte_wasm_vs_prettier');
	const format_svelte_vs_biome = speedup('format_svelte_vs_biome');
	const format_css_vs_oxfmt = speedup('format_css_vs_oxfmt');
	const format_css_vs_prettier = speedup('format_css_vs_prettier');
	const format_css_wasm_vs_prettier = speedup('format_css_wasm_vs_prettier');
	const format_css_vs_biome = speedup('format_css_vs_biome');
	// tsv's default span-only wire against Oxc's span-only AST
	const parse_ts_vs_oxc = speedup('parse_ts_vs_oxc');
	// `{locations: true}` against the reference parser it's a drop-in for
	const parse_ts_vs_acorn = speedup('parse_ts_vs_acorn');
	// What `{locations: true}` costs over the default span-only wire, same engine.
	const parse_ts_loc_cost = speedup('parse_ts_loc_cost');
	const parse_ts_yuku_vs_tsv = speedup('parse_ts_yuku_vs_tsv');
	const parse_ts_oxc_raw_vs_tsv = speedup('parse_ts_oxc_raw_vs_tsv');
	const parse_ts_yuku_wasm_vs_tsv_wasm = speedup('parse_ts_yuku_wasm_vs_tsv_wasm');
	// Svelte pairs `{locations: true}`, whose `loc` is a superset of Svelte's own, with
	// the parsers that carry one (Svelte's, and rsvelte's, which emits the same wire);
	// CSS pairs the default wire with `parseCss`, which emits no `loc` either. CSS runs
	// against tsv, so those two are quoted in that direction.
	const parse_svelte_vs_compiler = speedup('parse_svelte_vs_compiler');
	const parse_svelte_default_vs_compiler = speedup('parse_svelte_default_vs_compiler');
	const parse_svelte_vs_rsvelte = speedup('parse_svelte_vs_rsvelte');
	const parse_css_compiler_vs_tsv = speedup('parse_css_compiler_vs_tsv');
	const parse_css_postcss_vs_tsv = speedup('parse_css_postcss_vs_tsv');
	// The JSON hand-off's share of tsv's CSS parse row: everything the JSON wire
	// costs beyond the internal row, which builds the same AST and stops.
	const parse_css_wire_share = format_share_approx(
		benchmark_time_share_beyond(benchmarks_json, 'parse/css', 'tsv', 'tsv-internal')
	);
	// The CSS claims above are the Node report's; where another runtime's `parseCss` is
	// slow enough that tsv's default parse overtakes it, the copy says so. A lead that
	// would print as ~1.0x is no lead.
	const css_runtime_leads = derive_runtime_leads(
		benchmarks_cross_runtime_json,
		'parse/css',
		'svelte/compiler',
		'tsv'
	).filter((lead) => format_ratio_approx(lead.ratio) !== '1.0x');
	const css_lead_runtimes = css_runtime_leads
		.map((lead) => format_runtime_name(lead.runtime))
		.join(' and ');
	// rsvelte's parse addon targets its own upstream Svelte, which can sit a release
	// apart from the pin the svelte/compiler row runs — said only while the two differ
	const svelte_version = benchmarks_json.versions.svelte;
	const rsvelte_svelte_target = benchmarks_json.versions.rsvelte_parse_svelte_target;

	// The end-to-end CLI claims the TLDR quotes, from the formatter-comparison report;
	// the CLI section computes its own. tsv through its Node dispatcher against the other
	// tools' npm bins is the like-for-like footing the claims lead with; the bare-binary
	// ratios follow as what the binary does without a Node launcher in front.
	const cli_npm_ratio = (scenario: string, label: string) =>
		format_ratio_approx(cli_ratio_vs_tsv_npm(scenario, label, 'wall_ms'));
	const cli_npm_ts_vs_oxfmt = cli_npm_ratio(CLI_TS_REPO_KEY, 'oxfmt');
	const cli_npm_ts_vs_biome = cli_npm_ratio(CLI_TS_REPO_KEY, 'biome');
	const cli_ts_wall_vs_oxfmt = format_ratio_approx(
		cli_ratio_vs_tsv(CLI_TS_REPO_KEY, 'oxfmt', 'wall_ms')
	);
	const cli_ts_wall_vs_biome = format_ratio_approx(
		cli_ratio_vs_tsv(CLI_TS_REPO_KEY, 'biome', 'wall_ms')
	);
	// The Svelte head-to-head is published aborted if rsvelte-fmt crashes in the
	// harness, so its ratios can be absent while the scenario itself is present —
	// the prose covers both cases, gated on the very ratio the sentence quotes so
	// the two can't disagree.
	const cli_svelte = cli_scenario_find(CLI_SVELTE_KEY);
	const cli_svelte_npm_ratio = cli_ratio_vs_tsv_npm(CLI_SVELTE_KEY, 'rsvelte-fmt', 'wall_ms');
	const cli_svelte_timed = cli_svelte_npm_ratio !== undefined;
	const cli_svelte_npm_wall = format_ratio_approx(cli_svelte_npm_ratio);
</script>

<TomeContent {tome}>
	{#if at_root}
		<section>
			<p>
				The <TomeLink slug="benchmarks" /> compare tsv's speed and size with Prettier, Oxc, Biome,
				and others.
			</p>
		</section>
	{:else}
		<section>
			<p>
				tsv is a Rust toolchain for parsing and formatting TypeScript/JS, CSS, and Svelte
				(<a href="https://github.com/fuzdev/tsv">source code</a>). Its formatter closely follows
				<a href="https://prettier.io/">Prettier</a> and borrows its architectural patterns, and
				we're grateful for the hard work of Prettier's
				<a href="https://github.com/prettier/prettier/graphs/contributors">contributors</a>. After
				correctness, tsv prioritizes performance and efficiency: this page measures its speed and
				size on real-world code, and the <TomeLink slug="conformance" /> page compares parser
				coverage on edge-case test suites.
			</p>
			<p>
				This page compares tsv to Prettier and the JS parsers it can replace (Svelte's and
				acorn-typescript), and to Oxc and Biome, similar tools with more features, configurable
				styles, and wider language support. It also measures rsvelte, yuku-parser, swc, dprint,
				Malva, markup_fmt, and PostCSS;
				<a href="#{docs_slugify(LANGUAGE_SECTION_TITLE)}">{LANGUAGE_SECTION_TITLE}</a> lays out what
				each parses and formats.
			</p>
		</section>

		<TomeSection>
			<TomeSectionHeader text="tldr" />
			<p>
				tsv formats its three languages faster than Oxc and Biome in every in-process pairing here,
				and its CLI outpaces theirs using less memory in every shared scenario. Its artifacts are
				smaller than theirs too, except against oxc-parser's native build, since tsv publishes no
				native parse-only build yet.
			</p>
			<p>
				Except in the CLI section, every timing here is in-process and one file at a time, isolating
				engine speed from multi-core parallelism. The corpus is {format_count(corpus_counts.files)}
				files of real-world code, the author's own plus framework source, third-party libraries, and
				widely benchmarked TypeScript (see
				<a href="#{docs_slugify(CORPUS_SECTION_TITLE)}">Corpus</a>), timed under {node_display}.
			</p>
			<ul>
				<li>
					Formatting TypeScript, tsv is ~{format_ts_vs_oxfmt} faster than Oxfmt (native-vs-native),
					~{format_ts_vs_prettier} faster than Prettier (native Rust vs Prettier's JS;
					~{format_ts_wasm_vs_prettier} as wasm), and ~{format_ts_vs_biome} faster than Biome
					(wasm-vs-wasm).
				</li>
				<li>
					Formatting Svelte, tsv is ~{format_svelte_vs_prettier} faster than Prettier
					(~{format_svelte_wasm_vs_prettier} as wasm) and ~{format_svelte_vs_biome} faster than
					Biome (wasm-vs-wasm), and rsvelte currently has no in-process API.
				</li>
				<li>
					Formatting CSS, tsv is ~{format_css_vs_oxfmt} faster than Oxfmt (native-vs-native),
					~{format_css_vs_prettier} faster than Prettier (~{format_css_wasm_vs_prettier} as wasm),
					and ~{format_css_vs_biome} faster than Biome (wasm-vs-wasm).
				</li>
				<li>
					Parsing TypeScript to its default span-only AST (offsets only, like Oxc's), tsv is
					natively ~{parse_ts_vs_oxc} faster than oxc-parser's default JSON transfer, but
					~{parse_ts_oxc_raw_vs_tsv} slower than its raw
					transfer{instability_note('parse_ts_oxc_raw_vs_tsv')} and ~{parse_ts_yuku_vs_tsv} slower
					than yuku-parser (~{parse_ts_yuku_wasm_vs_tsv_wasm} as wasm; see
					<a href="#{docs_slugify(PARSE_SECTION_TITLE)}">{PARSE_SECTION_TITLE}</a>). With
					<code>{'{locations: true}'}</code>, which adds acorn's per-node line/column
					<code>loc</code>, it is ~{parse_ts_vs_acorn} faster than acorn-typescript, the parser it
					can replace, and still ahead of oxc-parser's JSON path and swc, whose ASTs carry none.
				</li>
				<li>
					Parsing Svelte with <code>{'{locations: true}'}</code>, whose <code>loc</code> is a
					superset of Svelte's own, tsv is ~{parse_svelte_vs_compiler} faster than svelte/compiler
					(JS) and ~{parse_svelte_vs_rsvelte} faster than rsvelte (native-vs-native); its default
					span-only AST is ~{parse_svelte_default_vs_compiler} faster than svelte/compiler.
				</li>
				<li>
					Parsing CSS runs the other way, largely because Svelte has a lower fidelity CSS AST which
					tsv parses to more spec-faithful granularity: Svelte's own <code>parseCss</code> is
					~{parse_css_compiler_vs_tsv} faster than tsv's default parse, and PostCSS
					~{parse_css_postcss_vs_tsv} faster (see
					<a href="#{docs_slugify(PARSE_SECTION_TITLE)}">{PARSE_SECTION_TITLE}</a>).
					{#each css_runtime_leads as lead (lead.runtime)}
						Under {format_runtime_name(lead.runtime)} it flips: tsv's default parse leads
						<code>parseCss</code> by ~{format_ratio_approx(lead.ratio)}, with <code>parseCss</code>
						~{format_ratio_approx(lead.slower_vs_base)} slower there than under Node.
					{/each}
				</li>
				<li>
					End to end as a CLI, tsv formats the JSX-free subset of a real TypeScript repo
					~{cli_npm_ts_vs_oxfmt} faster than Oxfmt and ~{cli_npm_ts_vs_biome} faster than Biome
					(~{cli_ts_wall_vs_oxfmt} and ~{cli_ts_wall_vs_biome} as the bare binary, without Node in
					front), using less memory than either. These are wall-clock ratios, so they include each
					tool's multi-file parallelism (see
					<a href="#{docs_slugify(CLI_SECTION_TITLE)}">the CLI section</a>).
				</li>
				{#if cli_svelte_timed}
					<li>
						On a third-party Svelte corpus, tsv's CLI, again through its Node bin, is
						~{cli_svelte_npm_wall} faster than rsvelte-fmt, another Rust Svelte formatter.
					</li>
				{/if}
			</ul>
		</TomeSection>

		<TomeSection>
			<TomeSectionHeader text={LANGUAGE_SECTION_TITLE} />
			<p>
				Support matrix for <strong>P</strong>arsers and <strong>F</strong>ormatters
				(<strong>bold</strong> is timed on this page, <span class="text_40">faded</span> is
				supported but not timed):
			</p>
			<BenchmarksTools rows={tool_matrix} />
		</TomeSection>

		<TomeSection>
			<TomeSectionHeader text={FORMAT_SECTION_TITLE} />
			<p>
				Each chart's ratios are relative to its highlighted row, and a negative ratio means that
				many times worse. Hover another row to compare against it instead.
			</p>
			{#if unstable_entries.length}
				<aside class="benchmarks-warning">
					⚠ Some rows in the {node_display} report were not measured stably, so the ratios through
					them are unreliable:
					<ul>
						{#each unstable_entries as entry (entry.group + '/' + entry.name)}
							<li>
								<code>{entry.group}/{entry.name}</code> — {format_unstable_readings(entry)}
							</li>
						{/each}
					</ul>
					Drift is a change in a row's cost while it was being measured, which the cleaned
					coefficient of variation (cv) cannot see. Negative drift means the row got faster (still
					warming up); positive, slower (degrading). Pass spread is how far the row's passes, each
					timed in a fresh process, sat apart: a level that depends on the process. The mean
					published for such a row may sit between two levels.
				</aside>
			{/if}
			{#each format_groups as group (group.language)}
				<BenchmarksGroup {group} />
			{/each}
			<aside>
				<p>Notes:</p>
				<ul>
					<li>
						Each format row times the tool's own parse too: source in, formatted text out.
						Wasm-vs-wasm and native-vs-native (N-API here) are the like-for-like pairings, and the
						<code>tsv-wasm</code> rows run the full parse+format build, not the smaller format-only
						or parse-only ones.
					</li>
					<li>
						Every formatter is pinned to tsv's fixed style (width 100, tabs, single quotes, no
						trailing commas) in its own option dialect, so each row does comparable layout work; the
						harness spot-checks the pins at startup. Nothing grades output against an oracle: the
						bench checks that output is non-empty and that tsv's native and wasm builds agree byte
						for byte. tsv's own output is checked against Prettier's in
						<a href="https://github.com/fuzdev/tsv/blob/main/docs/conformance_prettier.md">
							its repo's conformance gates
						</a>.
					</li>
					<li>
						Every tool that takes a filename gets a synthetic one (<code>file.ts</code>,
						<code>file.css</code>, <code>file.svelte</code>), so every row, Prettier's included,
						formats the corpus's <code>.js</code> files as TypeScript. A real Prettier run would
						hand <code>.js</code> to its Babel parser; which way that moves Prettier's time is
						unmeasured.
					</li>
					<li>
						Oxfmt formats TypeScript, JS, and CSS with its own native engine but delegates Svelte to
						its bundled Prettier and
						<a href="https://github.com/sveltejs/prettier-plugin-svelte">prettier-plugin-svelte</a>:
						only the embedded <code>&lt;script&gt;</code> reaches its native engine, while the
						markup, its expressions, and the <code>&lt;style&gt;</code> are that Prettier's.
					</li>
					<li>
						Biome has no dedicated Svelte formatter: its Svelte row runs with
						<code>html.experimentalFullSupportEnabled</code>, the experimental HTML-superset
						pipeline that formats the markup, script, and style. Its rows also carry two costs
						beyond formatting: <code>formatContent</code>, the only format entry point in its
						in-process API (<code>@biomejs/js-api</code>), opens the file in its workspace, pulls
						syntax diagnostics, and closes it on every call; and since that workspace frees no
						memory, the harness swaps in a fresh wasm instance before every TypeScript and Svelte
						sweep (every few on CSS), at a few percent of each sweep. There's no native Biome entry:
						that API runs only on Biome's wasm builds, and the native engine ships only as the
						<code>biome</code> CLI, which the
						<a href="#{docs_slugify(CLI_SECTION_TITLE)}">CLI section</a> times.
					</li>
					<li>
						The dprint entry is
						<a href="https://dprint.dev/plugins/typescript/">dprint-plugin-typescript</a>, the
						engine <code>deno fmt</code> runs for TypeScript and JS, loaded in-process as its wasm
						plugin. It formats only TypeScript and JS, JSX included, so its CSS slot goes to
						<a href="https://github.com/g-plane/malva">Malva</a>, a third-party CSS plugin for the
						same host, and its Svelte slot to markup_fmt (next).
					</li>
					<li>
						<a href="https://github.com/g-plane/markup_fmt">markup_fmt</a>, Malva's author's markup
						plugin for the same host, formats Svelte, handing each component's script, style, and
						template expressions to the dprint and Malva plugins. It isn't timed: it rejects valid
						Svelte this corpus holds, chiefly braces or markup inside a string in a template
						expression (a code sample passed as a prop, which most docs pages here do, or a literal
						brace written <code>{"{'{'}"}</code>) and <code>{'{…}'}</code> inside a quoted
						<code>style</code>. Every file a timed row rejects leaves every row's timed set, so
						timing it would drop the largest docs pages from every Svelte number on this page. The
						harness checks its coverage instead.
					</li>
					<li>
						<a href="https://github.com/baseballyama/rsvelte" rel="external">rsvelte-fmt</a>, the
						other Rust-native Svelte formatter here, is grayed out in the Svelte group: the harness
						runs it over every Svelte file to check coverage but doesn't time it, since it ships no
						in-process API and a process per file would measure spawn rather than formatting.
						{#if cli_svelte_timed}
							The <a href="#{docs_slugify(CLI_SECTION_TITLE)}">CLI section</a> times it.
						{:else if cli_svelte?.aborted}
							Its run in the <a href="#{docs_slugify(CLI_SECTION_TITLE)}">CLI section</a> is
							currently aborted rather than timed.
						{/if}
					</li>
				</ul>
			</aside>
		</TomeSection>

		<TomeSection>
			<TomeSectionHeader text={PARSE_SECTION_TITLE} />
			<p>
				The parsers here don't return the same output, so each ratio compares different amounts of
				work. They differ in how much position data each node carries (offsets only, or
				<code>loc</code> too), in how finely they break down CSS (<code>parseCss</code> and PostCSS
				keep more of it coarse than tsv does), and in what they collect beyond the tree (Oxc also
				gathers comments and module records). Each tool is compared against tsv's closest output,
				and the notes cover what still differs.
			</p>
			<p>
				tsv and <a href="https://oxc.rs/docs/guide/usage/parser">oxc-parser</a>, in its default
				mode, share a mechanism: both serialize the AST to JSON in Rust and hand it to the JS
				engine's <code>JSON.parse</code>, native and wasm alike. tsv is timed three ways:
			</p>
			<ul>
				<li>
					<code>tsv</code> / <code>tsv-wasm</code> is what the parsers return by default: a
					span-only AST (<code>start</code>/<code>end</code> offsets, no <code>loc</code>) of Oxc's
					kind. It is the closest comparison with oxc-parser but not an equal one: Oxc's AST also
					writes out default-valued fields tsv omits (<code>optional: false</code>,
					<code>decorators: []</code>, <code>typeAnnotation: null</code>), about a third more bytes,
					and its parse also collects comments and module records.
				</li>
				<li>
					<code>+locations</code> passes <code>{'{locations: true}'}</code>: the same parse with a
					<code>loc</code> (line/column) object on every node, rebuilt in JS from the offsets. That
					is acorn's shape on TypeScript, and on Svelte and CSS a superset of what their reference
					parsers carry. On the TypeScript corpus it takes ~{parse_ts_loc_cost} the time of the
					default.
				</li>
				<li>
					<code>internal</code> builds tsv's AST in Rust and stops: no serialization, nothing
					materialized in JS. These entries show raw engine speed. Their gap to the default entries
					is what serializing and handing off costs tsv, not a cross-tool comparison.
				</li>
			</ul>
			<p>
				<code>oxc-parser-raw</code> is the same native Oxc parse and the same tree, handed to JS
				through Oxc's experimental raw transfer instead: a shared buffer that generated JS
				deserializes into objects before the call returns, skipping the JSON. tsv ships no such
				path. Oxc supports it natively only, and not under Bun.
			</p>
			<p>
				yuku-parser, a JS/TS parser written in Zig, emits the same span-only AST as Oxc, so it too
				compares against tsv's default entries. It hands JS a compact binary buffer that decodes
				into objects when its <code>program</code> is read, so the bench reads it to time the same
				fully materialized result. swc's AST (a <code>Module</code> root with <code>span</code>
				offsets) matches neither of tsv's outputs.
			</p>
			{#each parse_groups as group (group.language)}
				<BenchmarksGroup {group} />
			{/each}
			<aside>
				<p>Notes:</p>
				<ul>
					<li>
						Parsers written in JS skip the Rust-to-JS serialization that tsv and oxc-parser's
						default JSON path pay for. On CSS the JSON hand-off is ~{parse_css_wire_share} of tsv's
						time (the gap between its default and <code>internal</code> entries), and Svelte's
						<code>parseCss</code> and PostCSS both finish ahead of tsv's default entries under Node.
						{#if css_runtime_leads.length}
							Under {css_lead_runtimes}, tsv overtakes <code>parseCss</code>; the
							<a href="#{docs_slugify(CROSS_RUNTIME_SECTION_TITLE)}">
								{CROSS_RUNTIME_SECTION_TITLE}
							</a>
							section has the per-runtime numbers.
						{/if}
						The CSS corpus is also the page's weakest sample (see
						<a href="#{docs_slugify(CORPUS_SECTION_TITLE)}">Corpus</a>), so those ratios are the
						least representative.
					</li>
					<li>
						Biome is grayed out across all three parse groups: its in-process API exposes no parse
						call, and the wasm workspace beneath it returns the syntax tree only as strings, not an
						AST to materialize and time. oxc-parser and swc are grayed out in the CSS group: Oxc
						formats CSS (in Oxfmt) and swc ships CSS tooling (<code>@swc/css</code>, which minifies
						and transforms), but neither ships a CSS parse binding.
					</li>
					<li>
						oxc-parser's wasm row runs an older release than its native row, so the wasm-vs-wasm
						pairing crosses Oxc versions (both listed under
						<a href="#{docs_slugify(DETAILS_SECTION_TITLE)}">{DETAILS_SECTION_TITLE}</a>).
					</li>
					<li>
						rsvelte's parser shares tsv's mechanism, a JSON string the caller
						<code>JSON.parse</code>s, but delivers Svelte's own AST: <code>loc</code> on the
						acorn-parsed nodes plus <code>name_loc</code>. So <code>rsvelte-parse</code> compares
						against the <code>+locations</code> entries, whose <code>loc</code> on every node is a
						superset of it, rather than the span-only default. Its second entry passes rsvelte's own
						<code>skipExpressionLoc</code>, which drops <code>loc</code> from every JS node but
						keeps <code>name_loc</code> and the comments' <code>loc</code>, so it sits near tsv's
						span-only output without matching it. rsvelte also has <code>parseEnvelope</code>, a
						binary path that skips the JSON, untimed here since it drops the
						<code>leadingComments</code> that <code>parse</code> returns.
						{#if rsvelte_svelte_target && rsvelte_svelte_target !== svelte_version}
							Its addon targets its own upstream Svelte, {rsvelte_svelte_target}, a release apart
							from the {svelte_version} the svelte/compiler row runs (both are listed under
							{DETAILS_SECTION_TITLE}).
						{/if}
					</li>
					<li>
						PostCSS is the base of Prettier's CSS parse, so it's the parse-side counterpart of the
						Prettier format entry; none of the Rust CSS tools here exposes a parse call. Its payload
						doesn't match tsv's: it keeps selectors as strings where <code>parseCss</code> and tsv
						parse them.
					</li>
				</ul>
			</aside>
		</TomeSection>

		<BenchmarksCliSection title={CLI_SECTION_TITLE} details_title={DETAILS_SECTION_TITLE} />

		<TomeSection>
			<TomeSectionHeader text="Binary size" />
			<p>
				The size of each tool's artifact, split by where it runs and grouped by what it does. Bars
				and ratios are raw bytes; the <code>gz</code> beside each estimates the download.
				<code>tsv-wasm</code>, <code>tsv (napi)</code>, and <code>tsv (ffi)</code> are tsv's full
				builds: parser and formatter for Svelte, TypeScript/JS, and CSS in one artifact. The
				format-only and parse-only builds are subsets of them.
			</p>
			<TomeSection>
				<TomeSectionHeader text="In the browser: wasm and JS" />
				<BenchmarksSizes groups={size_targets.browser} />
				<aside>
					<p>Notes:</p>
					<ul>
						<li>
							The <code>(js bundle)</code> entries are the reference toolchain — Prettier with
							prettier-plugin-svelte, and the parsers tsv can replace (Svelte's, plus acorn with
							acorn-typescript) — and aren't files any package ships. Each entry is a minified
							bundle of only what its job imports for tsv's three languages: what you would deploy
							to a browser, not what Node loads. The full entry is barely larger than the formatter,
							which already contains the whole parse bundle: prettier-plugin-svelte needs Svelte's
							parser, which pulls in acorn and acorn-typescript. Minified JS compresses much better
							than tsv's wasm, so beside it these entries look smaller by <code>gz</code> than by
							raw bytes.
						</li>
						<li>
							<code>dprint (wasm)</code>, <code>Malva (wasm)</code>, and
							<code>markup_fmt (wasm)</code> expose no parser, so all three sit under Formatter
							beside tsv's format-only wasm build. That build does Svelte, TypeScript/JS, and CSS in
							one artifact; Malva formats CSS and its dialects only, dprint TypeScript/JS and JSX
							only, and markup_fmt the markup of Svelte and other template languages, which needs
							the other two loaded beside it for a component's script and style.
						</li>
						<li>
							Biome's build carries its whole toolchain: parsers, formatters, and linters across the
							languages it supports, plus assists like import sorting, GritQL search and plugins,
							and a module graph. yuku-parser parses TypeScript, JS, JSX, and TSX only, where tsv's
							parse-only build beside it carries Svelte and CSS parsers too. Oxfmt ships no wasm
							build, hence its grayed-out slot under Formatter.
						</li>
					</ul>
				</aside>
			</TomeSection>
			<TomeSection>
				<TomeSectionHeader text="Native builds" />
				<BenchmarksSizes groups={size_targets.native} />
				<aside>
					<p>Notes:</p>
					<ul>
						<li>
							Every entry counts only artifact files, which undercounts tsv and the others alike.
							<code>{OXFMT_NATIVE_LABEL}</code> is its <code>.node</code> alone. That leaves out the
							package's JS that loads it, which includes a bundled Prettier (the one behind Oxfmt's
							Svelte path). <code>tsv (napi)</code> is likewise its <code>.node</code> alone:
							<a href="https://www.npmjs.com/package/@fuzdev/tsv"><code>@fuzdev/tsv</code></a> is a
							JS dispatcher over prebuilt per-platform packages, each of which also carries the
							<code>tsv</code> CLI binary. Installed, both are about twice their entries here.
						</li>
						<li>
							The <code>(ffi)</code> entries are tsv's C-ABI build, which isn't published: natively,
							tsv ships only its full N-API addon, which is why <code>tsv (napi)</code> also stands
							under Formatter and Parser. Read them as what the engine costs in that configuration,
							not as something you can install.
						</li>
						<li>
							The <code>{OXC_FULL_LABEL}</code> entry under Full toolchain sums Oxc's separate
							parser and formatter addons, since together they're the closest equivalent to tsv's
							single parse+format build. That sum is a little unfair to Oxc: Oxfmt statically links
							its own copy of the Oxc parser, so the two builds count the parser twice. The
							<code>oxfmt</code> addon also formats more languages than tsv, sorts imports, and
							bundles a language server and the CLI itself.
						</li>
						<li>
							<code>{RSVELTE_LABEL}</code> is a standalone executable carrying a CLI and Oxc's
							JS/TS, CSS, and JSON formatters beside its Svelte engine, where the tsv entries are
							bare libraries.
						</li>
						<li>
							<code>swc (napi)</code> and <code>rsvelte compiler (napi)</code> back parse rows but
							ship far more than a parser: swc's is an entire compiler (transforms, minifier,
							bundler), and rsvelte's carries the Svelte compiler plus svelte2tsx, HMR diffing and a
							resolver. Read them as what those addons ship, not as parser size.
						</li>
					</ul>
				</aside>
			</TomeSection>
		</TomeSection>

		<TomeSection>
			<TomeSectionHeader text={CROSS_RUNTIME_SECTION_TITLE} />
			<p>
				The same harness runs under three JS runtimes: Node, Deno, and Bun. The in-process charts
				above are the Node run, chosen as the default N-API host, not for speed. The native entry
				differs by runtime: Node and Bun load tsv's N-API addon; Deno loads its C-ABI library (the
				<code>(ffi)</code> build), which shares the addon's code but crosses a different binding
				boundary and is built differently. So a per-runtime delta on the same row comes from the JS
				engine, the host's N-API implementation, or that binding and build, not from tsv's
				algorithms.
			</p>
			<aside>
				<p>
					The <code>internal</code> rows cross the binding boundary but materialize nothing on the
					JS side, so a delta there is the boundary, each engine's hand-off of the source string
					into it, and for the wasm rows each engine's wasm compiler. The parse rows that
					materialize JSON add each engine's <code>JSON.parse</code> on top, and the
					<code>+locations</code> rows the JS walk that rebuilds <code>loc</code>.
				</p>
			</aside>
			<BenchmarksCrossRuntime report={benchmarks_cross_runtime_json} />
		</TomeSection>

		<TomeSection>
			<TomeSectionHeader text={DETAILS_SECTION_TITLE} />
			<p>
				Each row is the mean time per sweep, a pass over its group's timed file set. Within a group
				every tool is timed on the same files — the intersection of what every timed tool accepted,
				so a file one rejects drops out for everyone. The count above each chart is that
				intersection, and a chart that runs short of the corpus total says beneath it what was left
				out and which rows failed it.
			</p>
			<p>
				These are warm numbers: every row runs warmup sweeps before it is timed, so a cold one-shot
				call pays more. Each native or wasm call also pays a string encode across the binding
				boundary, and a decode wherever it hands back text or JSON, which the JS tools skip.
			</p>
			<p>
				Each row is timed in {format_count_maybe(sweeps.passes)} passes, and each pass runs until it
				has both a few seconds of sweeps and at least {format_count_maybe(sweeps.floor)} sweeps, so
				the slow rows stop at that floor in every pass. After outlier cleaning, rows keep from
				{format_count_maybe(sweeps.sample_size_min)} to {format_count_maybe(sweeps.sample_size_max)}
				timings across their passes. A steady reading over a few dozen sweeps is thinner evidence
				than one over hundreds, so the harness's check for unstable rows proves less for the slow
				rows, those that ran fewer than twice the floor's sweeps. Prettier, every format chart's
				default anchor, is among them in each format group:
			</p>
			<ul>
				{#each slow_row_groups as slow (slow.group)}
					{@const { operation, language } = parse_group_key(slow.group)}
					<li>
						{format_group_label(operation, language)}:
						{#if slow.every}
							every row
						{:else}
							{#each slow.names as name, i (name)}
								<span><code>{name}</code>{i < slow.names.length - 1 ? ', ' : ''}</span>
							{/each}
						{/if}
					</li>
				{/each}
			</ul>
			<p>
				Every pass of every row runs in a fresh process that loads that row's tool and nothing else,
				so no tool's code, garbage, or warmed-up state is shared with the next. Each pass takes a
				group's rows in a different order (forward, reversed, then rotated), so no row always runs
				right after the same one, and a row's number is the average of its passes. What no process
				boundary removes is the machine: nothing pins the process to a core or holds the laptop
				CPU's clock steady. Two fresh processes of the same row sat
				{format_share_ceil(process_noise?.median)} apart at the median and
				{format_share_ceil(process_noise?.p95)} at the 95th percentile in this run, so a ratio
				inside that isn't a difference the run measured. A row whose passes sat
				{format_share_ceil(UNSTABLE_PASS_SPREAD_THRESHOLD)} or more apart is flagged as unstable,
				and no row's timings shift more than {format_share_ceil(sweeps.drift_max)} from the first
				half of a pass to its second.
			</p>
			<p>
				One asymmetry isn't isolated. Oxfmt's programmatic <code>format</code> is async-only, so
				each call's timing includes an N-API task dispatch and a promise resolution that tsv's sync
				call doesn't pay. (Prettier's is async-only too, without the N-API hop.) Oxfmt's native work
				may also run off the JS thread: still one file at a time, since each call is awaited before
				the next, but not strictly one thread.
			</p>
			<BenchmarksMeta baseline={benchmarks_json} />
		</TomeSection>

		<TomeSection>
			<TomeSectionHeader text={CORPUS_SECTION_TITLE} />
			<p>
				Every in-process timing on this page comes from {format_count(corpus_counts.files)}
				<code>.svelte</code>, <code>.ts</code>/<code>.js</code>, and <code>.css</code> files of
				real-world code, vendored in the
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={corpus_snapshot_url}>
					fuzdev/corpora{corpus_snapshot_commit ? `@${corpus_snapshot_commit}` : ''}
				</a> snapshot so one clone reproduces it. They're the author's libraries, apps, and sites
				(the fuz.dev ecosystem plus personal SvelteKit projects), and upstream framework source
				(Svelte, SvelteKit, and the svelte.dev site), community Svelte libraries and tooling
				(Flowbite Svelte's components, LayerChart, Layer Cake, Svelte UX, svelte-maplibre, and
				Svelte's language tools), and TypeScript other formatter benchmarks compare on (TypeScript's
				own parser, Storybook, and Continue). By bytes, code the author didn't write is
				{corpus_third_party_shares}.
			</p>
			<ul>
				<li>
					Test files count as real code and stay in. Fixture files (formatter test suites, and
					fixture subtrees inside the measured repos) are out: deliberately tricky edge cases
					measure conformance, not typical throughput, and the <TomeLink slug="conformance" /> page
					covers them.
				</li>
				<li>
					Standalone CSS files are rare in this ecosystem, so the CSS set adds the
					<code>&lt;style&gt;</code> blocks of the corpus's Svelte components, concatenated per
					corpus
					collection{corpus_counts.harvested_css && corpus.css
						? ` — ${format_count(corpus_counts.harvested_css)} of its ${format_count(corpus.css)} entries`
						: ''}. Even so, CSS is the weakest sample, with just
					{format_count_maybe(corpus_counts.standalone_css)} standalone files.
				</li>
				<li>Read every ratio here as "on this corpus", not as a universal figure.</li>
			</ul>
			<Details eager summary="By source">
				<p>Each source links its upstream at the commit the snapshot vendored.</p>
				<BenchmarksCorpus table={corpus_source_table} />
			</Details>
		</TomeSection>

		<section>
			<p>
				tsv's numbers here are from builds without profile-guided optimization (PGO). PGO would make
				tsv faster but its binaries larger, and that size tradeoff has it on hold.
			</p>
		</section>
	{/if}
</TomeContent>
