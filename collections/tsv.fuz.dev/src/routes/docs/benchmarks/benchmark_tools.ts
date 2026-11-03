// The benchmarks page's language-support matrix: what each compared tool parses and
// formats, stated by hand from its docs and installed packages (no report field
// carries it), and which of those cells this page times, derived from the reports
// so a mark can't outlive the row it points at.

import type { BenchmarkBaseline } from './benchmark_data.ts';
import {
	CLI_SINGLE_FILE_KEY,
	CLI_SVELTE_KEY,
	CLI_TS_REPO_KEY,
	type BenchmarksCliReport
} from './benchmarks_cli.ts';

/** The matrix's language columns, in display order. */
export const TOOL_LANGUAGES = ['typescript', 'jsx', 'css', 'scss', 'svelte'] as const;
export type ToolLanguage = (typeof TOOL_LANGUAGES)[number];

export const TOOL_LANGUAGE_LABELS: Record<ToolLanguage, string> = {
	typescript: 'TS/JS',
	jsx: 'JSX/TSX',
	css: 'CSS',
	scss: 'SCSS/Less',
	svelte: 'Svelte'
};

/** How a capability is reached when it isn't the tool's own engine, each rendered as a footnote. */
export const TOOL_FOOTNOTES = {
	plugin: 'via prettier-plugin-svelte',
	prettier: 'via the Prettier it bundles, opt-in',
	experimental: 'experimental, behind a flag',
	oxc: "with Oxc's formatters",
	dprint: "with dprint's TypeScript and Malva plugins",
	option: 'with its jsx option',
	syntax: 'via a separate syntax package'
} as const;
export type ToolFootnote = keyof typeof TOOL_FOOTNOTES;

/** Parse means an AST handed to JS callers, not a parser used only inside the tool. */
export type ToolOperation = 'parse' | 'format';

/** One capability: the tool's own engine (`true`), or the footnote naming how it's reached. */
export type ToolCapability = true | ToolFootnote;

export interface ToolSupport {
	name: string;
	url?: string;
	languages: Partial<Record<ToolLanguage, Partial<Record<ToolOperation, ToolCapability>>>>;
	/** Notable languages beyond the columns, as a short list. */
	other?: string;
	/**
	 * The in-process report rows its timings live under, per operation — a name
	 * identifies a row only within its operation's groups (tsv's `tsv` is both).
	 */
	rows: Partial<Record<ToolOperation, ReadonlyArray<string>>>;
	/** Its rows in the CLI report, which times formatting only. */
	cli_labels?: ReadonlyArray<string>;
}

/** Every tool the page compares, tsv first, then the references, then the rest. */
export const TOOL_SUPPORT: ReadonlyArray<ToolSupport> = [
	{
		name: 'tsv',
		languages: {
			typescript: { parse: true, format: true },
			css: { parse: true, format: true },
			svelte: { parse: true, format: true }
		},
		rows: {
			parse: [
				'tsv',
				'tsv+locations',
				'tsv-internal',
				'tsv-wasm',
				'tsv-wasm+locations',
				'tsv-wasm-internal'
			],
			format: ['tsv', 'tsv-wasm']
		},
		cli_labels: ['tsv']
	},
	{
		name: 'Prettier',
		url: 'https://prettier.io/',
		languages: {
			typescript: { format: true },
			jsx: { format: true },
			css: { format: true },
			scss: { format: true },
			svelte: { format: 'plugin' }
		},
		other: 'JSON, YAML, Markdown, GraphQL, HTML, Vue, …',
		rows: { format: ['prettier'] },
		cli_labels: ['prettier', 'prettier + oxc-parser']
	},
	{
		name: 'svelte/compiler, acorn-typescript',
		url: 'https://svelte.dev/docs/svelte/svelte-compiler',
		languages: {
			typescript: { parse: true },
			jsx: { parse: 'option' },
			css: { parse: true },
			svelte: { parse: true }
		},
		rows: { parse: ['svelte/compiler', 'acorn-typescript'] }
	},
	{
		name: 'Oxc',
		url: 'https://oxc.rs/',
		languages: {
			typescript: { parse: true, format: true },
			jsx: { parse: true, format: true },
			css: { format: true },
			scss: { format: true },
			svelte: { format: 'prettier' }
		},
		other: 'JSON, TOML, YAML, GraphQL, Markdown; MDX, HTML, Vue, … via Prettier',
		rows: { parse: ['oxc-parser', 'oxc-parser-raw', 'oxc-parser-wasm'], format: ['oxfmt'] },
		cli_labels: ['oxfmt']
	},
	{
		name: 'Biome',
		url: 'https://biomejs.dev/',
		languages: {
			typescript: { format: true },
			jsx: { format: true },
			css: { format: true },
			svelte: { format: 'experimental' }
		},
		other: 'JSON, GraphQL, GritQL, HTML (opt-in), and experimental Vue, Astro',
		rows: { format: ['biome-wasm'] },
		cli_labels: ['biome']
	},
	{
		name: 'rsvelte',
		url: 'https://github.com/baseballyama/rsvelte',
		languages: {
			typescript: { format: 'oxc' },
			jsx: { format: 'oxc' },
			css: { format: 'oxc' },
			scss: { format: 'oxc' },
			svelte: { parse: true, format: true }
		},
		other: 'JSON, and the rest of what oxfmt formats with oxfmt installed',
		rows: { parse: ['rsvelte-parse', 'rsvelte-parse-skip-expr-loc'], format: ['rsvelte-fmt'] },
		cli_labels: ['rsvelte-fmt']
	},
	{
		name: '@dprint/typescript',
		url: 'https://dprint.dev/plugins/typescript/',
		languages: { typescript: { format: true }, jsx: { format: true } },
		other: "dprint's other plugins add JSON, Markdown, …; Malva and markup_fmt are listed below",
		rows: { format: ['dprint-wasm'] }
	},
	{
		name: 'Malva',
		url: 'https://github.com/g-plane/malva',
		languages: { css: { format: true }, scss: { format: true } },
		other: 'Sass',
		rows: { format: ['malva-wasm'] }
	},
	{
		name: 'markup_fmt',
		url: 'https://github.com/g-plane/markup_fmt',
		languages: { svelte: { format: 'dprint' } },
		other: 'HTML, Vue, Astro, Angular, and template dialects (Jinja, Twig, Vento, …)',
		// its `markup-fmt-wasm` row is coverage-only, never timed, so it marks no cell —
		// list it here if it is ever timed
		rows: {}
	},
	{
		name: 'yuku-parser',
		url: 'https://yuku.fyi/',
		languages: { typescript: { parse: true }, jsx: { parse: true } },
		rows: { parse: ['yuku-parser', 'yuku-parser-wasm'] }
	},
	{
		name: 'swc',
		url: 'https://swc.rs/',
		languages: { typescript: { parse: true }, jsx: { parse: true } },
		other: 'Flow',
		rows: { parse: ['swc'] }
	},
	{
		name: 'PostCSS',
		url: 'https://postcss.org/',
		languages: { css: { parse: true }, scss: { parse: 'syntax' } },
		rows: { parse: ['postcss'] }
	}
];

/**
 * The columns the in-process report has groups for, named as its groups name them;
 * the rest are never timed in process.
 */
const REPORT_LANGUAGES: ReadonlySet<ToolLanguage> = new Set(['typescript', 'css', 'svelte']);

/**
 * The column each CLI scenario formats; the tsv-only delivery scenario compares no
 * tools. The shape test requires every other scenario to be here.
 */
export const CLI_SCENARIO_LANGUAGES: Record<string, ToolLanguage> = {
	[CLI_TS_REPO_KEY]: 'typescript',
	[CLI_SINGLE_FILE_KEY]: 'typescript',
	[CLI_SVELTE_KEY]: 'svelte'
};

export interface ToolCell {
	operation: ToolOperation;
	footnote: ToolFootnote | null;
	/** Whether this page times it, in process or end to end. */
	timed: boolean;
}

export interface ToolMatrixRow {
	name: string;
	url: string | undefined;
	/** Parse before format, empty where the tool does neither. */
	cells: Record<ToolLanguage, Array<ToolCell>>;
	other: string | undefined;
}

/**
 * Whether `tool`'s `operation` on `language` is timed on the page: a timed row in
 * the in-process report's matching group, or, for formatting, a CLI scenario over
 * that language that ran the tool.
 */
export const is_tool_cell_timed = (
	tool: ToolSupport,
	language: ToolLanguage,
	operation: ToolOperation,
	baseline: Pick<BenchmarkBaseline, 'entries'>,
	cli: Pick<BenchmarksCliReport, 'scenarios'>
): boolean => {
	const rows = tool.rows[operation] ?? [];
	const in_process =
		REPORT_LANGUAGES.has(language) &&
		baseline.entries.some(
			(e) =>
				e.group === `${operation}/${language}` &&
				rows.includes(e.name) &&
				e.mean_ns != null &&
				e.mean_ns > 0
		);
	if (in_process) return true;
	if (operation !== 'format' || !tool.cli_labels) return false;
	const cli_labels = tool.cli_labels;
	return cli.scenarios.some(
		(s) =>
			!s.tsv_only &&
			CLI_SCENARIO_LANGUAGES[s.key] === language &&
			s.results.some((r) => cli_labels.includes(r.label))
	);
};

export const derive_tool_matrix = (
	baseline: Pick<BenchmarkBaseline, 'entries'>,
	cli: Pick<BenchmarksCliReport, 'scenarios'>,
	tools: ReadonlyArray<ToolSupport> = TOOL_SUPPORT
): Array<ToolMatrixRow> =>
	tools.map((tool) => {
		const cells = {} as Record<ToolLanguage, Array<ToolCell>>;
		for (const language of TOOL_LANGUAGES) {
			const support = tool.languages[language] ?? {};
			cells[language] = (['parse', 'format'] as const).flatMap((operation) => {
				const capability = support[operation];
				if (capability === undefined) return [];
				return [
					{
						operation,
						footnote: capability === true ? null : capability,
						timed: is_tool_cell_timed(tool, language, operation, baseline, cli)
					}
				];
			});
		}
		return { name: tool.name, url: tool.url, cells, other: tool.other };
	});

/** The footnotes a matrix uses, in the order its cells first reach them. */
export const derive_tool_footnotes = (rows: Array<ToolMatrixRow>): Array<ToolFootnote> => {
	const seen: Array<ToolFootnote> = [];
	for (const row of rows) {
		for (const language of TOOL_LANGUAGES) {
			for (const cell of row.cells[language]) {
				if (cell.footnote && !seen.includes(cell.footnote)) seen.push(cell.footnote);
			}
		}
	}
	return seen;
};
