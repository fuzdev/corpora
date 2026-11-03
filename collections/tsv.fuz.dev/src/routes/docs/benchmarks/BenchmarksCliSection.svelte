<script lang="ts">
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { docs_slugify } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';

	import {
		benchmarks_cli,
		cli_ratio_vs_tsv,
		cli_ratio_vs_tsv_npm,
		cli_tsv_npm_overhead_ms_range,
		cli_node_startup_ms,
		CLI_TS_REPO_KEY,
		CLI_TSV_NPM_LABEL
	} from './benchmarks_cli.ts';
	import {
		format_commit,
		format_ms,
		format_ms_range,
		format_ratio_approx,
		format_report_date
	} from './benchmark_display.ts';
	import BenchmarksCli from './BenchmarksCli.svelte';

	const {
		title,
		details_title
	}: {
		/** The section's heading, which the page's in-page anchors slugify. */
		title: string;
		/** The heading of the section listing the tool versions this one shares. */
		details_title: string;
	} = $props();

	// tsv's CPU lead over Oxfmt on the TypeScript repo, through its Node dispatcher and
	// as the bare binary — close together, which is what shows the dispatcher adds little CPU
	const npm_ts_cpu_vs_oxfmt = format_ratio_approx(
		cli_ratio_vs_tsv_npm(CLI_TS_REPO_KEY, 'oxfmt', 'cpu_ms')
	);
	const ts_cpu_vs_oxfmt = format_ratio_approx(cli_ratio_vs_tsv(CLI_TS_REPO_KEY, 'oxfmt', 'cpu_ms'));
	// the dispatcher's cost in absolute terms, which is what makes it "fixed": roughly
	// the same few tens of milliseconds whether the run is one file or a repo
	const npm_overhead = format_ms_range(cli_tsv_npm_overhead_ms_range());
	// the machine's bare Node launch, the floor under every npm-bin row
	const node_startup_ms = cli_node_startup_ms();
	// The harness records its own machine and tool versions; the shape test holds them
	// to the ones the details section lists, so only what the harness alone records is
	// quoted: when and from which revision it ran, the thread count its wall-clock
	// scales with, and the tsv packages it installs.
	const cli_date = format_report_date(benchmarks_cli.timestamp);
	const cli_commit_url = `https://github.com/ryanatkn/oxc-bench-formatter/commit/${benchmarks_cli.git_commit}`;
	const cli_tsv_binary = benchmarks_cli.tsv_binary;
	const cli_tsv_wasm_version = benchmarks_cli.versions['tsv-wasm'];
</script>

<TomeSection>
	<TomeSectionHeader text={title} />
	<p>
		The numbers above time tsv's engine in-process, one file at a time. This section times the whole
		CLI end to end, on real code, as you'd experience it from the command line: process spawn, file
		discovery, I/O, and each tool's default multi-file parallelism, plus peak memory. It comes from
		a fork of Oxc's own
		<a href="https://github.com/oxc-project/bench-formatter" rel="external">
			<code>bench-formatter</code>
		</a>
		that <a href="https://github.com/ryanatkn/oxc-bench-formatter" rel="external">adds tsv</a>.
		Upstream's other scenarios aren't shown: their corpora include JSX, which tsv doesn't parse, and
		two also format a repo's other languages and embedded code, one sorting imports and Tailwind
		classes too.
	</p>
	<p>
		As in the charts above, each table's ratios are relative to its highlighted row:
		<code>{CLI_TSV_NPM_LABEL}</code> where tsv faces other tools, and the bare <code>tsv</code>
		binary in the tsv-only table.
	</p>
	<BenchmarksCli report={benchmarks_cli} />
	<aside>
		<p>Notes:</p>
		<ul>
			<li>
				Every formatter is installed from npm, pinned by the fork's lockfile. The other tools are
				timed through their packages' Node bins, so tsv has two rows wherever it faces them.
				<code>{CLI_TSV_NPM_LABEL}</code> is the like-for-like row: the Node bin of
				<a href="https://www.npmjs.com/package/@fuzdev/tsv"><code>@fuzdev/tsv</code></a>, which is
				what <code>npx tsv</code> runs once it's installed. That bin is a small Node script, the
				dispatcher, which launches the native binary, as Biome's and rsvelte-fmt's bins do. The
				plain <code>tsv</code> row runs the same binary directly from the platform package, skipping
				Node: the bare binary.
			</li>
			<li>
				<code>prettier + oxc-parser</code> is Prettier with <code>@prettier/plugin-oxc</code>, which
				swaps in Oxc's Rust parser while printing stays in JS.
			</li>
			<li>
				tsv, Oxfmt, Biome, and rsvelte-fmt parallelize across files; Prettier's stable CLI formats
				them one at a time (its worker pool comes with <code>--experimental-cli</code>, which the
				harness leaves off). No tool's thread count is pinned, so the wall-clock ratios bake in each
				tool's parallelism, scale with core count, and mean little apart from this machine.
			</li>
			<li>
				The CPU ratio column compares <a href="https://github.com/sharkdp/hyperfine">hyperfine</a>'s
				user plus system time, summed across threads and child processes. It is the
				parallelism-neutral view, but only a rough proxy for engine speed: it also counts work other
				than formatting, enough that even Prettier's CPU time exceeds its wall-clock time.
			</li>
			<li>
				tsv's dispatcher adds a fixed ~{npm_overhead} over the bare binary, most of it Node's own
				startup (a bare <code>node -e ""</code> takes ~{format_ms(node_startup_ms)} on this
				machine), which every other npm-bin row pays too. It adds little CPU beside the TypeScript
				repo's multi-threaded work: in CPU time tsv leads Oxfmt there ~{npm_ts_cpu_vs_oxfmt} through
				the dispatcher and ~{ts_cpu_vs_oxfmt} as the bare binary.
			</li>
			<li>
				Peak memory is peak RSS, measured in a separate pass without warmups, with as many runs as
				the timed one. It is the largest single process in each command's tree, not the sum, so the
				rows that launch a native binary from Node (Biome, rsvelte-fmt, and tsv through its
				dispatcher) are understated.
			</li>
			<li>
				As in the in-process charts, every formatter is pinned to tsv's fixed style in its own
				option dialect, so these rows aren't comparable with upstream's published numbers, which
				leave the tools nearer their defaults.
			</li>
			<li>
				Before timing, a preflight run of each tool's check mode asserts that every formatter parses
				every file, that those reporting a file count agree, and that each finds at least one file
				to change, so a mis-scoped tool formatting nothing can't post an unbeatable time.
			</li>
		</ul>
	</aside>
	<p>
		This section ran on {cli_date}, from
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={cli_commit_url}>
			its harness at {format_commit(benchmarks_cli.git_commit)}
		</a>{benchmarks_cli.git_dirty ? ' with uncommitted changes' : ''}, on the same machine and Node
		as the in-process runs ({benchmarks_cli.machine.threads} threads). The versions of the tools
		both sections time are listed under
		<a href="#{docs_slugify(details_title)}">{details_title}</a>;
		{#if cli_tsv_binary.source === 'package'}
			its native tsv rows run the <code>{cli_tsv_binary.package}</code> binary,
		{:else}
			its native tsv rows run a local
			build{cli_tsv_binary.built ? ` from ${cli_tsv_binary.built}` : ''},
		{/if}
		and its wasm row <code>@fuzdev/tsv-wasm</code> {cli_tsv_wasm_version}.
	</p>
</TomeSection>
