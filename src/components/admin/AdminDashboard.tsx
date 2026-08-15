import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CreditCard,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

const PAID_STATUSES = new Set([
  "confirmed",
  "paid",
  "separating",
  "invoiced",
  "shipped",
  "out_for_delivery",
  "delivered",
]);

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando",
  confirmed: "Confirmado",
  paid: "Pago",
  separating: "Separando",
  invoiced: "Faturado",
  shipped: "Enviado",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão",
  boleto: "Boleto",
};

const PERIODS = [
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "90d", label: "90 dias", days: 90 },
  { id: "all", label: "Todo período", days: null },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  total: number;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string;
};

type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  quantity: number;
  total: number;
};

type TopProduct = {
  key: string;
  name: string;
  image: string | null;
  qty: number;
  revenue: number;
  orders: number;
};

function isPaidOrder(o: Pick<OrderRow, "status" | "payment_status">) {
  return PAID_STATUSES.has(o.status) || o.payment_status === "confirmed";
}

function methodKey(m: string | null) {
  if (!m) return "other";
  if (m === "pix") return "pix";
  if (m === "credit_card" || m === "card") return "credit_card";
  if (m === "boleto") return "boleto";
  return "other";
}

function periodStart(days: number | null) {
  if (days == null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

async function fetchAllOrders(fromIso: string | null): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  const page = 1000;
  let from = 0;
  while (true) {
    let q = supabase
      .from("orders")
      .select("id, order_number, customer_name, total, status, payment_method, payment_status, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + page - 1);
    if (fromIso) q = q.gte("created_at", fromIso);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as OrderRow[]));
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function fetchItemsForOrders(orderIds: string[]): Promise<OrderItemRow[]> {
  if (!orderIds.length) return [];
  const all: OrderItemRow[] = [];
  const chunk = 200;
  for (let i = 0; i < orderIds.length; i += chunk) {
    const ids = orderIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, product_id, product_name, product_image, quantity, total")
      .in("order_id", ids);
    if (error) throw error;
    all.push(...((data ?? []) as OrderItemRow[]));
  }
  return all;
}

export function AdminDashboard() {
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [customers, setCustomers] = useState(0);
  const [products, setProducts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const days = PERIODS.find((p) => p.id === period)?.days ?? null;
        const start = periodStart(days);
        const fromIso = start?.toISOString() ?? null;

        const [orderRows, cCount, pCount] = await Promise.all([
          fetchAllOrders(fromIso),
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("products").select("*", { count: "exact", head: true }),
        ]);

        const paidIds = orderRows.filter(isPaidOrder).map((o) => o.id);
        const itemRows = await fetchItemsForOrders(paidIds);

        if (cancelled) return;
        setOrders(orderRows);
        setItems(itemRows);
        setCustomers(cCount.count ?? 0);
        setProducts(pCount.count ?? 0);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao carregar estatísticas");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const stats = useMemo(() => {
    const paid = orders.filter(isPaidOrder);
    const pending = orders.filter((o) => o.status === "pending");
    const cancelled = orders.filter((o) => o.status === "cancelled" || o.status === "refunded");
    const revenue = paid.reduce((s, o) => s + Number(o.total), 0);
    const aov = paid.length ? revenue / paid.length : 0;

    const byMethod = {
      pix: { count: 0, revenue: 0, paidCount: 0, paidRevenue: 0 },
      credit_card: { count: 0, revenue: 0, paidCount: 0, paidRevenue: 0 },
      boleto: { count: 0, revenue: 0, paidCount: 0, paidRevenue: 0 },
      other: { count: 0, revenue: 0, paidCount: 0, paidRevenue: 0 },
    };

    for (const o of orders) {
      const key = methodKey(o.payment_method) as keyof typeof byMethod;
      byMethod[key].count += 1;
      byMethod[key].revenue += Number(o.total);
      if (isPaidOrder(o)) {
        byMethod[key].paidCount += 1;
        byMethod[key].paidRevenue += Number(o.total);
      }
    }

    const byStatusMap = new Map<string, number>();
    for (const o of orders) {
      byStatusMap.set(o.status, (byStatusMap.get(o.status) ?? 0) + 1);
    }
    const byStatus = [...byStatusMap.entries()]
      .map(([status, count]) => ({
        status,
        label: STATUS_LABEL[status] ?? status,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Daily sales (paid only)
    const dayMap = new Map<string, { date: string; revenue: number; orders: number }>();
    const days = PERIODS.find((p) => p.id === period)?.days;
    if (days) {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, { date: key, revenue: 0, orders: 0 });
      }
    }
    for (const o of paid) {
      const key = o.created_at.slice(0, 10);
      const row = dayMap.get(key) ?? { date: key, revenue: 0, orders: 0 };
      row.revenue += Number(o.total);
      row.orders += 1;
      dayMap.set(key, row);
    }
    const daily = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Top products from paid orders
    const productMap = new Map<string, TopProduct>();
    const paidIdSet = new Set(paid.map((o) => o.id));
    for (const it of items) {
      if (!paidIdSet.has(it.order_id)) continue;
      const key = it.product_id ?? it.product_name;
      const cur = productMap.get(key) ?? {
        key,
        name: it.product_name,
        image: it.product_image,
        qty: 0,
        revenue: 0,
        orders: 0,
      };
      cur.qty += Number(it.quantity);
      cur.revenue += Number(it.total);
      productMap.set(key, cur);
    }
    // Distinct orders per product
    const ordersPerProduct = new Map<string, Set<string>>();
    for (const it of items) {
      if (!paidIdSet.has(it.order_id)) continue;
      const key = it.product_id ?? it.product_name;
      const set = ordersPerProduct.get(key) ?? new Set();
      set.add(it.order_id);
      ordersPerProduct.set(key, set);
    }
    for (const [key, set] of ordersPerProduct) {
      const p = productMap.get(key);
      if (p) p.orders = set.size;
    }
    const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty);

    const methodPie = [
      { name: "PIX", key: "pix", value: byMethod.pix.paidCount, revenue: byMethod.pix.paidRevenue, color: "#2f9e4f" },
      { name: "Cartão", key: "credit_card", value: byMethod.credit_card.paidCount, revenue: byMethod.credit_card.paidRevenue, color: "#5a1a1f" },
      { name: "Boleto", key: "boleto", value: byMethod.boleto.paidCount, revenue: byMethod.boleto.paidRevenue, color: "#c9a86a" },
    ].filter((x) => x.value > 0 || x.revenue > 0);

    const recent = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);

    return {
      totalOrders: orders.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
      revenue,
      aov,
      byMethod,
      byStatus,
      daily,
      topProducts,
      methodPie,
      recent,
    };
  }, [orders, items, period]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return stats.topProducts.slice(0, 10);
    return stats.topProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [stats.topProducts, productQuery]);

  const searchTotals = useMemo(() => {
    if (!productQuery.trim()) return null;
    return {
      qty: filteredProducts.reduce((s, p) => s + p.qty, 0),
      revenue: filteredProducts.reduce((s, p) => s + p.revenue, 0),
      products: filteredProducts.length,
    };
  }, [filteredProducts, productQuery]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando estatísticas…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const kpi = [
    { label: "Receita confirmada", value: brl(stats.revenue), Icon: DollarSign, hint: `${stats.paidCount} pedidos pagos` },
    { label: "Pedidos no período", value: stats.totalOrders, Icon: ShoppingCart, hint: `${stats.pendingCount} pendentes` },
    { label: "Ticket médio", value: brl(stats.aov), Icon: TrendingUp, hint: "Pedidos confirmados" },
    { label: "Clientes", value: customers, Icon: Users, hint: "Cadastros totais" },
    { label: "Produtos", value: products, Icon: Package, hint: "Catálogo" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Visão geral de pedidos, pagamentos e produtos mais vendidos</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-sm border border-border bg-card p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium transition ${
                period === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpi.map((c) => (
          <div key={c.label} className="rounded-sm border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</span>
              <c.Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-2 font-serif text-2xl font-bold text-primary">{c.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* PIX vs Cartão */}
      <div className="grid gap-4 lg:grid-cols-3">
        <MethodCard
          title="PIX"
          Icon={Wallet}
          accent="text-green-700"
          total={stats.byMethod.pix.count}
          paid={stats.byMethod.pix.paidCount}
          paidRevenue={stats.byMethod.pix.paidRevenue}
          totalRevenue={stats.byMethod.pix.revenue}
        />
        <MethodCard
          title="Cartão de crédito"
          Icon={CreditCard}
          accent="text-primary"
          total={stats.byMethod.credit_card.count}
          paid={stats.byMethod.credit_card.paidCount}
          paidRevenue={stats.byMethod.credit_card.paidRevenue}
          totalRevenue={stats.byMethod.credit_card.revenue}
        />
        <div className="rounded-sm border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-medium">Pedidos pagos por método</h3>
          {stats.methodPie.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Sem vendas confirmadas no período</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.methodPie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {stats.methodPie.map((e) => (
                      <Cell key={e.key} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, _n, item: any) => [
                      `${value} pedidos · ${brl(item?.payload?.revenue ?? 0)}`,
                      item?.payload?.name,
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-sm border border-border bg-card p-5 lg:col-span-3">
          <h3 className="mb-1 text-sm font-medium">Receita confirmada por dia</h3>
          <p className="mb-4 text-xs text-muted-foreground">Somente pedidos pagos / confirmados</p>
          <div className="h-64">
            {stats.daily.every((d) => d.revenue === 0) ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const [, m, d] = String(v).split("-");
                      return `${d}/${m}`;
                    }}
                    fontSize={11}
                  />
                  <YAxis tickFormatter={(v) => `R$${Math.round(Number(v) / 100) * 100}`} fontSize={11} width={56} />
                  <Tooltip
                    labelFormatter={(v) => new Date(String(v) + "T12:00:00").toLocaleDateString("pt-BR")}
                    formatter={(value: number, name) => [
                      name === "revenue" ? brl(value) : value,
                      name === "revenue" ? "Receita" : "Pedidos",
                    ]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#5a1a1f" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-sm border border-border bg-card p-5 lg:col-span-2">
          <h3 className="mb-1 text-sm font-medium">Pedidos por status</h3>
          <p className="mb-4 text-xs text-muted-foreground">Distribuição no período selecionado</p>
          <div className="h-64">
            {stats.byStatus.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem pedidos</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byStatus} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="label" width={90} fontSize={11} />
                  <Tooltip formatter={(v: number) => [v, "Pedidos"]} />
                  <Bar dataKey="count" fill="#c9a86a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Top products */}
      <div className="rounded-sm border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-medium">Produtos mais comprados</h3>
            <p className="text-xs text-muted-foreground">Com base em pedidos confirmados / pagos no período</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="product-sales-search">
              Buscar produto
            </label>
            <input
              id="product-sales-search"
              type="search"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Digite o nome do produto…"
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        {searchTotals && (
          <div className="flex flex-wrap gap-4 border-b border-border bg-cream/60 px-5 py-2 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{searchTotals.products}</strong> produto(s)
            </span>
            <span>
              Qtd. vendida: <strong className="text-foreground">{searchTotals.qty}</strong>
            </span>
            <span>
              Receita: <strong className="text-foreground">{brl(searchTotals.revenue)}</strong>
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Produto</th>
                <th className="px-4 py-2 text-right">Qtd.</th>
                <th className="px-4 py-2 text-right">Pedidos</th>
                <th className="px-4 py-2 text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, i) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image ? (
                        <img src={p.image} alt="" className="h-10 w-10 rounded-sm object-cover border border-border" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium leading-snug">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{p.qty}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{p.orders}</td>
                  <td className="px-4 py-3 text-right font-medium">{brl(p.revenue)}</td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {productQuery.trim()
                      ? `Nenhum produto encontrado para “${productQuery.trim()}”`
                      : "Nenhum produto vendido no período"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!productQuery.trim() && stats.topProducts.length > 10 && (
          <p className="border-t border-border px-5 py-2 text-xs text-muted-foreground">
            Mostrando o top 10. Use a busca para encontrar qualquer produto vendido no período ({stats.topProducts.length} no total).
          </p>
        )}
      </div>

      {/* Recent orders */}
      <div className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-5 py-3 font-medium">Pedidos recentes</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Pagamento</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">#{o.order_number}</td>
                  <td className="px-4 py-2">{o.customer_name}</td>
                  <td className="px-4 py-2 text-xs">
                    {METHOD_LABEL[methodKey(o.payment_method)] ?? o.payment_method ?? "—"}
                  </td>
                  <td className="px-4 py-2">{brl(o.total)}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-accent/20 px-2 py-1 text-xs">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {new Date(o.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {stats.recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum pedido ainda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MethodCard({
  title,
  Icon,
  accent,
  total,
  paid,
  paidRevenue,
  totalRevenue,
}: {
  title: string;
  Icon: typeof Wallet;
  accent: string;
  total: number;
  paid: number;
  paidRevenue: number;
  totalRevenue: number;
}) {
  const rate = total ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Pedidos pagos</p>
          <p className="font-serif text-2xl font-bold text-primary">{paid}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Receita paga</p>
          <p className="font-serif text-xl font-bold text-primary">{brl(paidRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total tentativas</p>
          <p className="text-sm font-medium">{total}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Conversão</p>
          <p className="text-sm font-medium">{rate}%</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Volume total (inclui pendentes): {brl(totalRevenue)}</p>
    </div>
  );
}
