import { parse, type PreprocessorGroup, type AST } from 'svelte/compiler';
import MagicString from 'magic-string';
import { walk } from 'zimmerframe';
import { should_exclude_path } from '@fuzdev/fuz_util/path.ts';
import { escape_js_string } from '@fuzdev/fuz_util/string.ts';
import {
	find_attribute,
	extract_static_string,
	try_extract_conditional_chain,
	build_static_bindings,
	resolve_component_names,
	handle_preprocess_error,
	type ResolvedComponentImport
} from '@fuzdev/fuz_util/svelte_preprocess_helpers.ts';

import { syntax_styler_global } from './syntax_styler_global.ts';
import type { SyntaxStyler } from './syntax_styler.ts';

/**
 * Options for `svelte_preprocess_fuz_code`.
 */
export interface PreprocessFuzCodeOptions {
	/** File patterns to exclude. */
	exclude?: Array<string | RegExp>;

	/** Custom `SyntaxStyler` instance. @default syntax_styler_global */
	syntax_styler?: SyntaxStyler;

	/** Enable in-memory caching. @default true */
	cache?: boolean;

	/**
	 * Import sources that resolve to the `Code` component.
	 * Used to verify that `<Code>` in templates actually refers to `Code.svelte`.
	 *
	 * @default ['@fuzdev/fuz_code/Code.svelte']
	 */
	component_imports?: Array<string>;

	/**
	 * How to handle errors.
	 * @default 'throw' in CI, 'log' otherwise
	 */
	on_error?: 'log' | 'throw';
}

/**
 * Svelte preprocessor that compiles static `Code` component content at build time,
 * replacing runtime syntax highlighting with pre-rendered HTML.
 *
 * @param options - `PreprocessFuzCodeOptions` configuration
 * @returns a Svelte preprocessor group
 *
 * @example
 * ```ts
 * // svelte.config.js
 * import {svelte_preprocess_fuz_code} from '@fuzdev/fuz_code/svelte_preprocess_fuz_code.ts';
 *
 * export default {
 *   preprocess: [svelte_preprocess_fuz_code(), vitePreprocess()],
 * };
 * ```
 */
export const svelte_preprocess_fuz_code = (
	options: PreprocessFuzCodeOptions = {}
): PreprocessorGroup => {
	const {
		exclude = [],
		syntax_styler = syntax_styler_global,
		cache = true,
		component_imports = ['@fuzdev/fuz_code/Code.svelte'],
		on_error = process.env.CI === 'true' ? 'throw' : 'log'
	} = options;

	// In-memory cache: content+lang hash → highlighted HTML
	const highlight_cache: Map<string, string> = new Map();

	return {
		name: 'fuz-code',

		markup: ({ content, filename }) => {
			// Skip excluded files
			if (should_exclude_path(filename, exclude)) {
				return { code: content };
			}

			// Quick check: does file import from a known Code component source?
			if (!component_imports.some((source) => content.includes(source))) {
				return { code: content };
			}

			const s = new MagicString(content);
			const ast = parse(content, { filename, modern: true });

			// Resolve which local names map to the Code component
			const code_names = resolve_component_names(ast, component_imports);
			if (code_names.size === 0) {
				return { code: content };
			}

			const bindings = build_static_bindings(ast);

			// Find Code component usages with static content
			const transformations = find_code_usages(ast, syntax_styler, code_names, {
				cache: cache ? highlight_cache : null,
				on_error,
				filename,
				source: content,
				bindings
			});

			if (transformations.length === 0) {
				return { code: content };
			}

			// Apply transformations
			for (const t of transformations) {
				s.overwrite(t.start, t.end, t.replacement);
			}

			return {
				code: s.toString(),
				map: s.generateMap({ hires: true })
			};
		}
	};
};

interface Transformation {
	start: number;
	end: number;
	replacement: string;
}

interface FindCodeUsagesOptions {
	cache: Map<string, string> | null;
	on_error: 'log' | 'throw';
	filename: string | undefined;
	source: string;
	bindings: ReadonlyMap<string, string>;
}

/**
 * Attempts to highlight content, using cache if available.
 * Returns the highlighted HTML, or `null` on error.
 */
const try_highlight = (
	text: string,
	lang: string,
	syntax_styler: SyntaxStyler,
	options: FindCodeUsagesOptions
): string | null => {
	const cache_key = `${lang}:${text}`;
	let html = options.cache?.get(cache_key);
	if (html == null) {
		try {
			html = syntax_styler.stylize(text, lang);
			options.cache?.set(cache_key, html);
		} catch (error) {
			handle_preprocess_error(error, '[fuz-code]', options.filename, options.on_error);
			return null;
		}
	}
	return html;
};

/**
 * Walks the AST to find `Code` component usages with static `content` props
 * and generates transformations to replace them with `dangerous_raw_html`.
 */
const find_code_usages = (
	ast: AST.Root,
	syntax_styler: SyntaxStyler,
	code_names: Map<string, ResolvedComponentImport>,
	options: FindCodeUsagesOptions
): Array<Transformation> => {
	const transformations: Array<Transformation> = [];

	walk(ast.fragment as any, null, {
		Component(node: AST.Component, context: { next: () => void }) {
			// Always recurse into children - without this, Code components
			// nested inside other components would be missed, because zimmerframe
			// does not auto-recurse when a visitor is defined for a node type.
			context.next();

			if (!code_names.has(node.name)) return;

			// Skip if spread attributes present — can't determine content statically
			if (node.attributes.some((attr) => attr.type === 'SpreadAttribute')) return;

			const content_attr = find_attribute(node, 'content');
			if (!content_attr) return;

			// Skip if already preprocessed or a custom syntax_styler is provided
			if (find_attribute(node, 'dangerous_raw_html') || find_attribute(node, 'syntax_styler')) {
				return;
			}

			// Resolve language - must be static and supported
			const lang_attr = find_attribute(node, 'lang');
			const lang_value = lang_attr
				? extract_static_string(lang_attr.value, options.bindings)
				: 'svelte';
			if (lang_value === null) return;
			if (!syntax_styler.has_lang(lang_value)) return;

			// Try simple static string
			const content_value = extract_static_string(content_attr.value, options.bindings);
			if (content_value !== null) {
				const html = try_highlight(content_value, lang_value, syntax_styler, options);
				if (html === null || html === content_value) return;
				transformations.push({
					start: content_attr.start,
					end: content_attr.end,
					replacement: `dangerous_raw_html={'${escape_js_string(html)}'}`
				});
				return;
			}

			// Try conditional chain (handles both simple and nested ternaries)
			const chain = try_extract_conditional_chain(
				content_attr.value,
				options.source,
				options.bindings
			);
			if (chain) {
				// Highlight all branches
				const highlighted: Array<{ html: string; original: string }> = [];
				let any_changed = false;
				for (const branch of chain) {
					const html = try_highlight(branch.value, lang_value, syntax_styler, options);
					if (html === null) return;
					if (html !== branch.value) any_changed = true;
					highlighted.push({ html, original: branch.value });
				}
				if (!any_changed) return;

				// Build nested ternary expression for dangerous_raw_html
				// chain: [{test_source: 'a', value: ...}, {test_source: 'b', value: ...}, {test_source: null, value: ...}]
				// → a ? 'html_a' : b ? 'html_b' : 'html_c'
				let expr = '';
				for (let i = 0; i < chain.length; i++) {
					const branch = chain[i]!;
					const html = highlighted[i]!.html;
					if (branch.test_source !== null) {
						expr += `${branch.test_source} ? '${escape_js_string(html)}' : `;
					} else {
						expr += `'${escape_js_string(html)}'`;
					}
				}

				transformations.push({
					start: content_attr.start,
					end: content_attr.end,
					replacement: `dangerous_raw_html={${expr}}`
				});
			}
		}
	});

	return transformations;
};
