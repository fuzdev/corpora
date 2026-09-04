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

	const RESULTS_URL = 'https://github.com/fuzdev/fuz_code/blob/main/benchmark/compare/results.md';

	// representative end-to-end `stylize` speedups on larger (100×) inputs, rounded
	// from the committed comparison results and measured against the faster of
	// Shiki's two engines (the conservative choice) — see `RESULTS_URL` for the
	// full per-engine, per-size matrix
	const speedups: Array<{ lang: string; vs_prism: string; vs_shiki: string }> = [
		{ lang: 'ts', vs_prism: '~18×', vs_shiki: '~140×' },
		{ lang: 'css', vs_prism: '~8×', vs_shiki: '~90×' },
		{ lang: 'html', vs_prism: '~11×', vs_shiki: '~80×' },
		{ lang: 'json', vs_prism: '~17×', vs_shiki: '~95×' },
		{ lang: 'svelte', vs_prism: '~14×', vs_shiki: '~165×' }
	];

	// work time in ms (stylize + DOM commit) per language for each renderer, rounded
	// from one interactive-benchmark run on a single machine — illustrative, not a
	// spec; run the tool for numbers on your own hardware
	const browser_results: Array<{ lang: string; html: number; ranges: number }> = [
		{ lang: 'ts', html: 91, ranges: 12 },
		{ lang: 'css', html: 11, ranges: 3 },
		{ lang: 'html', html: 28, ranges: 4 },
		{ lang: 'json', html: 11, ranges: 2 },
		{ lang: 'svelte', html: 91, ranges: 13 },
		{ lang: 'md', html: 69, ranges: 10 },
		{ lang: 'sh', html: 49, ranges: 8 }
	];
	// bars scale to the slowest single result so lengths compare across languages
	const browser_max = Math.max(...browser_results.flatMap((r) => [r.html, r.ranges]));
</script>

<TomeContent {tome}>
	<section>
		<p>
			fuz_code runs one hand-written single-pass lexer per language without regular expressions,
			emitting a flat token event stream that renders to HTML in one forward pass. There is no
			grammar interpreter and no backtracking, so highlighting cost stays linear in the length of
			the input, including partial or malformed source.
		</p>
		<p>
			It is optimized for <em>runtime</em> highlighting, including streaming use cases.
			<a href="https://github.com/shikijs/shiki">Shiki</a>
			targets build-time use and runs the
			<a href="https://shiki.matsu.io/guide/regex-engines">Oniguruma regexp engine</a> that TextMate grammars
			require, trading runtime speed for grammar and theme coverage. fuz_code trades that coverage for
			a small, fast runtime path — it also provides tools for pre-compilation, and you can bring your
			own lexers for languages it doesn't support.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Compared to Shiki and Prism" />
		<p>
			The cross-implementation benchmark measures fuz_code against
			<a href="https://github.com/PrismJS/prism">Prism</a> and Shiki (both the JavaScript and
			Oniguruma engines). For end-to-end <code>stylize</code> — lexing plus HTML generation, the realistic
			runtime path — fuz_code runs roughly an order of magnitude faster than Prism and about two orders
			of magnitude faster than Shiki:
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
							<td>{vs_prism}</td>
							<td>{vs_shiki}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p>
			<small
				>Representative <code>stylize</code> results on larger inputs from one machine; absolute
				numbers vary by hardware. See the
				<a href={RESULTS_URL}>committed comparison results</a> for the full matrix across engines and
				sizes, plus tokenize-only rows that compare the raw lexers without HTML generation.</small
			>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="In the browser" />
		<p>
			The <a href={resolve('/benchmark')}>in-browser benchmark</a>
			measures real DOM rendering rather than pure compute. It times fuz_code's two renderers — the standard
			HTML path (<DeclarationLink name="Code" />) and the experimental CSS Custom Highlight API path
			(<DeclarationLink name="CodeHighlight" />, ranges) — across every supported language,
			reporting mean, median, percentiles, coefficient of variation, and throughput, with
			system-stability gating between samples.
		</p>
		<p>
			Set the iteration count, warmup runs, cooldown, and content multiplier, then run it on your
			own hardware. For the steadiest numbers, launch Chromium with garbage collection exposed (<code
				>chromium --js-flags="--expose-gc"</code
			>) so the harness can settle the heap between samples.
		</p>
		<p>
			A sample run of work time — stylize plus DOM commit — per language for each renderer. The
			default <DeclarationLink name="Code" /> path builds a <code>.token_*</code> span per token;
			the experimental <DeclarationLink name="CodeHighlight" /> path skips that DOM, so it commits less:
		</p>
		<div class="perf-legend">
			<span><span class="perf-swatch perf-html"></span> <code>Code</code> (html)</span>
			<span><span class="perf-swatch perf-ranges"></span> <code>CodeHighlight</code> (ranges)</span>
		</div>
		<div class="perf-bars">
			{#each browser_results as { lang, html, ranges } (lang)}
				<div class="perf-lang"><code>{lang}</code></div>
				<div class="perf-set">
					<div class="perf-row">
						<div class="perf-track">
							<div class="perf-fill perf-html" style:width="{(html / browser_max) * 100}%"></div>
						</div>
						<span class="perf-num">{html}<span class="unit"> ms</span></span>
					</div>
					<div class="perf-row">
						<div class="perf-track">
							<div
								class="perf-fill perf-ranges"
								style:width="{(ranges / browser_max) * 100}%"
							></div>
						</div>
						<span class="perf-num">{ranges}<span class="unit"> ms</span></span>
					</div>
				</div>
			{/each}
		</div>
		<p>
			<small
				>Lower is better. The benchmark uses complex samples at the tool's default size, so this is
				illustrative, not representative of most inputs. The live tool also reports paint-settle
				time, percentiles, and throughput.</small
			>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="On your machine" />
		<p>The command-line benchmarks run from a checkout of the repo:</p>
		<ul>
			<li>
				<code>npm run benchmark</code> — the internal suite, timing every sample at normal and 100× sizes
				against a local baseline for regression detection.
			</li>
			<li>
				<code>npm run benchmark:vs</code> — the cross-implementation shootout against Prism and Shiki
				that produces the comparison results above.
			</li>
		</ul>
		<p>
			The internal suite includes a <code>pathological</code> group of adversarial inputs (deeply nested
			and degenerate source) that pins the lexer's worst-case behavior to linear time; the same generators
			back the linearity tests. The engine keeps no resumable state, so it re-lexes the whole document
			on every change rather than tokenizing incrementally — whole-document lexing is already sub-frame
			at these speeds.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Why it's fast" />
		<ul>
			<li>
				No regular expressions — char-code scanning, native <code>indexOf</code>, keyword maps.
			</li>
			<li>
				One single-pass lexer per language emitting a flat <code>Int32Array</code> event stream, rendered
				to HTML in a single forward pass.
			</li>
			<li>
				Linear-time by construction — every scan loop advances, so there is no catastrophic
				backtracking on adversarial input.
			</li>
			<li>No runtime dependencies — nothing heavier than the lexers ships to the browser.</li>
		</ul>
		<p>
			The same entry points power all of it: <DeclarationLink name="syntax_styler_global" /> and the
			<ModuleLink module_path="syntax_styler.ts">SyntaxStyler</ModuleLink> class expose
			<code>lex</code>
			(the flat event stream) and <code>stylize</code> (HTML). See the
			<TomeLink slug="usage" /> for the API and the <TomeLink slug="samples" /> for output in every language.
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
	.perf-bars {
		display: grid;
		grid-template-columns: 6rem 1fr;
		align-items: center;
		column-gap: var(--space_md);
		row-gap: var(--space_md);
		margin-bottom: var(--space_lg);
	}
	.perf-lang {
		text-align: right;
	}
	.perf-set {
		display: flex;
		flex-direction: column;
	}
	.perf-row {
		display: grid;
		grid-template-columns: 1fr 3.5rem;
		align-items: center;
		gap: var(--space_sm);
	}
	.perf-track {
		height: 0.4rem;
		background: var(--fg_05);
		border-radius: var(--border_radius_xs);
		overflow: hidden;
	}
	.perf-fill {
		height: 100%;
		min-width: 2px;
		border-radius: var(--border_radius_xs);
		transition: width 0.3s ease;
	}
	.perf-html {
		background: var(--color_j_50);
	}
	.perf-ranges {
		background: var(--color_g_50);
	}
	.perf-num {
		font-size: var(--font_size_sm);
		text-align: right;
		white-space: nowrap;
	}
	.unit {
		color: var(--text_50);
	}
</style>
