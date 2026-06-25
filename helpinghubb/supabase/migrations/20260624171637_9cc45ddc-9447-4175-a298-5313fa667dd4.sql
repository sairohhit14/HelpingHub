
-- 1. Issue type default priority
ALTER TABLE public.issue_types
  ADD COLUMN IF NOT EXISTS default_priority public.ticket_priority NOT NULL DEFAULT 'medium';

-- Seed defaults by label (case-insensitive). Admins can still override per ticket.
UPDATE public.issue_types SET default_priority = 'critical' WHERE
  label ILIKE '%duplicate payment%'
  OR label ILIKE '%money deducted%'
  OR label ILIKE '%payment deducted%ticket not generated%'
  OR label ILIKE '%refund delay%'
  OR label ILIKE '%flight ticket not generated%';

UPDATE public.issue_types SET default_priority = 'high' WHERE
  label ILIKE '%ticket missing%'
  OR label ILIKE '%wrong seat%'
  OR label ILIKE '%booking fail%'
  OR label ILIKE '%cancellation failure%'
  OR label ILIKE '%multiple tickets but only some%';

UPDATE public.issue_types SET default_priority = 'medium' WHERE
  label ILIKE '%qr code%'
  OR label ILIKE '%pnr%'
  OR label ILIKE '%download%'
  OR label ILIKE '%booking confirmation delay%';

UPDATE public.issue_types SET default_priority = 'low' WHERE
  label ILIKE '%profile%'
  OR label ILIKE '%notification%'
  OR label ILIKE '%login issue%'
  OR label ILIKE '%general%';

-- 2. Escalation columns on tickets
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_status_priority_created
  ON public.tickets (status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON public.tickets (assigned_agent_id);

-- 3. Auto-assign agent on ticket insert
CREATE OR REPLACE FUNCTION public.auto_assign_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked UUID;
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.priority = 'critical' THEN
    -- Prefer admins (senior), then agents; tie-break by least open workload
    SELECT ur.user_id INTO picked
    FROM public.user_roles ur
    LEFT JOIN public.tickets t
      ON t.assigned_agent_id = ur.user_id
     AND t.status NOT IN ('resolved','closed')
    WHERE ur.role IN ('admin','agent')
    GROUP BY ur.user_id, ur.role
    ORDER BY (ur.role = 'admin') DESC, COUNT(t.id) ASC, MIN(ur.user_id::text)
    LIMIT 1;
  ELSE
    -- balanced: least loaded agent (round-robin tie-break by oldest last-assignment)
    SELECT ur.user_id INTO picked
    FROM public.user_roles ur
    LEFT JOIN public.tickets t
      ON t.assigned_agent_id = ur.user_id
     AND t.status NOT IN ('resolved','closed')
    LEFT JOIN public.tickets last_t
      ON last_t.assigned_agent_id = ur.user_id
    WHERE ur.role = 'agent'
    GROUP BY ur.user_id
    ORDER BY COUNT(t.id) ASC, COALESCE(MAX(last_t.created_at), 'epoch'::timestamptz) ASC
    LIMIT 1;
  END IF;

  IF picked IS NOT NULL THEN
    NEW.assigned_agent_id := picked;
    NEW.status := 'assigned';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_assign_agent ON public.tickets;
CREATE TRIGGER trg_auto_assign_agent
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_agent();

-- 4. SLA escalation
CREATE OR REPLACE FUNCTION public.check_sla_escalations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  reason TEXT;
  admin_ids UUID[];
  n INT := 0;
BEGIN
  SELECT ARRAY_AGG(user_id) INTO admin_ids FROM public.user_roles WHERE role = 'admin';

  FOR rec IN
    SELECT * FROM public.tickets
    WHERE status NOT IN ('resolved','closed')
      AND escalation_level = 0
  LOOP
    reason := NULL;
    IF rec.priority = 'critical' THEN
      IF rec.assigned_agent_id IS NULL AND rec.created_at < now() - INTERVAL '30 minutes' THEN
        reason := 'Critical ticket unassigned > 30 minutes';
      ELSIF rec.created_at < now() - INTERVAL '2 hours' THEN
        reason := 'Critical ticket unresolved > 2 hours';
      END IF;
    ELSIF rec.priority = 'high' AND rec.created_at < now() - INTERVAL '4 hours' THEN
      reason := 'High priority ticket unresolved > 4 hours';
    ELSIF rec.priority = 'medium' AND rec.created_at < now() - INTERVAL '24 hours' THEN
      reason := 'Medium priority ticket unresolved > 24 hours';
    ELSIF rec.priority = 'low' AND rec.created_at < now() - INTERVAL '48 hours' THEN
      reason := 'Low priority ticket unresolved > 48 hours';
    END IF;

    IF reason IS NOT NULL THEN
      UPDATE public.tickets
        SET escalation_level = 1,
            escalated_at = now(),
            escalated_reason = reason
        WHERE id = rec.id;

      -- Notify assigned agent + all admins
      INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
      SELECT DISTINCT uid, 'ticket_escalated',
             'SLA breach: ' || rec.ticket_number, reason, rec.id
      FROM unnest(
        COALESCE(admin_ids, ARRAY[]::UUID[])
        || CASE WHEN rec.assigned_agent_id IS NOT NULL THEN ARRAY[rec.assigned_agent_id] ELSE ARRAY[]::UUID[] END
      ) AS uid
      WHERE uid IS NOT NULL;

      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_sla_escalations() FROM PUBLIC, anon, authenticated;

-- Schedule via pg_cron (every 5 minutes)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('check-sla-escalations');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'check-sla-escalations',
  '*/5 * * * *',
  $cron$ SELECT public.check_sla_escalations(); $cron$
);
