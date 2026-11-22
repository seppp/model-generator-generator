# Notes for Claude

## Keep the instructions in step (every change)

People change generators with instructions this repo gives them, so a change
to the generator generator is not done until these match it:

- `docs/RECIPES.md`: the recipe reference. The website pastes it into the
  *Copy prompt for an AI chat* prompt, so it is what other people's AIs know.
  Wrap repo-only details (paths, npm commands, engine internals) in
  `<!-- dev-only -->` markers; `<!-- chat: ... -->` text appears only in the
  prompt (`engine/docs.js`).
- `web/app/prompt.js`: the rules at the top of that prompt.
- `.claude/skills/new-generator/SKILL.md` and
  `.claude/skills/review-submissions/SKILL.md`.
- `README.md` (features, commands) and this file.

`npm run check` fails when `docs/RECIPES.md` misses a block, block argument,
enum option, font, param type, step key or expression function, or the README
misses an npm script, and when the chat version mentions repo paths or npm
commands (`tools/docs-check.mjs`). It can't judge wording or
workflows, so read the files above whenever you change behaviour.

## Backwards compatibility (every change)

People keep generators in their browser, in exported files and in share links,
built on older versions of the recipe format and of the official recipes.
Changes must keep those working:

- Don't rename or remove blocks, block arguments, enum options, fonts, param
  types, step keys, expression functions or param keys of official recipes;
  add new ones instead and keep the old names working (map them if needed).
- `tests/compat/` holds older recipe versions; `npm run check` builds them all.
  When you change an official recipe, copy its previous version there.
- Deploys must load as a whole: `tools/generate.mjs` versions every module URL
  (`?v=<build hash>`); keep new imports and fetches inside that scheme.

If a change can't be backwards compatible, **don't merge it**, even with
standing permission to merge. Stop and tell the user first: what breaks,
which generators (official ones, and what kind of saved or shared ones),
whether they should be adjusted, and if adjusting them changes any
functionality. Let the user decide whether to apply it anyway.

## Repo notes

- New generator ideas: use the `new-generator` skill in `.claude/skills/`. Generators are JSON recipes in `recipes/`; don't hand-write pages or FeatureScript per generator.
- Submitted generators (GitHub issues labelled `submission`): use the `review-submissions` skill.
- Recipe format: `docs/RECIPES.md`. The build combines `recipes/*.json` into `dist/generators.json` (collection format in `engine/collection.js`, same as users' exported files). Engine code is shared between browser and Node (`engine/`), so keep it free of DOM and Node APIs.
- Before committing run `npm run check`. `npm run export -- <id> key=value` writes STL/3MF/OBJ/SVG/DXF/FS to `out/` for inspection.
- No bundler: the site uses native ES modules with an import map; `tools/generate.mjs` copies vendored packages from node_modules into `dist/vendor/`.
