<script lang="ts">
	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import Contextmenu from '$lib/Contextmenu.svelte';
	import { ContextmenuState } from '$lib/contextmenu_state.svelte.ts';
	import MdnLink from '$lib/MdnLink.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	const selected = selected_contextmenu_root_component_context.get();
	const ContextmenuRootComponent = $derived(selected.component);

	const contextmenu = new ContextmenuState();

	// TODO maybe pass `contextmenu` to the children snippet

	let toggled = $state.raw(false);

	let text_el: HTMLElement | undefined = $state.raw();

	const select_text = () => {
		const selection = window.getSelection();
		if (!selection || !text_el) return;
		const range = document.createRange();
		range.selectNodeContents(text_el);
		selection.removeAllRanges();
		selection.addRange(range);
	};

	let value = $state.raw('');

	// TODO very hacky
	const text1 = `If a contextmenu is triggered on selected text, it includes a 'copy text' entry.  Try selecting text and then opening the contextmenu on it.`;
	const text2 = `If a contextmenu is triggered on selected text, it includes a 'copy text' entry.\n\n\nTry selecting text and then opening the contextmenu on it.`;
	const text3 = `If a contextmenu is triggered on selected text, it includes a 'copy text' entry.

Try selecting text and then opening the contextmenu on it.`;

	const highlighted = $derived(value === text1 || value === text2 || value === text3);
</script>

<ContextmenuRootComponent {contextmenu} scoped>
	<TomeSection>
		<div class:color_d_50={highlighted}>
			<TomeSectionHeader text="Select text" />
		</div>
		<Contextmenu>
			{#snippet entries()}
				<ContextmenuEntry run={() => void (toggled = !toggled)}>Toggle something</ContextmenuEntry>
			{/snippet}
			<div class="panel p_md" class:color_g_50={highlighted}>
				<div bind:this={text_el} class="mb_lg">
					<p>
						When the Fuz contextmenu opens and the user has selected text, the menu includes a
						<code>copy text</code>
						entry.
					</p>
					<p>
						Try <button type="button" onclick={select_text} class:color_a={toggled}>
							selecting text
						</button>
						and then opening the contextmenu on it.
					</p>
				</div>
				<label>
					<input type="text" placeholder="paste text here?" bind:value />
				</label>
				<p class:color_g_50={highlighted}>
					Opening the contextmenu on an <code>input</code> or <code>textarea</code> opens the
					browser's default contextmenu.
				</p>
				<label>
					<textarea placeholder="paste text here?" bind:value></textarea>
				</label>
				<p>
					<MdnLink path="Web/HTML/Global_attributes/contenteditable" /> likewise has your browser's
					default contextmenu behavior.
				</p>
				<p><code>contenteditable</code></p>
				<blockquote contenteditable bind:innerText={value}></blockquote>
				<p><code>contenteditable="plaintext-only"</code></p>
				<blockquote contenteditable="plaintext-only" bind:innerText={value}></blockquote>
				<aside>
					Note that if there are no actions found (like the toggle here) the system contextmenu
					opens instead, bypassing the Fuz contextmenu, as demonstrated in the default behaviors.
				</aside>
			</div>
		</Contextmenu>
	</TomeSection>
</ContextmenuRootComponent>

<style>
	label {
		/* TODO hacky */
		display: block;
	}
</style>
