import { test, assert, describe } from 'vitest';
import { assert_rejects } from '@fuzdev/fuz_util/testing.ts';
import { preprocess, parse } from 'svelte/compiler';

import { svelte_preprocess_fuz_code } from '$lib/svelte_preprocess_fuz_code.ts';
import { syntax_styler_global } from '$lib/syntax_styler_global.ts';

const run = async (input: string): Promise<string> => {
	const result = await preprocess(input, [svelte_preprocess_fuz_code()], {
		filename: 'Test.svelte'
	});
	return result.code;
};

/** Helper: extract the dangerous_raw_html value from preprocessor output. */
const extract_raw_html = (result: string): string | null => {
	// Match dangerous_raw_html={'...'} - the value is a single-quoted JS string
	const match = /dangerous_raw_html=\{'((?:[^'\\]|\\.)*)'\}/.exec(result);
	if (!match) return null;
	// Unescape the JS string to get the actual HTML
	return match[1]!
		.replace(/\\'/g, "'")
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\\\/g, '\\');
};

describe('svelte_preprocess_fuz_code', () => {
	describe('static content transformation', () => {
		test('transforms double-quoted attribute', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Verify content attr is replaced with dangerous_raw_html
			assert.notInclude(result, 'content="const');
			assert.include(result, 'dangerous_raw_html=');

			// Verify the HTML matches direct stylize() output
			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('transforms single-quoted JS expression', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content={'const x = 1;'} lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('transforms template literal (no interpolation)', async () => {
			const input =
				'<script lang="ts">\n\timport Code from \'@fuzdev/fuz_code/Code.svelte\';\n</script>\n\n<Code content={`const x = 1;`} lang="ts" />';
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('produces specific token classes for TypeScript', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Verify specific token types are present in the output
			assert.include(result, 'token_keyword');
			assert.include(result, 'token_number');
			assert.include(result, 'token_punctuation');
			assert.include(result, 'token_operator');
		});

		test('defaults to svelte lang when lang not specified', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="<button>Click</button>" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(
				raw_html,
				syntax_styler_global.stylize('<button>Click</button>', 'svelte')
			);
		});

		test('skips empty string content (no highlighting benefit)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="" lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'content=""');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('handles multiline content with escaped newlines', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;
const y = 2;" lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			// Newlines should be escaped in the JS string
			assert.include(result, '\\n');
			// Verify roundtrip: extracted HTML matches direct stylize
			const raw_html = extract_raw_html(result);
			assert.strictEqual(
				raw_html,
				syntax_styler_global.stylize('const x = 1;\nconst y = 2;', 'ts')
			);
		});

		test('skips concatenation when output equals input (no tokens)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content={'hello' + ' world'} lang="ts" />`;
			const result = await run(input);

			// 'hello world' has no TS tokens, stylize returns same string
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('transforms concatenation when output has tokens', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content={'const ' + 'x = 1;'} lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('transforms concatenation with template literal', async () => {
			const input =
				"<script lang=\"ts\">\n\timport Code from '@fuzdev/fuz_code/Code.svelte';\n</script>\n\n<Code content={'<' + `script>`} />";
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('<script>', 'svelte'));
		});
	});

	describe('escaping', () => {
		test('escapes single quotes in highlighted source', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 'hello';" lang="ts" />`;
			const result = await run(input);

			// The single-quoted JS string must have escaped quotes
			assert.include(result, "\\'hello\\'");
			// But the extracted HTML should have unescaped quotes
			const raw_html = extract_raw_html(result);
			assert.include(raw_html!, "'hello'");
			assert.strictEqual(raw_html, syntax_styler_global.stylize("const x = 'hello';", 'ts'));
		});

		test('escapes backslashes in highlighted source', async () => {
			const input = String.raw`<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const re = /\\d+/;" lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			const raw_html = extract_raw_html(result);
			assert.ok(raw_html);
		});
	});

	describe('conditional expressions', () => {
		test('transforms ternary with static string branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			assert.include(result, 'show ?');
			assert.include(result, 'token_keyword');
		});

		test('ternary produces correct HTML for both branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			// Extract both branches from: dangerous_raw_html={show ? '...' : '...'}
			const match =
				/dangerous_raw_html=\{(\w+) \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'\}/.exec(result);
			assert.ok(match);
			assert.strictEqual(match[1], 'show');

			const unescape = (s: string) =>
				s.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');

			assert.strictEqual(unescape(match[2]!), syntax_styler_global.stylize('const x = 1;', 'ts'));
			assert.strictEqual(unescape(match[3]!), syntax_styler_global.stylize('let y = 2;', 'ts'));
		});

		test('ternary with concatenation in branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const ' + 'x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			assert.include(result, 'show ?');
		});

		test('skips ternary with dynamic branch', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
	let code = 'x';
</script>

<Code content={show ? code : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('ternary output is parseable by Svelte compiler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'const x = 1;' : 'let y = 2;'} lang="ts" />`;
			const result = await run(input);

			const ast = parse(result, { filename: 'Test.svelte', modern: true });
			assert.isAbove(ast.fragment.nodes.length, 0);
		});

		test('transforms nested ternary (3 branches)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let a = true;
	let b = false;
</script>

<Code content={a ? 'const x = 1;' : b ? 'let y = 2;' : 'var z = 3;'} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			assert.include(result, 'a ?');
			assert.include(result, 'b ?');
			assert.include(result, 'token_keyword');
		});

		test('nested ternary produces correct HTML for all branches', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let a = true;
	let b = false;
</script>

<Code content={a ? 'const x = 1;' : b ? 'let y = 2;' : 'var z = 3;'} lang="ts" />`;
			const result = await run(input);

			// Extract the nested ternary expression from: dangerous_raw_html={a ? '...' : b ? '...' : '...'}
			const match =
				/dangerous_raw_html=\{(\w+) \? '((?:[^'\\]|\\.)*)' : (\w+) \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'\}/.exec(
					result
				);
			assert.ok(match);
			assert.strictEqual(match[1], 'a');
			assert.strictEqual(match[3], 'b');

			const unescape = (s: string) =>
				s.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');

			assert.strictEqual(unescape(match[2]!), syntax_styler_global.stylize('const x = 1;', 'ts'));
			assert.strictEqual(unescape(match[4]!), syntax_styler_global.stylize('let y = 2;', 'ts'));
			assert.strictEqual(unescape(match[5]!), syntax_styler_global.stylize('var z = 3;', 'ts'));
		});

		test('skips nested ternary with dynamic branch', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let a = true;
	let b = false;
	let code = 'x';
</script>

<Code content={a ? 'const x = 1;' : b ? code : 'var z = 3;'} lang="ts" />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('nested ternary output is parseable by Svelte compiler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let a = true;
	let b = false;
</script>

<Code content={a ? 'const x = 1;' : b ? 'let y = 2;' : 'var z = 3;'} lang="ts" />`;
			const result = await run(input);

			const ast = parse(result, { filename: 'Test.svelte', modern: true });
			assert.isAbove(ast.fragment.nodes.length, 0);
		});

		test('transforms 4-branch nested ternary', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let a = true;
	let b = false;
	let c = false;
</script>

<Code content={a ? 'const w = 1;' : b ? 'let x = 2;' : c ? 'var y = 3;' : 'type Z = 4;'} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			assert.include(result, 'a ?');
			assert.include(result, 'b ?');
			assert.include(result, 'c ?');
			assert.include(result, 'token_keyword');

			const ast = parse(result, { filename: 'Test.svelte', modern: true });
			assert.isAbove(ast.fragment.nodes.length, 0);
		});
	});

	describe('const variable tracing', () => {
		test('transforms const variable reference', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const code = 'const x = 1;';
</script>

<Code content={code} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('transforms ternary with const branch references', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
	const a = 'const x = 1;';
	const b = 'let y = 2;';
</script>

<Code content={show ? a : b} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			assert.include(result, 'show ?');
		});

		test('transforms template literal with const interpolation', async () => {
			const input =
				'<script lang="ts">\n\timport Code from \'@fuzdev/fuz_code/Code.svelte\';\n\tconst v = \'1\';\n</script>\n\n<Code content={`const x = ${v};`} lang="ts" />';
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});
	});

	describe('dynamic content preservation', () => {
		test('preserves variable reference', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let code = 'const x = 1;';
</script>

<Code content={code} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'content={code}');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('preserves template literal with numeric const interpolation', async () => {
			// `const value = 1` is a numeric literal — only string consts are traced
			const input =
				'<script lang="ts">\n\timport Code from \'@fuzdev/fuz_code/Code.svelte\';\n\tconst value = 1;\n</script>\n\n<Code content={`const x = ${value};`} lang="ts" />';
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('preserves ternary with dynamic branch', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
	let code = 'a';
</script>

<Code content={show ? code : 'b'} lang="ts" />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('preserves function call expression', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const get_code = () => 'x';
</script>

<Code content={get_code()} lang="ts" />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('preserves $state rune const', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const code = $state('const x = 1;');
</script>

<Code content={code} lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'content={code}');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('skips when dynamic lang with static content', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let lang = 'ts';
</script>

<Code content="const x = 1;" lang={lang} />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
			assert.include(result, 'content="const x = 1;"');
		});
	});

	describe('no-op skip (output equals input)', () => {
		test('skips when neither ternary branch has tokens', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let show = true;
</script>

<Code content={show ? 'hello' : 'world'} lang="ts" />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('transforms content with HTML special characters', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="a < b" lang="ts" />`;
			const result = await run(input);

			// stylize HTML-encodes < so output differs from input
			assert.include(result, 'dangerous_raw_html=');
			const raw_html = extract_raw_html(result);
			assert.include(raw_html!, '&lt;');
		});

		test('skips static content that stylizes to itself', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="x" />`;
			const result = await run(input);

			assert.include(result, 'content="x"');
			assert.notInclude(result, 'dangerous_raw_html');
		});
	});

	describe('skip conditions', () => {
		test('skips custom syntax_styler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const custom_styler = {};
</script>

<Code content="const x = 1;" lang="ts" syntax_styler={custom_styler} />`;
			const result = await run(input);

			assert.include(result, 'content="const x = 1;"');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('skips unrelated Code component', async () => {
			const input = `<script lang="ts">
	import Code from 'other-package/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'content="const x = 1;"');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('skips when lang is null', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="plain text" lang={null} />`;
			const result = await run(input);

			assert.include(result, 'content="plain text"');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('skips unknown language', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="code" lang="unknown_lang" />`;
			const result = await run(input);

			assert.include(result, 'content="code"');
			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('skips files without Code in content', async () => {
			const input = `<script lang="ts">
	const x = 1;
</script>

<p>Hello world</p>`;
			const result = await run(input);

			assert.strictEqual(result, input);
		});

		test('skips files without matching import', async () => {
			const input = `<script lang="ts">
	// No import of Code component
	const Code = 'just a string';
</script>

<p>Hello world</p>`;
			const result = await run(input);

			assert.strictEqual(result, input);
		});

		test('skips Code without content attribute', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code lang="ts" />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});

		test('skips when dangerous_raw_html already present', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code dangerous_raw_html={'precomputed'} content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			assert.include(result, 'content="const x = 1;"');
			assert.include(result, "dangerous_raw_html={'precomputed'}");
		});

		test('skips spread attributes (no content to detect)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	const props = { content: 'x', lang: 'ts' };
</script>

<Code {...props} />`;
			const result = await run(input);

			assert.notInclude(result, 'dangerous_raw_html');
		});
	});

	describe('import resolution', () => {
		test('handles renamed import', async () => {
			const input = `<script lang="ts">
	import Highlighter from '@fuzdev/fuz_code/Code.svelte';
</script>

<Highlighter content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('handles import in script module block', async () => {
			const input = `<script module>
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('respects custom component_imports', async () => {
			const input = `<script lang="ts">
	import Code from '$lib/MyCode.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[
					svelte_preprocess_fuz_code({
						component_imports: ['$lib/MyCode.svelte']
					})
				],
				{ filename: 'Test.svelte' }
			);

			assert.include(result.code, 'dangerous_raw_html=');
		});

		test('custom component_imports with path not containing "Code"', async () => {
			const input = `<script lang="ts">
	import Highlighter from '$lib/Highlighter.svelte';
</script>

<Highlighter content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[
					svelte_preprocess_fuz_code({
						component_imports: ['$lib/Highlighter.svelte']
					})
				],
				{ filename: 'Test.svelte' }
			);

			const raw_html = extract_raw_html(result.code);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});
	});

	describe('prop preservation', () => {
		test('preserves all other props alongside transformation', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" inline wrap nomargin />`;
			const result = await run(input);

			assert.include(result, 'dangerous_raw_html=');
			assert.include(result, 'lang="ts"');
			assert.include(result, 'inline');
			assert.include(result, 'wrap');
			assert.include(result, 'nomargin');
			// Script block should be unchanged
			assert.include(result, "import Code from '@fuzdev/fuz_code/Code.svelte'");
		});

		test('attribute order does not matter', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code lang="ts" content="const x = 1;" />`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
			// lang should still be present
			assert.include(result, 'lang="ts"');
		});
	});

	describe('multiple components', () => {
		test('handles mixed static/dynamic', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	let dynamic_code = 'x';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content={dynamic_code} lang="ts" />
<Code content="let y = 2;" lang="js" />`;
			const result = await run(input);

			// First and third should be transformed
			const matches = result.match(/dangerous_raw_html/g);
			assert.lengthOf(matches!, 2);
			// Second should remain dynamic
			assert.include(result, 'content={dynamic_code}');
		});

		test('handles multiple languages with correct output', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content={'.foo { color: red; }'} lang="css" />
<Code content={'{"key": "value"}'} lang="json" />`;
			const result = await run(input);

			const matches = result.match(/dangerous_raw_html/g);
			assert.lengthOf(matches!, 3);
			// Verify CSS-specific tokens
			assert.include(result, 'token_selector');
			// Verify JSON-specific tokens
			assert.include(result, 'token_property');
		});

		test('caches repeated content (identical output)', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />
<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Extract all dangerous_raw_html values
			const all_matches = [...result.matchAll(/dangerous_raw_html=\{'((?:[^'\\]|\\.)*)'\}/g)];
			assert.lengthOf(all_matches, 2);
			assert.strictEqual(all_matches[0]![1], all_matches[1]![1]);
		});
	});

	describe('nesting', () => {
		test('handles Code nested inside other components', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import Wrapper from './Wrapper.svelte';
</script>

<Wrapper>
	<Code content="const x = 1;" lang="ts" />
</Wrapper>`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('handles Code nested inside HTML elements', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<div>
	<Code content="const x = 1;" lang="ts" />
</div>`;
			const result = await run(input);

			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('handles non-self-closing Code with children snippet', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts">
	{#snippet children(html)}
		<pre>{@html html}</pre>
	{/snippet}
</Code>`;
			const result = await run(input);

			// content should be transformed
			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
			// children snippet should be preserved
			assert.include(result, '{#snippet children(html)}');
		});
	});

	describe('output validity', () => {
		test('output is parseable by Svelte compiler', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// Should not throw
			const ast = parse(result, { filename: 'Test.svelte', modern: true });
			assert.isAbove(ast.fragment.nodes.length, 0);
		});

		test('output contains valid single-quoted JS string expression', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await run(input);

			// The attribute should be wrapped as dangerous_raw_html={'...'}
			assert.match(result, /dangerous_raw_html=\{'[^]*?'\}/);
			// No unescaped single quotes inside the string (except the wrapping ones)
			const inner = /dangerous_raw_html=\{'((?:[^'\\]|\\.)*)'\}/.exec(result)![1];
			// Verify no raw single quotes (they should all be escaped)
			assert.notMatch(inner!, /(?<!\\)'/);
		});

		test('generates source map', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(input, [svelte_preprocess_fuz_code()], {
				filename: 'Test.svelte'
			});

			assert.isDefined(result.map);
			const map = result.map as { sources: Array<string> };
			assert.include(map.sources, 'Test.svelte');
		});
	});

	describe('options', () => {
		test('respects exclude with regex', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[svelte_preprocess_fuz_code({ exclude: [/Test\.svelte$/] })],
				{ filename: 'Test.svelte' }
			);

			assert.include(result.code, 'content="const x = 1;"');
			assert.notInclude(result.code, 'dangerous_raw_html');
		});

		test('respects exclude with string', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[svelte_preprocess_fuz_code({ exclude: ['fixtures/'] })],
				{ filename: 'src/test/fixtures/Test.svelte' }
			);

			assert.notInclude(result.code, 'dangerous_raw_html');
		});

		test('cache: false disables caching', async () => {
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(input, [svelte_preprocess_fuz_code({ cache: false })], {
				filename: 'Test.svelte'
			});

			// Should still transform correctly without caching
			assert.include(result.code, 'dangerous_raw_html=');
			const raw_html = extract_raw_html(result.code);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('const x = 1;', 'ts'));
		});

		test('on_error throw mode throws on stylize failure', async () => {
			const bad_styler = {
				has_lang: () => true,
				stylize() {
					throw new Error('test error');
				}
			} as any;

			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;

			const error = await assert_rejects(() =>
				preprocess(
					input,
					[svelte_preprocess_fuz_code({ syntax_styler: bad_styler, on_error: 'throw' })],
					{ filename: 'Test.svelte' }
				)
			);
			assert.ok(error.message.includes('test error'));
		});

		test('on_error log mode skips failed transformation', async () => {
			const bad_styler = {
				has_lang: () => true,
				stylize() {
					throw new Error('test error');
				}
			} as any;

			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="const x = 1;" lang="ts" />`;
			const result = await preprocess(
				input,
				[svelte_preprocess_fuz_code({ syntax_styler: bad_styler, on_error: 'log' })],
				{ filename: 'Test.svelte' }
			);

			// Should remain unchanged when error is logged
			assert.include(result.code, 'content="const x = 1;"');
			assert.notInclude(result.code, 'dangerous_raw_html');
		});
	});

	describe('HTML entity handling', () => {
		test('Svelte decodes HTML entities in double-quoted attributes', async () => {
			// When Svelte parses content="&lt;div&gt;", the Text node's .data is "<div>"
			const input = `<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
</script>

<Code content="a &amp; b" lang="ts" />`;
			const result = await run(input);

			// Svelte decodes &amp; to & in the Text node, so stylize receives "a & b"
			const raw_html = extract_raw_html(result);
			assert.strictEqual(raw_html, syntax_styler_global.stylize('a & b', 'ts'));
		});
	});
});
