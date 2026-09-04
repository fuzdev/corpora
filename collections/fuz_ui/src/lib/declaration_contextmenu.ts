import type { Declaration } from './declaration.svelte.ts';
import type { ContextmenuParams } from './contextmenu_state.svelte.ts';

// TODO @many expand contextmenus for docs

export const create_declaration_contextmenu = (
	declaration: Declaration
): Array<ContextmenuParams> => {
	const entries: Array<ContextmenuParams> = [];

	// View source on GitHub
	if (declaration.url_github) {
		entries.push({
			snippet: 'link',
			props: {
				href: declaration.url_github
			}
		});
	}

	return entries;
};
