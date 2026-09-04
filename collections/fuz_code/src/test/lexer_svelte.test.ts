import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events } from '$lib/lexer.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'svelte')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_svelte expressions', () => {
	test('a plain expression', () => {
		assert.deepEqual(tokens_of('{x}'), [
			['svelte_expression', '{x}'],
			['punctuation', '{'],
			['lang_ts', 'x'],
			['punctuation', '}']
		]);
	});

	test('an empty expression coalesces its braces', () => {
		assert.deepEqual(tokens_of('{}'), [
			['svelte_expression', '{}'],
			['punctuation', '{}']
		]);
	});

	test('braces inside strings do not close the expression', () => {
		assert.deepEqual(tokens_of("{'}'}"), [
			['svelte_expression', "{'}'}"],
			['punctuation', '{'],
			['lang_ts', "'}'"],
			['string', "'}'"],
			['punctuation', '}']
		]);
	});

	test('nested braces balance to any depth', () => {
		const text = '{f({a: {b: {c: 1}}})}';
		const tokens = tokens_of(text);
		assert.deepEqual(tokens[0], ['svelte_expression', text]);
		assert.deepEqual(tokens.at(-1), ['punctuation', '}']);
	});

	test('an unterminated expression extends to the end', () => {
		const text = '{#if x';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'svelte')), []);
		assert.deepEqual(picked(text, ['special_keyword']), [['special_keyword', '#if']]);
	});

	test('expressions and tags lex across probe-starved prefixes', () => {
		// the window's `<`/`{` probes are cached (`MarkupProbeCache`) — a run of
		// constructs without one probe char must not lose the construct after it
		assert.deepEqual(picked('<b>a</b><b>a</b>{x}', ['svelte_expression']), [
			['svelte_expression', '{x}']
		]);
		assert.deepEqual(picked('{x}{y}<b>a</b>', ['tag']), [
			['tag', '<b>'],
			['tag', '<b'],
			['tag', '</b>'],
			['tag', '</b']
		]);
	});
});

describe('lexer_svelte blocks', () => {
	test('open, else, and close blocks', () => {
		assert.deepEqual(tokens_of('{#if x}'), [
			['svelte_expression', '{#if x}'],
			['block', '{#if x}'],
			['punctuation', '{'],
			['special_keyword', '#if'],
			['lang_ts', 'x'],
			['punctuation', '}']
		]);
		assert.deepEqual(picked('{:else}', ['special_keyword']), [['special_keyword', ':else']]);
		assert.deepEqual(picked('{:else if y}', ['special_keyword', 'lang_ts']), [
			['special_keyword', ':else if'],
			['lang_ts', 'y']
		]);
		assert.deepEqual(picked('{/if}', ['block', 'special_keyword']), [
			['block', '{/if}'],
			['special_keyword', '/if']
		]);
	});

	test('snippet blocks lex their signature as ts', () => {
		assert.deepEqual(picked('{#snippet greet(name: string)}', ['special_keyword', 'function']), [
			['special_keyword', '#snippet'],
			['function', 'greet']
		]);
	});

	test('an unknown sigil word stays a plain expression', () => {
		assert.deepEqual(picked('{#nope x}', ['block', 'each', 'special_keyword']), []);
		assert.deepEqual(tokens_of('{#nope x}')[0], ['svelte_expression', '{#nope x}']);
	});
});

describe('lexer_svelte each', () => {
	test('the expression before `as` is lexed as ts', () => {
		assert.deepEqual(tokens_of('{#each thing_keys as [k, v] (key(k))}').slice(0, 6), [
			['svelte_expression', '{#each thing_keys as [k, v] (key(k))}'],
			['each', '{#each thing_keys as [k, v] (key(k))}'],
			['punctuation', '{'],
			['special_keyword', '#each'],
			['lang_ts', 'thing_keys'],
			['keyword', 'as']
		]);
	});

	test('`as` inside brackets or identifiers does not split', () => {
		assert.deepEqual(picked('{#each has_as as base}', ['keyword']), [['keyword', 'as']]);
		assert.deepEqual(picked('{#each f([x as y]) as z}', ['keyword']).length, 1);
	});

	test('a close-each is a block', () => {
		assert.deepEqual(picked('{/each}', ['block', 'each']), [['block', '{/each}']]);
	});
});

describe('lexer_svelte await', () => {
	test('`then` splits two ts interiors', () => {
		assert.deepEqual(
			picked('{#await promise then value}', ['special_keyword', 'keyword', 'lang_ts']),
			[
				['special_keyword', '#await'],
				['lang_ts', 'promise'],
				['keyword', 'then'],
				['lang_ts', 'value']
			]
		);
	});

	test(':then and :catch are special keywords', () => {
		assert.deepEqual(picked('{:then v}', ['special_keyword']), [['special_keyword', ':then']]);
		assert.deepEqual(picked('{:catch e}', ['special_keyword']), [['special_keyword', ':catch']]);
	});
});

describe('lexer_svelte at-directives', () => {
	test('directive structure', () => {
		assert.deepEqual(tokens_of('{@render children()}').slice(0, 5), [
			['svelte_expression', '{@render children()}'],
			['at_directive', '{@render children()}'],
			['punctuation', '{'],
			['at_keyword', '@render'],
			['lang_ts', 'children()']
		]);
	});

	test('nested braces and comments inside directives', () => {
		const text = '{@attach f(() => {\n\t// arg\n})}';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'svelte')), []);
		assert.deepEqual(picked(text, ['at_keyword', 'comment']), [
			['at_keyword', '@attach'],
			['comment', '// arg']
		]);
	});
});

describe('lexer_svelte declaration tags', () => {
	test('`{const …}` and `{let …}` wrap a declaration_tag with a keyword lead', () => {
		assert.deepEqual(tokens_of('{const area = w * h}').slice(0, 5), [
			['svelte_expression', '{const area = w * h}'],
			['declaration_tag', '{const area = w * h}'],
			['punctuation', '{'],
			['keyword', 'const'],
			['lang_ts', 'area = w * h']
		]);
		assert.deepEqual(picked('{let name = user.name}', ['declaration_tag', 'keyword']), [
			['declaration_tag', '{let name = user.name}'],
			['keyword', 'let']
		]);
	});

	test('a `const`/`let`-prefixed identifier is not a declaration tag', () => {
		assert.deepEqual(picked('{const_value + 1}', ['declaration_tag']), []);
		assert.deepEqual(tokens_of('{const_value + 1}')[0], ['svelte_expression', '{const_value + 1}']);
	});

	test('declaration tags are top-level only, not in attribute position', () => {
		// `full` is false in tag/attribute context — the leading `const` stays a
		// plain ts keyword with no declaration_tag container
		assert.deepEqual(picked('<a b={const x}>', ['declaration_tag']), []);
		assert.deepEqual(picked('<a b={const x}>', ['keyword']), [['keyword', 'const']]);
	});

	test('an unterminated declaration tag stays valid', () => {
		const text = '{const x =';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'svelte')), []);
		assert.deepEqual(picked(text, ['declaration_tag', 'keyword']), [
			['declaration_tag', '{const x ='],
			['keyword', 'const']
		]);
	});

	test('the legacy `{@const}` stays an at_directive, not a declaration tag', () => {
		assert.deepEqual(picked('{@const x = 1}', ['at_directive', 'declaration_tag', 'at_keyword']), [
			['at_directive', '{@const x = 1}'],
			['at_keyword', '@const']
		]);
	});
});

describe('lexer_svelte attribute comments', () => {
	test('line and block comments between attributes emit comment leaves', () => {
		assert.deepEqual(picked('<div a="1" // note\n\t/* block */ b="2">', ['comment', 'attr_name']), [
			['attr_name', 'a'],
			['comment', '// note'],
			['comment', '/* block */'],
			['attr_name', 'b']
		]);
	});

	test('multiple inline block comments, and an unterminated one extends to the end', () => {
		assert.deepEqual(picked('<span /* a */ /* b */ x>', ['comment']), [
			['comment', '/* a */'],
			['comment', '/* b */']
		]);
		const text = '<div /* open';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'svelte')), []);
		assert.deepEqual(picked(text, ['comment']), [['comment', '/* open']]);
	});

	test('a line comment runs to the newline, swallowing a same-line `>`', () => {
		// js line-comment semantics — the tag closes on the next line
		assert.deepEqual(picked('<div // c >\n>', ['comment', 'punctuation']), [
			['punctuation', '<'],
			['comment', '// c >'],
			['punctuation', '>']
		]);
	});

	test('a block comment is opaque — an inner `>` does not close the tag', () => {
		const text = '<div /* a > b */ c="1">';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'svelte')), []);
		assert.deepEqual(picked(text, ['comment', 'attr_name']), [
			['comment', '/* a > b */'],
			['attr_name', 'c']
		]);
	});
});

describe('lexer_svelte tags', () => {
	test('an expression-valued attribute', () => {
		assert.deepEqual(tokens_of('<a b={x}>').slice(3, 9), [
			['attr_name', 'b'],
			['attr_value', '={x}'],
			['punctuation', '='],
			['svelte_expression', '{x}'],
			['punctuation', '{'],
			['lang_ts', 'x']
		]);
	});

	test('shorthand and spread expressions in attribute position', () => {
		assert.deepEqual(picked('<button {onclick}>', ['svelte_expression']), [
			['svelte_expression', '{onclick}']
		]);
		assert.deepEqual(picked('<a {...rest}>', ['svelte_expression', 'operator']), [
			['svelte_expression', '{...rest}'],
			['operator', '...']
		]);
	});

	test('at-directives in attribute position', () => {
		assert.deepEqual(picked("<span {@attach f('p')}>", ['at_keyword', 'string']), [
			['at_keyword', '@attach'],
			['string', "'p'"]
		]);
	});

	test('directives keep their namespace prefix', () => {
		assert.deepEqual(tokens_of('<input bind:value />').slice(3, 5), [
			['attr_name', 'bind:value'],
			['namespace', 'bind:']
		]);
		assert.deepEqual(picked('<div class:active={c}>', ['attr_name', 'namespace']), [
			['attr_name', 'class:active'],
			['namespace', 'class:']
		]);
	});

	test('directive modifiers get punctuation pipes', () => {
		const tokens = picked('<div transition:fade|local|global={x}>', [
			'attr_name',
			'namespace',
			'punctuation'
		]);
		// skip the tag punctuation `<` at index 0
		assert.deepEqual(tokens.slice(1, 5), [
			['attr_name', 'transition:fade|local|global'],
			['namespace', 'transition:'],
			['punctuation', '|'],
			['punctuation', '|']
		]);
	});

	test('quoted values interleave text and expressions', () => {
		assert.deepEqual(picked('<a class="a {b} c">', ['attr_value', 'svelte_expression']), [
			['attr_value', '="a {b} c"'],
			['svelte_expression', '{b}']
		]);
	});

	test('style and on* attributes are ordinary in svelte', () => {
		assert.deepEqual(
			picked('<div style="color:red" onclick="f()">', ['special_attr', 'value']),
			[]
		);
	});
});

describe('lexer_svelte regions', () => {
	test('script embeds ts', () => {
		assert.deepEqual(picked('<script>let x = 1;</script>', ['script', 'lang_ts', 'keyword']), [
			['script', 'let x = 1;'],
			['lang_ts', 'let x = 1;'],
			['keyword', 'let']
		]);
	});

	test('style embeds css', () => {
		assert.deepEqual(picked('<style>a{color:red}</style>', ['style', 'lang_css', 'property']), [
			['style', 'a{color:red}'],
			['lang_css', 'a{color:red}'],
			['property', 'color']
		]);
	});

	test('textarea keeps expressions live', () => {
		assert.deepEqual(picked('<textarea>{value}</textarea>', ['svelte_expression']), [
			['svelte_expression', '{value}']
		]);
	});

	test('comments swallow expressions', () => {
		assert.deepEqual(tokens_of('<!-- comment {b} -->'), [['comment', '<!-- comment {b} -->']]);
	});
});

describe('lexer_svelte malformed-input resilience', () => {
	// a `|` before the `:` in an attribute name is malformed, but must still
	// produce a valid (non-overlapping) event stream — the pipe belongs to the
	// namespace span, not a separate modifier punctuation leaf
	test('a pipe before the namespace colon stays valid', () => {
		assert.deepEqual(
			validate_syntax_events(syntax_styler_global.lex('<div a|b:c></div>', 'svelte')),
			[]
		);
	});

	// `@`/`#`/`$` at an embedded ts window's edge (the each/await `as`/`then`
	// split boundary) must not read or emit past the window
	test('an at-sign at an embed boundary stays valid', () => {
		for (const text of ['{#each a@as b}', '{#await x@then y}', '{#each a#as b}']) {
			assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'svelte')), [], text);
		}
	});
});

describe('lexer_svelte sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.svelte', 'utf8');

	test('lexes the sample with valid invariants', () => {
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(content, 'svelte')), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'svelte')).map((t) => t.type)
		);
		for (const t of [
			'tag',
			'svelte_expression',
			'lang_ts',
			'attr_name',
			'block',
			'at_directive',
			'declaration_tag'
		]) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 11) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'svelte');
			assert.deepEqual(validate_syntax_events(lexed), [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'svelte'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'svelte'));
		assert.deepEqual(a, b);
	});
});
