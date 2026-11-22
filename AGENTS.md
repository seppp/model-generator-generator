# Agent instructions

Read [CLAUDE.md](CLAUDE.md): it applies to every coding agent, not only Claude.
In short: generators are JSON recipes in `recipes/` (format in
`docs/RECIPES.md`), run `npm run check` before committing, and every change to
the generator generator also updates the instructions people and AIs use
(`docs/RECIPES.md`, the AI prompt rules in `web/app/prompt.js`, the skills in
`.claude/skills/`, `README.md`).
