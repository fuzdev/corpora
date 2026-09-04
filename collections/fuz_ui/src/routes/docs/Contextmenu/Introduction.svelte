<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import MdnLink from '$lib/MdnLink.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import Contextmenu from '$lib/Contextmenu.svelte';
	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import Details from '$lib/Details.svelte';
	import RootComponentSelector from './RootComponentSelector.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	/* eslint-disable no-alert */

	const selected = selected_contextmenu_root_component_context.get();
	const ContextmenuRootComponent = $derived(selected.component);
	const root_component_name = $derived(selected.name);
</script>

<TomeSection>
	<TomeSectionHeader text="Introduction" />
	<p>
		Fuz provides a customizable contextmenu that overrides the system contextmenu to provide helpful
		capabilities to users. Popular websites with similar features include Google Docs and Discord.
		Below are caveats about this breaking some user expectations, and a workaround for iOS Safari
		support. See also the <MdnLink path="Web/API/Element/contextmenu_event" /> docs and
		<a href="https://www.w3.org/TR/uievents/#event-type-contextmenu">w3 spec</a>.
	</p>
	<p>
		When you rightclick inside a <DeclarationLink name="ContextmenuRoot" />, or longpress on touch
		devices, it searches the DOM tree for behaviors defined with
		<DeclarationLink name="Contextmenu" />
		starting from the target element up to the root. If any behaviors are found, the Fuz contextmenu
		opens, showing all contextually available actions. If no behaviors are found, the default system
		contextmenu opens.
	</p>
	<p>
		Here's a <code>{root_component_name}</code> with a <DeclarationLink name="Contextmenu" /> inside
		another <DeclarationLink name="Contextmenu" />:
	</p>
	<ContextmenuRootComponent scoped>
		<Contextmenu>
			{#snippet entries()}
				<ContextmenuEntry run={() => alert('alert A')}>alert A</ContextmenuEntry>
			{/snippet}
			<div class="panel p_md mb_lg">
				<p>alert A -- rightclick or longpress here to open the contextmenu</p>
				<Contextmenu>
					{#snippet entries()}
						<ContextmenuEntry run={() => alert('alert B')}>alert B</ContextmenuEntry>
					{/snippet}
					<p class="panel p_md">alert B -- also inherits A</p>
				</Contextmenu>
			</div>
		</Contextmenu>
	</ContextmenuRootComponent>
	<Details>
		{#snippet summary()}
			view code
		{/snippet}
		<Code
			content={`<${root_component_name}>
	<Contextmenu>
		{#snippet entries()}
			<ContextmenuEntry run={() => alert('alert A')}>
				alert A
			</ContextmenuEntry>
		{/snippet}
		<div class="panel p_md mb_lg">
			<p>alert A -- rightclick or longpress here to open the contextmenu</p>
			<Contextmenu>
				{#snippet entries()}
					<ContextmenuEntry run={() => alert('alert B')}>
						alert B
					</ContextmenuEntry>
				{/snippet}
				<p class="panel p_md">
					alert B -- also inherits A
				</p>
			</Contextmenu>
		</div>
	</Contextmenu>
</${root_component_name}>`}
		/>
	</Details>
	<p>
		This simple hierarchical pattern gives users the full contextual actions by default -- not just
		the actions for the target being clicked, but all ancestor actions too. This means users don't
		need to hunt for specific parent elements to find the desired action, unlike many systems --
		instead, all actions in the tree are available, improving UX convenience and predictability at
		the cost of more noisy menus. Developers can opt out of this inheritance behavior by simply not
		nesting <DeclarationLink name="Contextmenu" /> declarations, and submenus are useful for
		managing complexity.
	</p>
	<h4>Mouse and keyboard:</h4>
	<ul>
		<li>
			rightclick opens the Fuz contextmenu and not the system contextmenu (minus current exceptions
			for input/textarea/contenteditable)
		</li>
		<li>holding Shift opens the system contextmenu, bypassing the Fuz contextmenu</li>
		<li>
			keyboard navigation and activation should work similarly to the W3C <a
				href="https://www.w3.org/WAI/ARIA/apg/patterns/menubar/"
			>
				APG menubar pattern
			</a>
		</li>
	</ul>
	<h4>Touch devices:</h4>
	<ul>
		<li>
			longpress opens the Fuz contextmenu and not the system contextmenu (minus current exceptions
			for input/textarea/contenteditable)
		</li>
		<li>
			tap-then-longpress opens the system contextmenu or performs other default behavior like
			selecting text, bypassing the Fuz contextmenu
		</li>
		<li>
			tap-then-longpress can't work for clickable elements like links; longpress on the first
			contextmenu entry for those cases (double-longpress)
		</li>
	</ul>
	<h4>All devices:</h4>
	<ul>
		<li>
			opening the contextmenu on the contextmenu itself shows the system contextmenu, bypassing the
			Fuz contextmenu
		</li>
		<li>
			opening the contextmenu attempts haptic feedback with <MdnLink
				path="Web/API/Navigator/vibrate"
			>
				<code>navigator.vibrate</code>
			</MdnLink>
		</li>
	</ul>
	<RootComponentSelector />
</TomeSection>
