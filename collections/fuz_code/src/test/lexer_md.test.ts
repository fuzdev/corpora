import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events } from '$lib/lexer.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'md')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_md blocks', () => {
	test('headings with inline content', () => {
		assert.deepEqual(tokens_of('## Head `x`'), [
			['heading', '## Head `x`'],
			['punctuation', '##'],
			['inline_code', '`x`'],
			['punctuation', '`'],
			['content', 'x'],
			['punctuation', '`']
		]);
	});

	test('not headings: no space, 7 hashes, empty', () => {
		assert.deepEqual(picked('#hashtag', ['heading']), []);
		assert.deepEqual(picked('####### seven', ['heading']), []);
		assert.deepEqual(picked('## ', ['heading']), []);
	});

	test('blockquotes get the inline scan', () => {
		assert.deepEqual(tokens_of('> quote with **bold**'), [
			['blockquote', '> quote with **bold**'],
			['punctuation', '>'],
			['bold', '**bold**'],
			['punctuation', '**'],
			['punctuation', '**']
		]);
	});

	test('list items span their line with an indent-aware marker', () => {
		assert.deepEqual(tokens_of('  - item _em_'), [
			['list', '  - item _em_'],
			['punctuation', '  -'],
			['italic', '_em_'],
			['punctuation', '_'],
			['punctuation', '_']
		]);
		assert.deepEqual(picked('* starred', ['list']), [['list', '* starred']]);
	});

	test('horizontal rules', () => {
		assert.deepEqual(tokens_of('---'), [['hr', '---']]);
		assert.deepEqual(tokens_of('*****'), [['hr', '*****']]);
		assert.deepEqual(tokens_of('___'), [['hr', '___']]);
		assert.deepEqual(picked('--', ['hr']), []);
	});
});

describe('lexer_md fences', () => {
	test('a known language embeds inside a lang container', () => {
		assert.deepEqual(tokens_of('```ts\nlet x = 1;\n```').slice(0, 4), [
			['fenced_code', '```ts\nlet x = 1;\n```'],
			['code_fence', '```ts'],
			['lang_ts', '\nlet x = 1;\n'],
			['keyword', 'let']
		]);
	});

	test('info words match exactly — json is json, tsx is unknown', () => {
		assert.deepEqual(picked('```json\n{"a": 1}\n```', ['lang_json', 'property']), [
			['lang_json', '\n{"a": 1}\n'],
			['property', '"a"']
		]);
		assert.deepEqual(picked('```tsx\nlet x = 1;\n```', ['lang_ts', 'keyword']), []);
	});

	test('extra info after the language word is tolerated', () => {
		assert.deepEqual(picked('```ts twoslash\nlet x = 1;\n```', ['keyword']), [['keyword', 'let']]);
	});

	test('unknown or absent info leaves content plain', () => {
		assert.deepEqual(tokens_of('```python\nprint(1)\n```'), [
			['fenced_code', '```python\nprint(1)\n```'],
			['code_fence', '```python'],
			['code_fence', '```']
		]);
	});

	test('a longer closing fence closes a shorter opener', () => {
		assert.deepEqual(picked('```\nplain\n`````', ['code_fence']), [
			['code_fence', '```'],
			['code_fence', '`````']
		]);
	});

	test('a shorter closing fence does not close a longer opener', () => {
		assert.deepEqual(picked('````python\na\n```\nb\n````', ['code_fence']), [
			['code_fence', '````python'],
			['code_fence', '````']
		]);
	});

	test('markdown fences self-embed', () => {
		assert.deepEqual(picked('````md\n# inner\n````', ['lang_md', 'heading']), [
			['lang_md', '\n# inner\n'],
			['heading', '# inner']
		]);
	});

	test('an unterminated fence extends to the end', () => {
		const text = '```ts\nlet x = 1;';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'md')), []);
		assert.deepEqual(picked(text, ['fenced_code', 'keyword']), [
			['fenced_code', text],
			['keyword', 'let']
		]);
	});

	test('deep self-embed cascades stay valid without overflowing the stack', () => {
		// each unterminated ```md fence embeds the rest of the document as
		// markdown — the embed depth cap bounds the cascade
		const input = '```md\n'.repeat(4000);
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(input, 'md')), []);
	});
});

describe('lexer_md inline', () => {
	test('emphasis forms', () => {
		assert.deepEqual(picked('a **b** _c_ *d* __e__ ~~f~~', ['bold', 'italic', 'strikethrough']), [
			['bold', '**b**'],
			['italic', '_c_'],
			['italic', '*d*'],
			['bold', '__e__'],
			['strikethrough', '~~f~~']
		]);
	});

	test('space-adjacent delimiters do not match', () => {
		assert.deepEqual(picked('not ** bold **, not _ italic _', ['bold', 'italic']), []);
	});

	test('underscore forms require word boundaries', () => {
		assert.deepEqual(picked('snake_case_name and _real_', ['italic']), [['italic', '_real_']]);
	});

	test('inline code is line-bounded and non-empty', () => {
		assert.deepEqual(picked('a `b` c', ['inline_code', 'content']), [
			['inline_code', '`b`'],
			['content', 'b']
		]);
		assert.deepEqual(picked('not `` empty', ['inline_code']), []);
		assert.deepEqual(picked('not `multi\nline`', ['inline_code']), []);
	});

	test('links', () => {
		assert.deepEqual(tokens_of('[text](url)'), [
			['link', '[text](url)'],
			['link_text_wrapper', '[text]'],
			['punctuation', '['],
			['link_text', 'text'],
			['punctuation', ']'],
			['url_wrapper', '(url)'],
			['punctuation', '('],
			['url', 'url'],
			['punctuation', ')']
		]);
		assert.deepEqual(picked('[a[b]](c) and [d] (e)', ['link']), []);
	});

	test('links on later lines survive failed probes on earlier ones', () => {
		// the `]`/`)` probes are cached for the whole document (`MdScanCache`) —
		// an opener that fails to match on one line must not lose a real link on
		// a later line
		assert.deepEqual(picked('[a](b\ntext\n[c](d) e', ['link']), [['link', '[c](d)']]);
		assert.deepEqual(picked('[a b\n[c](d)', ['link']), [['link', '[c](d)']]);
	});

	test('entities', () => {
		assert.deepEqual(picked('a &amp; b &#38; c', ['entity']), [
			['entity', '&amp;'],
			['entity', '&#38;']
		]);
	});
});

describe('lexer_md raw markup', () => {
	test('inline tags in paragraph text', () => {
		assert.deepEqual(picked('some <strong>bold</strong> html', ['tag']).length, 2 * 2);
	});

	test('multi-line comments span paragraph lines', () => {
		assert.deepEqual(picked('before <!-- a\nb --> after **x**', ['comment', 'bold']), [
			['comment', '<!-- a\nb -->'],
			['bold', '**x**']
		]);
	});

	test('script regions embed js', () => {
		assert.deepEqual(picked('<script>\nlet x = 1;\n</script>', ['script', 'lang_js', 'keyword']), [
			['script', '\nlet x = 1;\n'],
			['lang_js', '\nlet x = 1;\n'],
			['keyword', 'let']
		]);
	});

	test('markup constructs inside block containers clamp to the line', () => {
		const text = '> quote <b unterminated\nplain';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'md')), []);
		assert.deepEqual(picked(text, ['tag']).slice(0, 1), [['tag', '<b unterminated']]);
	});

	test('attribute entities on later lines survive entity-less earlier tags', () => {
		// the markup probe cache is shared across the whole document scan
		// (`MdScanCache.markup`) — entity-less attribute values on earlier lines
		// must not lose an entity in a later one
		assert.deepEqual(picked('<b c="v">x</b>\n\n<i d="&amp;">y</i>', ['entity']), [
			['entity', '&amp;']
		]);
	});
});

describe('lexer_md sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.md', 'utf8');

	test('lexes the sample with valid invariants', () => {
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(content, 'md')), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'md')).map((t) => t.type)
		);
		for (const t of ['heading', 'fenced_code', 'code_fence', 'list', 'bold', 'italic']) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 13) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'md');
			assert.deepEqual(validate_syntax_events(lexed), [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'md'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'md'));
		assert.deepEqual(a, b);
	});
});
