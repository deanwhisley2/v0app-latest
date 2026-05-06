# Startup Recovery Orchestration + Safe Resume

## Restart risk inventory

- Crash during BUY execution: DB may have `PENDING` while exchange already filled; risk is duplicate retry BUY; complexity high.
- Crash during SELL liquidation: open position may remain on exchange while session transitions incomplete; risk is unhedged exposure; complexity high.
- Stale `ExecutionLock`: lock owner died and no new worker can proceed; risk is deadlock and frozen recovery; complexity low.
- Stale `ExecutionIdempotency` in `IN_PROGRESS`: retries blocked forever; risk is stuck lifecycle and manual force actions; complexity medium.
- `ACTIVE` session with exchange-flat state: lifecycle says in-market but exchange is flat; risk is false position tracking and bad risk math; complexity high.
- Exchange-open position but DB `PositionState=FLAT`: DB misses exposure; risk is overtrading and unsafe SELL/BUY decisions; complexity critical.
- Recovery rerun collisions after repeated restarts: startup jobs may overlap; risk is duplicated repair attempts; complexity medium.
- Cooldown/risk counters reset in process memory: restart bypasses local safety throttles; risk is post-restart overtrading; complexity critical.

## External truth + restoration model

- Order terminal truth (`FILLED` / canceled/rejected/expired) comes from exchange.
- Position truth starts from net executed quantity derived from order fills, then reconciles with `PositionState`.
- On any unresolved mismatch, status escalates to `MANUAL_REVIEW_REQUIRED` and global gate blocks autonomous execution.
- Partial fill truth uses exchange `executedQty` + `cummulativeQuoteQty` to patch quantity/price only when unambiguous.

## Startup recovery orchestration

1. Set global resume gate to `RECOVERY_IN_PROGRESS`.
2. Scan and release stale execution locks.
3. Mark stale idempotency `IN_PROGRESS` records as `FAILED`.
4. Reconcile incomplete sessions (`PENDING`, `ACTIVE`) with exchange.
5. Classify unresolved sessions (`RECOVERY_REQUIRED`, `DIVERGED`, `EXCHANGE_UNKNOWN`).
6. Set gate:
   - `SAFE_TO_RESUME` when unresolved count is zero.
   - `MANUAL_REVIEW_REQUIRED` when unresolved exists.
   - `RECOVERY_FAILED` on orchestration failure.

## Stale lock recovery model

- Lock stale definition: expired `ExecutionLock.expiresAt` older than current time.
- Clearance authority: startup orchestrator using admin DB context only.
- Safety check: release only expired locks; each release is logged as `[stale-lock-release]`.

## Execution resume gating model

- Persisted in `StartupRecoveryState` with scope `GLOBAL_EXECUTION`.
- Supported gate states:
  - `RECOVERY_IN_PROGRESS`
  - `SAFE_TO_RESUME`
  - `MANUAL_REVIEW_REQUIRED`
  - `RECOVERY_FAILED`
  - `EXECUTION_BLOCKED`
- `scripts/background-engine.ts` and `scripts/auto-trader-daemon.ts` now hard-block cycles unless gate is `SAFE_TO_RESUME`.

## Risk/cooldown restoration note

- Engine-level process memory counters still exist in daemon scripts.
- Safe behavior on startup is enforced by global resume gate to prevent immediate autonomous continuation before reconciliation.
- Next hardening step: migrate script-local risk/cooldown counters to DB-backed runtime authority rows for full restart durability.

## Startup trace logging

- Logs emitted:
  - `[startup-recovery]`
  - `[startup-scan]`
  - `[stale-lock-release]`
  - `[exchange-reconcile]`
  - `[resume-approved]`
  - `[resume-blocked]`

## Startup/deployment sequence

1. Run DB migration adding `StartupRecoveryState`.
2. On process boot, run `npx tsx scripts/reconcile-on-start.ts`.
3. Start autonomous workers/daemons only after gate is `SAFE_TO_RESUME`.
4. If gate is `MANUAL_REVIEW_REQUIRED` or `RECOVERY_FAILED`, hold autonomous execution and resolve flagged sessions.
