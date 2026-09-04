<script lang="ts">
	// Test harness: renders `DialogContent` with a custom `close_button` snippet
	// that spreads the `attrs` bag onto its own button, so tests can assert the bag
	// carries the default's behavior (onclick, a11y) into a consumer-defined snippet.
	import Dialog from '$lib/Dialog.svelte';
	import DialogContent from '$lib/DialogContent.svelte';

	const { dialog_props = {} }: { dialog_props?: Record<string, any> } = $props();
</script>

<Dialog {...dialog_props}>
	<DialogContent>
		{#snippet close_button(attrs)}
			<button {...attrs} data-testid="custom-close">×</button>
		{/snippet}
		<p data-testid="content">hello</p>
	</DialogContent>
</Dialog>
