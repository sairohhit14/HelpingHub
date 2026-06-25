
DO $$ BEGIN
  CREATE TYPE public.refund_method AS ENUM ('bank_account','upi','transaction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS num_tickets INT,
  ADD COLUMN IF NOT EXISTS ticket_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS charge_per_ticket NUMERIC(12,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_method public.refund_method,
  ADD COLUMN IF NOT EXISTS account_holder TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Admins full access to refunds" ON public.refund_requests;
CREATE POLICY "Admins full access to refunds" ON public.refund_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
