<script lang="ts">
	// Test harness: composes `DialogContent` inside a `Dialog` so the dialog
	// context is set, forwarding props to each for `DialogContent` tests.
	import Dialog from '$lib/Dialog.svelte';
	import DialogContent from '$lib/DialogContent.svelte';

	const {
		dialog_props = {},
		content_props = {}
	}: { dialog_props?: Record<string, any>; content_props?: Record<string, any> } = $props();
</script>

<Dialog {...dialog_props}>
	<DialogContent {...content_props}>
		<p data-testid="content">hello</p>
	</DialogContent>
</Dialog>
