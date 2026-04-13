## Summary
- What changed:
- Why:

## Files changed
- [ ] apps/api
- [ ] apps/web
- [ ] shared/root config
- [ ] CI / GitHub Actions
- [ ] Railway / deploy files

## Redis / cache impact
- Affected keys:
- [ ] buy-cache:*
- [ ] dashboard-cache:*
- [ ] signal:*
- [ ] candles:*
- TTL changes:
- Schema changes:
- Backward compatibility note:

## Railway impact
- Startup / build / healthcheck impact:
- Env var impact:
- Deploy risk:

## Verification
- [ ] pnpm -r --if-present lint
- [ ] pnpm -r --if-present typecheck
- [ ] pnpm -r --if-present build
- [ ] Manual smoke check

## Rollback
- Revert commit / PR
- Restore previous cache readers/writers if needed
