<script lang="ts">
	import { resolve } from '$app/paths';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	const TOME_SLUG = 'benchmark';
	const tome = tome_get_by_slug(TOME_SLUG);

	const BENCH_URL = 'https://syntax-highlighter-bench.ryanatkn.com/';
	const BENCH_REPO_URL = 'https://github.com/ryanatkn/syntax-highlighter-bench';

	// how many times longer Prism and the faster of Shiki's two engines take than
	// fuz_code to highlight to HTML, the geometric mean over the bench's neutral
	// inputs (small, medium, and large) per language — copied from the run in
	// `bench_run`, so update both together
	const speedups: Array<{ lang: string; vs_prism: number; vs_shiki: number }> = [
		{ lang: 'ts', vs_prism: 12.0, vs_shiki: 91.1 },
		{ lang: 'js', vs_prism: 8.7, vs_shiki: 102.9 },
		{ lang: 'css', vs_prism: 6.6, vs_shiki: 58.8 },
		{ lang: 'html', vs_prism: 6.7, vs_shiki: 57.4 },
		{ lang: 'json', vs_prism: 6.0, vs_shiki: 32.8 },
		{ lang: 'svelte', vs_prism: 8.0, vs_shiki: 122.8 },
		{ lang: 'md', vs_prism: 13.3, vs_shiki: 24.8 },
		{ lang: 'sh', vs_prism: 16.0, vs_shiki: 73.0 },
		{ lang: 'rust', vs_prism: 6.0, vs_shiki: 45.7 }
	];
	const bench_run = {
		date: '2026-10-12',
		commit: '340492a991a23a48cff3d90b896838031209a635',
		fuz_code: '0.52.1',
		prism: '1.30.0',
		shiki: '4.5.0',
		node: '24.14.1',
		cpu: 'AMD Ryzen 5 PRO 7530U'
	};

	// mean work time in ms (stylize + DOM commit) per language for each renderer,
	// from one interactive-benchmark run on a single machine (the run hand-pasted
	// into `benchmark/results.md`) — illustrative, not a spec; run the tool for
	// numbers on your own hardware
	const browser_run_date = '2026-07-11';
	const browser_results: Array<{ lang: string; html: number; ranges: number }> = [
		{ lang: 'ts', html: 91.23, ranges: 11.8 },
		{ lang: 'css', html: 10.52, ranges: 2.58 },
		{ lang: 'html', html: 28.24, ranges: 3.96 },
		{ lang: 'json', html: 10.6, ranges: 1.92 },
		{ lang: 'svelte', html: 91.38, ranges: 12.52 },
		{ lang: 'md', html: 69.38, ranges: 9.78 },
		{ lang: 'sh', html: 48.7, ranges: 8.16 }
	];
	// bars scale to the slowest single result so lengths compare across languages
	const browser_max = Math.max(...browser_results.flatMap((r) => [r.html, r.ranges]));

	type Renderer = 'html' | 'ranges';
	const renderers: Array<{ key: Renderer; label: string; color: string }> = [
		{ key: 'html', label: 'Code', color: 'var(--palette_j_50)' },
		{ key: 'ranges', label: 'CodeHighlight', color: 'var(--palette_g_50)' }
	];

	// each language's ratios are taken against its `Code` row by default, or against
	// whichever row the pointer is over, so either renderer can be the baseline
	let hovered: { lang: string; renderer: Renderer } | undefined = $state();
	const to_hovered = (event: Event): typeof hovered => {
		const row = (event.target as Element | null)?.closest<HTMLElement>('[data-renderer]');
		const lang = row?.dataset.lang;
		const renderer = row?.dataset.renderer as Renderer | undefined;
		return lang && renderer ? { lang, renderer } : undefined;
	};
	const to_anchor = (lang: string): Renderer =>
		hovered?.lang === lang ? hovered.renderer : 'html';

	// one decimal under 10 so the shown times still reproduce the ratios
	const format_ms = (ms: number): string => ms.toFixed(ms < 10 ? 1 : 0);

	// an approximate speedup for prose and tables (`~6.6x`, `~91x`)
	const format_speedup_approx = (ratio: number): string => `~${ratio.toFixed(ratio < 10 ? 1 : 0)}x`;

	// how many times faster a row is than its anchor (`7.58x`), or the reciprocal
	// negated when slower (`−7.58x`), two decimals under 10 and one from there
	const format_speedup = (ratio: number): string => {
		const magnitude = ratio >= 1 ? ratio : 1 / ratio;
		const digits = Number(magnitude.toFixed(2)) >= 10 ? 1 : 2;
		const text = magnitude.toFixed(digits);
		return `${ratio < 1 && text !== '1.00' ? '−' : ''}${text}x`;
	};
	const ratio_color = (ratio: number): string => {
		if (ratio < 0.5) return 'var(--palette_c_50)';
		if (ratio < 1) return 'var(--palette_h_50)';
		if (ratio < 2) return 'var(--palette_e_50)';
		if (ratio < 5) return 'var(--palette_b_50)';
		return 'var(--palette_j_50)';
	};
</script>

<TomeContent {tome}>
	<section>
		<p>
			fuz_code is optimized for <em>runtime</em> syntax styling. This page summarizes how it
			compares with Prism and Shiki, measures its two renderers in the browser, and lists the
			benchmarks that run from a checkout. The comparisons come from
			<a href={BENCH_URL}>syntax-highlighter-bench</a>, a separate suite that times each library on
			the same neutral inputs.
		</p>
		<p>
			<a href="https://github.com/shikijs/shiki">Shiki</a> targets build-time use and runs the
			<a href="https://shiki.matsu.io/guide/regex-engines">Oniguruma regexp engine</a> that TextMate
			grammars require, trading runtime speed for grammar and theme coverage. fuz_code trades that
			coverage for a small, fast runtime path. For static content, the
			<ModuleLink module_path="svelte_preprocess_fuz_code.ts">
				svelte_preprocess_fuz_code
			</ModuleLink> preprocessor renders at build time. Languages it lacks can be added by writing a
			lexer.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Compared to Shiki and Prism" />
		<p>
			<a href={BENCH_URL}>syntax-highlighter-bench</a> measures fuz_code against
			<a href="https://prismjs.com/">Prism</a>, Shiki (both its JavaScript and Oniguruma engines),
			and <a href="https://twinkleplop.pngwn.at/">Twinkleplop</a>, each in its own process, on real
			code none of them authored. Highlighting to HTML, fuz_code runs about an order of magnitude
			faster than Prism and one to two orders of magnitude faster than Shiki:
		</p>
		<div class="overflow-x:auto">
			<table>
				<thead>
					<tr>
						<th>language</th>
						<th>fuz_code vs Prism</th>
						<th>fuz_code vs Shiki</th>
					</tr>
				</thead>
				<tbody>
					{#each speedups as { lang, vs_prism, vs_shiki } (lang)}
						<tr>
							<td><code>{lang}</code></td>
							<td>{format_speedup_approx(vs_prism)}</td>
							<td>{format_speedup_approx(vs_shiki)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<aside>
			How many times longer each library takes, at the geometric mean over small, medium, and large
			inputs per language, against the faster of Shiki's two engines. Shiki inlines theme colors on
			every span where fuz_code and Prism emit classes, so part of its cost is work the others leave
			to CSS. The <a href="{BENCH_URL}results">full results</a> also cover tokenizing alone,
			startup, bundle size, and memory.
		</aside>
		<p>
			<small>
				Run of {bench_run.date} at commit
				<a href="{BENCH_REPO_URL}/commit/{bench_run.commit}">{bench_run.commit.slice(0, 7)}</a>:
				fuz_code {bench_run.fuz_code}, Prism {bench_run.prism}, Shiki {bench_run.shiki}, Node
				{bench_run.node}, {bench_run.cpu}.
			</small>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="In the browser" />
		<p>
			The <a href={resolve('/benchmark')}>in-browser benchmark</a> measures real DOM rendering
			rather than pure compute. It times fuz_code's two renderers — the standard HTML path
			(<DeclarationLink name="Code" />) and the experimental CSS Custom Highlight API path
			(<DeclarationLink name="CodeHighlight" />, ranges) — across the sample languages, reporting
			mean, median, percentiles, coefficient of variation, and throughput, and it pauses longer
			between samples when the system looks unstable.
		</p>
		<p>
			Set the iteration count, warmup runs, cooldown, and content multiplier, then run it on your
			own hardware. For the steadiest numbers, launch Chromium with garbage collection exposed
			(<code>chromium --js-flags="--expose-gc"</code>) so the harness can run a minor collection
			between samples.
		</p>
		<p>
			A sample run of work time — stylize plus DOM commit — per language for each renderer. The
			default <DeclarationLink name="Code" /> path builds a <code>.token_*</code> span per token;
			the experimental <DeclarationLink name="CodeHighlight" /> path skips that DOM, so it commits
			less:
		</p>
		<div class="perf-legend">
			{#each renderers as { key, label, color } (key)}
				<span>
					<span class="perf-swatch" style:background={color}></span>
					<DeclarationLink name={label} /> ({key})
				</span>
			{/each}
		</div>
		<!-- A table to assistive tech, one row per renderer per language, each headed by a
			visually hidden label. Hover is delegated to the chart, which reads the row under
			the pointer off its data attributes, and `pointerleave` restores every language's
			default anchor. Re-baselining is a pointer-only affordance over numbers that are
			all visible regardless. -->
		<div class="perf-container">
			<div
				class="perf-chart"
				role="table"
				aria-label="Work time per language for each renderer"
				onpointerover={(event) => (hovered = to_hovered(event))}
				onpointerleave={() => (hovered = undefined)}
			>
				{#each browser_results as result (result.lang)}
					{@const anchor = to_anchor(result.lang)}
					<div class="perf-group" role="rowgroup">
						<div class="perf-lang" aria-hidden="true"><code>{result.lang}</code></div>
						{#each renderers as { key, label, color } (key)}
							{@const ms = result[key]}
							{@const ratio = result[anchor] / ms}
							<div
								class="perf-row"
								class:anchor={key === anchor}
								role="row"
								data-lang={result.lang}
								data-renderer={key}
							>
								<span class="perf-sr" role="rowheader">{result.lang} {label}</span>
								<div class="perf-track" role="cell" aria-hidden="true">
									<div
										class="perf-fill"
										style:width="{(ms / browser_max) * 100}%"
										style:background={color}
									></div>
								</div>
								<span class="perf-num" role="cell">
									{format_ms(ms)} <span class="unit">ms</span>
								</span>
								<span
									class="perf-ratio"
									role="cell"
									style:color={key === anchor ? 'var(--text_40)' : ratio_color(ratio)}
								>
									{format_speedup(ratio)}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
		<aside>
			Lower is better. Each language's ratios are relative to its highlighted row, and a negative
			ratio means that many times slower; hover the other row to compare against it. The benchmark
			uses complex samples at the tool's default size, so this is illustrative, not representative
			of most inputs. The live tool also reports paint-settle time, percentiles, and throughput.
		</aside>
		<p>
			<small>
				Run of {browser_run_date}, before the tool added Rust.
			</small>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="On your machine" />
		<p>The command-line benchmarks run from a checkout of the repo:</p>
		<ul>
			<li>
				<code>npm run benchmark</code> — the internal suite, timing every sample at normal and 100×
				sizes against a local baseline for regression detection.
			</li>
			<li>
				<code>npm run benchmark:cost</code> — the cost model for iterating on a lexer: per-construct
				costs and each language's time over a grammar-free floor lexer, in a few seconds.
			</li>
		</ul>
		<p>
			The internal suite includes a <code>pathological</code> group of adversarial inputs (deeply
			nested and degenerate source) that tracks the lexer's worst-case cost; the same generators
			back the linearity tests.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Design" />
		<ul>
			<li>
				Lexers scan char codes and use native <code>indexOf</code> and keyword maps in place of
				regular expressions.
			</li>
			<li>
				One single-pass lexer per language emitting a flat <code>Int32Array</code> event stream,
				rendered to HTML in a single forward pass.
			</li>
			<li>
				Delimiter scans are amortized linear, with no grammar interpreter or backtracking. A test
				suite checks that lexing time stays near-linear on adversarial inputs.
			</li>
			<li>The lexers and styler import nothing outside the package.</li>
		</ul>
		<p>
			The engine keeps no resumable state, so it re-lexes the whole document on every change rather
			than tokenizing incrementally. In the committed results the largest inputs, up to a few
			hundred kilobytes of source, take under about ten milliseconds in Node.
		</p>
		<p>
			See <TomeLink slug="usage" /> for the API and <TomeLink slug="samples" /> for output in every
			language.
		</p>
	</TomeSection>
</TomeContent>

<style>
	.perf-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space_md);
		margin-bottom: var(--space_md);
		font-size: var(--font_size_sm);
		color: var(--text_50);
	}
	.perf-swatch {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: var(--border_radius_xs);
		vertical-align: middle;
	}
	.perf-container {
		container-type: inline-size;
		margin-bottom: var(--space_lg);
	}
	/* the chart is the grid and its groups and rows are subgrids, so every column
	 * sizes to its content across all languages; the ratio column is held at the
	 * widest ratio `format_speedup` prints here, so re-baselining shifts nothing */
	.perf-chart {
		display: grid;
		grid-template-columns:
			[lang] max-content [track] minmax(0, 1fr) [value] max-content [ratio] 7ch;
		column-gap: var(--space_sm);
		row-gap: var(--space_sm);
	}
	.perf-group {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
	}
	.perf-lang {
		grid-column: lang;
		grid-row: 1 / span 2;
		text-align: right;
	}
	/* rows within a language sit flush, so the anchor band reads as one row */
	.perf-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: track / -1;
		align-items: center;
		padding: var(--space_xs);
	}
	.perf-row.anchor {
		background-color: var(--ink_05);
		box-shadow: inset var(--border_width_3) 0 0 var(--ink_50);
	}
	.perf-track {
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		background: var(--ink_05);
	}
	.perf-fill {
		height: 100%;
		min-width: 2px;
		border-radius: var(--border_radius_xs);
	}
	.perf-num,
	.perf-ratio {
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.perf-ratio {
		font-weight: 700;
	}
	.unit {
		color: var(--text_50);
	}
	.perf-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	/* narrow: the language label takes its own line above its rows, and the track
	 * starts at the left edge */
	@container (width < 28rem) {
		.perf-chart {
			grid-template-columns: [lang track] minmax(0, 1fr) [value] max-content [ratio] 7ch;
		}
		.perf-lang {
			grid-column: 1 / -1;
			grid-row: auto;
			text-align: left;
		}
	}
</style>
