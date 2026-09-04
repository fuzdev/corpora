/**
 * Pathological input generators for the lexer engine — workload classes that
 * realistic samples don't cover: deep nesting, huge single lines, very long
 * and escape-heavy strings, many tiny tokens, colon/angle/paren-dense
 * text that stresses the ts lexer's bounded heuristic scans
 * (`scan_type_annotation`, `scan_balanced_angle`, `is_function_variable`),
 * and probe-starved text — dense in a construct char while lacking a char
 * its scanner probes for (`<` vs `{` vs `&`, link `]`/`)`) — that stresses
 * the monotonic probe caches (`advance_probe`).
 *
 * Shared by the linearity suite (`lexer.pathological.test.ts`) and the
 * benchmark runner (`benchmark/benchmarks.ts`) so the same workloads are both
 * CI-enforced and perf-tracked.
 *
 * @module
 */

export interface PathologicalCase {
	name: string;
	lang: string;
	/**
	 * Generates an input of approximately `size` chars (at least one repetition
	 * of the case's building block, so tiny sizes still produce valid input).
	 */
	generate: (size: number) => string;
}

const repeat_to_size = (unit: string, size: number): string =>
	unit.repeat(Math.max(1, Math.round(size / unit.length)));

// fixed nesting depth for the repeated-block deep-nesting cases — constant
// depth repeated to reach the target size, measuring input-length scaling at
// realistic nesting. The *_full_depth cases scale nesting depth with size
// instead: linear because substitution/interpolation interiors discover their
// own closing delimiters during real tokenization (a per-level close-prescan
// would make them O(depth²)). Unbounded-depth stack safety is covered by the
// per-lexer `deep nesting` test suites.
const NESTING_DEPTH = 32;

export const PATHOLOGICAL_CASES: Array<PathologicalCase> = [
	{
		// every `:` triggers a type-annotation lookahead that finds no `=` —
		// the measured trigger from the design sheet (§10)
		name: 'ts_colon_dense',
		lang: 'ts',
		generate: (size) => repeat_to_size('a:', size)
	},
	{
		// every ident is followed by `<` that never balances, so each one pays
		// the bounded generic-call angle scan
		name: 'ts_angle_dense',
		lang: 'ts',
		generate: (size) => repeat_to_size('a<', size)
	},
	{
		// every ident is followed by `= (` with no closing paren in reach, so
		// `is_function_variable` pays the bounded balanced-paren scan
		name: 'ts_paren_dense',
		lang: 'ts',
		generate: (size) => repeat_to_size('a=(', size)
	},
	{
		// template literals with interpolations nested NESTING_DEPTH deep
		name: 'ts_deep_template',
		lang: 'ts',
		generate: (size) =>
			repeat_to_size('`${'.repeat(NESTING_DEPTH) + '1' + '}`'.repeat(NESTING_DEPTH) + ';\n', size)
	},
	{
		// one enormous line of ordinary code — no newlines anywhere
		name: 'ts_huge_line',
		lang: 'ts',
		generate: (size) => repeat_to_size("const x1 = fn(a, 'str') + 42; ", size)
	},
	{
		// a single giant string literal
		name: 'ts_long_string',
		lang: 'ts',
		generate: (size) => `const s = "${'x'.repeat(Math.max(1, size - 14))}";`
	},
	{
		// a single string that is nothing but escapes
		name: 'ts_escape_heavy',
		lang: 'ts',
		generate: (size) => `const s = "${'\\x'.repeat(Math.max(1, Math.floor(size / 2) - 7))}";`
	},
	{
		// maximum token density — operator/number/punctuation every few chars
		name: 'ts_many_tiny',
		lang: 'ts',
		generate: (size) => repeat_to_size('a=1;', size)
	},
	{
		// one giant punctuation run — stresses emit-time span coalescing
		name: 'json_deep_array',
		lang: 'json',
		generate: (size: number): string => {
			const half = Math.max(1, Math.floor((size - 1) / 2));
			return '['.repeat(half) + '1' + ']'.repeat(half);
		}
	},
	{
		// every `<` opens a tag that never closes — one giant unterminated tag
		// churning through attribute names
		name: 'html_angle_flood',
		lang: 'html',
		generate: (size) => repeat_to_size('<a ', size)
	},
	{
		// attribute-dense tags in every value form
		name: 'html_attr_dense',
		lang: 'html',
		generate: (size) => repeat_to_size('<a b="c" d=e f>', size)
	},
	{
		// entity-dense text
		name: 'html_entity_dense',
		lang: 'html',
		generate: (size) => repeat_to_size('&amp;x', size)
	},
	{
		// expression-dense template text — balancer + ts embed per `{…}`
		name: 'svelte_expression_dense',
		lang: 'svelte',
		generate: (size) => repeat_to_size('{x}', size)
	},
	{
		// emphasis-delimiter-dense text — every `*`/`_` probes for a closer
		name: 'md_emphasis_dense',
		lang: 'md',
		generate: (size) => repeat_to_size('*a _b ', size)
	},
	{
		// fence-dense markdown — block scanner + close-fence line scans
		name: 'md_fence_dense',
		lang: 'md',
		generate: (size) => repeat_to_size('```ts\nlet x = 1;\n```\n', size)
	},
	{
		// `[`-dense text with no closing `]` — each `[` probes for a link closer
		// that never comes; a naive per-`[` forward scan would be quadratic
		name: 'md_bracket_dense',
		lang: 'md',
		generate: (size) => repeat_to_size('[', size)
	},
	{
		// `[x](`-dense text — exercises both the `]` and `)` link-closer probes
		// with no closing `)` in reach
		name: 'md_link_paren_dense',
		lang: 'md',
		generate: (size) => repeat_to_size('[x](', size)
	},
	{
		// expression-valued attributes — tag scanner + expression interplay
		name: 'svelte_attr_expr_dense',
		lang: 'svelte',
		generate: (size) => repeat_to_size('<a b={c} {d} />', size)
	},
	{
		// tag-dense svelte with no `{` anywhere — the expression-brace probe
		// never hits, so it must be cached rather than re-run per tag
		name: 'svelte_tag_only_dense',
		lang: 'svelte',
		generate: (size) => repeat_to_size('<i>a</i>', size)
	},
	{
		// tag-dense html with no `&` anywhere — the entity probe never hits, so
		// it must be cached across text gaps and attribute values
		name: 'html_no_entity_dense',
		lang: 'html',
		generate: (size) => repeat_to_size('<i>a</i>', size)
	},
	{
		// one raw-markup tag per line — md threads the markup probe caches
		// across lines, so an absent `&` costs one probe per document, not one
		// per line
		name: 'md_tag_per_line',
		lang: 'md',
		generate: (size) => repeat_to_size('<b c="d">x</b>\n', size)
	},
	{
		// one link opener per line with no `)` anywhere — the link probes must
		// stay monotonic across lines, not just within one
		name: 'md_link_paren_per_line',
		lang: 'md',
		generate: (size) => repeat_to_size('[x](y\n', size)
	},
	{
		// nested rules NESTING_DEPTH deep — the native-nesting state stack
		name: 'css_deep_nesting',
		lang: 'css',
		generate: (size) =>
			repeat_to_size('a{'.repeat(NESTING_DEPTH) + 'color:red;' + '}'.repeat(NESTING_DEPTH), size)
	},
	{
		// command substitutions NESTING_DEPTH deep
		name: 'bash_deep_command_sub',
		lang: 'sh',
		generate: (size) =>
			repeat_to_size(
				'echo $('.repeat(NESTING_DEPTH) + 'ls' + ')'.repeat(NESTING_DEPTH) + '\n',
				size
			)
	},
	{
		// one interpolation nest as deep as the input allows — every char is a
		// delimiter of the same construct, so any per-level rescan is quadratic
		name: 'ts_template_full_depth',
		lang: 'ts',
		generate: (size: number): string => {
			const depth = Math.max(1, Math.floor(size / 5));
			return '`${'.repeat(depth) + '1' + '}`'.repeat(depth);
		}
	},
	{
		// one command-substitution nest as deep as the input allows
		name: 'bash_cmdsub_full_depth',
		lang: 'sh',
		generate: (size: number): string => {
			const depth = Math.max(1, Math.floor(size / 3));
			return '$('.repeat(depth) + 'x' + ')'.repeat(depth);
		}
	},
	{
		// heredocs opened inside command substitutions, nested as deep as the
		// input allows — each body suspends at the next `$(`, so the closing
		// delimiter must be discovered in the same forward pass (a per-heredoc
		// close-prescan would be O(depth²), the bug this case guards against)
		name: 'bash_heredoc_sub_full_depth',
		lang: 'sh',
		generate: (size: number): string => {
			const depth = Math.max(1, Math.floor(size / 12));
			return '$(cat <<EOF\n'.repeat(depth) + 'x';
		}
	},
	{
		// many sequential heredocs with expanded, substitution-bearing bodies —
		// exercises the line-walk close scan and the suspend/resume drain at scale
		name: 'bash_heredoc_dense',
		lang: 'sh',
		generate: (size) => repeat_to_size('cat <<EOF\nx $y $(z)\nEOF\n', size)
	},
	{
		// a cascade of unterminated ```md fences — each embeds the rest of the
		// document as markdown, bounded by the embed depth cap
		name: 'md_deep_self_embed',
		lang: 'md',
		generate: (size) => repeat_to_size('```md\n', size)
	},
	{
		// every `'` triggers the lifetime-vs-char ident scan
		name: 'rust_lifetime_dense',
		lang: 'rust',
		generate: (size) => repeat_to_size("'a ", size)
	},
	{
		// one attribute per few chars — each pays the balanced-bracket scan
		name: 'rust_attr_dense',
		lang: 'rust',
		generate: (size) => repeat_to_size('#[a]', size)
	},
	{
		// one block comment nested as deep as the input allows — the nesting
		// depth counter must resolve it in a single forward pass
		name: 'rust_comment_full_depth',
		lang: 'rust',
		generate: (size: number): string => '/*'.repeat(Math.max(1, Math.floor(size / 2)))
	},
	{
		// a raw string dense in `"` that never carries enough hashes to close —
		// each quote probe must advance rather than rescan
		name: 'rust_raw_hash_dense',
		lang: 'rust',
		generate: (size: number): string =>
			'r##"' + '"#'.repeat(Math.max(1, Math.floor((size - 7) / 2))) + '"##'
	}
];
