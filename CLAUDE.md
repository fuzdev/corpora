# corpora

> Pinned snapshot of real-code corpora for the fuz ecosystem's language tools.

A data repo, not a package. It vendors the source of real-world projects — one
collection per upstream repo, every collection pinned at one roll-up commit — so that
a tool's benchmarks, conformance gates and PGO training all name one SHA and anyone
can reproduce their numbers with one clone. First consumer: [tsv](https://github.com/fuzdev/tsv).

## Layout

```
corpora/
├── manifest.json     # collections: name, url, commit, subpaths, include, exclude, files, license, shaped_by, origin
├── lock.json         # per collection: commit, file count, bytes, content digest (generated)
├── src/lib/          # the materializer + check, gro tasks on Node (git via subprocess)
│   ├── materialize.task.ts # the task: write mode, `--check`, `--only <name>`; a full run also removes/reports collections the manifest dropped
│   └── *.ts                # materialize, manifest (schemas, then cross-field checks), git, source (sibling or .cache clone), snapshot
├── src/test/         # vitest; `gro test` passes `--dir src`, and vite.config.ts keeps a bare `vitest` out of collections/ too
├── .cache/           # gitignored: bare clones fetched at the pinned commits when no sibling has them
└── collections/
    └── <name>/       # LICENSE + the upstream-relative source tree, verbatim bytes
```

Consumers point at `collections/<name>`, never at the repo root — the tree they walk
holds only corpus files.

## Commands

```bash
npm run materialize                 # rewrite collections/ + lock.json from manifest.json
npm run materialize -- --only kit   # one collection (repeatable); the others keep their lock entries
npm run materialize:check           # re-materialize in memory, compare byte for byte + lock; exit 1 on drift or a bad --only
npm run check                       # gro check: typecheck + vitest + gen + format; never reaches collections/
```

The `--` before a flag matters: without it npm takes the flag itself. `gro format` covers
`src/` and the root config files, so it never reaches `collections/`; never run `tsv format .`,
which would walk it.

`npm run materialize:check` is what CI runs (`.github/workflows/check.yml`), after `gro check --workspace`. It is also the
license gate: a collection whose license file or declaration does not read as its
manifest SPDX id fails inside it.

## Rules

- **Verbatim bytes.** `.gitattributes` declares `* -text`; nothing here is ever
  formatted, and no ignore files live under `collections/` (a consumer's discovery reads
  the root's too, so the root `.gitignore` ends by re-including everything under `collections/`),
  so every tool's discovery sees every file. Never format a collection in place; copy
  it, or `git checkout --` it afterwards.
- **Materialized from git objects** — `git ls-tree -r <commit> -- <subpath>` lists, `git
  cat-file --batch` copies — filtered by the manifest's extension allowlist and excludes.
  Never from a directory walk of a live checkout, never from a consumer's own discovery.
  Symlinks are skipped (a snapshot holds bytes, not links); a subpath that matches no
  file fails, and so does a kept path that isn't UTF-8. A collection's `files` names upstream files kept whatever their extension
  — a module-type or config file a runtime reads to load the source as written, like the
  `package.json` whose `"type": "module"` makes Node read `.ts` as ESM, or an upstream
  attribution notice a license requires to accompany the code, like the `NOTICE.txt`
  crediting Apache-2.0 code a library ported; each must exist at the commit.
- **Code as people write it.** Upstream test fixtures are excluded by the upstream's
  own meaning, and so is a third-party bundle an upstream vendors into its tree (both
  spelled per collection in the manifest's `exclude`); conformance suites (test262, the TypeScript compiler's cases, wpt,
  Svelte's and prettier's test suites) do not belong here — consumers read those
  checkouts directly.
- **Redistributable only.** Every collection carries its upstream LICENSE (or names
  the manifest field it was read from) and must be permissive; the materializer
  refuses anything else.
- **No oracle verdicts.** What a formatter or parser says about these files stays in
  the consumer, keyed on this repo's SHA.
- **Refreshes are deliberate.** No scheduled auto-refresh; CI only checks that
  re-materializing at the manifest's commits reproduces the tree byte for byte, that
  every collection is licensed, and that the lock matches.
