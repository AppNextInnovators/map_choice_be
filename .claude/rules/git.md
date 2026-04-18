Always follow these rules when performing git or GitHub actions on behalf of the user.

- Never push directly to `main` or `dev` — always use a pull request
- Never force-push (`git push --force`) to any shared branch
- Never merge a PR without confirming the user has review/approval
- Never commit `.env` files, API keys, or secrets
- Always start new work from `dev` — `git checkout dev && git pull origin dev` first
- Branch naming: `your-name/short-description` (e.g. `rakib/fix-drawer-state`)
- Stage specific files only — never `git add .` blindly
- Write clear commit messages describing what changed and why
- Delete the branch after it is merged
- PRs always target `dev`, not `main`
- Merges from `dev` → `main` are done by the team lead only

**Why:** User explicitly defined these as team rules to be enforced on every git action.

**How to apply:** Before any git push, commit, or PR action, verify it complies with these rules. Refuse or warn if a requested action would violate them (e.g. pushing directly to main).
