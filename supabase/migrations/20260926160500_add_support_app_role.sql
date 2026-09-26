-- Papel exclusivo do painel de suporte. Não concede acesso ao admin da loja.
-- Novo valor de enum só pode ser usado depois deste comando estar commitado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';
