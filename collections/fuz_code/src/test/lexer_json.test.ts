import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events } from '$lib/lexer.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'json')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

describe('lexer_json', () => {
	test('distinguishes properties from string values', () => {
		assert.deepEqual(tokens_of('{"a": "b"}'), [
			['punctuation', '{'],
			['property', '"a"'],
			['operator', ':'],
			['string', '"b"'],
			['punctuation', '}']
		]);
	});

	test('handles literals and numbers', () => {
		assert.deepEqual(tokens_of('[true, false, null, -1.5e3]'), [
			['punctuation', '['],
			['boolean', 'true'],
			['punctuation', ','],
			['boolean', 'false'],
			['punctuation', ','],
			['null', 'null'],
			['punctuation', ','],
			['number', '-1.5e3'],
			['punctuation', ']']
		]);
	});

	test('null renders with the keyword alias class', () => {
		assert.include(
			syntax_styler_global.stylize('null', 'json'),
			'<span class="token_null token_keyword">null</span>'
		);
	});

	test('coalesces adjacent punctuation', () => {
		assert.deepEqual(tokens_of('[[]]'), [['punctuation', '[[]]']]);
	});

	test('handles jsonc comments', () => {
		assert.deepEqual(tokens_of('// line\n{/* block */}'), [
			['comment', '// line'],
			['punctuation', '{'],
			['comment', '/* block */'],
			['punctuation', '}']
		]);
	});

	test('unterminated string extends to end of line', () => {
		assert.deepEqual(tokens_of('"abc\n1'), [
			['string', '"abc'],
			['number', '1']
		]);
	});

	test('property lookahead crosses newlines', () => {
		assert.deepEqual(tokens_of('{"a"\n: 1}'), [
			['punctuation', '{'],
			['property', '"a"'],
			['operator', ':'],
			['number', '1'],
			['punctuation', '}']
		]);
	});
});

describe('lexer_json sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.json', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'json');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'json')).map((t) => t.type)
		);
		for (const t of ['property', 'string', 'number', 'boolean', 'null', 'punctuation']) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'json'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'json'));
		assert.deepEqual(a, b);
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 7) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'json');
			const issues = validate_syntax_events(lexed);
			assert.deepEqual(issues, [], `prefix of length ${len}`);
		}
	});
});
