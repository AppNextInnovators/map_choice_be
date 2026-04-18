Any file I create or produce — including notes, docs, or memory files — must be placed inside the repo using relative paths. The `.claude/` folder is committed to GitHub, so never include absolute paths or machine-specific paths in any file under `.claude/`.

Generated documents — blueprints, feature plans, component specs, anything a PM or developer produces as an artifact — go in `docs/`, not `.claude/`. The `.claude/` folder is only for Claude configuration, rules, and memory.

**Why:** `.claude/` is pushed to GitHub and shared across the team — absolute paths like `/Users/rakibulhasan/...` break for other developers. Keeping generated docs in `docs/` also makes them easier to find and review.

**How to apply:** Always use repo-relative paths. Put generated artifacts in `docs/` (e.g. `docs/feature-plan.md`, `docs/component-spec.md`). Never write `/Users/...` or any absolute path into `.claude/` files. Never create doc files directly under `.claude/`.
