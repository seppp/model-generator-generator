# Notes for Claude

- New generator ideas: use the `new-generator` skill in `.claude/skills/`. Generators are JSON recipes in `recipes/`; don't hand-write pages or FeatureScript per generator.
- Recipe format: `docs/RECIPES.md`. Engine code is shared between browser and Node (`engine/`), so keep it free of DOM and Node APIs.
- Before committing run `npm run check`. `npm run export -- <id> key=value` writes STL/3MF/FS to `out/` for inspection.
- No bundler: the site uses native ES modules with an import map; `tools/generate.mjs` copies vendored packages from node_modules into `dist/vendor/`.
