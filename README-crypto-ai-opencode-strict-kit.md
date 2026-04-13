# crypto-ai OpenCode strict kit

This kit is a stricter version tailored for the current `crypto-ai` repository shape and deployment model.

## Included
- `AGENTS.md` — strict repo rules for apps/api, apps/web, Redis, Railway
- `opencode.json` — safer OpenCode defaults and permissions
- `.github/workflows/ci.yml` — baseline CI
- `.github/pull_request_template.md`
- `.github/CODEOWNERS`
- `docs/opencode/strict-cache-rules.md`
- `docs/opencode/railway-deploy-checklist.md`
- `docs/opencode/prompt-templates.md`
- `scripts/opencode-session.sh`

## Key focus
This strict version is opinionated around these cache families:
- `buy-cache:*`
- `dashboard-cache:*`
- `signal:*`
- `candles:*`

## Recommended install
1. Extract files into the repo root.
2. Replace `@your-github-username` in `.github/CODEOWNERS`.
3. Review `ci.yml` versions for your actual runtime.
4. Commit the files.
5. Start OpenCode from a feature branch.

## Suggested daily flow
1. `tmux new -s opencode`
2. `./scripts/opencode-session.sh /path/to/repo`
3. `/init`
4. Ask OpenCode to use `plan` first.
5. Move to `build` only after reviewing the plan.
6. Review diff manually.
7. Commit, push, open PR.
8. Let Railway deploy after merge.

## Important note
This kit is tuned to the repo shape described in prior work. If your actual repository uses different package names, key names, or workflows, update the files accordingly.
