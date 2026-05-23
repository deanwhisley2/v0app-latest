-- Align fixed-desk persona display returns with 27–30% monthly policy band.

UPDATE public.container_trader_personas
SET monthly_return_pct = 27.0
WHERE id = 'fix_l1_t1' AND monthly_return_pct < 27.0;

UPDATE public.container_trader_personas
SET monthly_return_pct = GREATEST(monthly_return_pct, 27.0)
WHERE kind = 'fix' AND monthly_return_pct < 27.0;
