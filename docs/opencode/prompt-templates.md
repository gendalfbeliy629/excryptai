# Prompt templates for strict crypto-ai workflow

## 1. Analysis only
Use `plan`.

```text
Analyze the current implementation for this task in apps/api and apps/web.
Do not edit files yet.
Return:
1. current behavior
2. exact files to change
3. Redis keys affected
4. Railway/deploy risk
5. minimal implementation plan
```

## 2. Safe implementation
Use `build` only after the plan is acceptable.

```text
Implement the approved minimal fix.
Constraints:
- preserve current API contracts unless absolutely necessary
- do not rename Redis key families
- keep buy-cache:*, dashboard-cache:*, signal:*, candles:* backward compatible
- do not edit deployment files unless required
After changes:
- run the narrowest relevant verification
- summarize changed files
- summarize Redis impact
- summarize Railway impact
```

## 3. Cache-sensitive task
```text
Focus on Redis safety.
Before editing, identify all readers and writers for:
- buy-cache:*
- dashboard-cache:*
- signal:*
- candles:*
Then implement the smallest safe change.
State clearly whether old cached data remains readable after deploy.
```

## 4. Railway-sensitive task
```text
Treat this as deployment-sensitive.
Do not change railway.json, Dockerfile, startup commands, or health endpoints unless strictly necessary.
If any deploy-risk file must change, explain why before editing and keep the change minimal.
```
