import { Link } from "@tanstack/react-router";
import { ChevronRight, PackageX, RotateCcw } from "lucide-react";
import { POLICY_SLUGS } from "@/lib/policy-links";

/**
 * Textos presos à política de devolução publicada (Merchant Center):
 * retorno grátis só em avaria, extravio ou erro; na desistência o frete de volta é do cliente.
 */
const CARDS = [
  {
    icon: PackageX,
    title: "Devolução grátis",
    text: "Se o pedido chegar com avaria ou errado",
  },
  {
    icon: RotateCcw,
    title: "Devolução em até 7 dias",
    text: "Desistiu? Sem taxa, até 7 dias após receber",
  },
] as const;

export function ProductTrustCards() {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card" aria-label="Devolução">
      {CARDS.map(({ icon: Icon, title, text }) => (
        <li key={title}>
          <Link
            to="/politicas/$slug"
            params={{ slug: POLICY_SLUGS.returns }}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{text}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
