<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { docs_slugify } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	import { benchmarks_json } from './benchmarks.ts';
	import { benchmarks_conformance_json } from './benchmarks_conformance.ts';
	import { benchmarks_cross_runtime_json } from './benchmarks_cross_runtime.ts';
	import {
		benchmarks_cli,
		cli_memory_ratio_range,
		cli_speedup_vs_tsv,
		CLI_TS_REPO_KEY,
		CLI_SVELTE_KEY
	} from './benchmarks_cli.ts';
	import {
		benchmark_speedup,
		derive_benchmark_groups,
		derive_conformance_groups,
		derive_speedup_summary,
		format_corpus_source_files,
		format_ratio_approx,
		format_ratio_range,
		format_ratio_range_approx,
		corpus_source_url
	} from './benchmark_data.ts';
	import BenchmarksSummary from './BenchmarksSummary.svelte';
	import BenchmarksGroup from './BenchmarksGroup.svelte';
	import BenchmarksConformance from './BenchmarksConformance.svelte';
	import BenchmarksSizes from './BenchmarksSizes.svelte';
	import BenchmarksMeta from './BenchmarksMeta.svelte';
	import BenchmarksCrossRuntime from './BenchmarksCrossRuntime.svelte';
	import BenchmarksCli from './BenchmarksCli.svelte';

	const LIBRARY_ITEM_NAME = 'benchmarks';

	const tome = tome_get_by_slug(LIBRARY_ITEM_NAME);

	// Section titles referenced by in-page anchors, slugified the same way
	// `TomeSectionHeader` builds its ids so a rename can't orphan a link.
	const CLI_SECTION_TITLE = 'End-to-end CLI benchmark';
	const CROSS_RUNTIME_SECTION_TITLE = 'Cross-runtime';

	// The benchmarked runtime version and the report's date, read from the report
	// itself so the prose tracks each data refresh (the shape tests pin the
	// flagship report to node, so the "Node" label can't silently drift).
	const node_display = `Node${
		benchmarks_json.machine ? ` v${benchmarks_json.machine.runtime_version.split('.')[0]}` : ''
	}`;
	const report_month = new Date(benchmarks_json.timestamp).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric'
	});

	const groups = derive_benchmark_groups(benchmarks_json);
	const speedup_rows = derive_speedup_summary(groups);
	const conformance_groups = derive_conformance_groups(benchmarks_conformance_json);

	const corpus = $derived(benchmarks_json.corpus);
	// Derived from the report so the "What's measured" figure can't drift from the
	// copied data (the report carries per-language file counts, not bytes).
	const corpus_file_count = $derived(Object.values(corpus).reduce((sum, n) => sum + n, 0));
	const format_groups = groups.filter((g) => g.operation === 'format');
	const parse_groups = groups.filter((g) => g.operation === 'parse');

	// Every ratio the TLDR and the section notes quote, computed from the same
	// reports the charts render so the prose can't drift from them. Native-vs-native
	// pairs tsv with oxfmt, wasm-vs-wasm pairs tsv_wasm with biome-wasm; the parse
	// comparison uses tsv's span-only wire, the shape oxc-parser also emits.
	const speedup = (group: string, slower: string, faster: string) =>
		format_ratio_approx(benchmark_speedup(benchmarks_json, group, slower, faster));
	const format_ts_vs_oxfmt = speedup('format/typescript', 'oxfmt', 'tsv');
	const format_ts_vs_prettier = speedup('format/typescript', 'prettier', 'tsv');
	const format_ts_vs_biome = speedup('format/typescript', 'biome-wasm', 'tsv_wasm');
	const format_svelte_vs_prettier = speedup('format/svelte', 'prettier', 'tsv');
	const format_svelte_vs_biome = speedup('format/svelte', 'biome-wasm', 'tsv_wasm');
	const format_css_vs_oxfmt = speedup('format/css', 'oxfmt', 'tsv');
	const format_css_vs_biome = speedup('format/css', 'biome-wasm', 'tsv_wasm');
	const parse_ts_vs_oxc = speedup('parse/typescript', 'oxc-parser', 'tsv-json-no-locations');
	// The one entry that leads tsv's span-only wire, so the tldr quotes it in the
	// direction the data actually runs rather than only naming what tsv beats.
	const parse_ts_yuku_vs_tsv = speedup('parse/typescript', 'tsv-json-no-locations', 'yuku-parser');

	// The end-to-end CLI claims, from the formatter-comparison report.
	const cli_ts_wall_vs_oxfmt = format_ratio_approx(
		cli_speedup_vs_tsv(CLI_TS_REPO_KEY, 'oxfmt', 'wall_ms')
	);
	const cli_ts_cpu_vs_oxfmt = format_ratio_approx(
		cli_speedup_vs_tsv(CLI_TS_REPO_KEY, 'oxfmt', 'cpu_ms')
	);
	const cli_ts_wall_vs_biome = format_ratio_approx(
		cli_speedup_vs_tsv(CLI_TS_REPO_KEY, 'biome', 'wall_ms')
	);
	// scoped to the two tools the TLDR sentence names, so the range it quotes
	// is measured over exactly them (the full-span figure lives in the CLI section)
	const cli_ts_memory = cli_memory_ratio_range(CLI_TS_REPO_KEY, ['oxfmt', 'biome']);
	const cli_memory = cli_memory_ratio_range();
	// The Svelte head-to-head is absent until the harness README is regenerated
	// with it, so every claim about it is conditional on the data being present.
	const cli_svelte_wall = cli_speedup_vs_tsv(CLI_SVELTE_KEY, 'rsvelte-fmt', 'wall_ms');
	const cli_svelte_memory = cli_speedup_vs_tsv(CLI_SVELTE_KEY, 'rsvelte-fmt', 'memory_mb');
</script>

<TomeContent {tome}>
	<section>
		<p>
			tsv is a toolchain for TypeScript/JS, CSS, and Svelte in Rust. After correctness, performance
			is tsv's next priority. This page shows how it measures up against Prettier, which tsv closely
			follows, and against <a href="https://oxc.rs/">Oxc</a> and
			<a href="https://biomejs.dev/">Biome</a>, which are similar tools with wider language support
			(tsv doesn't support JSX/TSX/SCSS/etc). Also included for comparison:
			<a href="https://baseballyama.github.io/rsvelte/">rsvelte</a> (Svelte parser/formatter),
			<a href="https://yuku.fyi/">Yuku</a> (TypeScript/JS parser),
			<a href="https://swc.rs/">swc</a> (TypeScript/JS parser),
			<a href="https://dprint.dev/">dprint-typescript</a> (TypeScript/JS formatter),
			<a href="https://github.com/g-plane/malva">malva</a> (CSS formatter, dprint's CSS plugin), and
			<a href="https://postcss.org/">PostCSS</a>
			(CSS parser).
		</p>
	</section>

	<TomeSection>
		<TomeSectionHeader text="tldr" />
		<p>
			Compared to Oxc and Biome, tsv is faster, smaller, and uses less memory to parse and format
			its supported languages. This section has a prose summary; skip ahead for charts.
		</p>
		<p>
			The measurements on this page are single-threaded and in-process, where each tool parses or
			formats one file at a time (isolating engine speed from multi-core parallelism), measured over
			a large collection of real-world repos: {corpus_file_count.toLocaleString('en-US')} files
			including Svelte's official repos (svelte, kit, svelte.dev) and the
			<a href="https://github.com/fuzdev">fuz.dev repos</a>. On that basis:
		</p>
		<ul>
			<li>
				Formatting TypeScript, tsv is ~{format_ts_vs_oxfmt} faster than Oxfmt (native-vs-native),
				~{format_ts_vs_prettier} faster than Prettier (native Rust vs Prettier's JS), and
				~{format_ts_vs_biome} faster than Biome (wasm-vs-wasm).
			</li>
			<li>
				Formatting Svelte, tsv is ~{format_svelte_vs_prettier} faster than Prettier (which Oxfmt's
				Svelte path delegates to internally) and ~{format_svelte_vs_biome} faster than Biome.
			</li>
			<li>
				Formatting CSS, it's ~{format_css_vs_oxfmt} faster than Oxfmt and ~{format_css_vs_biome}
				faster than Biome.
			</li>
			<li>
				Parsing TypeScript to JSON, tsv is ~{parse_ts_vs_oxc} faster than Oxc, and
				~{parse_ts_yuku_vs_tsv} slower than yuku-parser, which hands its AST to JS as a compact
				binary buffer where tsv and Oxc both go through JSON; Biome doesn't expose its parser to JS.
				tsv's default AST adds a per-node line/column <code>loc</code> for drop-in Svelte
				compatibility, with a fast path to reconstruct locs in JS.
			</li>
			<li>
				A
				<a href="https://github.com/ryanatkn/oxc-bench-formatter" rel="external">
					fork of Oxc's official <code>bench-formatter</code>
				</a>
				is an end-to-end CLI benchmark with its own corpus. On a real TypeScript repo, tsv formats
				~{cli_ts_wall_vs_oxfmt} faster than Oxfmt and ~{cli_ts_wall_vs_biome} faster than Biome
				using ~{cli_ts_memory
					? format_ratio_range_approx(cli_ts_memory.min, cli_ts_memory.max)
					: '—'}
				less memory than either. Wall-clock ratios bake in each tool's multi-file parallelism — see
				the notes in <a href="#{docs_slugify(CLI_SECTION_TITLE)}">that section</a>.
			</li>
			{#if cli_svelte_wall != null && cli_svelte_memory != null}
				<li>
					The fork's Svelte scenario benches tsv against rsvelte-fmt, the other Rust Svelte-native
					formatter, on a third-party <code>.svelte</code> corpus: tsv formats
					~{format_ratio_approx(cli_svelte_wall)} faster using ~{format_ratio_approx(
						cli_svelte_memory
					)} less memory.
				</li>
			{/if}
		</ul>
		<p>
			Each section below has notes that attempt to fairly contextualize its numbers. The charts show
			numbers using {node_display}, and at the end of the page is a
			<a href="#{docs_slugify(CROSS_RUNTIME_SECTION_TITLE)}">cross-runtime comparison</a>.
		</p>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Like Prettier but speedier" />
		<BenchmarksSummary rows={speedup_rows} />
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Format speed" />
		<p class="mb_xl5">
			tsv's formatter is similar to
			<a href="https://oxc.rs/docs/guide/usage/formatter.html">Oxfmt</a>,
			<a href="https://biomejs.dev/formatter/">Biome</a>, and
			<a href="https://dprint.dev/plugins/typescript/">dprint</a>. It formats Svelte, TypeScript,
			and CSS, plus JS as strict-mode TypeScript:
		</p>
		{#each format_groups as group (group.language)}
			<BenchmarksGroup {group} {corpus} />
		{/each}
		<aside class="mt_xl5">
			<p>Notes:</p>
			<ul>
				<li>wasm-to-wasm and native-to-native (N-API here) are the fair comparisons</li>
				<li>
					Oxfmt formats TypeScript, JS, and CSS with its own native engine, and for Svelte it
					delegates to Prettier internally (via prettier-plugin-svelte).
				</li>
				<li>
					There's no native Biome entry: its native engine ships only as the <code>biome</code> CLI
					binary, a separate process rather than an embeddable library, so it can't be fairly timed
					in-process like the others.
				</li>
				<li>
					The dprint entry is
					<a href="https://dprint.dev/plugins/typescript/">dprint-plugin-typescript</a>, the engine
					<code>deno fmt</code> runs for TypeScript and JS, loaded in-process as its wasm plugin. It
					formats TypeScript and JS only — the plugin rejects CSS and Svelte — so it's grayed out in
					those two groups. This times the engine, not the <code>deno fmt</code> CLI: a subprocess
					per file would measure process startup instead of formatting.
				</li>
				<li>
					dprint's CSS work lives in a separate plugin,
					<a href="https://github.com/g-plane/malva">malva</a>, which gets its own CSS entry over
					the same wasm host. Its HTML plugin isn't included — it doesn't format Svelte.
				</li>
				<li>
					<a href="https://github.com/baseballyama/rsvelte" rel="external">rsvelte-fmt</a>, the
					other Rust-native Svelte formatter, is grayed out for a different reason than dprint: it
					ran over every file, but isn't timed. It ships no in-process API, so each file costs a
					fresh process, incompatible with tsv's single-threaded benchmarks. Its row reports
					coverage only.{#if cli_svelte_wall != null}
						For multi-threaded CLI speed, see the
						<a href="#{docs_slugify(CLI_SECTION_TITLE)}">CLI section</a>.
					{/if}
				</li>
			</ul>
		</aside>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Parse speed" />
		<p class="mb_xl5">
			The parse entries that build a full JS AST are comparable in mechanism: tsv and oxc-parser
			both serialize the AST to JSON in Rust and deserialize it in JS, native and wasm alike. But
			the deliverables differ — tsv's default wire (<code>tsv-json</code> /
			<code>tsv_wasm-json</code>) carries a per-node <code>loc</code> (line/column) object that
			oxc-parser's default span-only AST omits, and that <code>loc</code> is roughly half the wire
			bytes and most of its JSON.parse cost. The <code>tsv-json-no-locations</code> /
			<code>tsv_wasm-json-no-locations</code>
			entries drop it, emitting the same span-only shape oxc does, so those are the payload-matched,
			apples-to-apples comparison with oxc-parser (line/column stays derivable from the offsets plus
			source, so nothing is lost). The tsv-internal and tsv_wasm-internal entries build the native
			AST but skip JS-side materialization, so they show raw in-engine speed rather than a
			cross-tool comparison.
		</p>
		<p class="mb_xl5">
			yuku-parser, a JS/TS parser written in Zig, emits the same span-only AST as oxc, so it too
			compares against the <code>no-locs</code> entries rather than tsv's <code>loc</code>-bearing
			default. It reaches that AST differently: instead of serializing to JSON it returns a compact
			binary buffer that its JS side decodes into objects. The deliverable is the same fully
			materialized tree, so the entries stay comparable — though every one of them times parsing and
			the hand-off into JS together, and this benchmark doesn't split the two.
		</p>
		{#each parse_groups as group (group.language)}
			<BenchmarksGroup {group} {corpus} />
		{/each}
		<aside class="mt_xl5">
			<p>Some notes:</p>
			<ul>
				<li>
					JS parsers skip the Rust-to-JS serialization step that tsv and oxc pay for, which keeps
					them competitive.
				</li>
				<li>
					Biome is shown grayed-out across all three parse groups because its
					<code>@biomejs/js-api</code>
					package doesn't expose a parser to JS (only formatting and linting). Biome parses
					internally but never surfaces the AST across the JS boundary, so it can't be measured.
				</li>
				<li>
					oxc-parser only parses TypeScript and JS (and JSX, not measured here). oxc-parser doesn't
					expose a CSS parser, and it doesn't parse Svelte.
				</li>
				<li>
					yuku-parser and swc both parse TypeScript and JS and nothing else — no CSS, no Svelte, no
					formatter — so they appear in the TypeScript parse group only.
				</li>
				<li>
					rsvelte's parser is the only other engine here that parses Svelte, and it's matched to
					tsv's default wire on both counts that matter: it also hands JS a compact JSON string, and
					on a real component the two payloads are within a couple of percent. So
					<code>rsvelte-parse</code> compares against <code>tsv-json</code> directly, not against
					the <code>no-locs</code> entries. Its second entry passes rsvelte's own
					<code>skipExpressionLoc</code>, which drops <code>loc</code> only on embedded JS
					expressions and keeps the top-level offsets — a different trade than tsv's span-only wire,
					which is why that entry is named for the option rather than for tsv's.
				</li>
				<li>
					swc parses into its own AST shape — a <code>Module</code> root carrying <code>span</code>
					offsets rather than ESTree's <code>loc</code>/<code>range</code> — so it isn't
					payload-matched to either tsv wire.
				</li>
				<li>
					PostCSS is the only other CSS parser here, and the only kind available: no Rust CSS parser
					exposes an AST to JS. Lightning CSS transforms rather than handing back a tree, Biome
					doesn't surface a parser at all, and malva is a formatter. It's also the parser behind
					Prettier's CSS printer, which makes it the parse-side counterpart to the Prettier entry in
					the format group.
				</li>
				<li>
					a CSS coverage gap is a grammar difference, not a verdict. The CSS reference row is
					Svelte's <code>parseCss</code>, which tsv is a drop-in for — and unlike Svelte's parser on
					the Svelte side, it isn't an authority on what valid CSS is in either direction. PostCSS
					rejects a handful of files <code>parseCss</code> accepts (unclosed strings, a missing
					semicolon) and accepts more that it rejects, mostly modern CSS Svelte's parser doesn't
					implement yet — <code>@supports selector(…)</code>, mixins — rather than anything
					malformed. So PostCSS landing a shade above tsv here is two grammars, not a gap.
				</li>
				<li>
					the <code>no-locs</code> entries are the payload-matched comparison with oxc-parser (see
					above); the plain <code>tsv-json</code> entries carry the larger <code>loc</code>-bearing
					AST, so their slower number isn't an engine-speed difference.
				</li>
				<li>
					<code>tsv internal (node napi)</code> and <code>tsv_wasm internal</code> aren't a fair
					comparison to the other entries — they skip JS-side AST materialization entirely, so
					they're included only to show tsv's own JSON-serialization overhead against its
					non-internal entry.
				</li>
			</ul>
		</aside>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Parse conformance" />
		<p class="mb_xl5">
			Separate from the speed numbers above that use a real-world corpus of code, this section
			measures parse <em>coverage</em>: how much of a much larger, deliberately hard corpus each
			parser accepts — Prettier's format-test suites, Svelte's compiler test suite, CSS extracted
			from <a href="https://github.com/web-platform-tests/wpt">web-platform-tests</a>,
			<a href="https://github.com/tc39/test262">test262</a>'s expected-valid strict-mode tests, and
			the single-file cases from the
			<a href="https://github.com/microsoft/TypeScript">TypeScript compiler</a>'s own test suite
			that tsc itself parses cleanly.
		</p>
		{#if benchmarks_cross_runtime_json.conformance_vintage?.stale}
			<aside class="mixed-vintage">
				⚠ The conformance report backing this section comes from a different commit than the
				speed reports above, so the two sections describe different builds until it is re-run.
			</aside>
		{/if}
		<BenchmarksConformance groups={conformance_groups} />
		<aside class="mt_xl5">
			<p>Reading these numbers:</p>
			<ul>
				<li>
					Coverage is per engine, not per binding — a parser accepts the same files whether it runs
					native or wasm, so each tool appears once.
				</li>
				<li>
					The yuku-parser row is its wasm binding: the native one segfaults on test262's
					escaped-identifier tests, where a single identifier is a long run of braced unicode
					escapes. Wasm runs the same parser with the fault contained, so the number stands — and on
					the speed corpus above, which has no such identifiers, both bindings are measured.
				</li>
				<li>
					For Svelte, the corpus excludes the files svelte/compiler itself rejects, so its number is
					100% by construction and the rest read as drop-in fidelity against it — higher is strictly
					better. For TypeScript and CSS the canonical parser isn't a clean validity oracle
					(acorn-typescript trails modern syntax, Svelte's CSS parser is lenient), so those suites
					keep intentionally-invalid and out-of-scope inputs — read them relative to each other, not
					as an absolute target.
				</li>
				<li>
					The <code>tsc</code> row is the TypeScript compiler's own parser, which appears here and
					nowhere else on this page — a verdict rather than a speed. It selected the compiler slice of
					this corpus (only the cases it parses cleanly are kept), so it scores 100% there by
					construction, the way svelte/compiler does on the Svelte set; the rest of its number comes
					from corpora it didn't select, where it rejects JSX and stage-1 proposals in Prettier's
					JavaScript fixtures and a small tail of test262. That blend is why it doesn't read 100%.
				</li>
				<li>
					Accepting a file says nothing about producing the <em>right</em> AST — tsv's output is
					separately verified against the canonical parsers (svelte/compiler, acorn-typescript) at
					corpus scale in its repo's conformance gates.
				</li>
			</ul>
			{#if benchmarks_conformance_json.corpus_sources?.length}
				<p>Corpus sources ({benchmarks_conformance_json.corpus_sources.length}):</p>
				<ul>
					{#each benchmarks_conformance_json.corpus_sources as source (source.path)}
						{@const url = corpus_source_url(source)}
						<li>
							{#if url}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={url} rel="external"><code>{source.path}</code></a>
							{:else}
								<code>{source.path}</code>
							{/if}
							— {format_corpus_source_files(source)}
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Binary size" />
		<p>
			Rather than supporting many languages, tsv focuses on Svelte/HTML, TypeScript/JS, and CSS.
			This lets it be smaller when it's all you need, a quality that's more relevant when used in
			the browser via wasm.
		</p>
		<BenchmarksSizes sizes={benchmarks_json.binary_sizes} />
		<aside class="mt_xl5">
			<p>Important notes:</p>
			<ul>
				<li>apples-to-apples comparisons are difficult here because of differing scope</li>
				<li>oxc-parser only parses TypeScript and JS/JSX; oxfmt is its separate formatter</li>
				<li>
					yuku-parser parses TypeScript and JS and ships no formatter, so both its builds sit under
					Parser — but tsv's parse-only builds beside them carry parsers for Svelte and CSS too, so
					the gap there is scope as much as engine
				</li>
				<li>tsv and tsv_wasm include a parser and formatter for Svelte, TypeScript/JS, and CSS</li>
				<li>
					Biome bundles a parser, formatter, and linter for many languages, but its native engine
					ships only as the CLI binary, not an embeddable library, and <code>@biomejs/js-api</code>
					exposes only formatting and linting. Every native entry here is an in-process library
					call, so a subprocess CLI isn't a comparable artifact — only Biome's wasm build is
					included
				</li>
				<li>
					the <code>oxc-parser + oxfmt</code> entry under Full toolchain sums oxc's separate parser
					and formatter packages, since together they're the closest equivalent to tsv's single
					parse+format build
				</li>
				<li>
					that combined figure is a little unfair to oxc: oxfmt statically links its own copy of the
					same oxc parser (it has to parse to format) but doesn't depend on the
					<code>oxc-parser</code>
					package or expose parsing through its API. The two are independently compiled, so the sum
					counts the parser's compiled code twice — more than a single build exposing both
					operations (like tsv's) would need
				</li>
				<li>
					oxfmt has no wasm build as of {report_month}, so it's shown grayed-out under Formatter,
					holding its slot beside <code>oxfmt (napi)</code>
				</li>
				<li>
					<code>rsvelte-fmt (binary)</code> is the widest scope mismatch here — a standalone
					executable carrying a CLI and the whole oxc formatter beside its Svelte engine, where the
					tsv entries are bare libraries
				</li>
				<li>
					<code>rsvelte-fmt + oxfmt</code> is what you install to format a project, and the fairer
					comparison to tsv's single build: over a directory it delegates non-Svelte files to
					<code>oxfmt</code> and errors without it (hence the peer dependency). A single
					<code>.svelte</code> file needs no oxfmt — it formats the embedded
					<code>&lt;script&gt;</code> and <code>&lt;style&gt;</code> itself
				</li>
				<li>
					<code>dprint (wasm)</code> and <code>malva (wasm)</code> are two plugins for the same
					dprint formatter host — TypeScript/JS and CSS respectively — and neither exposes a parser,
					so both sit under Formatter beside tsv's format-only wasm build. That build does Svelte,
					TypeScript/JS and CSS in one artifact, so each gap there is scope before it's engine
				</li>
				<li>
					<code>swc (napi)</code> and <code>rsvelte compiler (napi)</code> are the widest scope
					mismatches in the table. Both back parse rows and ship no formatter, so they're grouped
					under Parser, but each artifact is far larger than what's measured: swc's is an entire
					compiler (transforms, minifier, bundler) where the benchmark calls only its parser, and
					rsvelte's carries the Svelte compiler plus svelte2tsx, HMR diffing and a resolver. Read
					them as what those addons ship, not as parser size
				</li>
				<li>
					tsv's N-API addon for Node and Bun ships as <code>@fuzdev/tsv</code> (prebuilt
					per-platform packages, which also carry the native <code>tsv</code> CLI binary that
					<code>npx tsv</code>
					runs); the C-FFI library Deno loads is built for benchmarking and not published
				</li>
			</ul>
		</aside>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text={CLI_SECTION_TITLE} />
		<p class="mb_xl5">
			The numbers above measure tsv's engine in-process, one file at a time, using tsv's original
			benchmarks. This section describes the results from a fork of Oxc's official
			<a href="https://github.com/oxc-project/bench-formatter" rel="external">
				<code>bench-formatter</code>
			</a>
			that <a href="https://github.com/ryanatkn/oxc-bench-formatter" rel="external">adds tsv</a>,
			timing the whole CLI end-to-end — process spawn, file discovery, I/O, and each tool's default
			multi-file parallelism — plus peak memory. It's the "what you experience typing the command"
			measure, run on real repositories. tsv appears only in the JSX-free scenarios (it has no
			JSX/TSX parser). The tsv binary measured here is the same one <code>@fuzdev/tsv</code> ships
			in its platform packages and execs from <code>npx tsv</code> — the npx path just adds Node's
			~20&nbsp;ms launcher on top.
		</p>
		<BenchmarksCli report={benchmarks_cli} />
		<aside class="mt_xl5">
			<p>How to read these numbers:</p>
			<ul>
				<li>
					This measures the whole command, not the engine in isolation. tsv, oxfmt, and biome
					parallelize across files while prettier is effectively serial, so the wall-clock ratios
					bake in each tool's parallelism and scale with core count — they're only meaningful
					alongside the machine they ran on. The <code>vs tsv (CPU work)</code> column is the
					parallelism-neutral view (total CPU time across threads): on the TypeScript repo tsv is
					~{cli_ts_wall_vs_oxfmt} faster than Oxfmt in wall-clock but only ~{cli_ts_cpu_vs_oxfmt} in
					CPU work, the rest being cores Oxfmt uses and Prettier can't.
				</li>
				<li>
					Peak memory doesn't depend on thread count, so it's the most directly comparable figure —
					tsv uses {cli_memory ? format_ratio_range(cli_memory.min, cli_memory.max) : '—'} less than
					every other tool in every scenario.
				</li>
				<li>
					Formatting width isn't identical: prettier, biome, and oxfmt format at width 80 (oxfmt
					explicitly, the others by default), while tsv is non-configurable at width 100. Different
					widths mean different line-break work — a real if small asymmetry with no fix on tsv's
					side.{#if cli_svelte_wall != null}
						The Svelte scenario is the exception: rsvelte-fmt is configurable, so it runs at tsv's
						style there and that head-to-head has no width asymmetry.
					{/if}
				</li>
				<li>
					Errors aren't penalized by the harness, but the tsv scenarios run a preflight parse check
					first and every formatter accepts the whole corpus, so nothing is skipped. tsv is left out
					of the fork's other three scenarios because they contain JSX/TSX or measure work tsv
					doesn't do (embedded-language formatting, import and Tailwind-class sorting).
				</li>
			</ul>
		</aside>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Benchmarking details" />
		<p>
			All numbers are single-threaded: every library formats or parses one file at a time, measured
			sequentially with no cross-file parallelism. Each row is the total time to process the whole
			corpus once on a single core — not the multi-core batch throughput a CLI gets when it formats
			many files at once, which most of these tools (tsv included) can do.
		</p>
		<p class="mb_xl3">
			What's measured: {corpus_file_count.toLocaleString('en-US')} files of <code>.svelte</code>,
			<code>.ts</code>/<code>.js</code>, and <code>.css</code> — real-world code only, from two
			sources: the author's libraries, apps, and sites (the fuz.dev ecosystem plus personal
			SvelteKit sites), and upstream framework source (Svelte, SvelteKit, and the svelte.dev site).
			The CSS set also includes real-authored CSS extracted from those components'
			<code>&lt;style&gt;</code>
			blocks, concatenated per repo — standalone CSS files are rare in this ecosystem, and the same
			bytes appear in the Svelte rows (rows are never summed). Test files count as real code and
			stay in; fixture files (the formatter test suites that used to be part of this corpus, and
			fixture subtrees inside the measured repos) are excluded — deliberately tricky edge cases
			measure conformance, not typical throughput, and are covered by the parse-conformance section
			above.
		</p>
		<BenchmarksMeta baseline={benchmarks_json} />
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text={CROSS_RUNTIME_SECTION_TITLE} />
		<p>
			The same benchmark harness runs under three JS runtimes — Node, Deno, and Bun. The headline
			numbers above are the Node run. The native entry differs by runtime: Node and Bun load tsv's
			N-API addon, while Deno loads its C-FFI library. They share code but cross a different binding
			boundary, so a per-runtime delta on the same row is a runtime effect — the JS engine or the
			binding boundary — not a difference in tsv's own engine, which is identical across all three.
		</p>
		<aside class="mt_xl5 mb_xl5">
			<p>
				The <code>tsv-internal</code> rows cross the native binding boundary but materialize nothing
				on the JS side, so a delta there is the binding boundary itself; the JSON-materializing
				parse rows add each JS engine's <code>JSON.parse</code> cost on top. Node is the headline as
				the default N-API path, not a speed pick.
			</p>
		</aside>
		<BenchmarksCrossRuntime report={benchmarks_cross_runtime_json} />
	</TomeSection>
</TomeContent>

<style>
	/* the warning red tint over fuz_css's base aside styling (same as BenchmarksCrossRuntime) */
	.mixed-vintage {
		border-left-color: var(--color_c_50);
	}
</style>
