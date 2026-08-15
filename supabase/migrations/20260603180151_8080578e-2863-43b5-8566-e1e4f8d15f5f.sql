-- Legacy Lovable admin UUID; skip on fresh Supabase (admin is created in 20260611143701).
INSERT INTO public.user_roles (user_id, role)
SELECT 'c9ea104e-b169-4084-873f-52407ddd51ae', 'admin'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = 'c9ea104e-b169-4084-873f-52407ddd51ae'
)
ON CONFLICT (user_id, role) DO NOTHING;
