-- Situação "respondido" na fila de suporte, para a equipe marcar o que já atendeu.

ALTER TABLE public.support_order_contacts
  DROP CONSTRAINT IF EXISTS support_order_contacts_outcome_check;

ALTER TABLE public.support_order_contacts
  ADD CONSTRAINT support_order_contacts_outcome_check
  CHECK (outcome IN ('waiting', 'responded', 'recovered', 'lost'));
