import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events } from '$lib/lexer.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'bash')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_bash words', () => {
	test('keywords, builtins, booleans by lookup', () => {
		assert.deepEqual(picked('if true; then echo hi; fi', ['keyword', 'builtin', 'boolean']), [
			['keyword', 'if'],
			['boolean', 'true'],
			['keyword', 'then'],
			['builtin', 'echo'],
			['keyword', 'fi']
		]);
	});

	test('word boundaries — local_var is not the local keyword', () => {
		assert.deepEqual(picked('local_var=1', ['keyword']), []);
		assert.deepEqual(picked('local x=1', ['keyword']), [['keyword', 'local']]);
	});

	test('function definitions, both styles', () => {
		assert.deepEqual(picked('greet() { :; }', ['function']), [['function', 'greet']]);
		assert.deepEqual(picked('function cleanup { :; }', ['keyword', 'function']), [
			['keyword', 'function'],
			['function', 'cleanup']
		]);
	});
});

describe('lexer_bash variables and expansions', () => {
	test('special, braced, and named variables', () => {
		assert.deepEqual(picked('echo $0 $@ ${name} ${arr[0]} $HOME', ['variable']), [
			['variable', '$0'],
			['variable', '$@'],
			['variable', '${name}'],
			['variable', '${arr[0]}'],
			['variable', '$HOME']
		]);
	});

	test('command substitution is a container with nested bash', () => {
		assert.deepEqual(tokens_of('$(echo hi)'), [
			['command_substitution', '$(echo hi)'],
			['punctuation', '$('],
			['builtin', 'echo'],
			['punctuation', ')']
		]);
	});

	test('legacy backtick command substitution is a container', () => {
		assert.deepEqual(tokens_of('`echo hi`'), [
			['command_substitution', '`echo hi`'],
			['punctuation', '`'],
			['builtin', 'echo'],
			['punctuation', '`']
		]);
	});

	test('backtick substitution nests inside a double-quoted string', () => {
		const lexed = syntax_styler_global.lex('"a `id` b"', 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.strictEqual(types.filter((t) => t === 'command_substitution').length, 1);
		assert.strictEqual(types.filter((t) => t === 'string').length, 1);
	});

	test('nested command substitution inside a double-quoted string', () => {
		const lexed = syntax_styler_global.lex('"a $(echo "b $(echo c)")"', 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.strictEqual(types.filter((t) => t === 'command_substitution').length, 2);
		assert.strictEqual(types.filter((t) => t === 'string').length, 2);
	});

	test('a comment inside $(…) does not close the substitution', () => {
		// the substitution's end is discovered during real tokenization, so the
		// `)` inside the comment cannot close it early — it runs to line end and
		// the substitution extends to the real `)` on the next line
		const text = '$(echo hi # not done)\necho more)';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'bash')), []);
		assert.deepEqual(picked(text, ['command_substitution', 'comment']), [
			['command_substitution', text],
			['comment', '# not done)']
		]);
	});

	test('a malformed substitution interior propagates to the window end', () => {
		// an unterminated single-quoted string consumes the closing `)`, so the
		// damage extends editor-style instead of being contained
		const text = "$(echo 'oops) more";
		const lexed = syntax_styler_global.lex(text, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.deepEqual(picked(text, ['command_substitution']), [['command_substitution', text]]);
	});

	test('double-quoted strings expand, single-quoted do not', () => {
		assert.deepEqual(picked('"$a" \'$a\'', ['string', 'variable']), [
			['string', '"$a"'],
			['variable', '$a'],
			['string', "'$a'"]
		]);
	});

	test('a bare $ before a non-name char is plain', () => {
		assert.deepEqual(picked('"x$"', ['variable']), []);
	});

	test('nested and quoted parameter expansions span the balanced braces', () => {
		assert.deepEqual(picked('echo ${a:-${b}} ${c%"}"} "${d:-${e}}"', ['variable']), [
			['variable', '${a:-${b}}'],
			['variable', '${c%"}"}'],
			['variable', '${d:-${e}}']
		]);
	});

	test('an unterminated ${ nest extends to the window end without throwing', () => {
		const lexed = syntax_styler_global.lex('echo ${a:-${b}', 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});
});

describe('lexer_bash arithmetic', () => {
	test('$((…)) is distinct from command substitution', () => {
		const tokens = tokens_of('$(( 2 + 3 ))');
		assert.deepEqual(picked('$(( 2 + 3 ))', ['command_substitution']), []);
		assert.deepEqual(tokens, [
			['punctuation', '$(('],
			['number', '2'],
			['number', '3'],
			['punctuation', '))']
		]);
	});

	test('$(…) command substitution still parses', () => {
		assert.deepEqual(picked('$(date)', ['command_substitution']), [
			['command_substitution', '$(date)']
		]);
	});

	test('stray text between arithmetic closers keeps the parens separate', () => {
		const text = '$((x) y)';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'bash')), []);
		assert.deepEqual(picked(text, ['punctuation']), [
			['punctuation', '$(('],
			['punctuation', ')'],
			['punctuation', ')']
		]);
	});
});

describe('lexer_bash numbers, operators, descriptors', () => {
	test('number formats', () => {
		assert.deepEqual(picked('x=0xFF y=077 z=2#1010 w=42', ['number']), [
			['number', '0xFF'],
			['number', '077'],
			['number', '2#1010'],
			['number', '42']
		]);
	});

	test('operators and here-string vs heredoc', () => {
		assert.deepEqual(picked('a || b && c | d <<< e', ['operator']), [
			['operator', '||'],
			['operator', '&&'],
			['operator', '|'],
			['operator', '<<<']
		]);
	});

	test('file descriptors around redirections', () => {
		assert.deepEqual(picked('cmd 2>&1', ['file_descriptor', 'operator']), [
			['file_descriptor', '2'],
			['operator', '>'],
			['file_descriptor', '&1']
		]);
	});

	test('bare = is plain, but == and =~ are operators', () => {
		assert.deepEqual(picked('x=1; [[ $x == 1 ]]; [[ $x =~ a ]]', ['operator']), [
			['operator', '=='],
			['operator', '=~']
		]);
	});
});

describe('lexer_bash heredocs', () => {
	test('unquoted heredoc is a container that expands variables', () => {
		const text = 'cat <<EOF\nhi ${name}\nEOF\n';
		// `cat` is plain — it is an external command, not a bash builtin
		assert.deepEqual(tokens_of(text), [
			['heredoc', '<<EOF\nhi ${name}\nEOF'],
			['heredoc_delimiter', '<<EOF'],
			['variable', '${name}'],
			['heredoc_delimiter', 'EOF']
		]);
	});

	test('quoted heredoc does not expand', () => {
		const text = "cat <<'END'\nno $expansion\nEND\n";
		assert.deepEqual(picked(text, ['variable', 'heredoc_delimiter']), [
			['heredoc_delimiter', "<<'END'"],
			['heredoc_delimiter', 'END']
		]);
	});

	test('<<- allows an indented closing delimiter', () => {
		const text = 'cat <<-EOF\n\tbody\n\tEOF\n';
		const tokens = tokens_of(text);
		assert.ok(tokens.some(([type, t]) => type === 'heredoc_delimiter' && t === 'EOF'));
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'bash')), []);
	});

	test('plain << requires the closing delimiter at column 0', () => {
		// the indented `\tEOF` is body; the column-0 `EOF` closes
		const text = 'cat <<EOF\n\tEOF\nbody\nEOF\n';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'bash')), []);
		assert.ok(
			tokens_of(text).some(([type, t]) => type === 'heredoc' && t === '<<EOF\n\tEOF\nbody\nEOF')
		);
	});

	test('a closing delimiter with trailing whitespace does not close', () => {
		// `EOF ` (trailing space) is body; the exact `EOF` closes
		const text = 'cat <<EOF\nEOF \nbody\nEOF\n';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'bash')), []);
		assert.ok(
			tokens_of(text).some(([type, t]) => type === 'heredoc' && t === '<<EOF\nEOF \nbody\nEOF')
		);
	});

	test('unterminated heredoc extends to the window end without throwing', () => {
		const lexed = syntax_styler_global.lex('cat <<EOF\nbody with no close\n', 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('multiple heredocs on one line drain in redirect order with mixed quoting', () => {
		const text = "cat <<'Q' <<U\nno $(x)\nQ\nyes $(y)\nU\nafter\n";
		const lexed = syntax_styler_global.lex(text, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const tokens = syntax_events_to_tokens(lexed);
		// two bodies, consumed in redirect order
		assert.equal(tokens.filter((t) => t.type === 'heredoc').length, 2);
		// the quoted body does not expand; the unquoted one does
		const subs = tokens.filter((t) => t.type === 'command_substitution');
		assert.deepEqual(
			subs.map((t) => text.slice(t.start, t.end)),
			['$(y)']
		);
	});

	test('a heredoc body containing `)` does not close an enclosing substitution', () => {
		const text = '$(cat <<EOF\na ) b\nEOF\n)';
		const lexed = syntax_styler_global.lex(text, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.deepEqual(picked(text, ['command_substitution']), [['command_substitution', text]]);
	});

	test('CRLF line endings still close the heredoc', () => {
		const text = 'cat <<EOF\r\nbody ${x}\r\nEOF\r\n';
		const lexed = syntax_styler_global.lex(text, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const tokens = syntax_events_to_tokens(lexed);
		// the closing delimiter is found (not swallowed into a runaway body)
		assert.ok(
			tokens.some((t) => t.type === 'heredoc_delimiter' && text.slice(t.start, t.end) === 'EOF')
		);
		assert.ok(tokens.some((t) => t.type === 'variable'));
	});
});

describe('lexer_bash comments', () => {
	test('comments require a preceding boundary; $# is a variable', () => {
		assert.deepEqual(picked('echo $# # trailing', ['comment', 'variable']), [
			['variable', '$#'],
			['comment', '# trailing']
		]);
	});

	test('shebang at file start', () => {
		assert.deepEqual(tokens_of('#!/bin/bash\nx')[0], ['shebang', '#!/bin/bash']);
	});
});

describe('lexer_bash sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.sh', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'bash')).map((t) => t.type)
		);
		for (const t of [
			'builtin',
			'keyword',
			'string',
			'variable',
			'command_substitution',
			'comment'
		]) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 11) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'bash');
			assert.deepEqual(validate_syntax_events(lexed), [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'bash'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'bash'));
		assert.deepEqual(a, b);
	});
});

describe('lexer_bash deep nesting', () => {
	test('deeply nested command substitutions tokenize fully without overflowing the stack', () => {
		const depth = 20000;
		const input = '$('.repeat(depth) + 'x' + ')'.repeat(depth);
		const lexed = syntax_styler_global.lex(input, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.equal(types.filter((t) => t === 'command_substitution').length, depth);
	});

	test('deeply nested arithmetic expansions tokenize fully without overflowing the stack', () => {
		const depth = 20000;
		const input = '$(('.repeat(depth) + '1' + '))'.repeat(depth);
		const lexed = syntax_styler_global.lex(input, 'bash');
		assert.deepEqual(validate_syntax_events(lexed), []);
		// the innermost literal is reached and tokenized — the depth cap this
		// replaced left interiors past its bound as plain text (the `$((`/`))`
		// punctuation runs coalesce into single leaves, so count the payload)
		const tokens = syntax_events_to_tokens(lexed);
		assert.equal(tokens.filter((t) => t.type === 'number').length, 1);
	});

	test('deep command substitutions alternating through double-quoted strings stay valid', () => {
		const depth = 5000;
		const input = '$("'.repeat(depth) + 'x' + '")'.repeat(depth);
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(input, 'bash')), []);
	});

	test('deep command substitutions alternating through heredoc bodies stay valid', () => {
		const depth = 2000;
		const input = '$(cat <<EOF\n'.repeat(depth) + 'x' + '\nEOF\n)'.repeat(depth);
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(input, 'bash')), []);
	});

	test('shallow nested command substitutions tokenize their interiors', () => {
		const types = tokens_of('echo $(echo $(date))').map(([type]) => type);
		assert.equal(types.filter((t) => t === 'command_substitution').length, 2);
	});
});
