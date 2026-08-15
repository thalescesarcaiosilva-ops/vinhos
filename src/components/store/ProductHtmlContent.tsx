import { sanitizeProductHtml, normalizeProductDescription, formatProductDescription, isRichProductHtml } from "@/lib/html-content";
import { cn } from "@/lib/utils";

type Props = {
  html: string | null | undefined;
  className?: string;
};

/** Renderiza descrições HTML do catálogo (Magazord/Vinoteca) com formatação legível. */
export function ProductHtmlContent({ html, className }: Props) {
  if (!html?.trim()) return null;

  const normalized = normalizeProductDescription(html);

  if (!isRichProductHtml(normalized)) {
    const text = formatProductDescription(html);
    if (!text) return null;
    return (
      <div className={cn("text-sm leading-relaxed text-foreground/80 whitespace-pre-line", className)}>
        {text.split(/\n{2,}/).map((block, i) => (
          <p key={i} className={i > 0 ? "mt-4" : undefined}>{block}</p>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "product-html text-sm leading-relaxed text-foreground/80",
        "[&_p]:mb-4 [&_p:last-child]:mb-0",
        "[&_h2]:mb-3 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-primary",
        "[&_h3]:mb-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-widest [&_h3]:text-muted-foreground",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&_table]:mx-auto [&_table]:w-full [&_table]:max-w-lg [&_table]:border-collapse [&_table]:text-left",
        "[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:text-muted-foreground",
        "[&_td]:border-b [&_td]:border-border/60 [&_td]:py-2 [&_td]:text-sm",
        "[&_address]:mt-4 [&_address]:text-xs [&_address]:not-italic [&_address]:text-muted-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(normalized) }}
    />
  );
}
