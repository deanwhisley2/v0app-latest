BEGIN;

INSERT INTO public.container_trader_personas (
  id, kind, display_name, avatar_initials, win_rate_pct, risk_class, monthly_return_pct,
  speciality, description, strategies, sort_order, fix_band_required, unlock_rule, unlock_params, legacy_ids
)
VALUES
  (
    'cpy_marcus', 'copy', 'Marcus Chen', 'MC', 78.5, 'Low', 12.4,
    'BTC/ETH Long-term',
    'Conservative trader focused on major pairs with strong fundamentals.',
    '["DOW Theory","Supply & Demand","Weekly Structure"]'::jsonb,
    1, 1, 'none', '{}'::jsonb,
    ARRAY['tr_001']::text[]
  ),
  (
    'cpy_sarah', 'copy', 'Sarah Williams', 'SW', 82.1, 'Medium', 18.7,
    'Scalping Expert',
    'High-frequency trader specializing in quick scalps.',
    '["FVG","Liquidity Sweep","8AM Range"]'::jsonb,
    2, 1, 'none', '{}'::jsonb,
    ARRAY['tr_002']::text[]
  ),
  (
    'fix_l1_t1', 'fix', 'Desk Tau — Session', 'DT', 85.0, 'Low', 23.0,
    'Baseline institutional desk',
    'Level 1 structured allocation — unlocked once Nexus Main is funded.',
    '["Baseline corridor","Stable yield stack"]'::jsonb,
    10, 1, 'account_funded', '{}'::jsonb,
    ARRAY[]::text[]
  ),
  (
    'fix_l1_t2', 'fix', 'Desk Upsilon — Growth', 'DU', 82.0, 'Medium', 25.8,
    'Referral-gated desk',
    'Requires fifteen referred accounts.',
    '["Referral-weighted","Growth sleeve"]'::jsonb,
    11, 1, 'referrals_min', '{"min":15}'::jsonb,
    ARRAY[]::text[]
  ),
  (
    'fix_l1_t3', 'fix', 'Desk Phi — Velocity', 'DP', 79.0, 'High', 30.1,
    'High-validation desk',
    'Requires referrals, lifetime funding, and majority valid referees.',
    '["Velocity sleeve","Deep validation"]'::jsonb,
    12, 1, 'referrals_funding_valid',
    '{"min_referrals":20,"min_lifetime_funding_usd":40,"min_valid_ratio":0.5}'::jsonb,
    ARRAY[]::text[]
  ),
  (
    'fix_l2_t4', 'fix', 'Desk Chi — Expansion', 'DC', 81.0, 'Low', 26.0,
    'Level 2 baseline desk',
    'Available once Level 2 fixed band unlocks.',
    '["Expansion corridor"]'::jsonb,
    20, 2, 'none', '{}'::jsonb,
    ARRAY[]::text[]
  ),
  (
    'fix_l2_t5', 'fix', 'Desk Psi — Reinvest', 'DPS', 83.0, 'Medium', 28.0,
    'Withdrawal reinvestment desk',
    'Requires completed payout cycle plus fresh Nexus Main funding.',
    '["Reinvest sleeve"]'::jsonb,
    21, 2, 'withdraw_then_fund', '{}'::jsonb,
    ARRAY[]::text[]
  ),
  (
    'fix_l2_t6', 'fix', 'Desk Omega — Tenure', 'DO', 84.0, 'High', 30.0,
    'Tenure commitment desk',
    'Requires sustained fixing commitment above policy principal.',
    '["Tenure sleeve"]'::jsonb,
    22, 2, 'long_fix_commitment',
    '{"min_principal_usd":100,"min_days_active":30}'::jsonb,
    ARRAY[]::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  monthly_return_pct = EXCLUDED.monthly_return_pct,
  unlock_rule = EXCLUDED.unlock_rule,
  unlock_params = EXCLUDED.unlock_params,
  legacy_ids = EXCLUDED.legacy_ids;

COMMIT;
