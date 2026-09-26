import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, LogIn, LogOut, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { brl } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

const FOLLOW_UP_AFTER_MS = 15 * 60 * 1000;
const REFRESH_MS = 30_000;

const WINDOWS = [
  { id: "24h", label: "Últimas 24 h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 dias", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 dias", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "Todos", ms: null },
] as const;

type WindowId = (typeof WINDOWS)[number]["id"];

type OrderItem = {
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type AbandonedOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: Json;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  payment_method: string | null;
  status: string;
  created_at: string;
  pix_receipt_path: string | null;
  items: OrderItem[];
};

export const Route = createFileRoute("/suporte")({
  head: () =>
    pageMeta({
      title: `Suporte — ${STORE.name}`,
      description: "Fila interna de pedidos sem pagamento ou cancelados.",
      path: "/suporte",
      noindex: true,
    }),
  component: SupportPanel,
});

function SupportPanel() {
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [allowedFor, setAllowedFor] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const apply = (u: { id: string; email?: string } | null) => {
      setUser(u);
      setSessionReady(true);
    };
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      apply(u ? { id: u.id, email: u.email } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      apply(u ? { id: u.id, email: u.email } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        const roles = new Set((data ?? []).map((row) => row.role));
        setAllowed(roles.has("support") || roles.has("admin"));
        setAllowedFor(user.id);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!sessionReady) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!user) return <Login />;
  if (allowedFor !== user.id) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Verificando acesso…</p>;
  }
  if (!allowed) return <Denied email={user.email} />;
  return <Queue email={user.email} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Login realizado");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-sm border border-border bg-card p-8">
        <h1 className="mb-2 font-serif text-2xl font-bold text-primary">Painel de suporte</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Pedidos gerados há mais de 15 minutos, ainda sem pagamento ou já cancelados.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" /> {loading ? "Aguarde..." : "Entrar"}
          </button>
        </form>
        <Link to="/" className="mt-6 block text-center text-xs text-primary hover:underline">
          ← Voltar à loja
        </Link>
      </div>
    </div>
  );
}

function Denied({ email }: { email?: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-serif text-2xl font-bold text-primary">Acesso negado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A conta {email} não tem permissão de suporte.
      </p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-6 inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-sm hover:bg-cream"
      >
        <LogOut className="h-4 w-4" /> Sair
      </button>
    </div>
  );
}

function Queue({ email }: { email?: string }) {
  const [orders, setOrders] = useState<AbandonedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [windowId, setWindowId] = useState<WindowId>("24h");
  const [now, setNow] = useState(() => Date.now());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    const cutoff = new Date(Date.now() - FOLLOW_UP_AFTER_MS).toISOString();
    const windowMs = WINDOWS.find((item) => item.id === windowId)?.ms ?? null;
    let request = supabase
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, shipping_address, total, subtotal, shipping, discount, payment_method, status, created_at, pix_receipt_path",
      )
      .in("status", ["pending", "cancelled"])
      .or("payment_status.is.null,payment_status.not.in.(confirmed,paid,approved)")
      .lte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(300);
    if (windowMs != null) {
      request = request.gte("created_at", new Date(Date.now() - windowMs).toISOString());
    }
    const { data, error: ordersError } = await request;
    if (requestId !== requestSeq.current) return;
    if (ordersError) {
      setError(ordersError.message);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const ids = rows.map((row) => row.id);
    let items: OrderItem[] = [];
    if (ids.length) {
      const { data: itemRows, error: itemsError } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, unit_price, total")
        .in("order_id", ids);
      if (requestId !== requestSeq.current) return;
      if (itemsError) {
        setError(itemsError.message);
        setLoading(false);
        return;
      }
      items = itemRows ?? [];
    }
    const byOrder = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = byOrder.get(item.order_id) ?? [];
      list.push(item);
      byOrder.set(item.order_id, list);
    }
    if (requestId !== requestSeq.current) return;
    setOrders(rows.map((row) => ({ ...row, items: byOrder.get(row.id) ?? [] })));
    setError(null);
    setUpdatedAt(new Date());
    setNow(Date.now());
    setLoading(false);
  }, [windowId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    const digits = q.replace(/\D/g, "");
    return orders.filter((order) => {
      const phone = (order.customer_phone ?? "").replace(/\D/g, "");
      const products = order.items.map((item) => item.product_name).join(" ").toLowerCase();
      return (
        order.customer_name.toLowerCase().includes(q) ||
        order.customer_email.toLowerCase().includes(q) ||
        order.order_number.toLowerCase().includes(q) ||
        products.includes(q) ||
        (digits.length >= 4 && phone.includes(digits))
      );
    });
  }, [orders, query]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary">Pedidos para contato</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pedidos gerados há mais de 15 minutos que ainda não foram pagos, inclusive os
            cancelados. Quando o pagamento é confirmado, o pedido sai desta lista sozinho.
          </p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <LogOut className="h-4 w-4" /> Sair{email ? ` (${email})` : ""}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nome, telefone, e-mail ou pedido"
          className="w-full min-w-[220px] flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1">
          {WINDOWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setWindowId(item.id)}
              className={`rounded-sm border px-3 py-2 text-xs font-medium ${
                windowId === item.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-xs hover:bg-cream"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
        <p className="text-sm text-muted-foreground">
          {filtered.length} pedido{filtered.length === 1 ? "" : "s"}
          {updatedAt ? ` · ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Endereço</th>
              <th className="px-4 py-3">Produtos</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <OrderRow key={order.id} order={order} now={now} />
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum pedido sem pagamento ou cancelado neste período.
                </td>
              </tr>
            )}
            {loading && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderRow({ order, now }: { order: AbandonedOrder; now: number }) {
  const address = formatAddress(order.shipping_address);
  const phoneDigits = toWhatsappDigits(order.customer_phone);
  const message = whatsappMessage(order);
  const created = new Date(order.created_at);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <tr className="border-t border-border align-top hover:bg-cream/30">
      <td className="px-4 py-3">
        <div className="font-mono text-xs font-semibold">#{order.order_number}</div>
        <div className="mt-1 text-xs text-muted-foreground">{created.toLocaleString("pt-BR")}</div>
        <div className="mt-1 text-xs font-medium text-primary">{ageLabel(order.created_at, now)}</div>
        <div className="mt-2 text-xs text-muted-foreground">{paymentLabel(order.payment_method)}</div>
        <span
          className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            order.status === "cancelled" ? "bg-amber-800 text-white" : "bg-accent/20 text-foreground"
          }`}
        >
          {order.status === "cancelled" ? "Cancelado" : "Aguardando pagamento"}
        </span>
        {order.pix_receipt_path && (
          <span className="mt-2 inline-block rounded bg-sky-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Comprovante enviado
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium">{order.customer_name}</div>
        <div className="text-xs text-muted-foreground">{order.customer_email}</div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium">{order.customer_phone || "Sem telefone"}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {phoneDigits && (
            <>
              <a
                href={`tel:+${phoneDigits}`}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-background"
              >
                <Phone className="h-3 w-3" /> Ligar
              </a>
              <a
                href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-sm bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800"
              >
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            </>
          )}
          {order.customer_phone && (
            <button
              type="button"
              onClick={() => copy(order.customer_phone ?? "", "Telefone")}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:bg-background"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs leading-relaxed">
        {address ? (
          <>
            <div>{address.line1}</div>
            <div className="text-muted-foreground">{address.line2}</div>
            {address.zip && <div className="text-muted-foreground">{address.zip}</div>}
          </>
        ) : (
          <span className="text-muted-foreground">Endereço não informado</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        {order.items.length === 0 && <span className="text-muted-foreground">Sem itens</span>}
        <ul className="space-y-1">
          {order.items.map((item, index) => (
            <li key={`${item.product_name}-${index}`}>
              {item.quantity}× {item.product_name}
              <span className="text-muted-foreground"> · {brl(item.total)}</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="px-4 py-3">
        <div className="font-semibold">{brl(order.total)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Produtos {brl(order.subtotal)}
          {Number(order.discount) > 0 ? ` · desc. ${brl(order.discount)}` : ""}
          {` · frete ${brl(order.shipping)}`}
        </div>
        <button
          type="button"
          onClick={() => copy(orderSummary(order, address), "Dados do pedido")}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Copy className="h-3 w-3" /> Copiar dados
        </button>
      </td>
    </tr>
  );
}

function paymentLabel(method: string | null) {
  if (method === "pix") return "Pix";
  if (method === "credit_card" || method === "card") return "Cartão";
  if (method === "boleto") return "Boleto";
  return method || "Pagamento não informado";
}

function ageLabel(iso: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

function toWhatsappDigits(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function addressRecord(value: Json): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatAddress(value: Json) {
  const addr = addressRecord(value);
  if (!addr) return null;
  const street = String(addr.street ?? "").trim();
  const number = String(addr.number ?? "").trim();
  const complement = addr.complement ? ` — ${String(addr.complement).trim()}` : "";
  const neighborhood = String(addr.neighborhood ?? "").trim();
  const city = String(addr.city ?? "").trim();
  const state = String(addr.state ?? "").trim();
  const zipRaw = String(addr.zipcode ?? addr.zip ?? addr.zipCode ?? "").replace(/\D/g, "");
  const zip = zipRaw.length >= 8 ? `CEP ${zipRaw.slice(0, 5)}-${zipRaw.slice(5, 8)}` : zipRaw ? `CEP ${zipRaw}` : "";
  if (!street && !city) return null;
  return {
    line1: `${street}${number ? `, ${number}` : ""}${complement}`.trim(),
    line2: [neighborhood, city && state ? `${city}/${state}` : city || state].filter(Boolean).join(" · "),
    zip,
  };
}

function whatsappMessage(order: AbandonedOrder) {
  const first = order.customer_name.trim().split(/\s+/)[0] || order.customer_name;
  const situation =
    order.status === "cancelled"
      ? "foi cancelado antes do pagamento"
      : "ainda não teve o pagamento confirmado";
  return `Olá, ${first}! Aqui é da ${STORE.name}. Vi que o pedido ${order.order_number} (${brl(order.total)}) ${situation}. Posso te ajudar a concluir?`;
}

function orderSummary(
  order: AbandonedOrder,
  address: { line1: string; line2: string; zip: string } | null,
) {
  const products = order.items.map((item) => `${item.quantity}x ${item.product_name}`).join("; ");
  return [
    `Pedido: ${order.order_number}`,
    `Cliente: ${order.customer_name}`,
    `Telefone: ${order.customer_phone || "—"}`,
    `E-mail: ${order.customer_email}`,
    `Endereço: ${address ? [address.line1, address.line2, address.zip].filter(Boolean).join(", ") : "—"}`,
    `Produtos: ${products || "—"}`,
    `Total: ${brl(order.total)}`,
    `Situação: ${order.status === "cancelled" ? "Cancelado" : "Aguardando pagamento"}`,
    `Pagamento: ${paymentLabel(order.payment_method)}`,
  ].join("\n");
}
