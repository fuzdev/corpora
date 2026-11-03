import type { SvgData } from './svg.ts';
import {
	// TODO when fuz.dev is ready
	// logo_fuz,
	logo_fuz_ui,
	logo_fuz_code,
	logo_mdz,
	logo_fuz_blog,
	logo_fuz_repos,
	logo_fuz_template,
	logo_fuz_css,
	logo_fuz_util,
	logo_gro,
	logo_svelte_docinfo,
	logo_fuz_app,
	logo_tsv
} from './logos.ts';

/**
 * Metadata for a project in the fuz.dev ecosystem, rendered by `ProjectLinks`.
 */
export interface ProjectItem {
	name: string;
	url: string;
	logo: SvgData;
	description: string;
	glyph: string;
	color_class: string;
}

// TODO ideally this wouldn't duplicate metadata like descriptions, but adding fuz_repos to this repo is heavy
// prettier-ignore
export const project_items: Array<ProjectItem> = [
	{name: 'fuz_app', url: 'https://app.fuz.dev/', logo: logo_fuz_app, description: '[pre-alpha] fullstack app library', glyph: '🗝', color_class: 'color_j_50'},
	{name: 'fuz_css', url: 'https://css.fuz.dev/', logo: logo_fuz_css, description: 'semantic-first CSS framework and design system', glyph: '🌿', color_class: 'color_b_50'},
	{name: 'fuz_ui', url: 'https://ui.fuz.dev/', logo: logo_fuz_ui, description: 'Svelte component library and frontend helpers', glyph: '🧶', color_class: 'color_c_50'},
	{name: 'fuz_template', url: 'https://template.fuz.dev/', logo: logo_fuz_template, description: 'starter template for SvelteKit web apps, Rust native tools, or both', glyph: '❄', color_class: 'color_h_50'},
	{name: 'fuz_blog', url: 'https://blog.fuz.dev/', logo: logo_fuz_blog, description: 'blog software from scratch with SvelteKit', glyph: '🖊️', color_class: 'color_e_50'},
	{name: 'fuz_code', url: 'https://code.fuz.dev/', logo: logo_fuz_code, description: 'syntax styling utilities and components for TypeScript, Svelte, Markdown, and more', glyph: '🎨', color_class: 'color_g_50'},
	{name: 'mdz', url: 'https://mdz.fuz.dev/', logo: logo_mdz, description: 'a strict markdown dialect built for streaming, Svelte authoring, docs websites, and untrusted content', glyph: '📝', color_class: 'color_d_50'},
	{name: 'fuz_repos', url: 'https://repos.fuz.dev/', logo: logo_fuz_repos, description: 'a tool for managing many repos', glyph: '🪄', color_class: 'color_a_50'},
	{name: 'svelte-docinfo', url: 'https://svelte-docinfo.fuz.dev/', logo: logo_svelte_docinfo, description: 'static analysis for TypeScript and Svelte', glyph: '📜', color_class: 'color_i_50'},
	{name: 'fuz_util', url: 'https://util.fuz.dev/', logo: logo_fuz_util, description: 'utility belt for JS', glyph: '🦕', color_class: 'color_f_50'},
	{name: 'gro', url: 'https://github.com/fuzdev/gro', logo: logo_gro, description: 'security-first JS runtime and toolchain on V8', glyph: '🌰', color_class: 'color_f_50'},
	{name: 'tsv', url: 'https://tsv.fuz.dev/', logo: logo_tsv, description: 'precise language tools for TypeScript/JS, CSS, and Svelte in Rust', glyph: '🪶', color_class: 'color_h_50'},
];
