import type { SampleLang } from '#lib/code_sample.ts';

/**
 * A `palette_*` utility class per demo language, chosen to evoke each language's
 * identity, for tinting the language buttons in the docs.
 */
export const lang_colors: Record<SampleLang, string> = {
	json: 'palette_e', // gold
	css: 'palette_d', // purple
	ts: 'palette_a', // blue
	rs: 'palette_g', // pink (rust's orange and brown are taken)
	html: 'palette_c', // red
	svelte: 'palette_h', // orange
	md: 'palette_f', // brown
	sh: 'palette_b' // green
};
