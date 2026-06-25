
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('customer', 'agent', 'admin');
CREATE TYPE public.ticket_status AS ENUM ('open','assigned','in_progress','pending_customer','resolved','closed');
CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high','critical');
CREATE TYPE public.refund_status AS ENUM ('pending','approved','rejected');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  mobile TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ CATEGORIES & ISSUE TYPES ============
CREATE TABLE public.ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.ticket_categories TO authenticated, anon;
GRANT ALL ON public.ticket_categories TO service_role;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories readable by everyone" ON public.ticket_categories FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage categories" ON public.ticket_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.issue_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.issue_types TO authenticated, anon;
GRANT ALL ON public.issue_types TO service_role;
ALTER TABLE public.issue_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Issue types readable by everyone" ON public.issue_types FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage issue types" ON public.issue_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ TICKETS ============
CREATE SEQUENCE public.ticket_number_seq START 1000;

CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.ticket_categories(id),
  issue_type_id UUID REFERENCES public.issue_types(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  booking_reference TEXT,
  pnr_number TEXT,
  transaction_id TEXT,
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'open',
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tickets_customer ON public.tickets(customer_id);
CREATE INDEX idx_tickets_agent ON public.tickets(assigned_agent_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);

-- Auto ticket number
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || LPAD(nextval('public.ticket_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_set_ticket_number BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

-- Updated_at trigger generic
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_tickets_touch BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Ticket RLS
CREATE POLICY "Customers view own tickets" ON public.tickets FOR SELECT TO authenticated
  USING (customer_id = auth.uid()
         OR assigned_agent_id = auth.uid()
         OR public.has_role(auth.uid(),'agent')
         OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customers create own tickets" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Customer updates own; agents/admins update assigned" ON public.tickets FOR UPDATE TO authenticated
  USING (customer_id = auth.uid()
         OR assigned_agent_id = auth.uid()
         OR public.has_role(auth.uid(),'agent')
         OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (customer_id = auth.uid()
         OR assigned_agent_id = auth.uid()
         OR public.has_role(auth.uid(),'agent')
         OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete tickets" ON public.tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ COMMENTS ============
CREATE TABLE public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments TO authenticated;
GRANT ALL ON public.ticket_comments TO service_role;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_comments_ticket ON public.ticket_comments(ticket_id);

CREATE POLICY "Comments select: parties + agents/admins; internal hidden from customer"
  ON public.ticket_comments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
            AND (
              (t.customer_id = auth.uid() AND is_internal = FALSE)
              OR t.assigned_agent_id = auth.uid()
              OR public.has_role(auth.uid(),'agent')
              OR public.has_role(auth.uid(),'admin')
            ))
  );
CREATE POLICY "Comments insert by ticket parties"
  ON public.ticket_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
            AND (t.customer_id = auth.uid()
                 OR t.assigned_agent_id = auth.uid()
                 OR public.has_role(auth.uid(),'agent')
                 OR public.has_role(auth.uid(),'admin')))
  );

-- ============ ATTACHMENTS ============
CREATE TABLE public.ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_attachments TO authenticated;
GRANT ALL ON public.ticket_attachments TO service_role;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Attachments visible to ticket parties" ON public.ticket_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
                 AND (t.customer_id = auth.uid()
                      OR t.assigned_agent_id = auth.uid()
                      OR public.has_role(auth.uid(),'agent')
                      OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "Attachments insert by ticket parties" ON public.ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (uploader_id = auth.uid()
              AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
                          AND (t.customer_id = auth.uid()
                               OR t.assigned_agent_id = auth.uid()
                               OR public.has_role(auth.uid(),'agent')
                               OR public.has_role(auth.uid(),'admin'))));

-- ============ HISTORY (audit) ============
CREATE TABLE public.ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_history TO authenticated;
GRANT ALL ON public.ticket_history TO service_role;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "History visible to ticket parties" ON public.ticket_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
                 AND (t.customer_id = auth.uid()
                      OR t.assigned_agent_id = auth.uid()
                      OR public.has_role(auth.uid(),'agent')
                      OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "History inserts allowed for parties" ON public.ticket_history FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- Ticket change tracker
CREATE OR REPLACE FUNCTION public.log_ticket_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_history(ticket_id, actor_id, action, to_value)
    VALUES (NEW.id, NEW.customer_id, 'created', NEW.status::TEXT);
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
    END IF;
    IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ticket_history AFTER INSERT OR UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_changes();
CREATE TRIGGER trg_ticket_resolve_stamp BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_changes();

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notif_user ON public.notifications(user_id, read_at);
CREATE POLICY "Notifications: read own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Notifications: update own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Notifications: any auth user can insert (server-controlled)" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- ============ REFUND REQUESTS ============
CREATE TABLE public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  status public.refund_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_requests TO authenticated;
GRANT ALL ON public.refund_requests TO service_role;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Refunds visible to ticket parties" ON public.refund_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid()
         OR public.has_role(auth.uid(),'agent')
         OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Refunds insert by ticket owner" ON public.refund_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "Refunds decided by agents/admins" ON public.refund_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'agent') OR public.has_role(auth.uid(),'admin'));

-- ============ PROFILES RLS ============
CREATE POLICY "Profiles: own read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'agent') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles: own update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles: admin insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Profiles: admin delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ USER ROLES RLS ============
CREATE POLICY "Roles: read own + admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Roles: admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ AUTO PROFILE + DEFAULT ROLE + FIRST USER = ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles(id, full_name, email, mobile)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          NEW.email,
          NEW.raw_user_meta_data->>'mobile');

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'customer');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED CATEGORIES ============
INSERT INTO public.ticket_categories(slug,name,description,sort_order) VALUES
  ('movie','Movie Tickets','Issues related to movie bookings',1),
  ('bus','Bus Tickets','Issues related to bus bookings',2),
  ('train','Train Tickets','Issues related to train bookings',3),
  ('flight','Flight Tickets','Issues related to flight bookings',4),
  ('event','Event Tickets','Issues related to event bookings',5),
  ('payment','Payment','Payment-related issues',6),
  ('refund','Refund','Refund-related issues',7);

-- ============ SEED ISSUE TYPES ============
WITH common(label, ord) AS (VALUES
  ('Payment Deducted but Ticket Not Generated', 1),
  ('Booked Multiple Tickets but Only Some Generated', 2),
  ('Ticket Confirmed but Seat Number Missing', 3),
  ('Wrong Seat Allocation', 4),
  ('Refund Not Received', 5),
  ('Duplicate Payment', 6),
  ('Ticket Not Visible in Booking History', 7),
  ('QR Code Not Generated', 8),
  ('PNR Not Generated', 9),
  ('Ticket Download Error', 10),
  ('Booking Failed but Money Deducted', 11),
  ('Cancellation Failure', 12),
  ('Login Issues', 13),
  ('Booking Confirmation Delay', 14),
  ('Other', 99)
)
INSERT INTO public.issue_types(category_id, label, sort_order)
SELECT c.id, common.label, common.ord
FROM public.ticket_categories c CROSS JOIN common;
