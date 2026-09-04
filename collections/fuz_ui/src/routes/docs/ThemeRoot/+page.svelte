<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import type { Theme } from '@fuzdev/fuz_css/theme.ts';
	import { default_themes } from '@fuzdev/fuz_css/themes.ts';

	import TomeContent from '$lib/TomeContent.svelte';
	import Details from '$lib/Details.svelte';
	import Dialog from '$lib/Dialog.svelte';
	import DialogContent from '$lib/DialogContent.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';
	import ColorSchemeInput from '$lib/ColorSchemeInput.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import ThemeInput from '$lib/ThemeInput.svelte';
	import ThemeForm from '$routes/ThemeForm.svelte';
	import MdnLink from '$lib/MdnLink.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import { theme_state_context } from '$lib/theme_state.svelte.ts';

	const TOME_SLUG = 'ThemeRoot';

	const tome = tome_get_by_slug(TOME_SLUG);

	const themes = default_themes.slice();

	const get_theme_state = theme_state_context.get();
	const theme_state = $derived(get_theme_state());

	let editing_theme: null | Theme = $state.raw(null);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section class="theme">
		<p>
			Fuz provides UI components that use
			<a href="https://css.fuz.dev/docs/themes">fuz_css' theming system</a>
			for dark mode and custom themes.
		</p>
		<p>
			<DeclarationLink name="ThemeRoot" /> adds global support for both the browser's
			<MdnLink path="Web/CSS/color-scheme" />
			and custom themes based on
			<a href="https://css.fuz.dev/docs/variables">fuz_css style variables</a>, which use
			<MdnLink path="Web/CSS/--*">CSS custom properties</MdnLink>.
			<DeclarationLink name="ThemeRoot" />
			is a singleton component that's mounted at the top-level of the page:
		</p>
		<Code lang="ts" content={`import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';`} />
		<Code content={`<!-- +layout.svelte -->\n<ThemeRoot>\n\t{@render children()}\n</ThemeRoot>`} />
		<Details>
			{#snippet summary()}Why the singleton?{/snippet}
			<aside>
				<p>Most theme usage affects the whole page, so Fuz makes that easy.</p>
				<p>
					By default <DeclarationLink name="ThemeRoot" /> syncs its settings to the global
					<code>:root</code>
					tag and persists to <code>localStorage</code>.
				</p>
				<p>These behaviors can be customized with its props:</p>
				<ul>
					<li><code>sync_color_scheme</code></li>
					<li><code>load_color_scheme</code></li>
					<li><code>save_color_scheme</code></li>
					<li><code>load_theme</code></li>
					<li><code>save_theme</code></li>
				</ul>
			</aside>
		</Details>
		<Details>
			{#snippet summary()}Why nested children?{/snippet}
			<aside>
				<p>
					<DeclarationLink name="ThemeRoot" /> is designed to wrap every page at the top level so it
					can provide the selected theme and color scheme in the Svelte context via a
					<code>theme_state</code>
					instance. It works without children, but <code>theme_state_context.get()</code> will fail
					unless you call
					<code>theme_state_context.set()</code>
					yourself.
				</p>
				<p>
					This lets you call <code>theme_state_context.get()</code> to access the reactive
					<DeclarationLink name="ThemeState" />
					class instance anywhere in your code. The helper components on this page like
					<DeclarationLink name="ColorSchemeInput" /> and <DeclarationLink name="ThemeInput" /> use
					it so they don't require a
					<code>theme_state</code>
					prop.
				</p>
				<p>
					If you don't don't want to wrap everything in <DeclarationLink name="ThemeRoot" /> for
					some reason, you can set a <DeclarationLink name="ThemeState" /> in context manually. It
					must be the same reference as the
					<DeclarationLink name="ThemeRoot" />
					prop:
				</p>
				<Code
					content={'<' +
						`script>
	const theme_state = new ThemeState(...);
	set_theme_state(theme_state);
</script>
<ThemeRoot {theme_state} />
<!--
	sibling components not nested in \`ThemeRoot\`
	can now call \`theme_state_context.get()\`
-->`}
				/>
			</aside>
		</Details>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Color scheme" />
		<p>
			<DeclarationLink name="ThemeRoot" /> defaults to automatic
			<MdnLink path="Web/CSS/color-scheme" />
			detection with
			<MdnLink path="Web/CSS/@media/prefers-color-scheme" />, and users can also set it directly:
		</p>
		<div class="mb_lg">
			<ColorSchemeInput />
		</div>
		<Code
			lang="ts"
			content={`import ColorSchemeInput from '@fuzdev/fuz_ui/ColorSchemeInput.svelte';`}
		/>
		<Code content="<ColorSchemeInput />" />
		<p>Pass props to override the default:</p>
		<!-- TODO this is bugged on page load, auto is SSR'd but doesn't update here, can we fix? Should Svelte prefer the client value? -->
		<Code
			content={`<ColorSchemeInput\n\tvalue={{color_scheme: ${
				"'" + JSON.stringify(theme_state.color_scheme).replace(/"/g, '') + "'"
			}}}\n\tonchange={...}\n/>`}
		/>
		<p>
			The builtin themes support both dark and light color schemes. Custom themes may support one or
			both color schemes.
		</p>
		<Details>
			{#snippet summary()}More about <DeclarationLink name="ColorSchemeInput" />{/snippet}
			<aside>
				<p>
					<DeclarationLink name="ColorSchemeInput" /> enables users to choose and persist the color
					scheme without boilerplate.
				</p>
				<p>
					By default, <DeclarationLink name="ColorSchemeInput" /> works with
					<DeclarationLink name="ThemeRoot" />'s
					<code>theme_state</code> in context to save the user's preference to
					<code>localStorage</code>. To customize this behavior, pass your own <code>value</code> or
					<code>onchange</code>
					props. The <code>value</code> defaults to <code>theme_state_context.get()</code> so
					technically you could call <code>set_theme_state</code>, but it's unlikely you want to
					override it in context.
				</p>
			</aside>
		</Details>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Builtin themes" />
		<p>
			A theme is a simple JSON collection of
			<a href="https://css.fuz.dev/docs/variables">fuz_css style variables</a>
			that can be transformed into CSS that set custom properties. Each variable can have values for
			light and/or dark color schemes. In other words, "dark" isn't a theme, it's a mode that any
			theme can implement.
		</p>
		<!-- TODO explain when exported <Code code={`<ThemeInput\n\t{themes}\n\t{selected_theme}\n/>`} /> -->
		<div class="width_atmost_sm mb_lg">
			<ThemeInput {themes} enable_editing onedit={(t) => (editing_theme = t)} />
		</div>
		<aside>
			⚠️ The builtin themes need a lot more work, but the proof of concept seems to work.
		</aside>
		<aside>
			⚠️ Custom themes currently pop in on page load. To see this, change from the base theme and
			refresh the page. This can be fixed using a similar strategy that we use to avoid pop-in of
			user-defined color schemes, but it's more involved.
		</aside>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Example usage" />
		<p>Themes are plain CSS that can be sourced in a variety of ways.</p>
		<p>
			To use Fuz's base theme, import the CSS generated by <code>vite_plugin_fuz_css</code> - it
			includes the theme variables, base styles, and utility classes your code uses:
		</p>
		<Code
			content={`<!-- +layout.svelte -->
<` +
				`script>
	import 'virtual:fuz.css';
	import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';
	import type {Snippet} from 'svelte';

	const {children}: {children: Snippet} = $props();
</script>

<!-- enable theme and color-scheme support -->
<ThemeRoot>
	{@render children()}
</ThemeRoot>`}
		/>
		<aside>
			Importing <code>@fuzdev/fuz_css/style.css</code> or <code>theme.css</code> alongside
			<code>virtual:fuz.css</code> ships both layers twice - the generated CSS already contains
			them. Those full stylesheets are for utility-only mode, which also sets
			<code>base_css: null</code>
			and <code>variables: null</code> on the plugin.
		</aside>
		<p>
			<DeclarationLink name="ThemeRoot" /> can be customized with the the nonreactive prop
			<code>theme_state</code>:
		</p>
		<Code
			lang="ts"
			content={`import {ThemeState} from '@fuzdev/fuz_ui/theme_state.svelte.js';\nconst theme_state = new ThemeState(...);`}
		/>
		<Code
			content={`<ThemeRoot {theme_state}>
	{@render children()}
</ThemeRoot>`}
		/>
		<aside>
			The <code>theme_state</code> prop is not reactive because it's put in Svelte context without a
			wrapper. This could be fixed, let me know if you have a usecase.
		</aside>
		<p>
			<DeclarationLink name="ThemeRoot" /> sets the <code>theme_state</code> in the Svelte context:
		</p>
		<Code
			lang="ts"
			content={`// get values from the Svelte context provided by
// the nearest \`ThemeRoot\` ancestor:
import {theme_state_context} from '@fuzdev/fuz_ui/theme_state.svelte.js';
const get_theme_state = theme_state_context.get();
const theme_state = $derived(get_theme_state());
theme_state.theme.name; // '${theme_state.theme.name}'
theme_state.color_scheme; // '${theme_state.color_scheme}'`}
		/>
		<p>
			For a more complete example, see <a href="https://github.com/fuzdev/fuz_template">
				fuz_template
			</a>.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="More details" />
		<p>
			<DeclarationLink name="ThemeRoot" /> initializes the system's theme support. Without it, the
			page will not reflect the user's system
			<code>color-scheme</code>. By default, <DeclarationLink name="ThemeRoot" /> applies the base
			theme to the root of the page via <code>create_theme_setup_script</code>. It uses JS to add
			the
			<code>.dark</code> CSS class to the <code>:root</code> element.
		</p>
		<p>
			This strategy enables color scheme and theme support with minimal CSS and optimal performance
			for most use cases. The system supports plain CSS usage that can be static or dynamic, or
			imported at buildtime or runtime. It also allows runtime access to the underlying data like
			the <a href="https://css.fuz.dev/docs/variables">style variables</a> if you want to pay the
			performance costs. Scoped theming to one part of the page is planned.
		</p>
		<p>
			The theme setup script interacts with <code>sync_color_scheme</code> to save the user's
			preference to <code>localStorage</code>. See also <DeclarationLink name="ColorSchemeInput" />.
		</p>
		<p>
			The setup script avoids flash-on-load due to color scheme, but currently themes flash in after
			loading. We'll try to fix this when the system stabilizes.
		</p>
	</TomeSection>
</TomeContent>

{#if editing_theme}
	<Dialog onclose={() => (editing_theme = null)}>
		<DialogContent>
			<ThemeForm
				theme={editing_theme}
				onsave={(theme) => {
					console.log(`update theme`, theme); // eslint-disable-line no-console
					alert('todo'); // eslint-disable-line no-alert
				}}
			/>
		</DialogContent>
	</Dialog>
{/if}
