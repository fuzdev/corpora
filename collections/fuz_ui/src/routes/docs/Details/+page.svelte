<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import TomeContent from '$lib/TomeContent.svelte';
	import Details from '$lib/Details.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';
	import MdnLink from '$lib/MdnLink.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';

	const TOME_SLUG = 'Details';

	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<TomeContent {tome}>
	<section>
		<p>
			The <DeclarationLink name="Details" /> component is an alternative to the
			<MdnLink path="Web/HTML/Element/details" /> element. By default it's lazy, and you can pass
			<code>eager</code>
			to render the children immediately like the base element.
		</p>
		<p>Benefits of lazy children:</p>
		<ul>
			<li>
				children are transitioned in/out with an animation (TODO this may be doable with eager
				children, if so it would probably be the better default, and then the prop should be swapped
				to <code>lazy</code>)
			</li>
			<li>improved performance, can significantly improve UX in some cases</li>
		</ul>
		<p>Tradeoffs:</p>
		<ul>
			<li><code>ctrl+f</code> does not work to find text and auto-open the details</li>
			<li>you may desire some behavior caused by mounting the children</li>
		</ul>
	</section>
	<TomeSection>
		<TomeSectionHeader text="With lazy rendering by default" />
		<Code
			content={`<Details>
  {#snippet summary()}summary content{/snippet}
  lazy children content
</Details>`}
		/>
		<Details>
			{#snippet summary()}summary content{/snippet}
			lazy children content
		</Details>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With eager rendering" />
		<Code
			content={`<Details eager>
  {#snippet summary()}summary content{/snippet}
  eager children content
</Details>`}
		/>
		<Details eager>
			{#snippet summary()}summary content{/snippet}
			eager children content
		</Details>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With the base details element">
			With the base <MdnLink path="Web/HTML/Element/details" /> element
		</TomeSectionHeader>
		<Code
			content={`<details>
  <summary>a summary element instead of a snippet</summary>
  the plain details
</details>`}
		/>
		<details>
			<summary>a summary element instead of a snippet</summary>
			the plain details
		</details>
	</TomeSection>
</TomeContent>
