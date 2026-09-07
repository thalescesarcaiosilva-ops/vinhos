-- Dimensões da arte original de cada banner.
-- Sem elas o <img> do hero não reserva altura e a home sofre CLS de ~0,39
-- quando o banner termina de carregar e empurra o conteúdo abaixo.
alter table public.banners
  add column if not exists width integer,
  add column if not exists height integer;

comment on column public.banners.width is
  'Largura em px da arte original. Usada para reservar a caixa do banner (CLS) e limitar o srcset.';
comment on column public.banners.height is
  'Altura em px da arte original. Usada junto com width para a proporção exata (nunca corta).';
