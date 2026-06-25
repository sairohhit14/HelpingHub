
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.log_ticket_changes() SET search_path = public;
ALTER FUNCTION public.set_ticket_number() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.log_ticket_changes() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.set_ticket_number() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;

-- Replace always-true history insert with party-scoped check
DROP POLICY IF EXISTS "History inserts allowed for parties" ON public.ticket_history;
CREATE POLICY "History inserts by parties" ON public.ticket_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
            AND (t.customer_id = auth.uid()
                 OR t.assigned_agent_id = auth.uid()
                 OR public.has_role(auth.uid(),'agent')
                 OR public.has_role(auth.uid(),'admin')))
  );

-- Replace always-true notification insert: only for self, agents, admins
DROP POLICY IF EXISTS "Notifications: any auth user can insert (server-controlled)" ON public.notifications;
CREATE POLICY "Notifications insert: self or staff" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'agent') OR public.has_role(auth.uid(),'admin'));
