-- O padrão do projeto concede tudo em tabelas novas. O funil só recebe insert público
-- e leitura de quem está autenticado; a policy restringe a leitura ao admin.

REVOKE ALL ON TABLE public.store_funnel_events FROM anon, authenticated;
GRANT INSERT ON TABLE public.store_funnel_events TO anon, authenticated;
GRANT SELECT ON TABLE public.store_funnel_events TO authenticated;
