import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events } from '$lib/lexer.ts';

const tokens_of = (text: string, lang = 'html'): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, lang)).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

const picked = (text: string, types: Array<string>, lang = 'html'): Array<[string, string]> =>
	tokens_of(text, lang).filter(([type]) => types.includes(type));

describe('lexer_markup tags', () => {
	test('a minimal element', () => {
		assert.deepEqual(tokens_of('<b>x</b>'), [
			['tag', '<b>'],
			['tag', '<b'],
			['punctuation', '<'],
			['punctuation', '>'],
			['tag', '</b>'],
			['tag', '</b'],
			['punctuation', '</'],
			['punctuation', '>']
		]);
	});

	test('a quoted attribute', () => {
		assert.deepEqual(tokens_of('<div class="test">'), [
			['tag', '<div class="test">'],
			['tag', '<div'],
			['punctuation', '<'],
			['attr_name', 'class'],
			['attr_value', '="test"'],
			['punctuation', '='],
			['punctuation', '"'],
			['punctuation', '"'],
			['punctuation', '>']
		]);
	});

	test('single-quoted, unquoted, and boolean attributes', () => {
		assert.deepEqual(tokens_of("<a href=foo title='b' hidden>"), [
			['tag', "<a href=foo title='b' hidden>"],
			['tag', '<a'],
			['punctuation', '<'],
			['attr_name', 'href'],
			['attr_value', '=foo'],
			['punctuation', '='],
			['attr_name', 'title'],
			['attr_value', "='b'"],
			['punctuation', '='],
			['punctuation', "'"],
			['punctuation', "'"],
			['attr_name', 'hidden'],
			['punctuation', '>']
		]);
	});

	test('self-closing punctuation is one span', () => {
		assert.deepEqual(tokens_of('<br />').slice(-1), [['punctuation', '/>']]);
	});

	test('namespaces in tag and attribute names', () => {
		assert.deepEqual(tokens_of('<svg:rect xlink:href="#a" />'), [
			['tag', '<svg:rect xlink:href="#a" />'],
			['tag', '<svg:rect'],
			['punctuation', '<'],
			['namespace', 'svg:'],
			['attr_name', 'xlink:href'],
			['namespace', 'xlink:'],
			['attr_value', '="#a"'],
			['punctuation', '='],
			['punctuation', '"'],
			['punctuation', '"'],
			['punctuation', '/>']
		]);
	});

	test('not tags: lone `<`, digit names, empty closers', () => {
		assert.deepEqual(tokens_of('a < b'), []);
		assert.deepEqual(tokens_of('<1x>'), []);
		assert.deepEqual(tokens_of('</>'), []);
	});

	test('an unterminated tag extends to the end of the input', () => {
		const text = '<div class="x';
		const tokens = tokens_of(text);
		assert.deepEqual(tokens[0], ['tag', text]);
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'html')), []);
	});

	test('js-style comments in tags stay bogus attributes (svelte-only feature)', () => {
		// `//` and `/* */` between attributes are comments in svelte, but in
		// html/xml they are ordinary bogus attribute text
		assert.deepEqual(picked('<div a="1" // x\n/* y */ b="2">', ['comment']), []);
		assert.deepEqual(picked('<div // x>', ['attr_name']), [['attr_name', 'x']]);
		assert.deepEqual(picked('<div /* y */ z>', ['comment'], 'xml'), []);
	});
});

describe('lexer_markup entities', () => {
	test('named and numeric forms', () => {
		assert.deepEqual(tokens_of('a &amp; &#38; &#x26; b'), [
			['entity', '&amp;'],
			['entity', '&#38;'],
			['entity', '&#x26;']
		]);
	});

	test('non-entities stay plain', () => {
		assert.deepEqual(tokens_of('a & b &nosemicolon and &waytoolongname;'), []);
	});

	test('entities inside attribute values', () => {
		assert.deepEqual(picked('<a title="a &amp; b">', ['entity']), [['entity', '&amp;']]);
	});

	test('entities after entity-less gaps and attribute values', () => {
		// the `&` probe is cached across text gaps and attribute values
		// (`MarkupProbeCache`) — entity-less regions before an entity must not
		// lose it
		assert.deepEqual(picked('<b>x</b> y <i>z</i> &amp; w', ['entity']), [['entity', '&amp;']]);
		assert.deepEqual(picked('<a b="c" d="&#x27;">', ['entity']), [['entity', '&#x27;']]);
	});
});

describe('lexer_markup comments, doctype, cdata, processing instructions', () => {
	test('comments swallow tag-lookalikes', () => {
		assert.deepEqual(tokens_of('<!-- comment <div>a<br /> b</div> <script> -->'), [
			['comment', '<!-- comment <div>a<br /> b</div> <script> -->']
		]);
	});

	test('a comment ends at the first closer', () => {
		assert.deepEqual(tokens_of('<!-- a <!-- b -->'), [['comment', '<!-- a <!-- b -->']]);
	});

	test('an unterminated comment extends to the end', () => {
		assert.deepEqual(tokens_of('<!-- open'), [['comment', '<!-- open']]);
	});

	test('doctype, case-insensitive', () => {
		assert.deepEqual(tokens_of('<!doctype html>'), [['doctype', '<!doctype html>']]);
		assert.deepEqual(tokens_of('<!DOCTYPE html>'), [['doctype', '<!DOCTYPE html>']]);
	});

	test('doctype with an internal subset', () => {
		const text = '<!DOCTYPE doc [ <!ENTITY x "y"> ]>';
		assert.deepEqual(tokens_of(text), [['doctype', text]]);
	});

	test('cdata is inert', () => {
		const text = '<![CDATA[ if (a < 0) alert("b"); <not-a-tag> ]]>';
		assert.deepEqual(tokens_of(text), [['cdata', text]]);
	});

	test('processing instructions', () => {
		assert.deepEqual(tokens_of('<?xml version="1.0"?>'), [
			['processing_instruction', '<?xml version="1.0"?>']
		]);
	});
});

describe('lexer_markup script and style regions', () => {
	test('script embeds js between ordinary tags', () => {
		assert.deepEqual(tokens_of('<script>let a = 1;</script>'), [
			['tag', '<script>'],
			['tag', '<script'],
			['punctuation', '<'],
			['punctuation', '>'],
			['script', 'let a = 1;'],
			['lang_js', 'let a = 1;'],
			['keyword', 'let'],
			['operator', '='],
			['number', '1'],
			['punctuation', ';'],
			['tag', '</script>'],
			['tag', '</script'],
			['punctuation', '</'],
			['punctuation', '>']
		]);
	});

	test('script content that looks like markup stays js', () => {
		assert.deepEqual(picked("<script>const ok = '<style>';</script>", ['string', 'style']), [
			['string', "'<style>'"]
		]);
	});

	test('style embeds css', () => {
		assert.deepEqual(tokens_of('<style>a{color:red}</style>').slice(4, 11), [
			['style', 'a{color:red}'],
			['lang_css', 'a{color:red}'],
			['selector', 'a'],
			['punctuation', '{'],
			['property', 'color'],
			['punctuation', ':'],
			['punctuation', '}']
		]);
	});

	test('close tags match case-insensitively and tolerate whitespace', () => {
		assert.deepEqual(picked('<script>1</SCRIPT >', ['script', 'number']), [
			['script', '1'],
			['number', '1']
		]);
	});

	test('a partial close-tag name does not close the region', () => {
		assert.deepEqual(picked('<script>a</scripts>b</script>', ['script']), [
			['script', 'a</scripts>b']
		]);
	});

	test('an unterminated region extends to the end', () => {
		assert.deepEqual(picked('<script>let a', ['script', 'keyword']), [
			['script', 'let a'],
			['keyword', 'let']
		]);
	});

	test('textarea and title are rcdata: entities only, no tags', () => {
		assert.deepEqual(tokens_of('<textarea><b>&amp;</b></textarea>').slice(4, -4), [
			['entity', '&amp;']
		]);
		// 4 = the outer+inner `tag` pairs of <title> and </title> — no <b> tag
		assert.strictEqual(picked('<title>a <b> b</title>', ['tag']).length, 4);
	});
});

describe('lexer_markup special attributes', () => {
	test('on* attributes embed js', () => {
		assert.deepEqual(tokens_of('<hr onclick="console.log(1)" />').slice(3, -1), [
			['special_attr', 'onclick="console.log(1)"'],
			['attr_name', 'onclick'],
			['attr_value', '="console.log(1)"'],
			['punctuation', '='],
			['punctuation', '"'],
			['value', 'console.log(1)'],
			['builtin', 'console'],
			['punctuation', '.'],
			['function', 'log'],
			['punctuation', '('],
			['number', '1'],
			['punctuation', ')'],
			['punctuation', '"']
		]);
	});

	test('style attributes embed css', () => {
		assert.deepEqual(picked('<div style="color:red">', ['special_attr', 'property']), [
			['special_attr', 'style="color:red"'],
			['property', 'color']
		]);
	});

	test('unquoted special values embed too', () => {
		assert.deepEqual(picked('<a onclick=go()>', ['value', 'function']), [
			['value', 'go()'],
			['function', 'go']
		]);
	});

	test('a value starting with whitespace gets no value container', () => {
		assert.deepEqual(picked('<div style=" color:red">', ['special_attr', 'value', 'property']), [
			['special_attr', 'style=" color:red"']
		]);
	});
});

describe('lexer_markup xml mode', () => {
	test('script has no special region', () => {
		assert.deepEqual(picked('<script>a<b></script>', ['script', 'lang_js'], 'xml'), []);
		assert.deepEqual(picked('<script>a<b></script>', ['tag'], 'xml').length, 3 * 2);
	});

	test('style and on* attributes are ordinary', () => {
		assert.deepEqual(
			picked('<div style="color:red" onclick="go()"/>', ['special_attr', 'value'], 'xml'),
			[]
		);
		assert.deepEqual(picked('<div style="color:red" onclick="go()"/>', ['attr_name'], 'xml'), [
			['attr_name', 'style'],
			['attr_name', 'onclick']
		]);
	});

	test('cdata and processing instructions still work', () => {
		assert.deepEqual(
			picked(
				'<?xml version="1.0"?><a><![CDATA[<b>]]></a>',
				['processing_instruction', 'cdata'],
				'xml'
			),
			[
				['processing_instruction', '<?xml version="1.0"?>'],
				['cdata', '<![CDATA[<b>]]>']
			]
		);
	});
});

describe('lexer_markup sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.html', 'utf8');

	test('lexes the sample with valid invariants', () => {
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(content, 'html')), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'html')).map((t) => t.type)
		);
		for (const t of ['tag', 'attr_name', 'attr_value', 'comment', 'doctype']) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 7) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'html');
			assert.deepEqual(validate_syntax_events(lexed), [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'html'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'html'));
		assert.deepEqual(a, b);
	});

	test('xml mode lexes the sample with valid invariants', () => {
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(content, 'xml')), []);
	});
});
