<script lang="ts">
	import { tome_get_by_slug } from '$lib/tome.ts';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeLink from '$lib/TomeLink.svelte';
	import MdnLink from '$lib/MdnLink.svelte';

	const TOME_SLUG = 'theming';

	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<TomeContent {tome}>
	<section>
		<p>
			Fuz bases its theme support on <a href="https://css.fuz.dev/">fuz_css</a>, which is based on
			semantic HTML and <MdnLink path="Web/CSS/--*">CSS custom properties</MdnLink>. For usage docs
			see <TomeLink slug="ThemeRoot" />.
		</p>
	</section>
</TomeContent>
