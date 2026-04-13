# Strict cache rules for crypto-ai

Use this document together with `AGENTS.md`.

## Goal
Keep Redis key strategy stable and predictable for:
- signal generation
- dashboard responses
- frontend chart data
- Railway restarts and rolling deploys

## Approved key families
- `buy-cache:*`
- `dashboard-cache:*`
- `signal:*`
- `candles:*`

## Guidance by family

### `buy-cache:*`
Use for aggregated BUY scan results by mode.

Recommended expectations:
- one stable writer path
- multiple safe readers
- explicit `cachedAt` and `expiresAt` if payload already uses metadata
- avoid adding nested fields unless all readers tolerate them

### `dashboard-cache:*`
Use for prebuilt frontend/dashboard payloads.

Recommended expectations:
- response DTO should remain stable
- additive changes are preferred
- if generated from `buy-cache:*`, document freshness relationship

### `signal:*`
Use for per-symbol signal context and derived summaries.

Recommended expectations:
- include mode in key name
- use normalized symbol format consistently
- readers must not assume a field exists unless writer guarantees it

### `candles:*`
Use for chart history by symbol and timeframe.

Recommended expectations:
- provider must be explicit in code, even if not encoded in key
- timestamps must stay in one consistent unit
- keep arrays ordered oldest -> newest
- keep payload small enough for hot retrieval

## Safe change policy
Allowed without redesign:
- additive fields
- better logging
- safer fallback handling
- defensive parsing
- improved validation

Requires extra caution:
- TTL changes
- key renames
- schema changes
- warmup flow changes
- provider changes for candle data
- frontend chart parser changes

## Required summary after any cache-related task
Always state:
1. Which keys were touched
2. Whether TTL changed
3. Whether payload schema changed
4. Whether existing cached data remains readable
5. Whether Railway deploy could temporarily mix old/new readers and writers
