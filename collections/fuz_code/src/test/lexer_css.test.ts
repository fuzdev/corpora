import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events } from '$lib/lexer.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'css')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_css structure', () => {
	test('a simple rule: selector, property, value stays plain', () => {
		assert.deepEqual(tokens_of('.a { color: red; }'), [
			['selector', '.a'],
			['punctuation', '{'],
			['property', 'color'],
			['punctuation', ':'],
			['punctuation', ';'],
			['punctuation', '}']
		]);
	});

	test('selectors are a single leaf, including pseudo and attribute parts', () => {
		assert.deepEqual(picked('.content::before { x: 1 }', ['selector']), [
			['selector', '.content::before']
		]);
		assert.deepEqual(picked("a[title='Click: here'] { x: 1 }", ['selector']), [
			['selector', "a[title='Click: here']"]
		]);
		assert.deepEqual(picked('div > p { x: 1 }', ['selector']), [['selector', 'div > p']]);
	});

	test('native nesting: a nested rule inside a declaration block', () => {
		assert.deepEqual(picked('.a { color: red; .b { color: blue; } }', ['selector', 'property']), [
			['selector', '.a'],
			['property', 'color'],
			['selector', '.b'],
			['property', 'color']
		]);
	});
});

describe('lexer_css comments and strings', () => {
	test('comments win over their contents', () => {
		assert.deepEqual(picked('/* .a { x: 1 } */ .b {}', ['comment', 'selector']), [
			['comment', '/* .a { x: 1 } */'],
			['selector', '.b']
		]);
	});

	test('a string is not broken by an inner comment sequence', () => {
		assert.deepEqual(picked('.a { content: "/* x */"; }', ['string', 'comment']), [
			['string', '"/* x */"']
		]);
	});

	test('unterminated comment extends to end', () => {
		const lexed = syntax_styler_global.lex('.a { /* unterminated', 'css');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});
});

describe('lexer_css values', () => {
	test('functions and url() containers', () => {
		assert.deepEqual(tokens_of('.a { background: url("x.png"); }').slice(2), [
			['property', 'background'],
			['punctuation', ':'],
			['url', 'url("x.png")'],
			['function', 'url'],
			['punctuation', '('],
			['string', '"x.png"'],
			['punctuation', ')'],
			['punctuation', ';'],
			['punctuation', '}']
		]);
	});

	test('function calls in values', () => {
		assert.deepEqual(picked('.a { color: rgba(0, 0, 0, 0.1); }', ['function', 'property']), [
			['property', 'color'],
			['function', 'rgba']
		]);
	});

	test('!important', () => {
		assert.deepEqual(picked('.a { color: red !important; }', ['important']), [
			['important', '!important']
		]);
	});

	test('numbers and bare identifiers in values stay plain (parity)', () => {
		assert.deepEqual(picked('.a { margin: 10px; color: red; }', ['number', 'property']), [
			['property', 'margin'],
			['property', 'color']
		]);
	});
});

describe('lexer_css at-rules', () => {
	test('@media prelude with a feature is an atrule container', () => {
		const tokens = tokens_of('@media (max-width: 600px) { body {} }');
		assert.deepEqual(tokens.slice(0, 6), [
			['atrule', '@media (max-width: 600px)'],
			['rule', '@media'],
			['punctuation', '('],
			['property', 'max-width'],
			['punctuation', ':'],
			['punctuation', ')']
		]);
	});

	test('at-rule prelude keywords', () => {
		assert.deepEqual(picked('@media screen and (min-width: 1px) {}', ['keyword', 'rule']), [
			['rule', '@media'],
			['keyword', 'and']
		]);
	});
});

describe('lexer_css sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.css', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'css');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'css')).map((t) => t.type)
		);
		for (const t of ['selector', 'property', 'function', 'comment', 'string', 'atrule']) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 5) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'css');
			assert.deepEqual(validate_syntax_events(lexed), [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'css'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'css'));
		assert.deepEqual(a, b);
	});
});
