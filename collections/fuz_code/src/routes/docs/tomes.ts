import type { Tome } from '@fuzdev/fuz_ui/tome.ts';
import UsagePage from './usage/+page.svelte';
import SamplesPage from './samples/+page.svelte';
import TextareaPage from './textarea/+page.svelte';
import BenchmarkPage from './benchmark/+page.svelte';
import ApiPage from './api/+page.svelte';

export const tomes: Array<Tome> = [
	{
		slug: 'usage',
		category: 'guide',
		Component: UsagePage,
		related_tomes: ['samples', 'textarea', 'benchmark'],
		related_modules: [
			'syntax_styler.ts',
			'syntax_styler_global.ts',
			'svelte_preprocess_fuz_code.ts'
		],
		related_declarations: ['Code', 'SyntaxStyler', 'syntax_styler_global']
	},
	{
		slug: 'samples',
		category: 'explore',
		Component: SamplesPage,
		related_tomes: ['usage', 'textarea', 'benchmark'],
		related_modules: [],
		related_declarations: ['Code', 'CodeHighlight']
	},
	{
		slug: 'textarea',
		category: 'explore',
		Component: TextareaPage,
		related_tomes: ['usage', 'samples'],
		related_modules: [],
		related_declarations: ['CodeTextarea', 'CodeHighlight']
	},
	{
		slug: 'benchmark',
		category: 'explore',
		Component: BenchmarkPage,
		related_tomes: ['usage', 'samples'],
		related_modules: ['syntax_styler.ts', 'syntax_styler_global.ts'],
		related_declarations: ['syntax_styler_global', 'SyntaxStyler', 'Code']
	},
	{
		slug: 'api',
		category: 'reference',
		Component: ApiPage,
		related_tomes: ['usage'],
		related_modules: [],
		related_declarations: []
	}
];
