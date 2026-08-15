
UPDATE public.order_status_history SET created_by = NULL WHERE created_by IS NOT NULL;
DELETE FROM auth.users;

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated', 'authenticated',
    'admin@vinellevinhos.com.br',
    crypt('Vinelle@Admin2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Admin","last_name":"Vinelle"}'::jsonb,
    false, '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'admin@vinellevinhos.com.br', 'email_verified', true),
    'email', new_user_id::text, now(), now(), now());

  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'admin');
END $$;
