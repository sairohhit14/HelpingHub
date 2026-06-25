
-- File path layout: <ticket_id>/<uuid>-<filename>
CREATE POLICY "Ticket attachments read for parties"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id::TEXT = split_part(name, '/', 1)
      AND (t.customer_id = auth.uid()
           OR t.assigned_agent_id = auth.uid()
           OR public.has_role(auth.uid(),'agent')
           OR public.has_role(auth.uid(),'admin'))
  )
);
CREATE POLICY "Ticket attachments upload for parties"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id::TEXT = split_part(name, '/', 1)
      AND (t.customer_id = auth.uid()
           OR t.assigned_agent_id = auth.uid()
           OR public.has_role(auth.uid(),'agent')
           OR public.has_role(auth.uid(),'admin'))
  )
);
CREATE POLICY "Ticket attachments delete for owner or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin'))
);
