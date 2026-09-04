import type { Tome } from '$lib/tome.ts';
import introduction from './introduction/+page.svelte';
import ThemeRoot from './ThemeRoot/+page.svelte';
import PendingAnimation from './PendingAnimation/+page.svelte';
import PendingButton from './PendingButton/+page.svelte';
import LibrarySummary from './LibrarySummary/+page.svelte';
import LibraryDetail from './LibraryDetail/+page.svelte';
import Details from './Details/+page.svelte';
import Dialog from './Dialog/+page.svelte';
import Teleport from './Teleport/+page.svelte';
import Alert from './Alert/+page.svelte';
import Docs from './Docs/+page.svelte';
import Library from './Library/+page.svelte';
import Contextmenu from './Contextmenu/+page.svelte';
import Redirect from './Redirect/+page.svelte';
import HueInput from './HueInput/+page.svelte';
import Breadcrumb from './Breadcrumb/+page.svelte';
import Card from './Card/+page.svelte';
import Sparkline from './Sparkline/+page.svelte';
import Svg from './Svg/+page.svelte';
import csp from './csp/+page.svelte';
import icons from './icons/+page.svelte';
import logos from './logos/+page.svelte';
import theming from './theming/+page.svelte';
import api from './api/+page.svelte';
import intersect from './intersect/+page.svelte';
import vite_plugin_pkg_json from './vite_plugin_pkg_json/+page.svelte';

// TODO maybe decouple `related` from `Tome` to get bidirectionality for free

// TODO consider with auto-discovery and exported metadata per-component

// TODO maybe decouple related links from Tome to get bidirectionality for free

export const tomes: Array<Tome> = [
	{
		slug: 'introduction',
		category: 'guide',
		Component: introduction,
		related_tomes: ['api'],
		related_modules: [],
		related_declarations: []
	},
	{
		slug: 'theming',
		category: 'guide',
		Component: theming,
		related_tomes: ['ThemeRoot'],
		related_modules: ['theme_state.svelte.ts'],
		related_declarations: ['ThemeRoot', 'ThemeState']
	},
	{
		slug: 'api',
		category: 'guide',
		Component: api,
		related_tomes: [],
		related_modules: [],
		related_declarations: []
	},
	{
		slug: 'vite_plugin_pkg_json',
		category: 'helpers',
		Component: vite_plugin_pkg_json,
		related_tomes: ['LibraryDetail'],
		related_modules: ['vite_plugin_pkg_json.ts'],
		related_declarations: ['vite_plugin_pkg_json']
	},
	{
		slug: 'csp',
		category: 'helpers',
		Component: csp,
		related_tomes: [],
		related_modules: ['csp.ts'],
		related_declarations: []
	},
	{
		slug: 'intersect',
		category: 'helpers',
		Component: intersect,
		related_tomes: [],
		related_modules: ['intersect.svelte.ts'],
		related_declarations: []
	},
	{
		slug: 'icons',
		category: 'helpers',
		Component: icons,
		related_tomes: ['logos', 'Svg'],
		related_modules: ['icons.ts'],
		related_declarations: []
	},
	{
		slug: 'logos',
		category: 'helpers',
		Component: logos,
		related_tomes: ['LibraryDetail', 'LibrarySummary', 'Svg'],
		related_modules: ['logos.ts'],
		related_declarations: []
	},
	{
		slug: 'Alert',
		category: 'components',
		Component: Alert,
		related_tomes: ['Card'],
		related_modules: [],
		related_declarations: ['Alert']
	},
	{
		slug: 'Breadcrumb',
		category: 'components',
		Component: Breadcrumb,
		related_tomes: ['Redirect'],
		related_modules: [],
		related_declarations: ['Breadcrumb']
	},
	{
		slug: 'Card',
		category: 'components',
		Component: Card,
		related_tomes: ['Alert'],
		related_modules: [],
		related_declarations: ['Card']
	},
	{
		slug: 'Contextmenu',
		category: 'components',
		Component: Contextmenu,
		related_tomes: [],
		related_modules: ['contextmenu_helpers.ts', 'contextmenu_state.svelte.ts'],
		related_declarations: ['Contextmenu', 'ContextmenuRoot', 'ContextmenuEntry']
	},
	{
		slug: 'Details',
		category: 'components',
		Component: Details,
		related_tomes: [],
		related_modules: [],
		related_declarations: ['Details']
	},
	{
		slug: 'Dialog',
		category: 'components',
		Component: Dialog,
		related_tomes: [],
		related_modules: ['dialog.ts'],
		related_declarations: ['Dialog', 'DialogContent']
	},
	{
		slug: 'HueInput',
		category: 'components',
		Component: HueInput,
		related_tomes: [], // TODO externals?
		related_modules: [],
		related_declarations: ['HueInput']
	},
	{
		slug: 'Docs',
		category: 'components',
		Component: Docs,
		related_tomes: ['Library', 'LibraryDetail', 'LibrarySummary'],
		related_modules: [],
		related_declarations: ['Docs']
	},
	{
		slug: 'Library',
		category: 'components',
		Component: Library,
		related_tomes: ['Docs', 'LibraryDetail', 'LibrarySummary', 'api'],
		related_modules: [],
		related_declarations: ['Library']
	},
	{
		slug: 'LibraryDetail',
		category: 'components',
		Component: LibraryDetail,
		related_tomes: ['api', 'logos', 'LibrarySummary'],
		related_modules: [],
		related_declarations: ['LibraryDetail']
	},
	{
		slug: 'LibrarySummary',
		category: 'components',
		Component: LibrarySummary,
		related_tomes: ['api', 'logos', 'LibraryDetail'],
		related_modules: [],
		related_declarations: ['LibrarySummary']
	},
	{
		slug: 'PendingAnimation',
		category: 'components',
		Component: PendingAnimation,
		related_tomes: ['PendingButton'],
		related_modules: [],
		related_declarations: ['PendingAnimation']
	},
	{
		slug: 'PendingButton',
		category: 'components',
		Component: PendingButton,
		related_tomes: ['PendingAnimation'],
		related_modules: [],
		related_declarations: ['PendingButton']
	},
	{
		slug: 'Redirect',
		category: 'components',
		Component: Redirect,
		related_tomes: ['Breadcrumb'],
		related_modules: [],
		related_declarations: ['Redirect']
	},
	{
		slug: 'Sparkline',
		category: 'components',
		Component: Sparkline,
		related_tomes: ['Svg'],
		related_modules: ['sparkline.ts', 'project_stats.ts', 'projects.ts'],
		related_declarations: ['Sparkline', 'ProjectActivityChart']
	},
	{
		slug: 'Svg',
		category: 'components',
		Component: Svg,
		related_tomes: ['logos'],
		related_modules: ['svg.ts'],
		related_declarations: ['Svg']
	},
	{
		slug: 'Teleport',
		category: 'components',
		Component: Teleport,
		related_tomes: [],
		related_modules: [],
		related_declarations: ['Teleport']
	},
	{
		slug: 'ThemeRoot',
		category: 'components',
		Component: ThemeRoot,
		related_tomes: ['theming'],
		related_modules: [],
		related_declarations: ['ThemeRoot']
	}
];
