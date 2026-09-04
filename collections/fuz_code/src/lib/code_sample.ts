export interface CodeSample {
	name: string;
	lang: string;
	content: string;
}

// Languages ordered from simple to complex
export const sample_langs = ['json', 'css', 'ts', 'rs', 'html', 'svelte', 'md', 'sh'] as const;

export type SampleLang = (typeof sample_langs)[number];
