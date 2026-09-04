<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import TomeContent from '$lib/TomeContent.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import TomeLink from '$lib/TomeLink.svelte';

	const TOME_SLUG = 'Library';
	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->
<!-- eslint-disable no-useless-escape -->

<TomeContent {tome}>
	<section>
		<p>
			<DeclarationLink name="Library" /> is the reactive wrapper around a
			<a href="https://util.fuz.dev/docs/api#LibraryJson"><code>LibraryJson</code></a>. It's
			constructed from the <code>package.json</code> subset
			<Code lang="ts" content="'virtual:pkg.json'" inline />
			served by <TomeLink slug="vite_plugin_pkg_json" /> plus the analyzed <code>modules</code> from
			<a href="https://svelte-docinfo.fuz.dev/"><code>virtual:svelte-docinfo</code></a>.
		</p>
		<Code
			lang="ts"
			content={`import {library_json_from_modules} from '@fuzdev/fuz_util/library_json.js';
import {Library} from '@fuzdev/fuz_ui/library.svelte.js';
import {modules} from 'virtual:svelte-docinfo';
import pkg_json from 'virtual:pkg.json';

const library_json = library_json_from_modules(pkg_json, modules);
const library = new Library(library_json);`}
		/>
		<p>
			Set it into <code>library_context</code> at the docs layout. <TomeLink slug="Docs" /> reads it
			for navigation, and <TomeLink slug="LibraryDetail" /> and <TomeLink slug="LibrarySummary" />
			render it:
		</p>
		<Code
			lang="svelte"
			content={`<!-- src/routes/docs/+layout.svelte -->
<script lang="ts">
  import {Library, library_context} from '@fuzdev/fuz_ui/library.svelte.js';
  import {library_json} from '$routes/library.js';

  const library = new Library(library_json);
  library_context.set(() => library);
<\/script>`}
		/>
		<p>
			These docs you're reading are the live example. fuz_ui sets its own <DeclarationLink
				name="Library"
			/>
			as described above. See <TomeLink slug="Docs" /> for the surrounding layout, and
			<TomeLink slug="LibraryDetail" />/<TomeLink slug="LibrarySummary" /> for the components that
			render it.
		</p>
	</section>
</TomeContent>
