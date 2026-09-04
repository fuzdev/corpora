<script lang="ts">
	import { resolve } from '$app/paths';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import Contextmenu from '$lib/Contextmenu.svelte';
	import { ContextmenuState } from '$lib/contextmenu_state.svelte.ts';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	const selected = selected_contextmenu_root_component_context.get();
	const ContextmenuRootComponent = $derived(selected.component);
	const root_component_name = $derived(selected.name);

	const contextmenu = new ContextmenuState();

	let link_entry_disabled = $state.raw(false);
	let text_entry_disabled = $state.raw(false);
	let custom_entry_included = $state.raw(true);

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
</script>

<TomeSection>
	<TomeSectionHeader text="Disable default behaviors" />
	<p>
		Check the boxes below to disable automatic <code>a</code> link detection and
		<code>copy text</code>
		detection, and see how the contextmenu behaves.
	</p>

	<Code
		content={`<${root_component_name}${link_entry_disabled ? ' link_entry={null}' : ''}${
			text_entry_disabled ? ' text_entry={null}' : ''
		}>`}
	/>

	<fieldset>
		<label class="row">
			<input type="checkbox" bind:checked={link_entry_disabled} />
			<span>disable automatic link entries, <code>link_entry={'{'}null}</code></span>
		</label>
		<label class="row">
			<input type="checkbox" bind:checked={text_entry_disabled} />
			<span>disable automatic copy text entries, <code>text_entry={'{'}null}</code></span>
		</label>
	</fieldset>

	<ContextmenuRootComponent
		{contextmenu}
		scoped
		link_entry={link_entry_disabled ? null : undefined}
		text_entry={text_entry_disabled ? null : undefined}
	>
		{#if custom_entry_included}
			<Contextmenu>
				{#snippet entries()}
					<ContextmenuEntry icon=">" run={() => void (toggled = !toggled)}>
						some custom entry
					</ContextmenuEntry>
				{/snippet}
				{@render test_area()}
			</Contextmenu>
		{:else}
			{@render test_area()}
		{/if}
	</ContextmenuRootComponent>

	<p>When no behaviors are defined, the system contextmenu is shown instead.</p>

	<div class="mb_md">
		<label class="row">
			<input type="checkbox" bind:checked={custom_entry_included} />
			include a custom entry, which ensures the Fuz contextmenu is used
		</label>
	</div>

	{#if custom_entry_included || !link_entry_disabled || !text_entry_disabled}
		<p><strong>Expected:</strong> the Fuz contextmenu will open and show:</p>
		<ul>
			{#if custom_entry_included}
				<li>custom "some custom entry" entry</li>
			{/if}
			{#if !text_entry_disabled}
				<li>"copy text" entry when text is selected</li>
			{/if}
			{#if !link_entry_disabled}
				<li>link entry when clicking on a link</li>
			{/if}
		</ul>
	{:else}
		<p>
			<strong>Expected:</strong> no behaviors defined. The system contextmenu will show, bypassing
			the Fuz contextmenu.
		</p>
	{/if}
</TomeSection>

{#snippet test_area()}
	<div class="panel p_md mb_lg">
		<p bind:this={text_el}>
			Try <button type="button" onclick={select_text} class:color_h={toggled}>
				selecting some text
			</button>
			and opening the contextmenu in this panel.
		</p>
		<p>
			Try opening the contextmenu on <a href={resolve('/')}>this link</a>.
		</p>
	</div>
{/snippet}
