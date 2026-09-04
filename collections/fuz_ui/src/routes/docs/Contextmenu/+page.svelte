<script lang="ts">
	import TomeContent from '$lib/TomeContent.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';
	import Introduction from './Introduction.svelte';
	import Discussion from './Discussion.svelte';
	import ExampleFull from './ExampleFull.svelte';
	import ExampleBasic from './ExampleBasic.svelte';
	import ExampleCustomInstance from './ExampleCustomInstance.svelte';
	import ExampleSelectText from './ExampleSelectText.svelte';
	import ExampleDisableDefaultBehaviors from './ExampleDisableDefaultBehaviors.svelte';
	import ExampleDefaultBehaviors from './ExampleDefaultBehaviors.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	const TOME_SLUG = 'Contextmenu';

	const tome = tome_get_by_slug(TOME_SLUG);

	selected_contextmenu_root_component_context.set();

	// TODO examples for error, async
</script>

<!-- TODO demonstrate usage of a custom `link_snippet` and `linkProps`  -->
<TomeContent {tome}>
	<Introduction />
	<ExampleBasic />
	<ExampleDefaultBehaviors />
	<ExampleSelectText />
	<ExampleDisableDefaultBehaviors />
	<ExampleCustomInstance />
	<ExampleFull />
	<Discussion />
	<section>
		<aside>
			<p>
				todo: demonstrate using <code>contextmenu_attachment</code> to avoid the wrapper element
			</p>
		</aside>
		<aside>
			<p>todo: for mobile, probably change to a drawer-from-bottom design</p>
		</aside>
	</section>
</TomeContent>
