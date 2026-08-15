import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { maskCEP, maskPhone, fetchAddressByCEP } from "@/lib/validation";
import { brl } from "@/lib/format";
import { toSiteImageUrl } from "@/lib/image-url";
import {
  Trash2, Plus, Heart, Package, MapPin, User as UserIcon, Ticket,
  Shield, LogOut, Headphones, ChevronRight, Home, PackageSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStoreSettings } from "@/lib/store-settings";
import { PixReceiptUpload } from "@/components/store/PixReceiptUpload";
import { TrackOrderPanel } from "@/components/store/TrackOrderPanel";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

type SectionKey =
  | "pedidos"
  | "rastreio"
  | "cupons"
  | "cadastro"
  | "enderecos"
  | "favoritos"
  | "seguranca"
  | "atendimento";

export const Route = createFileRoute("/minha-conta")({
  head: () =>
    pageMeta({
      title: `Minha Conta — ${STORE.name}`,
      description: `Gerencie pedidos, endereços e favoritos na sua conta ${STORE.name}.`,
      path: "/minha-conta",
      noindex: true,
    }),
  component: AccountPage,
});

const NAV: { key: SectionKey; icon: any; title: string; desc: string }[] = [
  { key: "pedidos", icon: Package, title: "Pedidos", desc: "Confira o andamento dos seus pedidos." },
  { key: "rastreio", icon: PackageSearch, title: "Rastrear pedido", desc: "Acompanhe a entrega com o código de rastreio." },
  { key: "cupons", icon: Ticket, title: "Créditos e descontos", desc: "Confira os cupons disponíveis." },
  { key: "cadastro", icon: UserIcon, title: "Cadastro", desc: "Altere seus dados cadastrais, e-mail e senha." },
  { key: "enderecos", icon: Home, title: "Endereços", desc: "Altere e gerencie seus endereços salvos." },
  { key: "favoritos", icon: Heart, title: "Favoritos", desc: "Veja seus itens favoritados." },
  { key: "atendimento", icon: Headphones, title: "Atendimento", desc: "Precisa de ajuda? Clique aqui." },
];

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState<SectionKey>("pedidos");
  const [trackCode, setTrackCode] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">Carregando...</div>;
  }

  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "";

  const sectionTitle = NAV.find((n) => n.key === active)?.title ?? "";
  const SectionIcon = NAV.find((n) => n.key === active)?.icon ?? Package;

  const openTracking = (code: string) => {
    setTrackCode(code);
    setActive("rastreio");
  };

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="container mx-auto px-4 py-6 md:py-10">
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Bem-vindo,</p>
                  <p className="truncate font-semibold">{firstName}</p>
                </div>
              </div>
              <button
                onClick={async () => { await signOut(); navigate({ to: "/" }); }}
                className="mt-3 flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <LogOut className="h-4 w-4" />Sair da conta
              </button>
            </div>

            <nav className="space-y-2">
              {NAV.map(({ key, icon: Icon, title, desc }) => {
                const isActive = active === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActive(key)}
                    className={cn(
                      "group relative flex w-full items-start gap-3 rounded-lg border p-4 text-left transition",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", isActive ? "text-primary-foreground" : "text-primary")} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-semibold", isActive ? "text-primary-foreground" : "text-primary")}>{title}</p>
                      <p className={cn("text-xs leading-snug", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {desc}
                      </p>
                    </div>
                    {isActive && (
                      <ChevronRight className="absolute -right-2 top-1/2 hidden h-5 w-5 -translate-y-1/2 rotate-0 text-primary lg:block" />
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main */}
          <main className="rounded-lg border border-border bg-card p-5 md:p-8">
            <header className="mb-6 flex items-center gap-2 border-b border-border pb-4">
              <SectionIcon className="h-5 w-5 text-primary" />
              <h1 className="font-serif text-xl font-bold text-primary md:text-2xl">{sectionTitle}</h1>
            </header>

            {active === "pedidos" && (
              <OrdersTab
                userId={user.id}
                userEmail={user.email ?? ""}
                onTrack={openTracking}
              />
            )}
            {active === "rastreio" && <TrackOrderPanel initialCode={trackCode} embedded />}
            {active === "cupons" && <CouponsTab />}
            {active === "cadastro" && <ProfileTab userId={user.id} />}
            {active === "enderecos" && <AddressesTab userId={user.id} />}
            {active === "favoritos" && <FavoritesTab userId={user.id} />}
            {active === "seguranca" && <SecurityTab email={user.email ?? ""} />}
            {active === "atendimento" && <SupportTab />}
          </main>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-6 flex h-40 w-full max-w-md items-center justify-center rounded-lg bg-muted/40">
        <Package className="h-16 w-16 text-muted-foreground/40" />
      </div>
      <h2 className="text-xl font-semibold text-primary">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function ProfileTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      return data;
    },
  });
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", birth_date: "" });
  useEffect(() => {
    if (data) setForm({
      first_name: data.first_name ?? "",
      last_name: data.last_name ?? "",
      phone: data.phone ?? "",
      birth_date: data.birth_date ?? "",
    });
  }, [data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone.replace(/\D/g, ""),
      birth_date: form.birth_date || null,
    }).eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Dados atualizados");
    qc.invalidateQueries({ queryKey: ["profile", userId] });
  };

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><Label>Nome</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
        <div><Label>Sobrenome</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
      </div>
      <div><Label>CPF</Label><Input value={data?.cpf ?? ""} disabled /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><Label>Data de nascimento</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
        <div><Label>Telefone</Label><Input value={maskPhone(form.phone)} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <Button type="submit">Salvar alterações</Button>
      <div className="mt-8 border-t border-border pt-6">
        <SecurityTab email="" />
      </div>
    </form>
  );
}

function AddressesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["addresses", userId],
    queryFn: async () => {
      const { data } = await supabase.from("addresses").select("*").eq("user_id", userId).order("created_at");
      return data ?? [];
    },
  });
  const [showForm, setShowForm] = useState(false);
  const empty = { label: "", recipient_name: "", zipcode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", is_default: false };
  const [form, setForm] = useState(empty);

  const onCepBlur = async () => {
    const a = await fetchAddressByCEP(form.zipcode);
    if (a) setForm((p) => ({ ...p, ...a }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...form, user_id: userId, zipcode: form.zipcode.replace(/\D/g, "") };
    if (form.is_default) await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
    const { error } = await supabase.from("addresses").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Endereço adicionado");
    setShowForm(false); setForm(empty);
    qc.invalidateQueries({ queryKey: ["addresses", userId] });
  };

  const remove = async (id: string) => {
    await supabase.from("addresses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["addresses", userId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm text-muted-foreground">Meus endereços</h2>
        <Button onClick={() => setShowForm((s) => !s)} size="sm"><Plus className="mr-1 h-4 w-4" />Novo endereço</Button>
      </div>

      {showForm && (
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-border p-6">
          <div><Label>Identificação (ex: Casa)</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div><Label>Destinatário</Label><Input required value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} /></div>
          <div><Label>CEP</Label><Input required value={maskCEP(form.zipcode)} onBlur={onCepBlur} onChange={(e) => setForm({ ...form, zipcode: e.target.value })} /></div>
          <div><Label>Rua</Label><Input required value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
          <div><Label>Número</Label><Input required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
          <div><Label>Complemento</Label><Input value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} /></div>
          <div><Label>Bairro</Label><Input required value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
          <div><Label>Cidade</Label><Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>Estado</Label><Input required maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></div>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />Definir como endereço principal</label>
          <Button type="submit" className="md:col-span-2">Salvar endereço</Button>
        </form>
      )}

      {list.length === 0 ? (
        <EmptyState title="Nenhum endereço cadastrado" description="Adicione um endereço para agilizar suas próximas compras." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="relative rounded-lg border border-border p-4">
              {a.is_default && <span className="absolute right-2 top-2 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Principal</span>}
              <p className="font-medium">{a.label || a.recipient_name}</p>
              <p className="text-sm text-muted-foreground">{a.street}, {a.number} {a.complement && `- ${a.complement}`}</p>
              <p className="text-sm text-muted-foreground">{a.neighborhood} • {a.city}/{a.state}</p>
              <p className="text-sm text-muted-foreground">CEP {maskCEP(a.zipcode)}</p>
              <button onClick={() => remove(a.id)} className="mt-3 inline-flex items-center gap-1 text-sm text-destructive hover:underline"><Trash2 className="h-3 w-3" />Remover</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersTab({
  userId,
  userEmail,
  onTrack,
}: {
  userId: string;
  userEmail: string;
  onTrack?: (code: string) => void;
}) {
  const qc = useQueryClient();
  const { data = [], refetch } = useQuery({
    queryKey: ["orders", userId, userEmail],
    queryFn: async () => {
      // RLS já filtra: user_id = auth.uid() OU e-mail do JWT = customer_email
      const { data } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (data.length === 0) {
    return (
      <EmptyState
        title="Não encontramos nenhum pedido!"
        description="Que tal olhar nossos produtos e receber seu primeiro pedido na porta de casa?!"
      >
        <Button asChild className="mt-6"><Link to="/">Ver produtos</Link></Button>
      </EmptyState>
    );
  }

  const statusLabel: Record<string, string> = {
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

  const paymentLabel = (method: string | null | undefined) => {
    if (method === "pix") return "Pix";
    if (method === "credit_card") return "Cartão de crédito";
    return method || "—";
  };

  const formatAddress = (addr: Record<string, unknown> | null | undefined) => {
    if (!addr || typeof addr !== "object") return null;
    const street = String(addr.street ?? "");
    const number = String(addr.number ?? "");
    const complement = addr.complement ? ` — ${addr.complement}` : "";
    const neighborhood = String(addr.neighborhood ?? "");
    const city = String(addr.city ?? "");
    const state = String(addr.state ?? "");
    const zip = String(addr.zipcode ?? addr.zip ?? addr.zipCode ?? "");
    if (!street && !city) return null;
    return {
      line1: `${street}${number ? `, ${number}` : ""}${complement}`,
      line2: [neighborhood, city && state ? `${city}/${state}` : city || state].filter(Boolean).join(" · "),
      zip: zip ? `CEP ${maskCEP(String(zip).replace(/\D/g, "").padStart(8, "0").slice(0, 8))}` : "",
    };
  };

  return (
    <div className="space-y-4">
      {data.map((o: any) => {
        const pay = (o.payment_status ?? "pending").toLowerCase();
        const canUploadReceipt =
          o.payment_method === "pix" &&
          o.status === "pending" &&
          pay !== "confirmed" &&
          pay !== "paid";
        const hasReceipt = Boolean(o.pix_receipt_path);
        const items = (o.order_items ?? []) as Array<{
          id: string;
          product_name: string;
          product_image: string | null;
          quantity: number;
          unit_price: number;
          total: number;
        }>;
        const itemQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        const address = formatAddress(o.shipping_address);
        const createdAt = new Date(o.created_at);

        return (
          <article key={o.id} className="overflow-hidden rounded-lg border border-border">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="font-semibold text-foreground">Pedido {o.order_number}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {createdAt.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                  {" · "}
                  {createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  {statusLabel[o.status] ?? o.status}
                </span>
                {hasReceipt && o.status === "pending" && (
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
                    Comprovante enviado
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4 p-4">
              {items.length > 0 ? (
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <div className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40">
                        {item.product_image ? (
                          <img
                            src={toSiteImageUrl(item.product_image)}
                            alt={item.product_name}
                            className="h-full w-full object-contain p-1"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground">{item.product_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Qtd. {item.quantity} · {brl(Number(item.unit_price))} cada
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-foreground">
                        {brl(Number(item.total))}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {itemQty || 0} item(s) · detalhes indisponíveis
                </p>
              )}

              <div className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pagamento</p>
                  <p className="text-foreground">{paymentLabel(o.payment_method)}</p>
                  {o.coupon_code && (
                    <p className="text-xs text-muted-foreground">Cupom: {o.coupon_code}</p>
                  )}
                </div>
                {address && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entrega</p>
                    <p className="text-foreground">{address.line1}</p>
                    {address.line2 && <p className="text-xs text-muted-foreground">{address.line2}</p>}
                    {address.zip && <p className="text-xs text-muted-foreground">{address.zip}</p>}
                  </div>
                )}
              </div>

              <div className="space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal ({itemQty} {itemQty === 1 ? "item" : "itens"})</span>
                  <span>{brl(Number(o.subtotal))}</span>
                </div>
                {Number(o.discount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Desconto</span>
                    <span>−{brl(Number(o.discount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Frete</span>
                  <span>{Number(o.shipping) === 0 ? "Grátis" : brl(Number(o.shipping))}</span>
                </div>
                <div className="flex justify-between pt-1 text-base font-semibold text-foreground">
                  <span>Total</span>
                  <span>{brl(Number(o.total))}</span>
                </div>
              </div>

              {o.tracking_code && (
                <div className="rounded-sm border border-border bg-muted/20 px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">Rastreio: </span>
                  {onTrack ? (
                    <button
                      type="button"
                      onClick={() => onTrack(o.tracking_code)}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.tracking_code}
                    </button>
                  ) : (
                    <Link
                      to="/rastreio"
                      search={{ codigo: o.tracking_code }}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.tracking_code}
                    </Link>
                  )}
                  {o.carrier ? (
                    <span className="text-muted-foreground"> ({o.carrier})</span>
                  ) : null}
                </div>
              )}

              {canUploadReceipt && (
                <PixReceiptUpload
                  orderId={o.id}
                  token={o.pix_receipt_token}
                  alreadyUploaded={hasReceipt}
                  compact
                  onUploaded={() => {
                    qc.invalidateQueries({ queryKey: ["orders", userId, userEmail] });
                    refetch();
                  }}
                />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FavoritesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["favorites", userId],
    queryFn: async () => {
      const { data } = await supabase.from("favorites").select("id, product:products(id, slug, name, price, image_url)").eq("user_id", userId);
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    await supabase.from("favorites").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["favorites", userId] });
  };

  if (data.length === 0) {
    return <EmptyState title="Sua lista de favoritos está vazia" description="Explore nossa loja e favorite os vinhos que mais te interessam." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((f: any) => f.product && (
        <div key={f.id} className="rounded-lg border border-border p-4">
          <Link to="/produto/$slug" params={{ slug: f.product.slug }} className="block">
            {f.product.image_url && <img src={toSiteImageUrl(f.product.image_url)} alt={f.product.name} className="mx-auto h-40 object-contain" />}
            <p className="mt-2 font-medium line-clamp-2">{f.product.name}</p>
            <p className="text-sm text-primary font-semibold">{brl(Number(f.product.price))}</p>
          </Link>
          <button onClick={() => remove(f.id)} className="mt-2 text-xs text-destructive hover:underline">Remover</button>
        </div>
      ))}
    </div>
  );
}

function CouponsTab() {
  const { data = [] } = useQuery({
    queryKey: ["coupons-active"],
    queryFn: async () => {
      const { listActiveCouponsFn } = await import("@/lib/coupon.functions");
      return await listActiveCouponsFn();
    },
  });

  if (data.length === 0) {
    return <EmptyState title="Nenhum cupom disponível" description="Fique de olho — em breve novos cupons e descontos especiais para você." />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.map((c: any) => (
        <div key={c.code} className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="font-mono text-lg font-bold text-primary">{c.code}</p>
          <p className="text-sm">{c.description}</p>
          {c.expires_at && <p className="mt-1 text-xs text-muted-foreground">Válido até {new Date(c.expires_at).toLocaleDateString("pt-BR")}</p>}
        </div>
      ))}
    </div>
  );
}


function SecurityTab({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState(email);
  const [newPassword, setNewPassword] = useState("");

  const updateEmail = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return toast.error(error.message);
    toast.success("Confirme a alteração no seu novo e-mail");
  };
  const updatePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error("Mínimo 8 caracteres");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada"); setNewPassword("");
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {email !== "" && (
        <form onSubmit={updateEmail} className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Shield className="h-4 w-4 text-primary" />Alterar e-mail</h3>
          <div><Label>Novo e-mail</Label><Input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
          <Button type="submit" size="sm">Atualizar e-mail</Button>
        </form>
      )}
      <form onSubmit={updatePassword} className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Shield className="h-4 w-4 text-primary" />Alterar senha</h3>
        <div><Label>Nova senha</Label><Input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
        <Button type="submit" size="sm">Atualizar senha</Button>
      </form>
    </div>
  );
}

function SupportTab() {
  const { data: settings } = useStoreSettings();
  const phoneDisplay = settings?.footer?.phone?.trim() ?? "";
  const phoneDigits = phoneDisplay.replace(/\D/g, "");
  const email = settings?.footer?.email ?? "";
  const phoneHref = phoneDigits ? `tel:+55${phoneDigits}` : undefined;

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-muted-foreground">Nossa equipe está pronta para te ajudar. Escolha um canal de atendimento:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {phoneHref ? (
          <a href={phoneHref} className="rounded-lg border border-border p-4 hover:border-primary">
            <p className="font-semibold text-primary">Telefone</p>
            <p className="text-sm text-muted-foreground">{phoneDisplay}</p>
          </a>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Telefone não configurado no painel admin.
          </div>
        )}
        {email ? (
          <a href={`mailto:${email}`} className="rounded-lg border border-border p-4 hover:border-primary">
            <p className="font-semibold text-primary">E-mail</p>
            <p className="text-sm text-muted-foreground">{email}</p>
          </a>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            E-mail não configurado no painel admin.
          </div>
        )}
      </div>
    </div>
  );
}
