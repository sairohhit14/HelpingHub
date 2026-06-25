
-- Agent tier
DO $$ BEGIN
  CREATE TYPE public.agent_tier AS ENUM ('junior','experienced','senior');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS agent_tier public.agent_tier;

-- Default existing agents to experienced, admins to senior
UPDATE public.user_roles SET agent_tier = 'experienced' WHERE role='agent' AND agent_tier IS NULL;
UPDATE public.user_roles SET agent_tier = 'senior' WHERE role='admin' AND agent_tier IS NULL;

-- New ticket columns
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);

-- ticket_assignments audit
CREATE TABLE IF NOT EXISTS public.ticket_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES auth.users(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  reason TEXT
);
GRANT SELECT ON public.ticket_assignments TO authenticated;
GRANT ALL ON public.ticket_assignments TO service_role;
ALTER TABLE public.ticket_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read assignments" ON public.ticket_assignments;
CREATE POLICY "Staff read assignments" ON public.ticket_assignments
  FOR SELECT TO authenticated
  USING (
    app_private.has_role(auth.uid(),'admin')
    OR app_private.has_role(auth.uid(),'agent')
    OR agent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.customer_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_ticket ON public.ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_agent ON public.ticket_assignments(agent_id);

-- Tier-aware auto-assign
CREATE OR REPLACE FUNCTION public.auto_assign_agent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE picked UUID;
        wanted_tiers public.agent_tier[];
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.priority = 'critical' THEN
    wanted_tiers := ARRAY['senior']::public.agent_tier[];
  ELSIF NEW.priority = 'high' THEN
    wanted_tiers := ARRAY['senior','experienced']::public.agent_tier[];
  ELSIF NEW.priority = 'medium' THEN
    wanted_tiers := ARRAY['senior','experienced','junior']::public.agent_tier[];
  ELSE
    wanted_tiers := ARRAY['junior','experienced','senior']::public.agent_tier[];
  END IF;

  -- pick least-loaded matching staff in the requested tiers
  SELECT ur.user_id INTO picked
  FROM public.user_roles ur
  LEFT JOIN public.tickets t
    ON t.assigned_agent_id = ur.user_id AND t.status NOT IN ('resolved','closed')
  WHERE ur.role IN ('admin','agent')
    AND (ur.agent_tier IS NULL OR ur.agent_tier = ANY(wanted_tiers))
  GROUP BY ur.user_id
  ORDER BY COUNT(t.id) ASC, MIN(ur.user_id::text)
  LIMIT 1;

  -- fallback: any staff
  IF picked IS NULL THEN
    SELECT ur.user_id INTO picked
    FROM public.user_roles ur
    LEFT JOIN public.tickets t
      ON t.assigned_agent_id = ur.user_id AND t.status NOT IN ('resolved','closed')
    WHERE ur.role IN ('admin','agent')
    GROUP BY ur.user_id
    ORDER BY COUNT(t.id) ASC LIMIT 1;
  END IF;

  IF picked IS NOT NULL THEN
    NEW.assigned_agent_id := picked;
    NEW.status := 'assigned';
    NEW.assigned_at := now();
  END IF;
  RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.auto_assign_agent() FROM PUBLIC;

-- Enhanced ticket change logger: capture assignment audit + resolved_by
CREATE OR REPLACE FUNCTION public.log_ticket_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_history(ticket_id, actor_id, action, to_value)
    VALUES (NEW.id, NEW.customer_id, 'created', NEW.status::TEXT);
    IF NEW.assigned_agent_id IS NOT NULL THEN
      INSERT INTO public.ticket_assignments(ticket_id, agent_id, assigned_by)
      VALUES (NEW.id, NEW.assigned_agent_id, COALESCE(auth.uid(), NEW.customer_id));
      -- notify customer that someone is on it
      INSERT INTO public.notifications(user_id, type, title, body, ticket_id)
      VALUES (NEW.customer_id, 'ticket_assigned',
              'Your ticket ' || NEW.ticket_number || ' is under investigation',
              'A support agent has been assigned and will be in touch shortly.', NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.ticket_history(ticket_id, actor_id, action, from_value, to_value)
      VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status::TEXT, NEW.status::TEXT);
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.ticket_history(ticket_id, actor_id, action, from_value, to_value)
      VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority::TEXT, NEW.priority::TEXT);
    END IF;
    IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      INSERT INTO public.ticket_history(ticket_id, actor_id, action, from_value, to_value)
      VALUES (NEW.id, auth.uid(), 'assigned',
              COALESCE(OLD.assigned_agent_id::TEXT,''), COALESCE(NEW.assigned_agent_id::TEXT,''));
      -- close prior assignment row, open new
      UPDATE public.ticket_assignments
        SET unassigned_at = now()
        WHERE ticket_id = NEW.id AND unassigned_at IS NULL;
      IF NEW.assigned_agent_id IS NOT NULL THEN
        INSERT INTO public.ticket_assignments(ticket_id, agent_id, assigned_by)
        VALUES (NEW.id, NEW.assigned_agent_id, auth.uid());
        NEW.assigned_at := now();
        -- notify customer of (re)assignment
        INSERT INTO public.notifications(user_id, type, title, body, ticket_id)
        VALUES (NEW.customer_id, 'ticket_assigned',
                'Your ticket ' || NEW.ticket_number || ' is under investigation',
                'A support agent has been assigned and will be in touch shortly.', NEW.id);
      END IF;
    END IF;
    IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
      NEW.resolved_at := now();
      NEW.resolved_by := auth.uid();
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

-- Tighten field perms: only admin OR the assigned agent can manage ticket state.
-- Customer may transition resolved → closed on their own ticket.
CREATE OR REPLACE FUNCTION public.enforce_ticket_field_perms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  is_admin boolean := app_private.has_role(auth.uid(),'admin');
  is_owner_agent boolean := (OLD.assigned_agent_id = auth.uid());
  is_customer boolean := (OLD.customer_id = auth.uid());
BEGIN
  IF is_admin THEN RETURN NEW; END IF;

  -- Customer: may confirm resolution by closing their own resolved ticket; nothing else.
  IF is_customer AND NOT is_owner_agent THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND OLD.status = 'resolved' AND NEW.status = 'closed'
       AND NEW.priority = OLD.priority
       AND NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id
       AND NEW.resolution_notes IS NOT DISTINCT FROM OLD.resolution_notes
       AND NEW.customer_id = OLD.customer_id
       AND NEW.ticket_number = OLD.ticket_number THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
       OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN
      RAISE EXCEPTION 'Customers may only confirm resolution by closing a resolved ticket';
    END IF;
    RETURN NEW;
  END IF;

  -- Agent: must be the assigned owner. Cannot reassign or change priority.
  IF NOT is_owner_agent THEN
    RAISE EXCEPTION 'Only the assigned agent or an admin can modify this ticket';
  END IF;
  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    RAISE EXCEPTION 'Only admins can reassign tickets';
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    RAISE EXCEPTION 'Only admins can change ticket priority';
  END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN
    RAISE EXCEPTION 'Immutable fields cannot change';
  END IF;
  RETURN NEW;
END $fn$;
