import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Copy,
  Eye,
  FileImage,
  LogIn,
  LogOut,
  MessageCircle,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { brl } from "@/lib/format";
import { buildPixQrDataUrl, isPixEmvPayload } from "@/lib/pix-qrcode";
import { getPixReceiptSignedUrl, uploadRecoveryReceipt } from "@/lib/pix-receipt.functions";
import { getPayoutStatus } from "@/lib/payoutbr.functions";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

const FOLLOW_UP_AFTER_MS = 15 * 60 * 1000;
const REFRESH_MS = 30_000;
const ORDER_LIMIT = 1000;

const ORDER_FIELDS =
  "id, order_number, customer_name, customer_email, customer_phone, shipping_address, total, subtotal, shipping, discount, payment_method, payment_status, status, created_at, pix_receipt_path, pix_expiration, pagou_transaction_id";

const RANGES = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "24h", label: "24 h" },
  { id: "48h", label: "48 h" },
  { id: "72h", label: "72 h" },
] as const;

type RangeId = (typeof RANGES)[number]["id"] | "day";
type Outcome = "waiting" | "recovered" | "lost";
type TabId = "new" | "waiting" | "recovered" | "lost" | "receipt";

type OrderItem = {
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type ContactMark = {
  contacted_at: string;
  outcome: Outcome;
  outcome_at: string;
  recovered_total: number | null;
  recovery_receipt_path: string | null;
  recovery_receipt_mime: string | null;
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
  payment_status: string | null;
  status: string;
  created_at: string;
  pix_receipt_path: string | null;
  pix_expiration: string | null;
  pagou_transaction_id: string | null;
  items: OrderItem[];
};

export const Route = createFileRoute("/suporte")({
  head: () =>
    pageMeta({
      title: `Recuperação — ${STORE.name}`,
      description: "Fila interna de recuperação de pedidos sem pagamento.",
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
    return (
      <p className="px-4 py-16 text-center text-sm text-muted-foreground">Verificando acesso…</p>
    );
  }
  if (!allowed) return <Denied email={user.email} />;
  return <Queue email={user.email} userId={user.id} />;
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
        <h1 className="mb-2 font-serif text-2xl font-bold text-primary">Recuperação de vendas</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Pedidos sem pagamento para contato, Pix válido ou vencido, e o valor marcado como
          recuperado.
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

function Queue({ email, userId }: { email?: string; userId: string }) {
  const [orders, setOrders] = useState<AbandonedOrder[]>([]);
  const [marks, setMarks] = useState<Record<string, ContactMark>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hitLimit, setHitLimit] = useState(false);
  const [query, setQuery] = useState("");
  const [rangeId, setRangeId] = useState<RangeId>("today");
  const [day, setDay] = useState(() => toDateInput(new Date()));
  const [tab, setTab] = useState<TabId>("new");
  const [details, setDetails] = useState<AbandonedOrder | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<AbandonedOrder | null>(null);
  const uploadReceipt = useServerFn(uploadRecoveryReceipt);
  const requestSeq = useRef(0);
  const checkVeno = useServerFn(getPayoutStatus);
  const openReceiptUrl = useServerFn(getPixReceiptSignedUrl);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    const clock = Date.now();
    const cutoff = new Date(clock - FOLLOW_UP_AFTER_MS).toISOString();
    const { from, to } = rangeBounds(rangeId, day, clock);

    let unpaidQuery = supabase
      .from("orders")
      .select(ORDER_FIELDS)
      .in("status", ["pending", "cancelled"])
      .or("payment_status.is.null,payment_status.not.in.(confirmed,paid,approved)")
      .lte("created_at", cutoff)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(ORDER_LIMIT);
    if (to) unpaidQuery = unpaidQuery.lt("created_at", to);

    let markedQuery = supabase
      .from("support_order_contacts")
      .select(
        "order_id, contacted_at, outcome, outcome_at, recovered_total, recovery_receipt_path, recovery_receipt_mime",
      )
      .gte("outcome_at", from)
      .limit(ORDER_LIMIT);
    if (to) markedQuery = markedQuery.lt("outcome_at", to);

    const [unpaidRes, markedRes] = await Promise.all([unpaidQuery, markedQuery]);
    if (requestId !== requestSeq.current) return;
    if (unpaidRes.error) {
      setError(unpaidRes.error.message);
      setLoading(false);
      return;
    }
    if (markedRes.error) {
      setError(markedRes.error.message);
      setLoading(false);
      return;
    }

    const unpaidRows = unpaidRes.data ?? [];
    const periodMarks = (markedRes.data ?? []) as Array<ContactMark & { order_id: string }>;
    const ids = new Set(unpaidRows.map((row) => row.id));
    const missingIds = periodMarks.map((mark) => mark.order_id).filter((id) => !ids.has(id));

    let extraRows: typeof unpaidRows = [];
    if (missingIds.length) {
      const { data, error: extraError } = await supabase
        .from("orders")
        .select(ORDER_FIELDS)
        .in("id", missingIds.slice(0, ORDER_LIMIT));
      if (requestId !== requestSeq.current) return;
      if (extraError) {
        setError(extraError.message);
        setLoading(false);
        return;
      }
      extraRows = data ?? [];
    }

    const rows = [...unpaidRows, ...extraRows];
    const rowIds = rows.map((row) => row.id);
    let itemRows: OrderItem[] = [];
    let markRows: Array<ContactMark & { order_id: string }> = periodMarks;
    if (rowIds.length) {
      const [itemsRes, marksRes] = await Promise.all([
        supabase
          .from("order_items")
          .select("order_id, product_name, quantity, unit_price, total")
          .in("order_id", rowIds),
        supabase
          .from("support_order_contacts")
          .select(
            "order_id, contacted_at, outcome, outcome_at, recovered_total, recovery_receipt_path, recovery_receipt_mime",
          )
          .in("order_id", rowIds),
      ]);
      if (requestId !== requestSeq.current) return;
      if (itemsRes.error) {
        setError(itemsRes.error.message);
        setLoading(false);
        return;
      }
      if (marksRes.error) {
        setError(marksRes.error.message);
        setLoading(false);
        return;
      }
      itemRows = itemsRes.data ?? [];
      markRows = marksRes.data ?? [];
    }

    const byOrder = new Map<string, OrderItem[]>();
    for (const item of itemRows) {
      const list = byOrder.get(item.order_id) ?? [];
      list.push(item);
      byOrder.set(item.order_id, list);
    }
    if (requestId !== requestSeq.current) return;
    setOrders(
      rows
        .map((row) => ({ ...row, items: byOrder.get(row.id) ?? [] }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    );
    setMarks(
      Object.fromEntries(
        markRows.map((mark) => [
          mark.order_id,
          {
            contacted_at: mark.contacted_at,
            outcome: normalizeOutcome(mark.outcome),
            outcome_at: mark.outcome_at,
            recovered_total: mark.recovered_total,
            recovery_receipt_path: mark.recovery_receipt_path,
            recovery_receipt_mime: mark.recovery_receipt_mime,
          },
        ]),
      ),
    );
    setHitLimit(unpaidRows.length >= ORDER_LIMIT);
    setError(null);
    setUpdatedAt(new Date());
    setNow(clock);
    setLoading(false);
  }, [rangeId, day]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => summarize(orders, marks, now), [orders, marks, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return orders.filter((order) => {
      const mark = marks[order.id];
      if (tab === "new" && mark) return false;
      if (tab === "waiting" && mark?.outcome !== "waiting") return false;
      if (tab === "recovered" && mark?.outcome !== "recovered") return false;
      if (tab === "lost" && mark?.outcome !== "lost") return false;
      if (tab === "receipt" && !order.pix_receipt_path) return false;
      if (!q) return true;
      const phone = (order.customer_phone ?? "").replace(/\D/g, "");
      const products = order.items
        .map((item) => item.product_name)
        .join(" ")
        .toLowerCase();
      return (
        order.customer_name.toLowerCase().includes(q) ||
        order.customer_email.toLowerCase().includes(q) ||
        order.order_number.toLowerCase().includes(q) ||
        products.includes(q) ||
        (digits.length >= 4 && phone.includes(digits))
      );
    });
  }, [orders, query, tab, marks]);

  async function cancelOrder(orderId: string) {
    if (!window.confirm("Cancelar este pedido?")) return;
    const { error: cancelError } = await supabase
      .from("orders")
      .update({ status: "cancelled", payment_status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending");
    if (cancelError) {
      toast.error(cancelError.message);
      return;
    }
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, status: "cancelled", payment_status: "cancelled" }
          : order,
      ),
    );
    setDetails((current) =>
      current?.id === orderId
        ? { ...current, status: "cancelled", payment_status: "cancelled" }
        : current,
    );
    toast.success("Pedido cancelado");
  }

  async function setOutcome(order: AbandonedOrder, outcome: Outcome | null) {
    if (!outcome) {
      const { error: deleteError } = await supabase
        .from("support_order_contacts")
        .delete()
        .eq("order_id", order.id);
      if (deleteError) {
        toast.error(deleteError.message);
        return;
      }
      setMarks((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      return;
    }
    const outcomeAt = new Date().toISOString();
    const recoveredTotal = outcome === "recovered" ? Number(order.total) : null;
    const { error: saveError } = await supabase.from("support_order_contacts").upsert({
      order_id: order.id,
      user_id: userId,
      contacted_at: marks[order.id]?.contacted_at ?? outcomeAt,
      outcome,
      outcome_at: outcomeAt,
      recovered_total: recoveredTotal,
    });
    if (saveError) {
      toast.error(saveError.message);
      return;
    }
    setMarks((prev) => ({
      ...prev,
      [order.id]: {
        contacted_at: prev[order.id]?.contacted_at ?? outcomeAt,
        outcome,
        outcome_at: outcomeAt,
        recovered_total: recoveredTotal,
        recovery_receipt_path: prev[order.id]?.recovery_receipt_path ?? null,
        recovery_receipt_mime: prev[order.id]?.recovery_receipt_mime ?? null,
      },
    }));
  }

  async function refreshVeno(order: AbandonedOrder) {
    setCheckingId(order.id);
    try {
      const res = await checkVeno({ data: { orderId: order.id } });
      const paymentStatus = res.status;
      const orderStatus = res.orderStatus ?? order.status;
      setOrders((prev) =>
        prev.map((row) =>
          row.id === order.id
            ? { ...row, payment_status: paymentStatus, status: orderStatus }
            : row,
        ),
      );
      setDetails((current) =>
        current?.id === order.id
          ? { ...current, payment_status: paymentStatus, status: orderStatus }
          : current,
      );
      if (paymentStatus === "confirmed") {
        await setOutcome(order, "recovered");
        toast.success("Veno confirmou o pagamento. Pedido contado como recuperado.");
      } else if (paymentStatus === "cancelled") {
        toast.message("Veno: Pix vencido ou cancelado.");
      } else {
        toast.message("Veno: Pix ainda pendente.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível consultar a Veno");
    } finally {
      setCheckingId(null);
    }
  }

  async function viewReceipt(orderId: string) {
    setReceiptId(orderId);
    try {
      const signed = await openReceiptUrl({ data: { orderId } });
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o comprovante");
    } finally {
      setReceiptId(null);
    }
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "new", label: "Novos", count: stats.newCount },
    { id: "waiting", label: "Aguardando", count: stats.waitingCount },
    { id: "recovered", label: "Recuperados", count: stats.recoveredCount },
    { id: "lost", label: "Perdidos", count: stats.lostCount },
    { id: "receipt", label: "Comprovante", count: stats.receiptCount },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.005_250)]">
      <header className="bg-[#0f2744] text-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Operação
            </p>
            <h1 className="font-serif text-xl font-bold">Recuperação de vendas</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/80">
            <span>
              {updatedAt
                ? updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : ""}
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-sm border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair{email ? ` · ${email}` : ""}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Em aberto"
            value={brl(stats.openValue)}
            hint={`${stats.openCount} pedido${stats.openCount === 1 ? "" : "s"} sem recuperar`}
          />
          <StatCard
            label="Pix válido agora"
            value={brl(stats.validValue)}
            hint={`${stats.validCount} com cobrança ainda válida na Veno`}
            tone="good"
          />
          <StatCard
            label="Pix vencido ou sem código"
            value={brl(stats.expiredValue)}
            hint={`${stats.expiredCount} para gerar de novo ou encerrar`}
            tone="warn"
          />
          <StatCard
            label="Recuperado no período"
            value={brl(stats.recoveredValue)}
            hint={`${stats.recoveredCount} marcado${stats.recoveredCount === 1 ? "" : "s"} como recuperado`}
            tone="accent"
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                tab === item.id
                  ? "border-[#0f2744] text-[#0f2744]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
              <span className="ml-1.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[11px]">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRangeId(item.id)}
                className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                  rangeId === item.id
                    ? "border-[#0f2744] bg-[#0f2744] text-white"
                    : "border-border bg-white text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            Dia
            <input
              type="date"
              value={rangeId === "day" ? day : ""}
              onChange={(e) => {
                setDay(e.target.value);
                setRangeId("day");
              }}
              className="rounded-sm border border-border bg-white px-2 py-1.5 text-xs text-foreground"
            />
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nome, telefone ou pedido"
            className="w-full min-w-[200px] flex-1 rounded-sm border border-border bg-white px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-white px-3 py-1.5 text-xs hover:bg-cream"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <p className="text-xs text-muted-foreground">
            {filtered.length} na aba · {orders.length} no período
          </p>
        </div>

        {hitLimit && (
          <p className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Este período atingiu o limite de {ORDER_LIMIT} pedidos. Filtre por hoje, ontem ou um dia
            específico para ver a fila completa.
          </p>
        )}
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto rounded-sm border border-border bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-[#f4f7fb] text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Produto</th>
                <th className="px-3 py-2.5">Valor</th>
                <th className="px-3 py-2.5">Pix</th>
                <th className="px-3 py-2.5">Quando</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  now={now}
                  mark={marks[order.id] ?? null}
                  checking={checkingId === order.id}
                  openingReceipt={receiptId === order.id}
                  onOpen={() => setDetails(order)}
                  onCancel={() => void cancelOrder(order.id)}
                  onOutcome={(outcome) => void setOutcome(order, outcome)}
                  onAskReceipt={() => setReceiptFor(order)}
                  onVeno={() => void refreshVeno(order)}
                  onReceipt={() => void viewReceipt(order.id)}
                />
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum pedido neste filtro.
                  </td>
                </tr>
              )}
              {loading && orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Pedidos com menos de 15 minutos ficam de fora, para o cliente ainda conseguir pagar
          sozinho. “Pix válido” usa o vencimento gravado pela Veno. “Checar Veno” consulta o status
          ao vivo. O card Recuperado soma só o que foi marcado como recuperado neste período.
        </p>
      </div>

      {details && (
        <OrderDetails
          order={details}
          mark={marks[details.id] ?? null}
          now={now}
          onClose={() => setDetails(null)}
          onCancel={() => void cancelOrder(details.id)}
          onOutcome={(outcome) => void setOutcome(details, outcome)}
          onVeno={() => void refreshVeno(details)}
          onReceipt={() => void viewReceipt(details.id)}
          onAskReceipt={() => setReceiptFor(details)}
          checking={checkingId === details.id}
        />
      )}
      {receiptFor && (
        <RecoveryReceiptDialog
          order={receiptFor}
          onClose={() => setReceiptFor(null)}
          onUpload={uploadReceipt}
          onSaved={(saved) => {
            const outcomeAt = new Date().toISOString();
            setMarks((prev) => ({
              ...prev,
              [receiptFor.id]: {
                contacted_at: prev[receiptFor.id]?.contacted_at ?? outcomeAt,
                outcome: "recovered",
                outcome_at: outcomeAt,
                recovered_total: Number(receiptFor.total),
                recovery_receipt_path: saved.path,
                recovery_receipt_mime: saved.mime,
              },
            }));
            setReceiptFor(null);
            toast.success("Pedido marcado como recuperado");
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "good" | "warn" | "accent";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-800"
        : tone === "accent"
          ? "text-[#0f2744]"
          : "text-foreground";
  return (
    <div className="rounded-sm border border-border bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-serif text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function OrderRow({
  order,
  now,
  mark,
  checking,
  openingReceipt,
  onOpen,
  onCancel,
  onOutcome,
  onAskReceipt,
  onVeno,
  onReceipt,
}: {
  order: AbandonedOrder;
  now: number;
  mark: ContactMark | null;
  checking: boolean;
  openingReceipt: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onOutcome: (outcome: Outcome | null) => void;
  onAskReceipt: () => void;
  onVeno: () => void;
  onReceipt: () => void;
}) {
  const phoneDigits = toWhatsappDigits(order.customer_phone);
  const pix = pixState(order, now);
  const created = new Date(order.created_at);
  const productLabel =
    order.items.length === 0
      ? "Sem itens"
      : order.items.length === 1
        ? `${order.items[0].quantity}× ${order.items[0].product_name}`
        : `${order.items[0].quantity}× ${order.items[0].product_name} +${order.items.length - 1}`;

  return (
    <tr
      className={`border-t border-border align-top ${mark?.outcome === "recovered" ? "bg-sky-50/70" : mark?.outcome === "lost" ? "bg-rose-50/50" : ""}`}
    >
      <td className="px-3 py-3">
        <div className="font-medium">{order.customer_name}</div>
        <div className="text-xs text-muted-foreground">
          {order.customer_phone || "Sem telefone"}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">#{order.order_number}</div>
      </td>
      <td className="max-w-[220px] px-3 py-3 text-xs leading-relaxed">{productLabel}</td>
      <td className="px-3 py-3">
        <div className="font-semibold">{brl(order.total)}</div>
        <div className="text-[11px] text-muted-foreground">frete {brl(order.shipping)}</div>
      </td>
      <td className="px-3 py-3">
        <PixBadge pix={pix} />
        <button
          type="button"
          onClick={onVeno}
          disabled={checking || !order.pagou_transaction_id}
          className="mt-1 block text-[11px] text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {checking
            ? "Consultando…"
            : order.pagou_transaction_id
              ? "Checar Veno"
              : "Sem cobrança Veno"}
        </button>
      </td>
      <td className="px-3 py-3 text-xs">
        <div>
          {created.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="text-muted-foreground">{ageLabel(order.created_at, now)}</div>
      </td>
      <td className="px-3 py-3">
        <SituationBadge order={order} mark={mark} />
        {(order.pix_receipt_path || mark?.recovery_receipt_path) && (
          <span className="mt-1 inline-block rounded bg-sky-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Comprovante
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {phoneDigits && (
            <a
              href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(whatsappMessage(order, pix))}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                if (!mark) onOutcome("waiting");
              }}
              className="inline-flex items-center gap-1 rounded-sm bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
          )}
          {phoneDigits && (
            <a
              href={`tel:+${phoneDigits}`}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-cream"
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] hover:bg-cream"
          >
            <Eye className="h-3 w-3" /> Ver
          </button>
          {(order.pix_receipt_path || mark?.recovery_receipt_path) && (
            <button
              type="button"
              onClick={onReceipt}
              disabled={openingReceipt}
              className="inline-flex items-center gap-1 rounded-sm border border-sky-700 px-2 py-1 text-[11px] text-sky-800 hover:bg-sky-50 disabled:opacity-60"
            >
              <FileImage className="h-3 w-3" /> {openingReceipt ? "…" : "Comprovante"}
            </button>
          )}
          <OutcomeButton
            active={mark?.outcome === "waiting"}
            onClick={() => onOutcome(mark?.outcome === "waiting" ? null : "waiting")}
            className="border-amber-700 text-amber-900 data-[on=true]:bg-amber-500 data-[on=true]:text-white"
          >
            Aguardando
          </OutcomeButton>
          <OutcomeButton
            active={mark?.outcome === "recovered"}
            onClick={() => (mark?.outcome === "recovered" ? onOutcome(null) : onAskReceipt())}
            className="border-sky-800 text-sky-900 data-[on=true]:bg-sky-700 data-[on=true]:text-white"
          >
            Recuperado
          </OutcomeButton>
          <OutcomeButton
            active={mark?.outcome === "lost"}
            onClick={() => onOutcome(mark?.outcome === "lost" ? null : "lost")}
            className="border-rose-700 text-rose-800 data-[on=true]:bg-rose-600 data-[on=true]:text-white"
          >
            Perdido
          </OutcomeButton>
          {order.status === "pending" && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-destructive px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
            >
              Cancelar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function OutcomeButton({
  active,
  className,
  children,
  onClick,
}: {
  active: boolean;
  className: string;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-on={active}
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 text-[11px] font-semibold ${className}`}
    >
      {children}
    </button>
  );
}

function PixBadge({ pix }: { pix: PixView }) {
  const className =
    pix.kind === "valid"
      ? "bg-emerald-100 text-emerald-900"
      : pix.kind === "expired"
        ? "bg-rose-100 text-rose-900"
        : "bg-stone-100 text-stone-700";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {pix.label}
    </span>
  );
}

function SituationBadge({ order, mark }: { order: AbandonedOrder; mark: ContactMark | null }) {
  if (mark?.outcome === "recovered") {
    return (
      <span className="inline-block rounded bg-sky-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Recuperado
      </span>
    );
  }
  if (mark?.outcome === "lost") {
    return (
      <span className="inline-block rounded bg-rose-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Perdido
      </span>
    );
  }
  if (mark?.outcome === "waiting") {
    return (
      <span className="inline-block rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Aguardando
      </span>
    );
  }
  if (order.status === "cancelled") {
    return (
      <span className="inline-block rounded bg-stone-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-[#0f2744] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Novo
    </span>
  );
}

function OrderDetails({
  order,
  mark,
  now,
  onClose,
  onCancel,
  onOutcome,
  onVeno,
  onReceipt,
  onAskReceipt,
  checking,
}: {
  order: AbandonedOrder;
  mark: ContactMark | null;
  now: number;
  onClose: () => void;
  onCancel: () => void;
  onOutcome: (outcome: Outcome | null) => void;
  onVeno: () => void;
  onReceipt: () => void;
  onAskReceipt: () => void;
  checking: boolean;
}) {
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixExpires, setPixExpires] = useState<string | null>(order.pix_expiration);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const address = formatAddress(order.shipping_address);
  const pix = pixState({ ...order, pix_expiration: pixExpires }, now);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void supabase
      .from("orders")
      .select("pix_qr_code, pix_expiration")
      .eq("id", order.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          setLoading(false);
          return;
        }
        const code = data?.pix_qr_code?.trim() || null;
        setPixCode(code);
        setPixExpires(data?.pix_expiration ?? null);
        const nextQr = code && isPixEmvPayload(code) ? await buildPixQrDataUrl(code) : null;
        if (cancelled) return;
        setQrUrl(nextQr);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyCode() {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      toast.success("Pix copia e cola copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const expired = pix.kind !== "valid";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-order-details-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-border bg-card p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="support-order-details-title"
              className="font-serif text-2xl font-bold text-primary"
            >
              Pedido #{order.order_number}
            </h2>
            <p className="text-sm text-muted-foreground">
              {order.customer_name} · {brl(order.total)}
            </p>
            <div className="mt-2">
              <PixBadge pix={pix} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:text-primary"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando Pix…</p>}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {!loading && !pixCode && (
          <p className="rounded-sm border border-border bg-cream px-3 py-3 text-sm text-muted-foreground">
            Este pedido não tem Pix copia e cola. A cobrança pode ter falhado antes de chegar na
            Veno.
          </p>
        )}
        {!loading && pixCode && expired && (
          <p className="rounded-sm border border-border bg-cream px-3 py-3 text-sm text-muted-foreground">
            O Pix venceu{pixExpires ? ` em ${new Date(pixExpires).toLocaleString("pt-BR")}` : ""}. O
            cliente precisa gerar um novo pagamento no site.
          </p>
        )}
        {!loading && pixCode && !expired && (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-sm border border-border bg-white p-3">
              {qrUrl ? (
                <img src={qrUrl} alt="QR Code Pix do pedido" className="h-64 w-64" />
              ) : (
                <p className="flex h-64 w-64 items-center justify-center text-center text-sm text-muted-foreground">
                  Não foi possível gerar o QR Code. Use o copia e cola.
                </p>
              )}
            </div>
            <textarea
              readOnly
              value={pixCode}
              rows={4}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar código
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-1 border-t border-border pt-4">
          <button
            type="button"
            onClick={onVeno}
            disabled={checking}
            className="rounded-sm border border-border px-3 py-2 text-xs font-medium hover:bg-cream disabled:opacity-60"
          >
            {checking ? "Consultando Veno…" : "Checar Veno"}
          </button>
          {(order.pix_receipt_path || mark?.recovery_receipt_path) && (
            <button
              type="button"
              onClick={onReceipt}
              className="rounded-sm border border-sky-700 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-50"
            >
              Ver comprovante
            </button>
          )}
          <button
            type="button"
            onClick={() => (mark?.outcome === "recovered" ? onOutcome(null) : onAskReceipt())}
            className="rounded-sm bg-sky-700 px-3 py-2 text-xs font-semibold text-white"
          >
            {mark?.outcome === "recovered" ? "Desmarcar recuperado" : "Marcar recuperado"}
          </button>
          {order.status === "pending" && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-destructive px-3 py-2 text-xs font-medium text-destructive"
            >
              Cancelar pedido
            </button>
          )}
        </div>
        <div className="mt-4 text-sm">
          <p>{order.customer_phone || "Sem telefone"}</p>
          <p className="text-muted-foreground">{order.customer_email}</p>
          {address && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {[address.line1, address.line2, address.zip].filter(Boolean).join(" · ")}
            </p>
          )}
          <ul className="mt-2 space-y-1 text-xs">
            {order.items.map((item, index) => (
              <li key={`${item.product_name}-${index}`}>
                {item.quantity}× {item.product_name} · {brl(item.total)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

type PixView = { kind: "valid" | "expired" | "none"; label: string; minutesLeft: number | null };

function pixState(
  order: Pick<
    AbandonedOrder,
    "pix_expiration" | "pagou_transaction_id" | "payment_status" | "status"
  >,
  now: number,
): PixView {
  const pay = (order.payment_status ?? "").toLowerCase();
  if (pay === "confirmed" || pay === "paid" || pay === "approved") {
    return { kind: "valid", label: "Pago", minutesLeft: null };
  }
  if (!order.pagou_transaction_id && !order.pix_expiration) {
    return { kind: "none", label: "Sem Pix", minutesLeft: null };
  }
  if (order.pix_expiration) {
    const leftMs = new Date(order.pix_expiration).getTime() - now;
    if (leftMs > 0) {
      const minutesLeft = Math.max(1, Math.ceil(leftMs / 60000));
      const label =
        minutesLeft >= 60
          ? `Válido · ${Math.floor(minutesLeft / 60)} h`
          : `Válido · ${minutesLeft} min`;
      return { kind: "valid", label, minutesLeft };
    }
    return { kind: "expired", label: "Vencido", minutesLeft: 0 };
  }
  if (pay === "cancelled" || order.status === "cancelled") {
    return { kind: "expired", label: "Vencido", minutesLeft: 0 };
  }
  return { kind: "valid", label: "Pix gerado", minutesLeft: null };
}

function summarize(orders: AbandonedOrder[], marks: Record<string, ContactMark>, now: number) {
  let openCount = 0;
  let openValue = 0;
  let validCount = 0;
  let validValue = 0;
  let expiredCount = 0;
  let expiredValue = 0;
  let recoveredCount = 0;
  let recoveredValue = 0;
  let lostCount = 0;
  let newCount = 0;
  let waitingCount = 0;
  let receiptCount = 0;
  for (const order of orders) {
    const mark = marks[order.id];
    const total = Number(order.total) || 0;
    if (order.pix_receipt_path) receiptCount += 1;
    if (mark?.outcome === "recovered") {
      recoveredCount += 1;
      recoveredValue += Number(mark.recovered_total ?? total);
      continue;
    }
    if (mark?.outcome === "lost") {
      lostCount += 1;
      continue;
    }
    if (mark?.outcome === "waiting") waitingCount += 1;
    else newCount += 1;
    openCount += 1;
    openValue += total;
    const pix = pixState(order, now);
    if (pix.kind === "valid") {
      validCount += 1;
      validValue += total;
    } else {
      expiredCount += 1;
      expiredValue += total;
    }
  }
  return {
    openCount,
    openValue,
    validCount,
    validValue,
    expiredCount,
    expiredValue,
    recoveredCount,
    recoveredValue,
    lostCount,
    newCount,
    waitingCount,
    receiptCount,
  };
}

function normalizeOutcome(value: string | null | undefined): Outcome {
  if (value === "recovered" || value === "lost" || value === "waiting") return value;
  return "waiting";
}

function rangeBounds(
  rangeId: RangeId,
  day: string,
  now: number,
): { from: string; to: string | null } {
  if (rangeId === "24h" || rangeId === "48h" || rangeId === "72h") {
    const hours = rangeId === "24h" ? 24 : rangeId === "48h" ? 48 : 72;
    return { from: new Date(now - hours * 60 * 60 * 1000).toISOString(), to: null };
  }
  const base =
    rangeId === "yesterday"
      ? new Date(now - 24 * 60 * 60 * 1000)
      : rangeId === "day"
        ? parseDay(day)
        : new Date(now);
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function parseDay(value: string) {
  const [year, month, date] = value.split("-").map(Number);
  if (!year || !month || !date) return new Date();
  return new Date(year, month - 1, date);
}

function toDateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
  const zip =
    zipRaw.length >= 8
      ? `CEP ${zipRaw.slice(0, 5)}-${zipRaw.slice(5, 8)}`
      : zipRaw
        ? `CEP ${zipRaw}`
        : "";
  if (!street && !city) return null;
  return {
    line1: `${street}${number ? `, ${number}` : ""}${complement}`.trim(),
    line2: [neighborhood, city && state ? `${city}/${state}` : city || state]
      .filter(Boolean)
      .join(" · "),
    zip,
  };
}

function RecoveryReceiptDialog({
  order,
  onClose,
  onUpload,
  onSaved,
}: {
  order: AbandonedOrder;
  onClose: () => void;
  onUpload: (input: {
    data: { orderId: string; filename: string; mime: string; dataBase64: string };
  }) => Promise<{ path: string; mime: string }>;
  onSaved: (saved: { path: string; mime: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      toast.error("Escolha uma imagem ou um PDF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo maior que 5 MB.");
      return;
    }
    const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    setBusy(true);
    try {
      const dataBase64 = await readFileBase64(file);
      const saved = await onUpload({
        data: { orderId: order.id, filename: file.name, mime, dataBase64 },
      });
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o comprovante.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-receipt-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-md rounded-sm border border-border bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="recovery-receipt-title" className="font-serif text-xl font-semibold">
              Comprovante da recuperação
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedido {order.order_number} · {brl(order.total)}. Envie a imagem ou o PDF do pagamento
              para marcar como recuperado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:bg-cream"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Arquivo (JPEG, PNG, WebP ou PDF, até 5 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-sm file:border file:border-border file:bg-cream file:px-3 file:py-1.5"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-3 py-2 text-xs font-medium hover:bg-cream"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !file}
            className="rounded-sm bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Enviando…" : "Enviar e marcar recuperado"}
          </button>
        </div>
      </form>
    </div>
  );
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Arquivo inválido."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function whatsappMessage(order: AbandonedOrder, pix: PixView) {
  const first = order.customer_name.trim().split(/\s+/)[0] || order.customer_name;
  const pixLine =
    pix.kind === "valid"
      ? "O Pix ainda está válido, posso te ajudar a concluir?"
      : pix.kind === "expired"
        ? "O Pix venceu. Posso te orientar a gerar outro pagamento?"
        : "O pagamento não foi concluído. Posso te ajudar a finalizar?";
  return `Olá, ${first}! Aqui é da ${STORE.name}. Vi o pedido ${order.order_number} de ${brl(order.total)}. ${pixLine}`;
}
