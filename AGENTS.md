# AGENTS.md

## Project identity
This repository is the `crypto-ai` monorepo.

Primary apps:
- `apps/api` — Node.js + TypeScript backend API, Telegram bot integration, cache warmup, signal generation, Redis integration.
- `apps/web` — Next.js frontend dashboard consuming API data.

Primary infrastructure:
- GitHub for source control and pull requests.
- Railway for deployments.
- Redis for shared cache across backend restarts and deploys.

Package manager:
- `pnpm`

## Non-negotiable operating mode
- Never work directly on `main`.
- Always use a feature branch.
- Prefer minimal safe changes over broad refactors.
- Preserve existing directory structure.
- Do not rename files, move modules, or restructure the monorepo unless explicitly required.
- Do not remove existing endpoints, jobs, Redis keys, or env vars unless the task explicitly requires it.
- For any risky task, first produce a plan and list impacted files before editing.

## Required sequence for any non-trivial task
1. Read the relevant files first.
2. Explain the current behavior briefly.
3. List exact files to be changed.
4. Implement the smallest safe change.
5. Run verification commands.
6. Return a concise summary with:
   - what changed
   - why
   - risks
   - rollback path

## Monorepo-specific rules
- Keep `apps/api` and `apps/web` independently buildable.
- Do not introduce hidden coupling between frontend and backend.
- API DTO changes must be backward compatible unless explicitly requested.
- Any backend response shape change must be checked against frontend consumers.
- Any frontend fetch change must be checked against API routes, cache shape, and fallback behavior.

## apps/api rules
- Preserve deterministic signal behavior unless the task is explicitly about trading logic.
- Avoid changing scoring formulas, thresholds, or signal semantics unless explicitly requested.
- Preserve current public route names and response contracts by default.
- Validate env usage whenever changing config, boot, Redis, or external API code.
- Do not silently swallow errors in signal, warmup, or cache code.
- Prefer explicit logging for degraded mode, warmup state, Redis failures, and external provider failures.

### Redis rules for apps/api
The following cache families are critical and must be handled conservatively:

#### 1) `buy-cache:*`
Expected usage:
- `buy-cache:soft`
- `buy-cache:hard`
- optional related status/meta keys

Rules:
- Treat `buy-cache:*` as shared backend cache for signal lists.
- Preserve TTL strategy unless the task explicitly changes it.
- Do not change value schema incompatibly without updating all readers.
- Keep payload serialization stable and explicit.
- Avoid writing partial or malformed cache objects.
- If warmup writes these keys, ensure atomicity as much as practical.
- If adding new metadata, make it additive, not breaking.

#### 2) `dashboard-cache:*`
Expected usage:
- `dashboard-cache:soft`
- `dashboard-cache:hard`
- optional related status/meta keys

Rules:
- Treat these as frontend-facing cache snapshots.
- Any DTO change must preserve backward compatibility.
- If dashboard data includes signal-derived sections, do not create TTL drift unless explicitly intended.
- Keep generation timestamps explicit.
- Prevent cache stampedes where possible.

#### 3) `signal:*`
Expected usage example:
- `signal:soft:BTC-USDT`
- `signal:hard:ETH-USDT`

Rules:
- Symbol normalization must stay consistent.
- Mode (`soft` / `hard`) must be explicit in the key.
- Per-symbol signal entries must not overwrite cross-mode data.
- Keep reader/writer naming aligned.
- If signal DTO changes, update all code paths that read signal cache and any related API formatter.

#### 4) `candles:*`
Expected usage examples:
- `candles:BTC-USDT:1m`
- `candles:BTC-USDT:1h`
- `candles:BTC-USDT:1d`
- or equivalent namespaced variants

Rules:
- Timeframe must be explicit in the key.
- Do not mix different providers or payload schemas under the same key.
- Preserve chronological ordering and timestamp units.
- Avoid unbounded growth; keep candle history capped or TTL-based.
- Candle payloads must remain compatible with frontend chart parsing.
- Any provider migration must define a safe compatibility strategy.

### Redis safety invariants
- Never flush Redis in application code.
- Never mass-delete cache families unless explicitly requested.
- Never silently change TTLs for `buy-cache:*`, `dashboard-cache:*`, `signal:*`, or `candles:*`.
- Any TTL change must be documented in the task summary.
- If Redis is unavailable, fallback behavior must be explicit and logged.
- Do not introduce per-request full recomputation when cache misses occur on hot paths unless explicitly required.

## apps/web rules
- Preserve current page structure and user-facing behavior unless explicitly requested.
- Avoid breaking hydration, SSR, or build-time rendering.
- Keep API calls resilient to missing or degraded backend data.
- If backend cache payloads change, update the frontend mapping code defensively.
- Chart code must preserve timestamp ordering, timeframe mapping, and stable rendering.
- Do not add expensive polling or duplicate requests without a clear reason.

## Railway deployment rules
- Treat deployment-related files as high risk.
- High-risk files include:
  - `railway.json`
  - `Dockerfile`
  - `.github/workflows/*`
  - root `package.json`
  - `pnpm-workspace.yaml`
  - lockfiles
  - env/config bootstrap files

### Railway-specific constraints
- Keep the backend listening on the expected `PORT`.
- Do not break service boot order or startup commands.
- Do not hardcode local-only paths or assumptions.
- Do not commit secrets, tokens, `.env` values, Railway internal URLs, or Redis credentials.
- When changing startup, build, or health endpoints, explain Railway impact explicitly.
- If a task touches Redis integration, mention whether cached data survives backend restart and how Railway services depend on Redis availability.

## GitHub / PR rules
- Do not push automatically.
- Do not merge automatically.
- Do not edit workflow files unless required by the task.
- Return a PR-ready summary that a human can paste into a pull request description.

## Allowed verification commands
Preferred checks:
- `pnpm -r --if-present lint`
- `pnpm -r --if-present typecheck`
- `pnpm -r --if-present build`
- targeted test commands if present

If a full build is too expensive, run the narrowest relevant verification and say exactly what was not verified.

## Forbidden actions
- No destructive git commands.
- No force push.
- No deleting Redis data.
- No production secret exposure.
- No broad refactor “cleanup” unless explicitly requested.
- No speculative migration of cache key names.

## Response format after implementation
Always return:
1. Changed files
2. Behavior change
3. Redis/cache impact
4. Railway/deploy impact
5. Verification run
6. Risks / rollback
