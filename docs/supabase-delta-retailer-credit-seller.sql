-- -----------------------------------------------------------------------------
-- Designated Level-2 retailer credit sellers (max 5 accounts — enforced in ops policy).
-- Enables UI + bootstrap flag retailer_credit_seller for credit sales to Level 1 users.
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS retailer_credit_seller BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.retailer_credit_seller IS
  'True for up to five Level-2 accounts authorized to sell credits to Level-1 users and run fixed trades. Also overridable via NEXUS_RETAILER_CREDIT_SELLER_IDS / NEXUS_RETAILER_CREDIT_SELLER_EMAILS.';
