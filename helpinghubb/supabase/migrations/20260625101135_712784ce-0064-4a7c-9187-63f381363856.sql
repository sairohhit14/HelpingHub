
-- Seed sample admin + agent users for demo / testing.
-- Safe to re-run: ON CONFLICT DO NOTHING.

DO $$
DECLARE
  admin_id UUID;
  agent_id UUID;
BEGIN
  -- Admin user
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@helpdesk.local';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@helpdesk.local', crypt('Admin@123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"System Admin"}'::jsonb,
      false, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
    VALUES (gen_random_uuid(), admin_id,
            jsonb_build_object('sub', admin_id::text, 'email', 'admin@helpdesk.local', 'email_verified', true),
            'email', admin_id::text, now(), now(), now());
  END IF;

  -- Agent user
  SELECT id INTO agent_id FROM auth.users WHERE email = 'agent@helpdesk.local';
  IF agent_id IS NULL THEN
    agent_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      agent_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'agent@helpdesk.local', crypt('Agent@123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Support Agent"}'::jsonb,
      false, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
    VALUES (gen_random_uuid(), agent_id,
            jsonb_build_object('sub', agent_id::text, 'email', 'agent@helpdesk.local', 'email_verified', true),
            'email', agent_id::text, now(), now(), now());
  END IF;

  -- Ensure profiles exist (handle_new_user trigger usually does this)
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (admin_id, 'System Admin', 'admin@helpdesk.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (agent_id, 'Support Agent', 'agent@helpdesk.local')
  ON CONFLICT (id) DO NOTHING;

  -- Force correct roles, clearing any default 'customer' the trigger may have inserted.
  DELETE FROM public.user_roles WHERE user_id IN (admin_id, agent_id);
  INSERT INTO public.user_roles(user_id, role) VALUES (admin_id, 'admin');
  INSERT INTO public.user_roles(user_id, role) VALUES (agent_id, 'agent');
END $$;
