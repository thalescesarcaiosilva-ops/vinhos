-- Volume (ml) e potencial de guarda informados pelo fornecedor/rótulo.
-- shelf_life só deve conter textos explícitos (nunca datas de validade inventadas).
alter table public.products
  add column if not exists volume_ml integer,
  add column if not exists shelf_life text;

comment on column public.products.volume_ml is 'Volume da embalagem em ml (para kits, volume por garrafa).';
comment on column public.products.shelf_life is 'Potencial de guarda informado explicitamente. Não representa data de validade.';
