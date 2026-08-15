/** Faixa promocional de desconto Pix — só exibir quando o % estiver ativo. */
export function PixDiscountBanner({ percent }: { percent: number }) {
  if (!percent || percent <= 0) return null;

  const label = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(".", ",");

  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-sm border border-[#b8d0ef] bg-[#e8f1fb] py-2.5 pl-3 pr-3"
      style={{ borderLeftWidth: 4, borderLeftColor: "#1e4f9c" }}
      role="status"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1e4f9c] text-sm font-bold leading-none text-white">
        {label}%
      </span>
      <div className="min-w-0 text-[#1a3a6b]">
        <div className="text-sm font-bold leading-tight">Pagando no Pix</div>
        <div className="text-xs leading-snug opacity-90">
          {label}% de desconto pagando com Pix
        </div>
      </div>
    </div>
  );
}
