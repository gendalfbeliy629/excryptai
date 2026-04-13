# Railway deploy checklist for crypto-ai

## Before push
- Confirm work is in a feature branch
- Run:
  - `pnpm -r --if-present lint`
  - `pnpm -r --if-present typecheck`
  - `pnpm -r --if-present build`
- Review `git diff`
- Check whether env usage changed
- Check whether startup / health endpoints changed

## If Redis-related code changed
Confirm:
- Redis fallback behavior is explicit
- Redis connection errors are logged clearly
- Cache payloads remain backward compatible where needed
- TTL changes are intentional and documented
- No key family was renamed accidentally

## If frontend data mapping changed
Confirm:
- current API responses still work
- degraded / empty cache state still renders safely
- chart candle parsing still matches backend timestamps and field names

## If deployment files changed
Review carefully:
- `railway.json`
- `Dockerfile`
- root `package.json`
- workspace config
- GitHub workflows

## After merge / deploy
Smoke checks:
- Railway service boots
- backend health endpoint responds
- frontend renders
- key API routes respond
- Redis-backed features work
- no unexpected degraded mode spam in logs
