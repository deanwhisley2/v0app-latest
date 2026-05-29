-- Fix mistaken new-member welcome bonus grants to pre-existing accounts.
-- Only profiles created on/after eligible_after may receive startup_bonus_received_at.

BEGIN;

alter table public.profiles
  add column if not exists startup_bonus_received_at timestamptz null;

comment on column public.profiles.startup_bonus_received_at is
  'Set once when automatic new-member welcome bonus ($5.30 USD equiv) is credited to Nexus Main. Distinct from referral milestone startup_capital_granted_at.';

-- Cutoff = deploy of new-member campaign (5900e55). Only registrations after this qualify.
UPDATE public.platform_launch_windows
SET
  programs = coalesce(programs, '{}'::jsonb)
    || jsonb_build_object(
      'new_member_welcome',
      coalesce(programs->'new_member_welcome', '{}'::jsonb)
        || jsonb_build_object(
          'enabled', true,
          'usd_reward', 5.3,
          'promo_banner', true,
          'promo_modal', true,
          'eligible_after', '2026-05-29T00:42:00.000Z'
        )
    ),
  updated_at = now()
WHERE slug = 'global-referral-2026';

-- Reverse mistaken welcome bonuses for accounts registered before eligible_after.
DO $$
DECLARE
  v_actor uuid := '00000000-0000-4000-8000-000000000001';
  v_cutoff timestamptz := '2026-05-29T00:42:00+00';
  v_bonus numeric(20,2) := 5.30;
  r record;
  v_reversal_ref text;
  v_bal numeric(20,2);
  v_debit numeric(20,2);
  v_treasury_result jsonb;
BEGIN
  FOR r IN
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE p.created_at < v_cutoff
      AND (
        p.startup_bonus_received_at IS NOT NULL
        OR p.startup_capital_locked_usd > 0
        OR p.startup_capital_granted_at IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.unified_ledger ul
          WHERE ul.reference_id = 'startup_capital:' || p.id::text
            AND ul.operation = 'DEBIT'
            AND ul.entity_type = 'TREASURY'
        )
      )
  LOOP
    v_reversal_ref := 'new_member_welcome_reversal:' || r.user_id::text;

    IF EXISTS (
      SELECT 1 FROM public.unified_ledger ul WHERE ul.reference_id = v_reversal_ref
    ) THEN
      UPDATE public.profiles
      SET
        startup_bonus_received_at = NULL,
        startup_capital_granted_at = NULL,
        startup_capital_locked_usd = 0,
        updated_at = now()
      WHERE id = r.user_id;
      CONTINUE;
    END IF;

    SELECT coalesce(ub.available_balance, 0)
    INTO v_bal
    FROM public.user_balances ub
    WHERE ub.user_id = r.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_bal := 0;
    END IF;

    v_debit := LEAST(coalesce(v_bal, 0), v_bonus);

    IF v_debit > 0 THEN
      UPDATE public.user_balances
      SET
        available_balance = round((coalesce(available_balance, 0) - v_debit)::numeric, 2),
        last_updated = now()
      WHERE user_id = r.user_id;

      v_treasury_result := public.update_treasury_usd(
        'CREDIT',
        v_debit,
        'MAIN_TREASURY',
        gen_random_uuid(),
        v_reversal_ref,
        'Reversal: mistaken new-member welcome bonus on pre-existing account',
        v_actor
      );

      IF coalesce((v_treasury_result->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Treasury reversal failed for user %: %', r.user_id, v_treasury_result;
      END IF;
    END IF;

    UPDATE public.profiles
    SET
      startup_bonus_received_at = NULL,
      startup_capital_granted_at = NULL,
      startup_capital_locked_usd = 0,
      updated_at = now()
    WHERE id = r.user_id;
  END LOOP;
END $$;

COMMIT;
