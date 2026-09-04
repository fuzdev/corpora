<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import ModuleLink from '@fuzdev/fuz_ui/ModuleLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	import Code from '$lib/Code.svelte';
	import { syntax_styler_global } from '$lib/syntax_styler_global.ts';

	const TOME_SLUG = 'usage';
	const tome = tome_get_by_slug(TOME_SLUG);

	const programmatic_example = `const x: number = 42;`;
	const programmatic_result = syntax_styler_global.stylize(programmatic_example, 'ts');
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<p>
			fuz_code highlights code with one lexer per language without regular expressions, generating
			HTML with
			<code>.token_*</code> classes that a theme styles. The <DeclarationLink name="Code" /> Svelte component
			is the typical entry point.
		</p>
		<p>To use it, import the default theme or your own:</p>
		<Code
			lang="ts"
			content="// +layout.svelte
import '@fuzdev/fuz_code/theme.css'; // add this"
		/>
		<p>then use <DeclarationLink name="Code" />:</p>
		<Code
			content={'<' +
				`script>\n\t// Something.svelte\n\timport Code from '@fuzdev/fuz_code/Code.svelte';\n</script>\n\n<Code content="<header>hello world</header>" />`}
		/>
		<p>outputs:</p>
		<Code content="<header>hello world</header>" />
	</section>
	<TomeSection>
		<TomeSectionHeader text="Dependencies" />
		<p>
			By default fuz_code depends on <a href="https://css.fuz.dev">fuz_css</a> to provide
			color-scheme-aware color variables. If you're not using it, import
			<code>theme_variables.css</code> or bring your own:
		</p>
		<Code
			lang="ts"
			content="// +layout.svelte
import '@fuzdev/fuz_code/theme.css';
// if not using fuz_css, add this too:
import '@fuzdev/fuz_code/theme_variables.css';"
		/>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Preprocessor" />
		<p>
			The <ModuleLink module_path="svelte_preprocess_fuz_code.ts"
				>svelte_preprocess_fuz_code</ModuleLink
			> preprocessor compiles static
			<DeclarationLink name="Code" /> content at build time, replacing runtime syntax highlighting:
		</p>
		<Code
			lang="ts"
			content={`// svelte.config.js
import {svelte_preprocess_fuz_code} from '@fuzdev/fuz_code/svelte_preprocess_fuz_code.js';

export default {
  preprocess: [
    svelte_preprocess_fuz_code(),
    vitePreprocess(),
  ],
};`}
		/>
		<p>
			Static string <code>content</code> props are highlighted at build time and replaced with pre-rendered
			HTML. Dynamic content is left unchanged for runtime highlighting.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Svelte support" />
		<p>
			<DeclarationLink name="Code" /> styles
			<a href="https://svelte.dev/">Svelte</a>
			by default, originally based on
			<a href="https://github.com/pngwn/prism-svelte"><code>prism-svelte</code></a>
			by <a href="https://github.com/pngwn">@pngwn</a> (<a href="https://pngwn.at/">pngwn.at</a>):
		</p>
		<Code content={'<Code content="<scr..." />'} />
		<p>styled:</p>
		<div>
			<Code
				content={'<' +
					`script lang="ts">
	import Card from '@fuzdev/fuz_ui/Card.svelte';
	console.log('hello Card', Card);
</script>

<Card>
	<div class="greeting">hi {friend}</div>
</Card>`}
			/>
		</div>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="TypeScript support" />
		<p>
			<DeclarationLink name="Code" /> supports TypeScript with <code>lang="ts"</code>:
		</p>
		<Code content={`<Code lang="ts" content="export type A<T> = ('b' | 3) & T;" />`} />
		<div>
			<Code lang="ts" content={`export type A<T> = ('b' | 3) & T;`} />
		</div>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Markdown support" />
		<p>
			<DeclarationLink name="Code" /> supports Markdown with <code>lang="md"</code>, and fenced
			blocks for all languages:
		</p>
		<Code content={`<Code lang="md" content="# hello \`world\` ..." />`} />
		<div>
			<Code lang="md" content={`# hello \`world\`\n\n\`\`\`ts\n\tconst a = 1;\n\`\`\``} />
		</div>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Disabling styling" />
		<p>
			Passing <code>lang={'{'}null}</code> disables syntax styling:
		</p>
		<Code content={'<Code lang={null} content="<aside>all is gray</aside>" />'} />
		<Code lang={null} content={`<aside>all is gray</aside>`} />
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Layout" />
		<p>
			<DeclarationLink name="Code" /> is a block by default:
		</p>
		<div>ab<Code content="c" /></div>
		<Code content={'<div>ab<Code content="c" /></div>'} />
		<p>
			It can be inlined with <Code inline content={`<Code inline content="..." />`} />
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Programmatic usage" />
		<p>
			fuz_code can be used directly from TypeScript without Svelte. Import <DeclarationLink
				name="syntax_styler_global"
			/> for a pre-configured instance with all built-in languages:
		</p>
		<Code
			lang="ts"
			content={`import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.js';

const html = syntax_styler_global.stylize('${programmatic_example}', 'ts');`}
		/>
		<p>returns HTML string:</p>
		<Code content={programmatic_result} />
		<p>then rendered with:</p>
		<Code content={'<code data-lang="ts">{@html programmatic_result}</code>'} />
		<p>we get:</p>
		<p>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<code data-lang="ts">{@html programmatic_result}</code>
		</p>
		<p>
			For a custom configuration, create your own <DeclarationLink name="SyntaxStyler" /> and register
			only the languages you need:
		</p>
		<Code
			lang="ts"
			content={`import {SyntaxStyler} from '@fuzdev/fuz_code/syntax_styler.js';
import {lexer_markup} from '@fuzdev/fuz_code/lexer_markup.js';
import {lexer_css} from '@fuzdev/fuz_code/lexer_css.js';

const styler = new SyntaxStyler();
styler.add_lang(lexer_markup);
styler.add_lang(lexer_css);

const html = styler.stylize('<div class="example">hello</div>', 'html');`}
		/>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Experimental highlighting API" />
		<p>
			fuz_code also has experimental support for the CSS Custom Highlight API with
			<DeclarationLink name="CodeHighlight" /> — see the <TomeLink slug="samples" /> and
			<TomeLink slug="textarea" />.
		</p>
	</TomeSection>
</TomeContent>
