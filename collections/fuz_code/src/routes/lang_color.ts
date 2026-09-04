import type { SampleLang } from '$lib/code_sample.ts';

/**
 * A `color_*` utility class per demo language, chosen to evoke each language's
 * identity, for tinting the language buttons in the docs.
 */
export const lang_colors: Record<SampleLang, string> = {
	json: 'color_e', // gold
	css: 'color_d', // purple
	ts: 'color_a', // blue
	rs: 'color_g', // pink (rust's orange and brown are taken)
	html: 'color_c', // red
	svelte: 'color_h', // orange
	md: 'color_f', // brown
	sh: 'color_b' // green
};
