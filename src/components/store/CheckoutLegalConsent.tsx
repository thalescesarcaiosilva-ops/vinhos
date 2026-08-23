import { Link } from "@tanstack/react-router";
import { CHECKOUT_POLICY_LINKS } from "@/lib/policy-links";

/** Links visíveis para políticas — exibir em todas as etapas do checkout. */
export function CheckoutPolicyLinks() {
  return (
    <section
      aria-labelledby="checkout-policies-heading"
      className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
      data-checkout-policies
    >
      <h3 id="checkout-policies-heading" className="sr-only">
        Políticas da loja
      </h3>
      <p className="text-foreground">
        Ao finalizar, você concorda com os{" "}
        {CHECKOUT_POLICY_LINKS.map((link, i) => (
          <span key={link.slug}>
            {i > 0 && (i === CHECKOUT_POLICY_LINKS.length - 1 ? " e " : ", ")}
            <Link
              to="/politicas/$slug"
              params={{ slug: link.slug }}
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </Link>
          </span>
        ))}
        .
      </p>
    </section>
  );
}

type ConsentProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
};

/** Checkbox de concordância — apenas no passo de pagamento. */
export function CheckoutLegalConsent({ checked, onChange, id = "checkout-legal-consent" }: ConsentProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
      <input
        id={id}
        name="legalConsent"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[var(--primary)]"
      />
      <span className="text-xs leading-relaxed">
        Li e concordo com as políticas acima para prosseguir com o pagamento.
      </span>
    </label>
  );
}
