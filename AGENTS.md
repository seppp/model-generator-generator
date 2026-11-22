# Agent instructions

Read [CLAUDE.md](CLAUDE.md): it applies to every coding agent, not only Claude.
In short: generators are JSON recipes in `recipes/` (format in
`docs/RECIPES.md`), run `npm run check` before committing, and every change to
the generator generator also updates the instructions people and AIs use
(`docs/RECIPES.md`, the AI prompt rules in `web/app/prompt.js`, the skills in
`.claude/skills/`, `README.md`). Changes must stay backwards compatible with
older recipes (saved, exported and shared ones; `tests/compat/`); if one can't,
don't merge it: tell the user what breaks, which generators, whether to adjust
them and what that changes, and let them decide (see CLAUDE.md).
