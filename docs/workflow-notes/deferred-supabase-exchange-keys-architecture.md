# DEFERRED: Supabase exchange keys + coin list architecture

**Status:** Saved for later implementation. **Do not run SQL or insert keys** until Supabase is available and policies are reviewed.

**Source:** User-provided design (archived verbatim in spirit below).

---

## Review (what to fix before / while implementing)

1. **RLS policy `current_user = 'service_role'`** — In Supabase, the **service role client usually bypasses RLS**. RLS policies are evaluated for the **anon/authenticated** role with JWT claims (`auth.uid()`), not as `current_user = 'service_role'`. Replace with either: (a) **no client access** to `exchange_keys` at all (only server routes using service role, table not exposed to PostgREST for anon), or (b) **per-user rows** `user_id uuid` + `auth.uid() = user_id` for SELECT/UPDATE of own keys.

2. **Tenancy** — A single global `exchange_keys` row per exchange fits a **one-tenant / platform-owned** bot. If users each connect their own exchange accounts, you need **`user_id`** (or `profile_id`) on keys and strict RLS — not a single `UNIQUE(exchange)` column.

3. **`coin_list` “anyone can read”** — OK for a public catalog **if** you truly want it world-readable. Writes (`addCoin`, `toggleCoinActive`) must **never** use the anon key from the browser; use **service role** or **admin** role on a **server-only** API route.

4. **Binance depth** — `/api/v3/depth` is **public**; sending `X-MBX-APIKEY` is usually unnecessary and widens exposure. Use keys only where Binance requires signing.

5. **Bitget / Bybit** — Signing and headers are exchange-specific; stubs like `generateBitgetSign` need real implementations and tests.

6. **Secrets in Next.js** — `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ENCRYPTION_KEY` must exist **only** in server env; **never** `NEXT_PUBLIC_*` and never import key-loader from client components.

7. **Encryption fallback** — `if (!ENCRYPTION_KEY) return text` stores **plaintext** in DB in dev; disable upsert or fail closed in staging/production.

8. **Overlap with current repo** — You already have `/api/binance/live-market` (public tickers, no keys) and env-based `BINANCE_API_KEY` / `BINANCE_SECRET_KEY` fallbacks. This design **centralizes** keys/coins in Supabase for multi-instance parity — good direction once RLS and tenancy are nailed.

---

## Original architecture (diagram)

```
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Table: exchange_keys                                    │   │
│  │  ┌────────────┬──────────────┬──────────────────────┐  │   │
│  │  │ exchange   │ encrypted_key │ encrypted_secret    │  │   │
│  │  ├────────────┼──────────────┼──────────────────────┤  │   │
│  │  │ binance    │ [encrypted]   │ [encrypted]         │  │   │
│  │  │ bitget     │ [encrypted]   │ [encrypted]         │  │   │
│  │  │ bybit      │ [encrypted]   │ [encrypted]         │  │   │
│  │  └────────────┴──────────────┴──────────────────────┘  │   │
│  │                                                         │   │
│  │  Table: coin_list                                        │   │
│  │  ┌────────────┬──────────────┬──────────────────────┐  │   │
│  │  │ symbol     │ name         │ is_active           │  │   │
│  │  ├────────────┼──────────────┼──────────────────────┤  │   │
│  │  │ BTCUSDT    │ Bitcoin      │ true                │  │   │
│  │  │ ETHUSDT    │ Ethereum     │ true                │  │   │
│  │  └────────────┴──────────────┴──────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              YOUR PLATFORM (Any instance)               │   │
│  │  - Reads keys from Supabase at startup                  │   │
│  │  - Reads coin list from Supabase                        │   │
│  │  - Never stores keys in memory longer than needed       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Supabase SQL (as provided — revise RLS before running)

```sql
-- Table for encrypted exchange keys
CREATE TABLE IF NOT EXISTS exchange_keys (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50) UNIQUE NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  encrypted_api_secret TEXT NOT NULL,
  encrypted_passphrase TEXT,  -- For Bitget
  is_read_only BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for coin list (central source of truth)
CREATE TABLE IF NOT EXISTS coin_list (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  exchange VARCHAR(50) DEFAULT 'binance',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  min_trade_amount DECIMAL(20, 8),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for system configuration
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default coins
INSERT INTO coin_list (symbol, name, priority) VALUES
  ('BTCUSDT', 'Bitcoin', 100),
  ('ETHUSDT', 'Ethereum', 90),
  ('SOLUSDT', 'Solana', 80),
  ('BNBUSDT', 'Binance Coin', 70),
  ('XRPUSDT', 'Ripple', 60),
  ('DOGEUSDT', 'Dogecoin', 50),
  ('ADAUSDT', 'Cardano', 40),
  ('AVAXUSDT', 'Avalanche', 30),
  ('DOTUSDT', 'Polkadot', 20),
  ('LINKUSDT', 'Chainlink', 10)
ON CONFLICT (symbol) DO NOTHING;

-- Insert default system config
INSERT INTO system_config (key, value, description) VALUES
  ('primary_exchange', 'binance', 'Default exchange for data feed'),
  ('enable_failover', 'true', 'Auto-switch if primary lags'),
  ('data_refresh_seconds', '5', 'How often to refresh market data')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE exchange_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Only service role can access exchange_keys (not client-side)
CREATE POLICY "Service role only" ON exchange_keys
  USING (current_user = 'service_role');

-- Anyone can read coin_list (public data)
CREATE POLICY "Anyone can read coins" ON coin_list
  FOR SELECT USING (true);

-- Anyone can read system_config (public settings)
CREATE POLICY "Anyone can read config" ON system_config
  FOR SELECT USING (true);
```

**Action before production:** Replace the `exchange_keys` policy with a Supabase-correct model (see Review §1). Consider `REVOKE`/`GRANT` so `exchange_keys` is not readable via anon PostgREST at all.

---

## Step 2: Encryption helper (server-only)

**File:** `lib/supabase/encryption.ts`

- Use **AES-256-GCM** with 32-byte key (64 hex chars from `openssl rand -hex 32`).
- **Do not** persist plaintext when `SUPABASE_ENCRYPTION_KEY` is missing in non-local environments.

---

## Step 3: Key loader (service role, server-only)

**File:** `lib/supabase/key-loader.ts`

- `createClient` with `SUPABASE_SERVICE_ROLE_KEY` — **server imports only**.
- In-memory cache + TTL is reasonable; document that **multi-instance** caches diverge until TTL expires (or add explicit invalidation).

---

## Step 4: Coin loader

**File:** `lib/supabase/coin-loader.ts`

- Read with anon + RLS SELECT is fine for public catalog **if** that matches product intent.
- **Admin mutations** (`addCoin`, `toggleCoinActive`) must move to **authenticated admin API** + service role or privileged role, not anon client.

---

## Step 5: Unified data fetcher

**File:** `lib/unified-data-fetcher.ts` (new or extend)

- Depends on `data-quality-engine` (ensure it exists or stub later).
- Authenticated vs public endpoints per exchange — implement carefully.

---

## Step 6: Insert script

**File:** `scripts/insert-exchange-keys.ts`

- Read keys from **env** at runtime; never commit literals.
- Align env names with repo: `BINANCE_API_KEY` + `BINANCE_SECRET_KEY` (or `BINANCE_API_SECRET`) as already used elsewhere.

---

## Step 7: Health endpoint

**File:** `app/api/health/route.ts`

- Avoid echoing sensitive booleans in client-visible responses in production, or keep minimal (`exchangesConfigured: number`).

---

## Summary table (as provided)

| Component | Where | Purpose |
|-----------|--------|---------|
| Supabase tables | SQL in Supabase | Store encrypted keys + coin list |
| Encryption helper | `lib/supabase/encryption.ts` | AES-256-GCM |
| Key loader | `lib/supabase/key-loader.ts` | Fetch + decrypt keys |
| Coin loader | `lib/supabase/coin-loader.ts` | Fetch coin list |
| Insert script | `scripts/insert-exchange-keys.ts` | One-time key injection |
| Health endpoint | `app/api/health/route.ts` | Verify wiring |

---

## Final checklist (when you implement)

1. Run revised SQL in Supabase SQL Editor.  
2. Set `SUPABASE_ENCRYPTION_KEY` (64 hex chars) on the server.  
3. Set `SUPABASE_SERVICE_ROLE_KEY` only on server.  
4. Run insert script once from a trusted machine with env loaded.  
5. Wire server routes to loaders; verify health.  
6. Re-read Review §1–§6 above before go-live.
