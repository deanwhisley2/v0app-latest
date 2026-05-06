# Full Daemon State Externalization + Stateless Orchestration

## Local-state inventory

- `scripts/background-engine.ts`: local `lastSignals`, `lastExecutionTime`, `tradesCount`, `totalLoss`, `openPosition`, `lastEntryTime` previously affected execution gating and order eligibility.
- `scripts/auto-trader-daemon.ts`: local `state.open`, `realizedPnlUsd`, `consecutiveLosses`, `pausedUntil` previously controlled entries/exits and risk pausing.
- Remaining legacy local-memory scripts:
  - `scripts/auto-trader-1hr.ts`
  - `scripts/emergency-shutdown.ts`
  These are not converted in this phase and remain non-canonical risk surfaces if actively used.

## Authoritative-state classification

- **Authoritative execution state (externalized):**
  - position status and open quantity/cost
  - last execution timestamp / entry timestamp
  - signal streak direction/count/timestamp
  - trade counter window
  - cumulative loss window
  - orchestration ownership (lease owner + heartbeat)
- **Ephemeral computation state (local-safe):**
  - fetched analysis payloads
  - single-cycle decisions and temporary JSON parsing
  - loop-local timing variables

## Externalization design implemented

- Added `DaemonSymbolState` for per-daemon/per-user/per-symbol runtime authority.
- Added `OrchestrationLease` for multi-worker execution ownership.
- Added `lib/daemon-runtime-authority.ts`:
  - `acquireOrchestrationLease`
  - `heartbeatOrchestrationLease`
  - `getDaemonSymbolRuntime`
  - `updateDaemonSymbolRuntime`

## Multi-worker coordination model

- Ownership model: worker must acquire lease before orchestration cycle.
- Heartbeat model: owner refreshes lease expiry each cycle.
- Collision behavior: non-owner skips execution and logs takeover denial.
- Stale owner behavior: expired lease can be claimed by another worker.

## Persistent streak/risk model

- `background-engine` now reads/writes signal streak (`streakAction`, `streakCount`, `streakUpdatedAt`) from `DaemonSymbolState`.
- Opportunity cooldown and risk windows use persisted `lastExecutionAt`, `tradeCountWindow`, `totalLossWindow`.
- Open lifecycle memory uses persisted `positionStatus`, `openSessionId`, `openQuantity`, `openEntryPrice`, `openEntryCost`, `lastEntryAt`.
- `auto-trader-daemon` now computes exposure/open-count/loss limits from persisted symbol states, not process-local maps.

## Startup + daemon integration

- Daemons continue to enforce startup gate from `StartupRecoveryState` (`SAFE_TO_RESUME` required).
- After gate pass, orchestration context is restored from `DaemonSymbolState`, never invented from empty local memory.

## Durable orchestration logs

- Logging tags in active use:
  - `[daemon-heartbeat]`
  - `[orchestration-lease]`
  - `[worker-takeover]`
  - `[signal-streak]`
  - `[risk-window]`
  - `[execution-authority]`

## Remaining local-state risks

- `scripts/auto-trader-1hr.ts` and `scripts/emergency-shutdown.ts` still contain local state fields affecting behavior.
- If these scripts are run in production, they can reintroduce split-brain runtime truth.
- Recommended next hardening: migrate these scripts to `DaemonSymbolState` + `OrchestrationLease` or retire them.

## PM2/distributed deployment notes

1. Apply migration adding `DaemonSymbolState` and `OrchestrationLease`.
2. Ensure startup recovery runs before daemon scheduling.
3. Start daemon workers; each worker must acquire lease before cycle.
4. Allow PM2 cluster safely: only lease owner executes; others idle and heartbeat denied.
5. Monitor logs for lease churn and stale-worker takeovers.
