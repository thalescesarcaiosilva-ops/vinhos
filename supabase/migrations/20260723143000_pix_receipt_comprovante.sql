-- Comprovante Pix: colunas no pedido + bucket privado
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_receipt_path text,
  ADD COLUMN IF NOT EXISTS pix_receipt_mime text,
  ADD COLUMN IF NOT EXISTS pix_receipt_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pix_receipt_token text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_pix_receipt_token_uidx
  ON public.orders (pix_receipt_token)
  WHERE pix_receipt_token IS NOT NULL;

COMMENT ON COLUMN public.orders.pix_receipt_path IS 'Caminho do comprovante no bucket privado pix-receipts';
COMMENT ON COLUMN public.orders.pix_receipt_token IS 'Token de upload para convidado (checkout Pix)';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pix-receipts',
  'pix-receipts',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- Admin autenticado pode ler objetos do bucket (signed URL ainda é preferível via server).
DROP POLICY IF EXISTS "Admins read pix receipts" ON storage.objects;
CREATE POLICY "Admins read pix receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pix-receipts' AND public.has_role(auth.uid(), 'admin'::public.app_role));
