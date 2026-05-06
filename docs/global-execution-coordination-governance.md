# Global Execution Coordination + Engine Governance

## Execution-authority hierarchy

1. `EngineGovernanceState` (global final authority)
2. Startup safety gate (`StartupRecoveryState`)
3. Worker lease ownership (`OrchestrationLease`)
4. Route/daemon execution locks (`ExecutionLock`)
5. Session/symbol runtime state (`ExecutionState`, `PositionState`, `DaemonSymbolState`)
6. Strategy signal producers (advisory only, non-authoritative)

## Governance architecture

- New global governor service: `lib/global-execution-governor.ts`
- Durable state:
  - `EngineGovernanceState` (mode, health, global limits)
  - `GovernanceApprovalLog` (every approve/deny decision with snapshot)
- Control/visibility APIs:
  - `GET /api/expert/governance/status`
  - `POST /api/expert/governance/control`

## Exposure-control model

- Portfolio exposure computed from `DaemonSymbolState` open entry cost.
- Symbol concentration exposure computed per symbol from same authority.
- Active session pressure from `TradeSession` in non-terminal statuses.
- Concurrent liquidation pressure from `ExecutionState`.
- Daily realized PnL guard from `RiskState`.
- Buy approvals are blocked if projected exposure exceeds configured caps.

## Execution approval workflow

Before execution, worker/route calls `requestGovernanceApproval` with:
- `workerId`, `lane`, `userId`, `symbol`, `action`, optional projected quote.

Response statuses:
- `APPROVED`
- `DENIED`
- `PAUSED`
- `RISK_LIMIT_BLOCKED`
- `RECOVERY_BLOCKED`
- `GOVERNANCE_LOCKED`

Enforced in:
- `app/api/expert/execute/nex/route.ts`
- `app/api/expert/execute/manual/route.ts`
- `app/api/trade/execute/route.ts`
- `scripts/background-engine.ts`
- `scripts/auto-trader-daemon.ts`

## Emergency governance states

Governance mode supports:
- `GLOBAL_PAUSE`
- `LIQUIDATION_ONLY`
- `SAFE_MODE`
- `EXECUTION_DISABLED`
- `RECOVERY_ONLY`
- `NORMAL`

Health states support:
- `HEALTHY`, `DEGRADED`, `RECOVERY_MODE`, `HIGH_RISK`, `PAUSED`, `GOVERNANCE_LOCKED`, `MANUAL_INTERVENTION_REQUIRED`

## Worker coordination philosophy

- Worker must hold lease to orchestrate.
- Worker must pass governance approval before BUY/SELL.
- Lease ownership is local coordination; governor is global authority.
- Startup gate must be `SAFE_TO_RESUME`, otherwise governance returns `RECOVERY_BLOCKED`.
- Under uncertainty, execution is blocked.

## Remaining governance blind spots

- Correlation model is currently exposure-based and symbol-centric, not factor-model-based.
- Legacy scripts not wired into governance approval can still bypass if run manually.
- Governance updates are API-driven; no separate multi-party approval workflow yet.

## PM2/distributed scaling notes

1. Apply DB migration for governance tables.
2. Ensure startup recovery sets gate before workers begin.
3. Run workers under leases; governance remains central approval authority.
4. Monitor `GovernanceApprovalLog` for denial spikes and mode transitions.
5. Use `GLOBAL_PAUSE`/`EXECUTION_DISABLED` for deterministic fleet-wide halts.
