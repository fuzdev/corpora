import { color_schemes, type ColorScheme, type Theme } from '@fuzdev/fuz_css/theme.ts';
import { default_themes } from '@fuzdev/fuz_css/themes.ts';
import { BROWSER } from 'esm-env';

import { create_context } from './context_helpers.ts';
import { load_from_storage, save_to_storage } from './storage.ts';

export interface ThemeStateJson {
	theme: Theme;
	color_scheme: ColorScheme;
}

export type ThemeStateOptions = Partial<ThemeStateJson>;

export class ThemeState {
	theme: Theme = $state.raw()!;
	color_scheme: ColorScheme = $state.raw()!;

	constructor(options?: ThemeStateOptions) {
		const theme = options?.theme ?? default_themes[0]!;
		const color_scheme = options?.color_scheme ?? 'auto';
		if (parse_color_scheme(color_scheme) === null) {
			throw Error('unknown color scheme: ' + color_scheme);
		}
		this.theme = theme;
		this.color_scheme = color_scheme; // TODO `resolved_color_scheme` if auto? users could then do different things based on the final value - would not be added to `ThemeStateJson`
	}

	toJSON(): ThemeStateJson {
		return {
			theme: this.theme,
			color_scheme: this.color_scheme
		};
	}
}
export const theme_state_context = create_context<() => ThemeState>();

export const sync_color_scheme = (color_scheme: ColorScheme | null): void => {
	if (!BROWSER) return;
	const dark =
		color_scheme === 'dark' ||
		(color_scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.classList.add(dark ? 'dark' : 'light');
	document.documentElement.classList.remove(dark ? 'light' : 'dark');
};

export const COLOR_SCHEME_STORAGE_KEY = 'fuz:color-scheme';
export const THEME_STORAGE_KEY = 'fuz:theme';

export const save_color_scheme = (
	color_scheme: ColorScheme | null,
	key = COLOR_SCHEME_STORAGE_KEY
): void => {
	save_to_storage(key, color_scheme);
};

export const load_color_scheme = (
	fallback: ColorScheme = 'auto',
	key = COLOR_SCHEME_STORAGE_KEY
): ColorScheme => load_from_storage(key, false, parse_color_scheme) ?? fallback;

export const save_theme = (theme: Theme | null, key = THEME_STORAGE_KEY): void => {
	save_to_storage(key, theme, true);
};

export const load_theme = (fallback: Theme = default_themes[0]!, key = THEME_STORAGE_KEY): Theme =>
	load_from_storage<Theme>(key, true) ?? fallback; // TODO use `parse_theme` from fuz_css

// TODO move to fuz_css
const parse_color_scheme = (value: unknown): ColorScheme | null =>
	color_schemes.includes(value as any) ? (value as ColorScheme) : null;
