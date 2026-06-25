
CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION app_private.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false)
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_active_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_active_user(uuid) TO authenticated, service_role;

-- Drop public policies that reference public.has_role
DROP POLICY IF EXISTS "Admins manage issue types" ON public.issue_types;
DROP POLICY IF EXISTS "Notifications insert: self or staff" ON public.notifications;
DROP POLICY IF EXISTS "Profiles: admin delete" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: admin insert" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: own read" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: own update" ON public.profiles;
DROP POLICY IF EXISTS "Admins full access to refunds" ON public.refund_requests;
DROP POLICY IF EXISTS "Refunds decided by agents/admins" ON public.refund_requests;
DROP POLICY IF EXISTS "Refunds insert by ticket owner" ON public.refund_requests;
DROP POLICY IF EXISTS "Refunds visible to ticket parties" ON public.refund_requests;
DROP POLICY IF EXISTS "Attachments insert by ticket parties" ON public.ticket_attachments;
DROP POLICY IF EXISTS "Attachments visible to ticket parties" ON public.ticket_attachments;
DROP POLICY IF EXISTS "Admins manage categories" ON public.ticket_categories;
DROP POLICY IF EXISTS "Comments insert by ticket parties" ON public.ticket_comments;
DROP POLICY IF EXISTS "Comments select: parties + agents/admins; internal hidden from " ON public.ticket_comments;
DROP POLICY IF EXISTS "History inserts by parties" ON public.ticket_history;
DROP POLICY IF EXISTS "History visible to ticket parties" ON public.ticket_history;
DROP POLICY IF EXISTS "Admins delete tickets" ON public.tickets;
DROP POLICY IF EXISTS "Customer updates own; agents/admins update assigned" ON public.tickets;
DROP POLICY IF EXISTS "Customers create own tickets" ON public.tickets;
DROP POLICY IF EXISTS "Customers view own tickets" ON public.tickets;
DROP POLICY IF EXISTS "Roles: admin manage" ON public.user_roles;
DROP POLICY IF EXISTS "Roles: read own + admin" ON public.user_roles;

-- Storage policies that depend on public.has_role
DROP POLICY IF EXISTS "Ticket attachments read for parties" ON storage.objects;
DROP POLICY IF EXISTS "Ticket attachments upload for parties" ON storage.objects;
DROP POLICY IF EXISTS "Ticket attachments delete for owner or admin" ON storage.objects;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- Recreate public policies
CREATE POLICY "Admins manage issue types" ON public.issue_types FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (app_private.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage categories" ON public.ticket_categories FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (app_private.has_role(auth.uid(),'admin'));

CREATE POLICY "Profiles: own read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles: own update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles: admin insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles: admin delete" ON public.profiles FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'));

CREATE POLICY "Roles: read own + admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Roles: admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (app_private.has_role(auth.uid(),'admin'));

CREATE POLICY "Customers view own tickets" ON public.tickets FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR assigned_agent_id = auth.uid()
         OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Customers create own tickets" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND app_private.is_active_user(auth.uid()));
CREATE POLICY "Admins delete tickets" ON public.tickets FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff update tickets" ON public.tickets FOR UPDATE TO authenticated
  USING (assigned_agent_id = auth.uid()
         OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (assigned_agent_id = auth.uid()
         OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Customers update own tickets (limited fields)" ON public.tickets FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_ticket_field_perms()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_staff boolean;
BEGIN
  is_staff := app_private.has_role(auth.uid(),'agent')
           OR app_private.has_role(auth.uid(),'admin')
           OR NEW.assigned_agent_id = auth.uid()
           OR OLD.assigned_agent_id = auth.uid();
  IF NOT is_staff THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
       OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.issue_type_id IS DISTINCT FROM OLD.issue_type_id THEN
      RAISE EXCEPTION 'Customers cannot modify status, priority, assignment, resolution notes, or category on a ticket';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_ticket_field_perms ON public.tickets;
CREATE TRIGGER enforce_ticket_field_perms BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_field_perms();

CREATE POLICY "Comments insert by ticket parties" ON public.ticket_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND app_private.is_active_user(auth.uid())
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
                AND (t.customer_id = auth.uid() OR t.assigned_agent_id = auth.uid()
                     OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin')))
  );
CREATE POLICY "Comments select: parties + agents/admins; internal hidden from customer" ON public.ticket_comments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
            AND (((t.customer_id = auth.uid()) AND (ticket_comments.is_internal = false))
                 OR t.assigned_agent_id = auth.uid()
                 OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin')))
  );

CREATE POLICY "Attachments insert by ticket parties" ON public.ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND app_private.is_active_user(auth.uid())
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
                AND (t.customer_id = auth.uid() OR t.assigned_agent_id = auth.uid()
                     OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin')))
  );
CREATE POLICY "Attachments visible to ticket parties" ON public.ticket_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
            AND (t.customer_id = auth.uid() OR t.assigned_agent_id = auth.uid()
                 OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin')))
  );

CREATE POLICY "History visible to ticket parties" ON public.ticket_history FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
            AND (t.customer_id = auth.uid() OR t.assigned_agent_id = auth.uid()
                 OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin')))
  );
REVOKE INSERT, UPDATE, DELETE ON public.ticket_history FROM authenticated, anon;

CREATE POLICY "Notifications insert: self or staff for ticket parties" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (
      (app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'))
      AND ticket_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_id
          AND (t.customer_id = notifications.user_id OR t.assigned_agent_id = notifications.user_id)
      )
    )
  );

CREATE POLICY "Refunds visible to ticket parties" ON public.refund_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid()
         OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Refunds insert by ticket owner" ON public.refund_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND app_private.is_active_user(auth.uid())
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.customer_id = auth.uid())
  );
CREATE POLICY "Refunds decided by agents/admins" ON public.refund_requests FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins full access to refunds" ON public.refund_requests FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin'))
  WITH CHECK (app_private.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.enforce_refund_field_perms()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_private.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  IF app_private.has_role(auth.uid(),'agent') THEN
    IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.num_tickets IS DISTINCT FROM OLD.num_tickets
       OR NEW.ticket_price IS DISTINCT FROM OLD.ticket_price
       OR NEW.total_paid IS DISTINCT FROM OLD.total_paid
       OR NEW.charge_per_ticket IS DISTINCT FROM OLD.charge_per_ticket
       OR NEW.charge_amount IS DISTINCT FROM OLD.charge_amount
       OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount
       OR NEW.refund_method IS DISTINCT FROM OLD.refund_method
       OR NEW.account_holder IS DISTINCT FROM OLD.account_holder
       OR NEW.account_number IS DISTINCT FROM OLD.account_number
       OR NEW.ifsc_code IS DISTINCT FROM OLD.ifsc_code
       OR NEW.upi_id IS DISTINCT FROM OLD.upi_id
       OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
       OR NEW.reason IS DISTINCT FROM OLD.reason THEN
      RAISE EXCEPTION 'Agents may only modify decision status, verification, decided_by, decided_at, and decision_notes on a refund request';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_refund_field_perms ON public.refund_requests;
CREATE TRIGGER enforce_refund_field_perms BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_refund_field_perms();

-- Recreate storage policies using app_private.has_role
CREATE POLICY "Ticket attachments read for parties" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = split_part(objects.name, '/', 1)
        AND (t.customer_id = auth.uid() OR t.assigned_agent_id = auth.uid()
             OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'))
    )
  );
CREATE POLICY "Ticket attachments upload for parties" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = split_part(objects.name, '/', 1)
        AND (t.customer_id = auth.uid() OR t.assigned_agent_id = auth.uid()
             OR app_private.has_role(auth.uid(),'agent') OR app_private.has_role(auth.uid(),'admin'))
    )
  );
CREATE POLICY "Ticket attachments delete for owner or admin" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (owner = auth.uid() OR app_private.has_role(auth.uid(),'admin'))
  );

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_ticket_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_ticket_field_perms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_refund_field_perms() FROM PUBLIC, anon, authenticated;
