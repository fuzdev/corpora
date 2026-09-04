<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import Svg from '@fuzdev/fuz_ui/Svg.svelte';
	import { logo_tsv } from '@fuzdev/fuz_ui/logos.ts';

	const LIBRARY_ITEM_NAME = 'introduction';

	const tome = tome_get_by_slug(LIBRARY_ITEM_NAME);

	const usage_example = `import {format_svelte, parse_svelte, type Root} from '@fuzdev/tsv';

const formatted = format_svelte('<script>\\nconst   x=1\\n<\\/script>');
const ast: Root = parse_svelte('<script>const x = 1;<\\/script>');`;

	const format_example = `import {format_svelte} from '@fuzdev/tsv_format_wasm';

const formatted = format_svelte('<script>\\nconst   x=1\\n<\\/script>');`;

	const parse_example = `import {parse_svelte, type Root} from '@fuzdev/tsv_parse_wasm';

const ast: Root = parse_svelte('<script>const x = 1;<\\/script>');`;

	const no_locations_example = `import {parse_typescript, reconstruct_locations} from '@fuzdev/tsv_parse_wasm';

// span-only AST: start/end offsets, no per-node loc (~46% smaller)
const ast = parse_typescript('const x = 1;', {locations: false});

// derive line/column back when you need it, no re-parse
reconstruct_locations(ast, 'const x = 1;');`;
</script>

<TomeContent {tome}>
	<section>
		<Svg data={logo_tsv} size="var(--icon_size_xl2)" class="float:right ml_lg mb_lg" />
		<p>
			tsv is a toolchain for TypeScript/JS, CSS, and Svelte in Rust. It ships a formatter that
			closely follows <a href="https://prettier.io/">Prettier</a> +
			<a href="https://github.com/sveltejs/prettier-plugin-svelte">prettier-plugin-svelte</a>, and a
			drop-in replacement for <a href="https://svelte.dev/">Svelte</a>'s parser +
			<a href="https://github.com/acornjs/acorn">acorn</a> +
			<a href="https://github.com/sveltejs/acorn-typescript">acorn-typescript</a>.
		</p>
		<p>
			Compared to Oxc, Biome, and SWC, tsv is a set of focused tools, not an extensible language
			platform, so the focus is Web standards + Svelte and there's no support for JSX/SCSS/etc.
			tsv's extensibility story is currently limited to using its Rust crates as libraries (or
			forking); bridging to JS or WASM plugins is an open question (leaning against).
		</p>
		<p>
			Compared to <a href="https://github.com/baseballyama/rsvelte">rsvelte</a>, tsv has its own
			TS/JS/CSS parsers instead of using Oxc, and rsvelte additionally has a compiler and
			linter/typechecker integration (tsv has some in-progress work here, scope unknown).
		</p>
		<p>tsv prioritizes, in order:</p>
		<ol>
			<li>correctness (Svelte and TypeScript conformance, spec adherence for HTML/CSS/JS)</li>
			<li>speed</li>
			<li>binary size and memory usage</li>
			<li>extensibility (valued but deprioritized), modularity, and reusability</li>
		</ol>
		<p>
			See the <TomeLink slug="benchmarks" /> for stats. Compared to Oxc and Biome, tsv is faster,
			smaller, and uses less memory to parse and format its supported languages. One reason for tsv
			to exist is to help find the performance bonuses left on the table in the Web ecosystem's
			increasingly-native implementations.
		</p>
		<p>
			This is an early release with many bugs (and fixes to bugs in Prettier and
			prettier-plugin-svelte), and reports and feedback are appreciated. See the
			<a href="https://github.com/fuzdev/tsv/issues">issues</a> and
			<a href="https://github.com/fuzdev/tsv/discussions">discussions</a>.
		</p>
		<p>
			AI disclosure: this codebase is mostly LLM-generated, and the usual caveats apply. It's a
			high-effort project that prioritizes quality.
		</p>
		<p>
			These docs are a work in progress. For design details see the
			<a href="https://github.com/fuzdev/tsv">readme</a>.
		</p>
		<TomeSection>
			<TomeSectionHeader text="Install" />
			<p>On Node.js and Bun, tsv installs as a native addon with prebuilt binaries:</p>
			<Code
				lang="sh"
				content={'npm i -D @fuzdev/tsv\nnpx tsv format src\nnpx tsv parse src/foo.svelte'}
			/>
			<p>
				The right binary installs automatically. Prebuilt for Linux (x64, arm64, and x64 musl),
				macOS arm64, and Windows x64 — anywhere else, use the WASM build below. The <code>tsv</code>
				command here is tsv's real native CLI binary, shipped in the platform package and exec'd
				directly — multi-file parallelism (<code>--jobs</code>), parallel discovery, the works. It
				ships beside the addon because neither can play the other's role: an addon can't be exec'd
				as a process, and an executable can't be loaded as an in-process module.
			</p>
			<p>
				tsv also ships as WASM, which runs everywhere including browsers and Deno, and carries the
				same <code>tsv</code> CLI:
			</p>
			<Code lang="sh" content={'npm i -D @fuzdev/tsv_wasm\nnpx tsv format src'} />
			<p>For smaller builds, the formatter and parser also ship solo:</p>
			<Code
				lang="sh"
				content={'npm i -D @fuzdev/tsv_format_wasm\nnpm i -D @fuzdev/tsv_parse_wasm'}
			/>
			<p>
				See the <TomeLink slug="benchmarks" /> for size and performance details.
			</p>
		</TomeSection>
		<TomeSection>
			<TomeSectionHeader text="Usage" />
			<p>
				All four packages share the same formatter and parser API — <code>@fuzdev/tsv</code> and
				<code>@fuzdev/tsv_wasm</code> are drop-in swaps for each other, same function names, same
				options, same errors. Both export the formatter and parser together:
			</p>
			<Code lang="ts" content={usage_example} />
			<p>The formatter alone:</p>
			<Code lang="ts" content={format_example} />
			<p>The parser alone:</p>
			<Code lang="ts" content={parse_example} />
			<p>
				<code>format_typescript</code>, <code>format_css</code>, <code>parse_typescript</code>, and
				<code>parse_css</code> work the same way, and the parsers return Svelte-compatible JSON ASTs
				with bundled TS types. Every parser also takes an acorn-style options object —
				<code>{'{locations: false}'}</code> for the span-only wire (below), plus TypeScript's
				<code>{"{goal: 'script' | 'module'}"}</code>. The native package needs no initialization;
				the WASM packages work zero-config in Node.js, Bun, and Deno (sync auto-init), and browsers
				and bundlers call <code>await init()</code> once first.
			</p>
		</TomeSection>
		<TomeSection>
			<TomeSectionHeader text="Span-only parsing" />
			<p>
				For efficiency, the parsers have a span-only mode that skips the per-node line/column,
				making the AST ~46% smaller and faster to materialize. You can derive line and column later
				without re-parsing. This is the default in oxc-parser.
			</p>
			<Code lang="ts" content={no_locations_example} />
			<p>
				Passing <code>{'{locations: false}'}</code> is faster than the default, because there's
				fewer bytes to emit and parse. Even when you need line/column, reconstructing in JS beats
				the <code>loc</code>-bearing wire end-to-end by ~1.7x on TypeScript (~2.2x for a few
				positions). tsv's default emits <code>loc</code> so that the bare call is a drop-in for
				Svelte's parser. The <code>reconstruct_locations</code> helper is bundled in every package
				that parses, native and WASM alike.
			</p>
			<p>Details:</p>
			<ul>
				<li>
					Span-only drops the per-node <code>loc</code> object (and <code>name_loc</code> on Svelte
					nodes), mirroring acorn's <code>locations: false</code>. The rest is unchanged, so every
					node keeps its <code>start</code>/<code>end</code> offsets.
				</li>
				<li>
					<code>reconstruct_locations(ast, source)</code> walks the tree and adds <code>loc</code>
					back, mutating in place.
				</li>
				<li>
					For sparse lookups, <code>create_locator(source)</code> reuses one line table across
					calls, so you pay for the positions you actually ask for.
				</li>
				<li>
					CSS nodes carry no <code>loc</code> to begin with, so <code>{'{locations: false}'}</code>
					is accepted as an inert no-op there.
				</li>
			</ul>
		</TomeSection>
		<TomeSection>
			<TomeSectionHeader text="Source code" />
			<ul>
				<li>
					<a href="https://github.com/fuzdev/tsv">github.com/fuzdev/tsv</a> — the formatter, parser,
					wasm bindings, CLI, etc
				</li>
				<li>
					<a href="https://github.com/fuzdev/tsv.fuz.dev">github.com/fuzdev/tsv.fuz.dev</a> — this
					website
				</li>
			</ul>
		</TomeSection>
	</section>
</TomeContent>
