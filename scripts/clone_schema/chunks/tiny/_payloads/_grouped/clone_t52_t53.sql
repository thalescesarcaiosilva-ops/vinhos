-- >>> 20260918165917_enable_rls_seed_sql_parts.sql
-- Tabela auxiliar de seed: não deve ser acessível via Data API pública.
alter table public._seed_sql_parts enable row level security;

revoke all on table public._seed_sql_parts from anon, authenticated, public;

-- Sem policies: apenas service_role/postgres (bypassrls) acessam.


-- >>> 20260926160500_add_support_app_role.sql
-- Papel exclusivo do painel de suporte. Não concede acesso ao admin da loja.
-- Novo valor de enum só pode ser usado depois deste comando estar commitado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';


