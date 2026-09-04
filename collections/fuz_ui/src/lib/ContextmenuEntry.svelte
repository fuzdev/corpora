<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { swallow } from '@fuzdev/fuz_util/dom.ts';

	import PendingAnimation from './PendingAnimation.svelte';
	import { contextmenu_context, type ContextmenuRun } from './contextmenu_state.svelte.ts';
	import type { SvgData } from './svg.ts';
	import ContextmenuIcon from './ContextmenuIcon.svelte';

	const {
		run,
		icon,
		children,
		disabled: disabled_prop = false
	}: {
		run: ContextmenuRun;
		icon?: SvgData | string | Snippet;
		children: Snippet;
		disabled?: boolean;
	} = $props();

	const get_contextmenu = contextmenu_context.get();
	const contextmenu = $derived(get_contextmenu());

	// add_entry registers on the current instance at init — not reactive to contextmenu getter changes
	const entry = get_contextmenu().add_entry(
		() => run,
		() => disabled_prop
	);

	const { selected, pending, error_message } = $derived(entry);
	const disabled = $derived(entry.disabled());

	let activate_timeout: NodeJS.Timeout | null = null;
	onDestroy(() => {
		if (activate_timeout !== null) clearTimeout(activate_timeout);
	});
</script>

<!-- disabling the a11y warning because a parent element handles keyboard events -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<li
	class={['menuitem plain selectable deselectable', { selected, disabled }]}
	role="menuitem"
	aria-disabled={disabled}
	tabindex="-1"
	title={error_message ? `Error: ${error_message}` : undefined}
	onclick={disabled
		? undefined
		: () => {
				// This timeout lets event handlers react to the current DOM
				// before the item's changes are applied.
				if (activate_timeout !== null) clearTimeout(activate_timeout);
				activate_timeout = setTimeout(() => {
					activate_timeout = null;
					void contextmenu.activate(entry);
				});
			}}
	onmouseenter={disabled
		? undefined
		: (e) => {
				swallow(e);
				contextmenu.select(entry);
			}}
>
	<div class="content">
		<div class="icon">
			<ContextmenuIcon {icon} />
		</div>
		<div class="title">{@render children()}</div>
		{#if pending}<PendingAnimation />{:else if error_message}⚠️{/if}
	</div>
</li>
