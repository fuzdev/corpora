import Code from '$lib/Code.svelte';
import CodeHighlight from '$lib/CodeHighlight.svelte';
import type { BenchmarkedImplementation } from './benchmark_types.ts';
import type { CodeSample } from '$lib/code_sample.ts';

/* eslint-disable no-console */

// Find appropriate sample for a language
export const find_sample = (
	samples: Record<string, CodeSample>,
	lang: string
): CodeSample | undefined =>
	Object.values(samples).find((s) => s.lang === lang && s.name.includes('complex'));

// Simple pre-generation using content.repeat()
export const pre_generate_large_contents = (
	samples: Record<string, CodeSample>,
	langs: ReadonlyArray<string>,
	multiplier: number
): Map<string, string> => {
	const large_contents: Map<string, string> = new Map();

	for (const lang of langs) {
		const sample = find_sample(samples, lang);
		if (!sample) continue;

		const large_content = sample.content.repeat(multiplier);
		large_contents.set(lang, large_content);

		// Log the size for debugging
		const size_kb = (new TextEncoder().encode(large_content).length / 1024).toFixed(1);
		console.log(`[Fixtures] Pre-generated ${lang}: ${size_kb}KB (${multiplier}x)`);
	}

	return large_contents;
};

export const implementation_names = ['html', 'ranges'] as const;
export type ImplementationName = (typeof implementation_names)[number];

export const implementations: Array<BenchmarkedImplementation> = [
	{ name: 'html', component: Code, mode: null },
	{ name: 'ranges', component: CodeHighlight, mode: 'ranges' }
];

// Languages to test
export const languages = ['ts', 'rs', 'css', 'html', 'json', 'svelte', 'md', 'sh'] as const;
export type Language = (typeof languages)[number];
