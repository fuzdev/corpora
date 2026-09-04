<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';

	const TOME_SLUG = 'introduction';

	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<TomeContent {tome}>
	<section>
		<p>
			fuz_ui is a Svelte UI library with components and helpers for making zippy websites. It's
			built on <a href="https://css.fuz.dev/">fuz_css</a>
			and provides a documentation system built on
			<a href="https://svelte-docinfo.fuz.dev/">svelte-docinfo</a>. fuz_ui emphasizes capability and
			efficiency and tries to be simple for those goals.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Usage" />
		<Code lang={null} content="npm i -D @fuzdev/fuz_ui" />
		<p>To import the Svelte components:</p>
		<Code
			lang="svelte"
			content={'<' +
				`script>
  import Alert from '@fuzdev/fuz_ui/Alert.svelte';
  import Card from '@fuzdev/fuz_ui/Card.svelte';
  import Dialog from '@fuzdev/fuz_ui/Dialog.svelte';
</script>`}
		/>
		<p>See the nav for the available components and other helpers.</p>
		<p>
			<a href="https://mdz.fuz.dev/">mdz</a> is a markdown dialect enhanced with Svelte components,
			autolinked identifiers, and other integrations. To compile static content at build time
			instead of parsing at runtime with slower dynamic rendering, use its
			<a href="https://mdz.fuz.dev/docs/svelte_preprocess_mdz">preprocessor</a>:
		</p>
		<Code
			lang="js"
			content={`// svelte.config.js
import {svelte_preprocess_mdz} from '@fuzdev/mdz/svelte_preprocess_mdz.js';

export default {
  preprocess: [
    svelte_preprocess_mdz(),
    // ...other preprocessors
  ],
};`}
		/>
	</TomeSection>
	<section>
		<p>
			fuz_ui is part of the <a href="https://www.fuz.dev/">Fuz stack</a>. See also the
			<a href="https://github.com/fuzdev/fuz_ui">repo</a>.
		</p>
	</section>
</TomeContent>
