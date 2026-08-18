import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import {
  LogIn,
  LogOut,
  Package,
  ShoppingCart,
  Image as ImageIcon,
  LayoutDashboard,
  Users,
  Tag,
  Settings,
  FolderTree,
  FolderOpen,
  FileText,
  Trash2,
  Plus,
} from "lucide-react";
import {
  POLICY_SHIPPING_METHOD,
  DEFAULT_SETTINGS,
  fetchStoreSettings,
  saveStoreSettings,
  type StoreSettingsData,
  type ShippingMethod,
  type ShippingRegion,
  type FooterLink,
  type InstitutionalPage,
} from "@/lib/store-settings";
import { normalizeClarityId, trackingActiveItems } from "@/lib/analytics";
import { confirmPaymentFromReceipt, getPixReceiptSignedUrl } from "@/lib/pix-receipt.functions";
import { useServerFn } from "@tanstack/react-start";
import { MediaLibrary, MediaPickerDialog } from "@/components/admin/MediaLibrary";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { toSiteImageUrl } from "@/lib/image-url";
import { getProductFeedAbsoluteUrl } from "@/lib/product-feed-xml";
import { countries } from "@/lib/countries";
import { flagUrlFor } from "@/lib/country-flags";
import { productHtmlToPlainText } from "@/lib/html-content";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageMeta({
      title: `Admin — ${STORE.name}`,
      description: `Painel administrativo da ${STORE.name}.`,
      path: "/admin",
      noindex: true,
    }),
  component: Admin,
});

type TabId =
  | "dashboard"
  | "products"
  | "banners"
  | "orders"
  | "customers"
  | "coupons"
  | "categories"
  | "media"
  | "footer"
  | "settings";

/** Reusable image picker: URL input + styled file upload button + preview with cache-bust. */
function ImageField({
  value,
  onChange,
  bucket,
  placeholder = "https://...",
  previewClass = "mt-2 h-32 w-full max-w-md rounded-sm object-cover border border-border",
}: {
  value: string | null | undefined;
  onChange: (url: string) => void;
  bucket: "product-images" | "banner-images";
  placeholder?: string;
  previewClass?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputId = `file-${bucket}-${Math.random().toString(36).slice(2, 8)}`;
  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem acima de 10MB");
      return;
    }
    setUploading(true);
    // Hash-based filename so identical content reuses the same Storage key.
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${hash}.${ext}`;
    // List bucket to check for duplicate
    const { data: existing } = await supabase.storage.from(bucket).list("", { search: hash });
    const dup = (existing ?? []).find((f) => f.name.startsWith(hash));
    if (dup) {
      setUploading(false);
      const reuse = confirm(
        "Essa imagem já existe na biblioteca. Deseja reutilizar a existente? (Cancelar = enviar nova cópia)",
      );
      if (reuse) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(dup.name);
        onChange(toSiteImageUrl(data.publicUrl));
        toast.success("Imagem reutilizada da biblioteca");
        return;
      }
      // Force new upload with timestamp suffix
      const altPath = `${hash}-${Date.now().toString(36)}.${ext}`;
      setUploading(true);
      const { error: e2 } = await supabase.storage.from(bucket).upload(altPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      setUploading(false);
      if (e2) {
        toast.error(e2.message);
        return;
      }
      onChange(toSiteImageUrl(supabase.storage.from(bucket).getPublicUrl(altPath).data.publicUrl));
      toast.success("Imagem enviada");
      return;
    }
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(toSiteImageUrl(data.publicUrl));
    toast.success("Imagem enviada");
  }
  const preview = value
    ? `${toSiteImageUrl(value)}${value.includes("?") ? "&" : "?"}t=${encodeURIComponent(value)}`
    : "";
  return (
    <div className="space-y-2">
      <input
        className={inp}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap items-center gap-3">
        <input id={inputId} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-sm border border-border bg-cream px-4 py-2 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          {uploading ? "Enviando…" : "📁 Escolher arquivo"}
        </label>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          📚 Biblioteca
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-sm text-destructive hover:underline"
          >
            Remover
          </button>
        )}
        <span className="text-xs text-muted-foreground">PNG, JPG ou WebP (máx 10MB)</span>
      </div>
      {value && (
        <img
          key={value}
          src={preview}
          alt=""
          className={previewClass}
          onError={(e) => {
            (e.target as HTMLImageElement).src = value;
          }}
        />
      )}
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        defaultBucket={bucket}
        onSelect={onChange}
      />
    </div>
  );
}

function storagePathFromPublicUrl(
  url: string | null | undefined,
  bucket: "product-images" | "banner-images",
) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

async function removeCategoryBannerIfUnused(
  url: string | null | undefined,
  currentCategoryId?: string,
) {
  if (!url) return;
  const path = storagePathFromPublicUrl(url, "banner-images");
  if (!path) return;
  const previousUrl = url;

  const [{ data: categories }, { data: banners }, { data: settings }] = await Promise.all([
    supabase.from("categories").select("id,banner_image").eq("banner_image", previousUrl),
    supabase.from("banners").select("id,image_url").eq("image_url", previousUrl),
    supabase.from("store_settings").select("id,data"),
  ]);
  const usedByAnotherCategory = (categories ?? []).some((c: any) => c.id !== currentCategoryId);
  const usedByBanner = (banners ?? []).length > 0;
  const usedBySettings = (settings ?? []).some((row: any) =>
    JSON.stringify(row.data ?? {}).includes(previousUrl),
  );

  if (!usedByAnotherCategory && !usedByBanner && !usedBySettings) {
    await supabase.storage.from("banner-images").remove([path]);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="md:col-span-2">
      <h3 className="mb-3 mt-2 border-b border-border pb-2 font-serif text-base font-bold text-primary">
        {title}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Admin() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<TabId>("dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  if (!user) return <Login />;
  if (!isAdmin) return <NotAdmin email={user.email} />;

  const tabs: { id: TabId; label: string; Icon: typeof Package }[] = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { id: "products", label: "Produtos", Icon: Package },
    { id: "categories", label: "Categorias", Icon: FolderTree },
    { id: "orders", label: "Pedidos", Icon: ShoppingCart },
    { id: "customers", label: "Clientes", Icon: Users },
    { id: "coupons", label: "Cupons", Icon: Tag },
    { id: "banners", label: "Banners", Icon: ImageIcon },
    { id: "media", label: "Mídia", Icon: FolderOpen },

    { id: "footer", label: "Rodapé & Páginas", Icon: FileText },
    { id: "settings", label: "Configurações", Icon: Settings },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-primary">Painel Admin</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <LogOut className="h-4 w-4" /> Sair ({user.email})
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <t.Icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <AdminDashboard />}
      {tab === "products" && <ProductsAdmin />}
      {tab === "categories" && <CategoriesAdmin />}
      {tab === "banners" && <BannersAdmin />}
      {tab === "orders" && <OrdersAdmin />}
      {tab === "customers" && <CustomersAdmin />}
      {tab === "coupons" && <CouponsAdmin />}
      {tab === "media" && (
        <div>
          <h2 className="mb-1 font-serif text-2xl font-bold text-primary">Biblioteca de Mídia</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Gerencie todas as imagens da loja: produtos, banners, categorias e logo. Reutilize
            imagens existentes para evitar duplicatas.
          </p>
          <MediaLibrary />
        </div>
      )}

      {tab === "footer" && <FooterAdmin />}
      {tab === "settings" && <SettingsAdmin />}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado");
      } else {
        const redirectUrl = `${window.location.origin}/admin`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast.success("Conta criada.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-sm border border-border bg-card p-8">
        <h1 className="mb-2 font-serif text-2xl font-bold text-primary">Painel Admin</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Acesso restrito à administração da loja.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />{" "}
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button
          onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-primary"
        >
          {mode === "login" ? "Não tem conta? Cadastrar" : "Já tem conta? Entrar"}
        </button>
        <p className="mt-6 text-xs text-muted-foreground">
          Após criar a conta, defina seu papel como <code>admin</code> na tabela{" "}
          <code>user_roles</code>.
        </p>
        <Link to="/" className="mt-4 block text-center text-xs text-primary hover:underline">
          ← Voltar à loja
        </Link>
      </div>
    </div>
  );
}

function NotAdmin({ email }: { email?: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-serif text-2xl font-bold text-primary">Acesso negado</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sua conta ({email}) ainda não é admin.</p>
      <p className="mt-4 text-xs text-muted-foreground">
        Adicione um registro em <code>user_roles</code> com role <code>admin</code> para o seu
        user_id.
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

/* ---------- Products ---------- */
function ProductsAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  async function load() {
    setLoading(true);
    try {
      const [ps, { data: cs, error: catErr }] = await Promise.all([
        fetchAllProducts(),
        supabase.from("categories").select("*").order("sort_order"),
      ]);
      if (catErr) throw catErr;
      setItems(ps ?? []);
      setCats(cs ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar produtos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllProducts() {
    const all = [];
    const page = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + page - 1);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < page) break;
      from += page;
    }
    return all;
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      load();
    }
  }

  if (editing)
    return (
      <ProductForm
        key={editing?.id ?? "new"}
        cats={cats}
        initial={editing}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );

  const filtered = items.filter((p) => {
    if (statusFilter === "active" && !p.is_active) return false;
    if (statusFilter === "inactive" && p.is_active) return false;
    if (!q) return true;
    const query = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      (p.slug ?? "").includes(query) ||
      (p.sku ?? "").toLowerCase().includes(query)
    );
  });
  const activeCount = items.filter((p) => p.is_active).length;
  const inactiveCount = items.length - activeCount;
  const feedUrl = getProductFeedAbsoluteUrl();

  return (
    <div>
      <div className="mb-4 rounded-sm border border-border bg-card p-4">
        <h3 className="font-serif text-sm font-bold text-primary">Feed XML de produtos</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Arquivo no formato Google Merchant / WebToffee com produtos ativos (categoria, preço,
          GTIN/EAN-13, imagem, estoque).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-xs break-all">{feedUrl}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(feedUrl);
              toast.success("URL copiada");
            }}
            className="rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Copiar URL
          </button>
          <a
            href={feedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Abrir XML
          </a>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Buscar produto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos ({items.length})</option>
            <option value="active">Ativos ({activeCount})</option>
            <option value="inactive">Inativos ({inactiveCount})</option>
          </select>
          <p className="text-sm text-muted-foreground">{filtered.length} produtos</p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Novo produto
        </button>
      </div>
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image_url && (
                        <img
                          src={toSiteImageUrl(p.image_url)}
                          alt=""
                          className="h-10 w-8 object-contain"
                        />
                      )}
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{brl(p.price)}</td>
                  <td className="px-4 py-3">{p.stock}</td>
                  <td className="px-4 py-3">{p.is_active ? "Ativo" : "Inativo"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(p)} className="text-primary hover:underline">
                      Editar
                    </button>
                    <button
                      onClick={() => del(p.id)}
                      className="ml-4 text-destructive hover:underline"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function toEditableDescription(value: string | null | undefined) {
  if (!value) return "";
  if (value.includes("\\n") || /<[a-z][\s\S]*>/i.test(value)) {
    return productHtmlToPlainText(value.replace(/\\n/g, "\n").replace(/\\r/g, ""));
  }
  return value;
}

function ProductForm({
  initial,
  cats,
  onClose,
}: {
  initial: any;
  cats: any[];
  onClose: () => void;
}) {
  const [f, setF] = useState<any>({
    name: "",
    slug: "",
    sku: "",
    gtin: "",
    short_description: "",
    description: "",
    price: 0,
    compare_at_price: null,
    stock: 0,
    image_url: "",
    video_url: "",
    category_id: null,
    country: "",
    region: "",
    grape: "",
    wine_type: "",
    classification: "",
    brand: "",
    vintage: "",
    alcohol_content: "",
    aging: "",
    wine_style: "",
    serving_temp: "",
    glass_type: "",
    decanting: "",
    visual_notes: "",
    nose_notes: "",
    palate_notes: "",
    harmonization: "",
    harmonizacao: [],
    selo: [],
    rating: null,
    vivino_rating: null,
    featured: false,
    best_seller: false,
    is_active: true,
    ...initial,
    short_description: toEditableDescription(initial?.short_description),
    description: toEditableDescription(initial?.description),
  });
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [allProducts, setAllProducts] = useState<
    { id: string; name: string; slug: string; image_url: string | null }[]
  >([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<
    { id: string; name: string; image_url: string | null }[]
  >([]);
  const [suggestionSearch, setSuggestionSearch] = useState("");

  useEffect(() => {
    supabase
      .from("products")
      .select("id, name, slug, image_url")
      .order("name")
      .then(({ data }) => setAllProducts(data ?? []));
  }, []);

  // Carrega categorias já vinculadas quando editando
  useEffect(() => {
    if (!initial?.id) {
      setSelectedCats(initial?.category_id ? [initial.category_id] : []);
      return;
    }
    supabase
      .from("product_categories")
      .select("category_id")
      .eq("product_id", initial.id)
      .then(({ data }) => setSelectedCats((data ?? []).map((r: any) => r.category_id)));
  }, [initial?.id]);

  useEffect(() => {
    if (!initial?.id) {
      setSelectedSuggestions([]);
      return;
    }
    supabase
      .from("product_suggestions")
      .select(
        "sort_order, products!product_suggestions_suggested_product_id_fkey(id, name, image_url)",
      )
      .eq("product_id", initial.id)
      .order("sort_order")
      .then(({ data }) => {
        const items = (data ?? []).map((r: any) => r.products).filter(Boolean) as {
          id: string;
          name: string;
          image_url: string | null;
        }[];
        setSelectedSuggestions(items);
      });
  }, [initial?.id]);

  const upd = (k: string) => (e: any) =>
    setF((p: any) => ({
      ...p,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));
  const updArr = (k: string) => (e: any) =>
    setF((p: any) => ({
      ...p,
      [k]: e.target.value
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
    }));

  const toggleCat = (id: string) =>
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addSuggestion = (p: { id: string; name: string; image_url: string | null }) => {
    if (p.id === initial?.id) return;
    if (selectedSuggestions.some((s) => s.id === p.id)) return;
    if (selectedSuggestions.length >= 3) {
      toast.error("Máximo de 3 produtos sugeridos");
      return;
    }
    setSelectedSuggestions((prev) => [...prev, p]);
    setSuggestionSearch("");
  };

  const removeSuggestion = (id: string) =>
    setSelectedSuggestions((prev) => prev.filter((s) => s.id !== id));

  async function save() {
    if (!f.name || !f.slug || !f.price) {
      toast.error("Nome, slug e preço são obrigatórios");
      return;
    }
    setSaving(true);
    const num = (v: any) => (v === "" || v === null || v === undefined ? null : Number(v));
    const payload: any = {
      ...f,
      price: Number(f.price),
      stock: Number(f.stock) || 0,
      compare_at_price: num(f.compare_at_price),
      rating: num(f.rating),
      vivino_rating: num(f.vivino_rating),
      gtin: (f.gtin || "").replace(/\D/g, "") || null,
      harmonizacao: Array.isArray(f.harmonizacao) ? f.harmonizacao : [],
      selo: Array.isArray(f.selo) ? f.selo : [],
      category_id: selectedCats[0] ?? null,
    };
    delete payload.categories;

    let productId = initial?.id as string | undefined;
    let error: any = null;
    if (productId) {
      ({ error } = await supabase.from("products").update(payload).eq("id", productId));
    } else {
      const { data, error: insErr } = await supabase
        .from("products")
        .insert(payload)
        .select("id")
        .single();
      error = insErr;
      productId = data?.id;
    }
    if (error || !productId) {
      setSaving(false);
      toast.error(error?.message ?? "Erro ao salvar");
      return;
    }

    // Sincroniza product_categories com a seleção do admin.
    // O trigger já cuidou das categorias derivadas (tintos/brancos/combos…),
    // então só removemos/inserimos as categorias manualmente escolhidas aqui.
    const { data: existing } = await supabase
      .from("product_categories")
      .select("category_id")
      .eq("product_id", productId);
    const existingIds = new Set((existing ?? []).map((r: any) => r.category_id));
    const desired = new Set(selectedCats);
    const toAdd = [...desired].filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !desired.has(id));

    // Só removemos as que estavam selecionadas pelo admin antes e não estão mais.
    // Categorias derivadas pelo trigger ficam intocadas (não as removemos manualmente).
    const prevAdminSelection: string[] = JSON.parse(
      sessionStorage.getItem(`pc:${productId}`) ?? "[]",
    );
    const removeManual = toRemove.filter((id) => prevAdminSelection.includes(id));

    if (removeManual.length) {
      await supabase
        .from("product_categories")
        .delete()
        .eq("product_id", productId)
        .in("category_id", removeManual);
    }
    if (toAdd.length) {
      await supabase
        .from("product_categories")
        .insert(toAdd.map((category_id) => ({ product_id: productId, category_id })));
    }
    sessionStorage.setItem(`pc:${productId}`, JSON.stringify(selectedCats));

    await supabase.from("product_suggestions").delete().eq("product_id", productId);
    if (selectedSuggestions.length) {
      const { error: sugErr } = await supabase.from("product_suggestions").insert(
        selectedSuggestions.map((s, i) => ({
          product_id: productId,
          suggested_product_id: s.id,
          sort_order: i,
        })),
      );
      if (sugErr) {
        setSaving(false);
        toast.error(sugErr.message);
        return;
      }
    }

    setSaving(false);
    toast.success("Salvo");
    onClose();
  }

  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  const lbl = "text-xs uppercase text-muted-foreground";
  const flag = flagUrlFor(f.country);

  // Section moved to module scope to avoid remounting on every keystroke.

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="mb-4 flex justify-between">
        <h2 className="font-serif text-xl font-bold text-primary">
          {initial?.id ? "Editar" : "Novo"} produto
        </h2>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-primary">
          ← Voltar
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Identificação">
          <label className="md:col-span-2">
            <span className={lbl}>Nome</span>
            <input className={inp} value={f.name} onChange={upd("name")} />
          </label>
          <label>
            <span className={lbl}>Slug</span>
            <input
              className={inp}
              value={f.slug}
              onChange={upd("slug")}
              placeholder="cabernet-2020"
            />
          </label>
          <label>
            <span className={lbl}>SKU</span>
            <input className={inp} value={f.sku ?? ""} onChange={upd("sku")} />
          </label>
          <label>
            <span className={lbl}>GTIN / EAN-13</span>
            <input
              className={inp}
              value={f.gtin ?? ""}
              onChange={upd("gtin")}
              placeholder="8054181280456"
              inputMode="numeric"
            />
          </label>
          <label>
            <span className={lbl}>Marca / Produtor</span>
            <input className={inp} value={f.brand ?? ""} onChange={upd("brand")} />
          </label>
          <div className="md:col-span-2">
            <span className={lbl}>
              Categorias{" "}
              <span className="ml-2 text-[11px] normal-case text-muted-foreground">
                ({selectedCats.length} selecionada{selectedCats.length === 1 ? "" : "s"})
              </span>
            </span>
            <input
              className={inp + " mt-1"}
              placeholder="Filtrar categorias…"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
            />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-sm border border-border bg-background p-2">
              {cats
                .filter(
                  (c) =>
                    !catSearch ||
                    c.name.toLowerCase().includes(catSearch.toLowerCase()) ||
                    (c.slug ?? "").includes(catSearch.toLowerCase()),
                )
                .map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCats.includes(c.id)}
                      onChange={() => toggleCat(c.id)}
                    />
                    <span>{c.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{c.slug}</span>
                  </label>
                ))}
              {cats.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  Nenhuma categoria cadastrada ainda.
                </p>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Categorias automáticas (tintos, brancos, espumantes, combos…) são aplicadas pelo
              sistema com base no nome/tipo do produto.
            </p>
          </div>
          <label className="md:col-span-2">
            <span className={lbl}>Descrição curta</span>
            <input
              className={inp}
              value={f.short_description ?? ""}
              onChange={upd("short_description")}
            />
          </label>
          <label className="md:col-span-2">
            <span className={lbl}>Descrição</span>
            <textarea
              className={inp}
              rows={4}
              value={f.description ?? ""}
              onChange={upd("description")}
            />
          </label>
        </Section>

        <Section title="Preço e estoque">
          <label>
            <span className={lbl}>Preço</span>
            <input
              type="number"
              step="0.01"
              className={inp}
              value={f.price}
              onChange={upd("price")}
            />
          </label>
          <label>
            <span className={lbl}>Preço de (riscado)</span>
            <input
              type="number"
              step="0.01"
              className={inp}
              value={f.compare_at_price ?? ""}
              onChange={upd("compare_at_price")}
            />
          </label>
          <label>
            <span className={lbl}>Estoque</span>
            <input type="number" className={inp} value={f.stock} onChange={upd("stock")} />
          </label>
        </Section>

        <Section title="Origem e ficha">
          <label>
            <span className={lbl}>País</span>
            <div className="flex items-center gap-2">
              <select className={inp} value={f.country ?? ""} onChange={upd("country")}>
                <option value="">— selecionar —</option>
                {countries.map((c) => (
                  <option key={c.slug} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </select>
              {flag && (
                <img
                  src={flag}
                  alt=""
                  className="h-8 w-8 rounded-full border border-border object-cover"
                />
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              A bandeira é puxada automaticamente pelo país.
            </p>
          </label>
          <label>
            <span className={lbl}>Região</span>
            <input className={inp} value={f.region ?? ""} onChange={upd("region")} />
          </label>
          <label>
            <span className={lbl}>Uva</span>
            <input className={inp} value={f.grape ?? ""} onChange={upd("grape")} />
          </label>
          <label>
            <span className={lbl}>Tipo de vinho</span>
            <input
              className={inp}
              value={f.wine_type ?? ""}
              onChange={upd("wine_type")}
              placeholder="Tinto / Branco / Rosé / Espumante"
            />
          </label>
          <label>
            <span className={lbl}>Classificação</span>
            <input
              className={inp}
              value={f.classification ?? ""}
              onChange={upd("classification")}
            />
          </label>
          <label>
            <span className={lbl}>Estilo</span>
            <input className={inp} value={f.wine_style ?? ""} onChange={upd("wine_style")} />
          </label>
          <label>
            <span className={lbl}>Safra</span>
            <input className={inp} value={f.vintage ?? ""} onChange={upd("vintage")} />
          </label>
          <label>
            <span className={lbl}>Teor alcoólico</span>
            <input
              className={inp}
              value={f.alcohol_content ?? ""}
              onChange={upd("alcohol_content")}
              placeholder="13,5%"
            />
          </label>
          <label>
            <span className={lbl}>Envelhecimento</span>
            <input className={inp} value={f.aging ?? ""} onChange={upd("aging")} />
          </label>
          <label>
            <span className={lbl}>Temperatura de serviço</span>
            <input
              className={inp}
              value={f.serving_temp ?? ""}
              onChange={upd("serving_temp")}
              placeholder="18°C"
            />
          </label>
          <label>
            <span className={lbl}>Taça</span>
            <input className={inp} value={f.glass_type ?? ""} onChange={upd("glass_type")} />
          </label>
          <label>
            <span className={lbl}>Decantação</span>
            <input className={inp} value={f.decanting ?? ""} onChange={upd("decanting")} />
          </label>
        </Section>

        <Section title="Notas de degustação">
          <label className="md:col-span-2">
            <span className={lbl}>Visual</span>
            <input className={inp} value={f.visual_notes ?? ""} onChange={upd("visual_notes")} />
          </label>
          <label className="md:col-span-2">
            <span className={lbl}>Aroma</span>
            <textarea
              className={inp}
              rows={2}
              value={f.nose_notes ?? ""}
              onChange={upd("nose_notes")}
            />
          </label>
          <label className="md:col-span-2">
            <span className={lbl}>Paladar</span>
            <textarea
              className={inp}
              rows={2}
              value={f.palate_notes ?? ""}
              onChange={upd("palate_notes")}
            />
          </label>
          <label className="md:col-span-2">
            <span className={lbl}>Harmonização (texto)</span>
            <textarea
              className={inp}
              rows={2}
              value={f.harmonization ?? ""}
              onChange={upd("harmonization")}
            />
          </label>
          <label className="md:col-span-2">
            <span className={lbl}>Harmonização (tags, separe por vírgula)</span>
            <input
              className={inp}
              value={(f.harmonizacao ?? []).join(", ")}
              onChange={updArr("harmonizacao")}
              placeholder="Carnes vermelhas, Queijos, Massas"
            />
          </label>
          <label className="md:col-span-2">
            <span className={lbl}>Selos / prêmios (vírgula)</span>
            <input
              className={inp}
              value={(f.selo ?? []).join(", ")}
              onChange={updArr("selo")}
              placeholder="Decanter 92, Wine Spectator"
            />
          </label>
          <label>
            <span className={lbl}>Avaliação interna (0-5)</span>
            <input
              type="number"
              step="0.1"
              className={inp}
              value={f.rating ?? ""}
              onChange={upd("rating")}
            />
          </label>
          <label>
            <span className={lbl}>Nota Vivino</span>
            <input
              type="number"
              step="0.1"
              className={inp}
              value={f.vivino_rating ?? ""}
              onChange={upd("vivino_rating")}
            />
          </label>
        </Section>

        <Section title="Mídia">
          <div className="md:col-span-2">
            <span className={lbl}>Imagem principal</span>
            <ImageField
              value={f.image_url}
              onChange={(url) => setF((p: any) => ({ ...p, image_url: url }))}
              bucket="product-images"
            />
          </div>
          <label className="md:col-span-2">
            <span className={lbl}>Vídeo do produto (YouTube, Vimeo ou .mp4)</span>
            <input
              className={inp}
              value={f.video_url ?? ""}
              onChange={upd("video_url")}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>
        </Section>

        <Section title="Produtos sugeridos">
          <div className="md:col-span-2">
            <span className={lbl}>
              Sugestões na página do produto{" "}
              <span className="ml-2 text-[11px] normal-case text-muted-foreground">
                ({selectedSuggestions.length}/3)
              </span>
            </span>
            {selectedSuggestions.length > 0 && (
              <div className="mt-2 space-y-2">
                {selectedSuggestions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-sm border border-border bg-background px-3 py-2"
                  >
                    {s.image_url && (
                      <img
                        src={toSiteImageUrl(s.image_url)}
                        alt=""
                        className="h-10 w-8 object-contain"
                      />
                    )}
                    <span className="flex-1 text-sm">{s.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSuggestion(s.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selectedSuggestions.length < 3 && (
              <>
                <input
                  className={inp + " mt-2"}
                  placeholder="Buscar produto pelo nome…"
                  value={suggestionSearch}
                  onChange={(e) => setSuggestionSearch(e.target.value)}
                />
                {suggestionSearch.trim() && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-sm border border-border bg-background p-2">
                    {allProducts
                      .filter((p) => p.id !== initial?.id)
                      .filter((p) => !selectedSuggestions.some((s) => s.id === p.id))
                      .filter((p) => p.name.toLowerCase().includes(suggestionSearch.toLowerCase()))
                      .slice(0, 20)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addSuggestion(p)}
                          className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                        >
                          {p.image_url && (
                            <img
                              src={toSiteImageUrl(p.image_url)}
                              alt=""
                              className="h-8 w-6 object-contain"
                            />
                          )}
                          <span>{p.name}</span>
                        </button>
                      ))}
                    {allProducts.filter(
                      (p) =>
                        p.id !== initial?.id &&
                        !selectedSuggestions.some((s) => s.id === p.id) &&
                        p.name.toLowerCase().includes(suggestionSearch.toLowerCase()),
                    ).length === 0 && (
                      <p className="px-2 py-3 text-sm text-muted-foreground">
                        Nenhum produto encontrado.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Exibidos abaixo do botão de compra na página do produto.
            </p>
          </div>
        </Section>

        <Section title="Publicação">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!f.featured} onChange={upd("featured")} /> Destaque
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!f.best_seller} onChange={upd("best_seller")} /> Mais
            vendido
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!f.is_active} onChange={upd("is_active")} /> Ativo
          </label>
        </Section>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-sm bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button onClick={onClose} className="rounded-sm border border-border px-6 py-2 text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ---------- Banners ---------- */
function BannersAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  async function load() {
    const { data } = await supabase.from("banners").select("*").order("sort_order");
    setItems(data ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(b: any) {
    const payload = { ...b };
    delete payload.id;
    delete payload.created_at;
    const { error } = b.id
      ? await supabase.from("banners").update(payload).eq("id", b.id)
      : await supabase.from("banners").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      setEditing(null);
      load();
    }
  }
  async function del(id: string) {
    if (!confirm("Excluir?")) return;
    await supabase.from("banners").delete().eq("id", id);
    load();
  }

  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  if (editing)
    return (
      <div className="space-y-3 rounded-sm border border-border bg-card p-6">
        <h2 className="font-serif text-xl font-bold text-primary">
          {editing.id ? "Editar" : "Novo"} banner
        </h2>
        <p className="text-sm text-muted-foreground">
          Na home, o hero ocupa 100% da largura da tela. Use posições separadas para desktop e
          mobile. Título serve só para acessibilidade; link opcional torna o banner clicável.
        </p>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Título (acessibilidade)</span>
          <input
            className={inp}
            value={editing.title ?? ""}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Link (opcional)</span>
          <input
            className={inp}
            value={editing.link_url ?? ""}
            onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
            placeholder="https://..."
          />
        </label>
        <div className="block">
          <span className="text-xs uppercase text-muted-foreground">Imagem</span>
          <ImageField
            value={editing.image_url}
            onChange={(url) => setEditing({ ...editing, image_url: url })}
            bucket="banner-images"
            previewClass="mt-2 max-h-48 w-full rounded-sm object-contain border border-border bg-muted"
          />
        </div>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Posição</span>
          <select
            className={inp}
            value={editing.position ?? "home_hero_desktop"}
            onChange={(e) => setEditing({ ...editing, position: e.target.value })}
          >
            <option value="home_hero_desktop">Hero da home — desktop</option>
            <option value="home_hero_mobile">Hero da home — mobile</option>
            <option value="home_strip">Faixa secundária da home</option>
            <option value="home_hero">Hero legado (desktop e mobile)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Ordem</span>
          <input
            type="number"
            className={inp}
            value={editing.sort_order ?? 0}
            onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={editing.is_active ?? true}
            onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
          />{" "}
          Ativo
        </label>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => save(editing)}
            className="rounded-sm bg-primary px-6 py-2 text-sm font-bold text-primary-foreground"
          >
            Salvar
          </button>
          <button
            onClick={() => setEditing(null)}
            className="rounded-sm border border-border px-6 py-2 text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    );

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <p className="text-sm text-muted-foreground">{items.length} banners</p>
        <button
          onClick={() =>
            setEditing({ position: "home_hero_desktop", sort_order: items.length, is_active: true })
          }
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          + Novo banner
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-sm border border-border bg-card">
            {b.image_url && (
              <img
                src={toSiteImageUrl(b.image_url)}
                alt=""
                className="h-40 w-full object-contain bg-muted"
              />
            )}
            <div className="p-4">
              <div className="font-medium">{b.title || "Sem título"}</div>
              <div className="text-xs text-muted-foreground">
                {b.position} · ordem {b.sort_order}
              </div>
              <div className="mt-3 flex gap-3 text-sm">
                <button onClick={() => setEditing(b)} className="text-primary hover:underline">
                  Editar
                </button>
                <button onClick={() => del(b.id)} className="text-destructive hover:underline">
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Orders ---------- */
const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "paid",
  "separating",
  "invoiced",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
] as const;
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

const ORDERS_PAGE_SIZE = 20;

function OrdersAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  // Número sequencial estável (210, 211…): 1 para o pedido mais antigo.
  const seqById = useMemo(() => {
    const map = new Map<string, number>();
    [...items]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((o, i) => map.set(o.id, i + 1));
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((o) => {
      if (filter === "comprovante") {
        if (!o.pix_receipt_path) return false;
      } else if (filter !== "all" && o.status !== filter) {
        return false;
      }
      if (!q) return true;
      const seq = String(seqById.get(o.id) ?? "");
      return (
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_email ?? "").toLowerCase().includes(q) ||
        (o.order_number ?? "").toLowerCase().includes(q) ||
        seq === q
      );
    });
  }, [items, filter, query, seqById]);

  // Volta para a primeira página quando filtro/busca mudam.
  useEffect(() => {
    setPage(1);
  }, [filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (currentPage - 1) * ORDERS_PAGE_SIZE,
    currentPage * ORDERS_PAGE_SIZE,
  );

  if (editing)
    return (
      <OrderDetail
        order={editing}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou e-mail do cliente…"
          className="w-full min-w-[220px] flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm sm:w-72 sm:flex-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">Todos os status</option>
          <option value="comprovante">Com comprovante</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{filtered.length} pedidos</p>
      </div>
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((o) => (
              <tr key={o.id} className="border-t border-border hover:bg-cream/30">
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">
                    Pedido {seqById.get(o.id) ?? "—"}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    #{o.order_number}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {o.customer_name}
                  <div className="text-xs text-muted-foreground">{o.customer_email}</div>
                </td>
                <td className="px-4 py-3">{brl(o.total)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-accent/20 px-2 py-1 text-xs">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    {o.pix_receipt_path && (
                      <span className="rounded bg-sky-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Comprovante
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  {new Date(o.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(o)} className="text-primary hover:underline">
                    Gerenciar
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum pedido
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderDetail({ order, onClose }: { order: any; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [status, setStatus] = useState(order.status);
  const [tracking, setTracking] = useState(order.tracking_code ?? "");
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [saving, setSaving] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const fetchReceiptUrl = useServerFn(getPixReceiptSignedUrl);
  const confirmFromReceipt = useServerFn(confirmPaymentFromReceipt);

  useEffect(() => {
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id)
      .then(({ data }) => setItems(data ?? []));
    supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setHistory(data ?? []));
  }, [order.id]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .update({
        status,
        tracking_code: tracking || null,
        carrier: carrier || null,
      })
      .eq("id", order.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido atualizado");
      onClose();
    }
  }

  async function openReceipt() {
    setReceiptLoading(true);
    try {
      const res = await fetchReceiptUrl({ data: { orderId: order.id } });
      setReceiptUrl(res.url);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível abrir o comprovante");
    } finally {
      setReceiptLoading(false);
    }
  }

  async function confirmPayment() {
    if (!confirm("Confirmar o pagamento deste pedido com base no comprovante?")) return;
    setConfirmingPayment(true);
    try {
      await confirmFromReceipt({ data: { orderId: order.id } });
      setStatus("confirmed");
      toast.success("Pagamento confirmado. Cliente verá o pedido como Confirmado.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao confirmar pagamento");
    } finally {
      setConfirmingPayment(false);
    }
  }

  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  const hasReceipt = Boolean(order.pix_receipt_path);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-primary">
            ← Voltar
          </button>
          <h2 className="mt-1 font-serif text-2xl font-bold text-primary">
            Pedido #{order.order_number}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {hasReceipt && (
            <span className="rounded bg-sky-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              Comprovante
            </span>
          )}
          <span className="rounded bg-accent/20 px-3 py-1 text-sm">
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
        </div>
      </div>

      {hasReceipt && (
        <div className="rounded-sm border border-sky-700/30 bg-sky-50 p-5">
          <h3 className="mb-2 font-medium text-sky-950">Comprovante Pix</h3>
          <p className="text-xs text-sky-900/80">
            Enviado em{" "}
            {order.pix_receipt_uploaded_at
              ? new Date(order.pix_receipt_uploaded_at).toLocaleString("pt-BR")
              : "—"}
            {order.pix_receipt_mime ? ` · ${order.pix_receipt_mime}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openReceipt}
              disabled={receiptLoading}
              className="rounded-sm border border-sky-800/40 bg-white px-3 py-2 text-sm font-medium text-sky-950 hover:bg-sky-100 disabled:opacity-60"
            >
              {receiptLoading
                ? "Carregando…"
                : receiptUrl
                  ? "Atualizar visualização"
                  : "Ver comprovante"}
            </button>
            {order.status === "pending" && (
              <button
                type="button"
                onClick={confirmPayment}
                disabled={confirmingPayment}
                className="rounded-sm bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {confirmingPayment ? "Confirmando…" : "Confirmar pagamento"}
              </button>
            )}
          </div>
          {receiptUrl && (
            <div className="mt-4 overflow-hidden rounded-sm border border-border bg-white">
              <img
                src={receiptUrl}
                alt="Comprovante Pix"
                className="max-h-[480px] w-full object-contain"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-sm border border-border bg-card p-5">
          <h3 className="mb-3 font-medium">Cliente</h3>
          <div className="space-y-1 text-sm">
            <div>{order.customer_name}</div>
            <div className="text-muted-foreground">{order.customer_email}</div>
            <div className="text-muted-foreground">{order.customer_phone}</div>
            <div className="text-muted-foreground">CPF: {order.customer_doc}</div>
          </div>
          <h3 className="mb-3 mt-5 font-medium">Endereço de entrega</h3>
          <div className="text-sm text-muted-foreground">
            {order.shipping_address?.street}, {order.shipping_address?.number}
            {order.shipping_address?.complement && ` — ${order.shipping_address.complement}`}
            <br />
            {order.shipping_address?.neighborhood} — {order.shipping_address?.city}/
            {order.shipping_address?.state}
            <br />
            CEP {order.shipping_address?.zipcode}
          </div>
        </div>

        <div className="rounded-sm border border-border bg-card p-5">
          <h3 className="mb-3 font-medium">Gestão</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Status</span>
              <select className={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Transportadora</span>
              <input
                className={inp}
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Correios, Jadlog…"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-muted-foreground">Código de rastreio</span>
              <input
                className={inp}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="BR..."
              />
            </label>
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-sm bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-5 py-3 font-medium">Itens</div>
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2">Qtd</th>
              <th className="px-4 py-2">Unit.</th>
              <th className="px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-4 py-2 flex items-center gap-3">
                  {i.product_image && (
                    <img
                      src={toSiteImageUrl(i.product_image)}
                      className="h-10 w-8 object-contain"
                      alt=""
                    />
                  )}
                  {i.product_name}
                </td>
                <td className="px-4 py-2">{i.quantity}</td>
                <td className="px-4 py-2">{brl(i.unit_price)}</td>
                <td className="px-4 py-2">{brl(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-cream/50">
              <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                Subtotal
              </td>
              <td className="px-4 py-2">{brl(order.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-4 py-1 text-right text-muted-foreground">
                Frete
              </td>
              <td className="px-4 py-1">{brl(order.shipping)}</td>
            </tr>
            {order.discount > 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-1 text-right text-muted-foreground">
                  Desconto
                </td>
                <td className="px-4 py-1">- {brl(order.discount)}</td>
              </tr>
            )}
            <tr className="border-t border-border font-bold">
              <td colSpan={3} className="px-4 py-2 text-right">
                Total
              </td>
              <td className="px-4 py-2">{brl(order.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-5 py-3 font-medium">Histórico de status</div>
        <ul className="divide-y divide-border">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-5 py-2 text-sm">
              <span>{STATUS_LABEL[h.status] ?? h.status}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(h.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
          {history.length === 0 && (
            <li className="px-5 py-3 text-sm text-muted-foreground">Sem histórico</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Customers ---------- */
function CustomersAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      const { data: orderAgg } = await supabase.from("orders").select("customer_email,total");
      const map = new Map<string, { count: number; spent: number }>();
      (orderAgg ?? []).forEach((o: any) => {
        const e = (o.customer_email ?? "").toLowerCase();
        const cur = map.get(e) ?? { count: 0, spent: 0 };
        cur.count++;
        cur.spent += Number(o.total);
        map.set(e, cur);
      });
      // Match by user_id->email via auth? We don't have email in profiles. Use blank for now.
      setItems((profiles ?? []).map((p: any) => ({ ...p, orders: 0, spent: 0 })));
      // Bonus: also load users with orders but no profile
      setLoading(false);
    })();
  }, []);

  const filtered = items.filter((p) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (p.first_name ?? "").toLowerCase().includes(t) ||
      (p.last_name ?? "").toLowerCase().includes(t) ||
      (p.cpf ?? "").includes(t) ||
      (p.phone ?? "").includes(t)
    );
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <input
          placeholder="Buscar por nome, CPF ou telefone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-sm rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="text-sm text-muted-foreground">{filtered.length} clientes</p>
      </div>
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">{p.cpf || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.phone || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum cliente
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Coupons ---------- */
function CouponsAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm("Excluir cupom?")) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      load();
    }
  }

  if (editing)
    return (
      <CouponForm
        initial={editing}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <p className="text-sm text-muted-foreground">{items.length} cupons</p>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Novo cupom
        </button>
      </div>
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Mín. pedido</th>
                <th className="px-4 py-3">Usos</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                  <td className="px-4 py-3 text-xs">{c.type}</td>
                  <td className="px-4 py-3">
                    {c.type === "percent" ? `${c.value}%` : brl(c.value)}
                  </td>
                  <td className="px-4 py-3">{c.min_order_value ? brl(c.min_order_value) : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.uses_count}
                    {c.max_uses ? `/${c.max_uses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">{c.is_active ? "Ativo" : "Inativo"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(c)} className="text-primary hover:underline">
                      Editar
                    </button>
                    <button
                      onClick={() => del(c.id)}
                      className="ml-3 text-destructive hover:underline"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum cupom
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CouponForm({ initial, onClose }: { initial: any; onClose: () => void }) {
  const [f, setF] = useState<any>({
    code: "",
    description: "",
    type: "percent",
    value: 10,
    min_order_value: null,
    max_uses: null,
    max_uses_per_user: 1,
    is_active: true,
    starts_at: null,
    expires_at: null,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const upd = (k: string) => (e: any) =>
    setF((p: any) => ({
      ...p,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  async function save() {
    if (!f.code) {
      toast.error("Código obrigatório");
      return;
    }
    setSaving(true);
    const payload = {
      ...f,
      code: String(f.code).toUpperCase().trim(),
      value: Number(f.value),
      min_order_value: f.min_order_value ? Number(f.min_order_value) : null,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
      max_uses_per_user: f.max_uses_per_user ? Number(f.max_uses_per_user) : null,
      starts_at: f.starts_at || null,
      expires_at: f.expires_at || null,
    };
    delete payload.uses_count;
    const { error } = initial?.id
      ? await supabase.from("coupons").update(payload).eq("id", initial.id)
      : await supabase.from("coupons").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      onClose();
    }
  }

  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="mb-4 flex justify-between">
        <h2 className="font-serif text-xl font-bold text-primary">
          {initial?.id ? "Editar" : "Novo"} cupom
        </h2>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-primary">
          ← Voltar
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="text-xs uppercase text-muted-foreground">Código</span>
          <input
            className={inp + " font-mono uppercase"}
            value={f.code}
            onChange={upd("code")}
            placeholder="BEMVINDO10"
          />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Tipo</span>
          <select className={inp} value={f.type} onChange={upd("type")}>
            <option value="percent">Porcentagem (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
            <option value="free_shipping">Frete grátis</option>
            <option value="first_purchase">Primeira compra</option>
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="text-xs uppercase text-muted-foreground">Descrição</span>
          <input className={inp} value={f.description ?? ""} onChange={upd("description")} />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Valor</span>
          <input
            type="number"
            step="0.01"
            className={inp}
            value={f.value}
            onChange={upd("value")}
          />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Valor mínimo do pedido</span>
          <input
            type="number"
            step="0.01"
            className={inp}
            value={f.min_order_value ?? ""}
            onChange={upd("min_order_value")}
          />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Máx. usos totais</span>
          <input
            type="number"
            className={inp}
            value={f.max_uses ?? ""}
            onChange={upd("max_uses")}
          />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Máx. usos por usuário</span>
          <input
            type="number"
            className={inp}
            value={f.max_uses_per_user ?? ""}
            onChange={upd("max_uses_per_user")}
          />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Início</span>
          <input
            type="datetime-local"
            className={inp}
            value={f.starts_at ? String(f.starts_at).slice(0, 16) : ""}
            onChange={upd("starts_at")}
          />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Expira em</span>
          <input
            type="datetime-local"
            className={inp}
            value={f.expires_at ? String(f.expires_at).slice(0, 16) : ""}
            onChange={upd("expires_at")}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.is_active} onChange={upd("is_active")} /> Ativo
        </label>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-sm bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button onClick={onClose} className="rounded-sm border border-border px-6 py-2 text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ---------- Categories ---------- */
function CategoriesAdmin() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .order("name");
    setItems(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm("Excluir categoria? Produtos vinculados continuarão existindo.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluída");
      load();
    }
  }

  if (editing)
    return (
      <CategoryForm
        initial={editing}
        parents={items}
        onClose={() => {
          queryClient.invalidateQueries({ queryKey: ["cat"] });
          setEditing(null);
          load();
        }}
      />
    );

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <p className="text-sm text-muted-foreground">{items.length} categorias</p>
        <button
          onClick={() => setEditing({ is_active: true, sort_order: items.length })}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Nova categoria
        </button>
      </div>
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Banner</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Pai</th>
                <th className="px-4 py-3">Ordem</th>
                <th className="px-4 py-3">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const parent = items.find((p) => p.id === c.parent_id);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      {c.banner_image ? (
                        <img
                          src={toSiteImageUrl(c.banner_image)}
                          alt=""
                          className="h-10 w-20 rounded-sm object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.slug}</td>
                    <td className="px-4 py-3 text-xs">{parent?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{c.sort_order}</td>
                    <td className="px-4 py-3 text-xs">{c.is_active ? "Ativa" : "Inativa"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-primary hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => del(c.id)}
                        className="ml-3 text-destructive hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma categoria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoryForm({
  initial,
  parents,
  onClose,
}: {
  initial: any;
  parents: any[];
  onClose: () => void;
}) {
  const [f, setF] = useState<any>({
    name: "",
    slug: "",
    description: "",
    parent_id: null,
    sort_order: 0,
    is_active: true,
    banner_image: "",
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const upd = (k: string) => (e: any) =>
    setF((p: any) => ({
      ...p,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  async function save() {
    if (!f.name || !f.slug) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }
    setSaving(true);
    const payload: any = {
      name: f.name,
      slug: String(f.slug).toLowerCase().trim(),
      description: f.description || null,
      parent_id: f.parent_id || null,
      sort_order: Number(f.sort_order) || 0,
      is_active: !!f.is_active,
      banner_image: f.banner_image || null,
    };
    const previousBanner = initial?.banner_image ?? null;
    const { error } = initial?.id
      ? await supabase.from("categories").update(payload).eq("id", initial.id)
      : await supabase.from("categories").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      if (previousBanner && previousBanner !== payload.banner_image) {
        await removeCategoryBannerIfUnused(previousBanner, initial.id);
      }
      toast.success("Categoria salva com um único banner principal");
      onClose();
    }
  }

  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="mb-4 flex justify-between">
        <h2 className="font-serif text-xl font-bold text-primary">
          {initial?.id ? "Editar" : "Nova"} categoria
        </h2>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-primary">
          ← Voltar
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="text-xs uppercase text-muted-foreground">Nome</span>
          <input className={inp} value={f.name} onChange={upd("name")} />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Slug</span>
          <input className={inp} value={f.slug} onChange={upd("slug")} placeholder="tintos" />
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Categoria pai</span>
          <select
            className={inp}
            value={f.parent_id ?? ""}
            onChange={(e) => setF((p: any) => ({ ...p, parent_id: e.target.value || null }))}
          >
            <option value="">— Nenhuma (raiz)</option>
            {parents
              .filter((p) => p.id !== initial?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="text-xs uppercase text-muted-foreground">Ordem</span>
          <input type="number" className={inp} value={f.sort_order} onChange={upd("sort_order")} />
        </label>
        <label className="md:col-span-2">
          <span className="text-xs uppercase text-muted-foreground">Descrição</span>
          <textarea
            className={inp}
            rows={3}
            value={f.description ?? ""}
            onChange={upd("description")}
          />
        </label>
        <div className="md:col-span-2">
          <span className="text-xs uppercase text-muted-foreground">
            Banner da página de coleção
          </span>
          <ImageField
            value={f.banner_image}
            onChange={(url) => setF((p: any) => ({ ...p, banner_image: url }))}
            bucket="banner-images"
          />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!f.is_active} onChange={upd("is_active")} /> Ativa
        </label>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-sm bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button onClick={onClose} className="rounded-sm border border-border px-6 py-2 text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ---------- Store Settings ---------- */
function SettingsAdmin() {
  const qc = useQueryClient();
  const [s, setS] = useState<StoreSettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStoreSettings()
      .then(setS)
      .catch(() => setS(DEFAULT_SETTINGS));
  }, []);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const shipping = {
        ...s.shipping,
        prepMinDays: s.shipping.prepMinDays ?? 1,
        prepMaxDays: s.shipping.prepMaxDays ?? 2,
        methods:
          s.shipping.methods.length > 0
            ? s.shipping.methods
            : [{ ...POLICY_SHIPPING_METHOD, price: s.shipping.flatShipping || STORE.flatShipping }],
      };
      await saveStoreSettings({ ...s, shipping });
      setS((prev) => (prev ? { ...prev, shipping } : prev));
      qc.invalidateQueries({ queryKey: ["store-settings"] });
      toast.success("Configurações salvas.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <p>Carregando…</p>;

  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  const num = (v: number, on: (n: number) => void, step = "0.01") => (
    <input
      type="number"
      step={step}
      className={inp}
      value={v}
      onChange={(e) => on(Number(e.target.value))}
    />
  );

  return (
    <div className="space-y-6">
      {/* Frete */}
      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-1 font-serif text-lg font-bold text-primary">Frete</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Conforme a Política de frete e os Termos: envio para todo o Brasil, separação de 1 a 2
          dias úteis, transporte de 6 a 9 dias úteis (prazo total 7 a 11 dias úteis após o
          pagamento), frete grátis a partir de R$ 300,00 e frete fixo de R$ 43,20 abaixo desse valor.
          Carrinho, checkout e calculadora de CEP mostram só o prazo de transporte (transit time),
          como no Google Merchant Center — a separação não entra nessa cotação.
        </p>

        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Frete grátis a partir de (R$)
            </span>
            {num(
              s.shipping.freeShippingFrom,
              (v) => setS({ ...s, shipping: { ...s.shipping, freeShippingFrom: v } }),
              "1",
            )}
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Frete abaixo do limiar (R$)
            </span>
            {num(
              s.shipping.flatShipping,
              (v) => {
                const methods = s.shipping.methods.map((m, i) =>
                  i === 0 ? { ...m, price: v } : m,
                );
                setS({
                  ...s,
                  shipping: {
                    ...s.shipping,
                    flatShipping: v,
                    expressShipping: v,
                    methods: methods.length ? methods : [{ ...POLICY_SHIPPING_METHOD, price: v }],
                  },
                });
              },
              "0.01",
            )}
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">Separação mín. (dias úteis)</span>
            {num(
              s.shipping.prepMinDays ?? 1,
              (v) =>
                setS({
                  ...s,
                  shipping: { ...s.shipping, prepMinDays: Math.max(0, Math.floor(v)) },
                }),
              "1",
            )}
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">Separação máx. (dias úteis)</span>
            {num(
              s.shipping.prepMaxDays ?? 2,
              (v) =>
                setS({
                  ...s,
                  shipping: { ...s.shipping, prepMaxDays: Math.max(0, Math.floor(v)) },
                }),
              "1",
            )}
          </label>
        </div>
        <p className="mb-6 text-[11px] text-muted-foreground">
          Carrinho e checkout exibem apenas o transporte (6–9 dias úteis). A separação (1–2) fica
          na política da loja e no handling time do Merchant Center, para não misturar os dois prazos.
        </p>

        {/* Métodos */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Métodos de entrega</h4>
            <button
              type="button"
              onClick={() =>
                setS({
                  ...s,
                  shipping: {
                    ...s.shipping,
                    methods: [
                      ...s.shipping.methods,
                      {
                        ...POLICY_SHIPPING_METHOD,
                        id: `m_${Date.now()}`,
                        label: "Entrega",
                      },
                    ],
                  },
                })
              }
              className="rounded-sm border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              + Adicionar método
            </button>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Preço base e prazo de transporte (dias úteis após o despacho). A política usa um único
            método para todo o Brasil.
          </p>
          <div className="space-y-2">
            {s.shipping.methods.map((m, i) => {
              const update = (patch: Partial<ShippingMethod>) => {
                const next = [...s.shipping.methods];
                next[i] = { ...m, ...patch };
                setS({ ...s, shipping: { ...s.shipping, methods: next } });
              };
              const remove = () =>
                setS({
                  ...s,
                  shipping: {
                    ...s.shipping,
                    methods: s.shipping.methods.filter((_, j) => j !== i),
                  },
                });
              return (
                <div
                  key={m.id}
                  className="grid items-end gap-2 rounded-sm border border-border bg-background p-3 md:grid-cols-[1fr_120px_90px_90px_70px_40px]"
                >
                  <label>
                    <span className="text-[11px] uppercase text-muted-foreground">Nome</span>
                    <input
                      className={inp}
                      value={m.label}
                      onChange={(e) => update({ label: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="text-[11px] uppercase text-muted-foreground">
                      Preço base (R$)
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      className={inp}
                      value={m.price}
                      onChange={(e) => update({ price: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    <span className="text-[11px] uppercase text-muted-foreground">
                      Transporte mín. (dias)
                    </span>
                    <input
                      type="number"
                      step="1"
                      className={inp}
                      value={m.etaMinDays}
                      onChange={(e) => update({ etaMinDays: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    <span className="text-[11px] uppercase text-muted-foreground">
                      Transporte máx. (dias)
                    </span>
                    <input
                      type="number"
                      step="1"
                      className={inp}
                      value={m.etaMaxDays}
                      onChange={(e) => update({ etaMaxDays: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) => update({ enabled: e.target.checked })}
                    />{" "}
                    Ativo
                  </label>
                  <button
                    type="button"
                    onClick={remove}
                    className="rounded-sm border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Regiões */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Regiões do Brasil</h4>
            <button
              type="button"
              onClick={() =>
                setS({
                  ...s,
                  shipping: {
                    ...s.shipping,
                    regions: [
                      ...s.shipping.regions,
                      {
                        id: `r_${Date.now()}`,
                        label: "Nova região",
                        ufs: [],
                        priceFactor: 1,
                        extraDays: 0,
                        freeShippingFrom: null,
                      },
                    ],
                  },
                })
              }
              className="rounded-sm border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              + Adicionar região
            </button>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            A política vigente é frete único para todo o Brasil. Só cadastre regiões se o preço ou
            o prazo passar a variar por UF.
          </p>
          <div className="space-y-2">
            {s.shipping.regions.map((r, i) => {
              const update = (patch: Partial<ShippingRegion>) => {
                const next = [...s.shipping.regions];
                next[i] = { ...r, ...patch };
                setS({ ...s, shipping: { ...s.shipping, regions: next } });
              };
              const remove = () =>
                setS({
                  ...s,
                  shipping: {
                    ...s.shipping,
                    regions: s.shipping.regions.filter((_, j) => j !== i),
                  },
                });
              return (
                <div key={r.id} className="rounded-sm border border-border bg-background p-3">
                  <div className="grid items-end gap-2 md:grid-cols-[1fr_100px_100px_140px_40px]">
                    <label>
                      <span className="text-[11px] uppercase text-muted-foreground">Nome</span>
                      <input
                        className={inp}
                        value={r.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="text-[11px] uppercase text-muted-foreground">
                        Mult. preço
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        className={inp}
                        value={r.priceFactor}
                        onChange={(e) => update({ priceFactor: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span className="text-[11px] uppercase text-muted-foreground">
                        Dias extras
                      </span>
                      <input
                        type="number"
                        step="1"
                        className={inp}
                        value={r.extraDays}
                        onChange={(e) => update({ extraDays: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span className="text-[11px] uppercase text-muted-foreground">
                        Frete grátis ≥ R$ (opc.)
                      </span>
                      <input
                        type="number"
                        step="1"
                        className={inp}
                        value={r.freeShippingFrom ?? ""}
                        placeholder="usa global"
                        onChange={(e) =>
                          update({
                            freeShippingFrom: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={remove}
                      className="rounded-sm border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      ×
                    </button>
                  </div>
                  <label className="mt-2 block">
                    <span className="text-[11px] uppercase text-muted-foreground">
                      UFs (separadas por vírgula)
                    </span>
                    <input
                      className={inp}
                      value={r.ufs.join(", ")}
                      onChange={(e) =>
                        update({
                          ufs: e.target.value
                            .split(",")
                            .map((x) => x.trim().toUpperCase())
                            .filter(Boolean),
                        })
                      }
                      placeholder="SP, RJ, MG"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pagamentos */}
      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-primary">Formas de pagamento</h3>
        <div className="mb-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.payments.pixEnabled}
              onChange={(e) =>
                setS({ ...s, payments: { ...s.payments, pixEnabled: e.target.checked } })
              }
            />{" "}
            PIX
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.payments.boletoEnabled}
              onChange={(e) =>
                setS({ ...s, payments: { ...s.payments, boletoEnabled: e.target.checked } })
              }
            />{" "}
            Boleto
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.payments.cardEnabled}
              onChange={(e) =>
                setS({ ...s, payments: { ...s.payments, cardEnabled: e.target.checked } })
              }
            />{" "}
            Cartão de crédito
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="text-xs uppercase text-muted-foreground">Desconto PIX (%)</span>
            {num(
              s.payments.pixDiscount,
              (v) => setS({ ...s, payments: { ...s.payments, pixDiscount: v } }),
              "0.1",
            )}
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">Máx. parcelas</span>
            {num(
              s.payments.maxInstallments,
              (v) =>
                setS({
                  ...s,
                  payments: { ...s.payments, maxInstallments: Math.max(1, Math.min(12, Math.floor(v))) },
                }),
              "1",
            )}
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">Parcelas sem juros até</span>
            {num(
              s.payments.interestFreeUpTo,
              (v) =>
                setS({
                  ...s,
                  payments: { ...s.payments, interestFreeUpTo: Math.max(1, Math.floor(v)) },
                }),
              "1",
            )}
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Valor mín. da parcela (R$)
            </span>
            {num(
              s.payments.minInstallment,
              (v) => setS({ ...s, payments: { ...s.payments, minInstallment: v } }),
              "1",
            )}
          </label>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase text-muted-foreground">
            Taxa total no parcelado (%)
          </p>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from(
              { length: Math.max(0, Math.min(12, s.payments.maxInstallments) - 1) },
              (_, i) => i + 2,
            ).map((n) => (
              <label key={n}>
                <span className="text-xs uppercase text-muted-foreground">{n}x — taxa (%)</span>
                {num(
                  Number(s.payments.installmentRates?.[String(n)] ?? 0),
                  (v) =>
                    setS({
                      ...s,
                      payments: {
                        ...s.payments,
                        installmentRates: {
                          ...s.payments.installmentRates,
                          [String(n)]: v,
                        },
                      },
                    }),
                  "0.01",
                )}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Usadas só para exibir as parcelas na loja. Devem ser as mesmas taxas da PayoutBR.
            O checkout envia o valor do pedido sem somar essa taxa de novo — senão o cliente
            pagaria juros duas vezes.
          </p>
        </div>
      </section>

      {/* Marca / logo do site */}
      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-1 font-serif text-lg font-bold text-primary">Logo do site</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Exibida no header e no menu mobile. Deixe vazio para usar a logo padrão da loja.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <ImageField
              value={s.brand.logoUrl}
              onChange={(url) => setS({ ...s, brand: { ...s.brand, logoUrl: url } })}
              bucket="banner-images"
              previewClass="mt-2 max-h-24 w-full rounded-sm object-contain border border-border bg-muted p-3"
            />
            {s.brand.logoUrl && (
              <button
                type="button"
                onClick={() => setS({ ...s, brand: { ...s.brand, logoUrl: "" } })}
                className="mt-2 text-xs text-destructive hover:underline"
              >
                Remover e usar logo padrão
              </button>
            )}
          </div>
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Altura máxima no header (px)
            </span>
            <input
              type="number"
              min={24}
              max={120}
              className={`${inp} mt-1`}
              value={s.brand.logoMaxHeight}
              onChange={(e) =>
                setS({
                  ...s,
                  brand: {
                    ...s.brand,
                    logoMaxHeight: Math.max(24, Math.min(120, Number(e.target.value) || 48)),
                  },
                })
              }
            />
          </label>
        </div>
      </section>

      {/* Cores */}
      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-primary">Cores do site</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["primary", "Primária (bordô)"],
              ["accent", "Destaque (dourado)"],
              ["buy", "Botão comprar"],
              ["sectionTitle", "Títulos de seção (carrosséis)"],
              ["productName", "Nome do produto"],
              ["productPrice", "Preço do produto"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span className="text-xs uppercase text-muted-foreground">{label}</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={s.colors[key]}
                  onChange={(e) => setS({ ...s, colors: { ...s.colors, [key]: e.target.value } })}
                  className="h-9 w-12 rounded-sm border border-border bg-background"
                />
                <input
                  className={inp}
                  value={s.colors[key]}
                  onChange={(e) => setS({ ...s, colors: { ...s.colors, [key]: e.target.value } })}
                />
              </div>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          As cores aplicam em todo o site. Recarregue a página após salvar.
        </p>
      </section>

      {/* Rastreamento / analytics */}
      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-1 font-serif text-lg font-bold text-primary">Rastreamento e analytics</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Configure os IDs usados apenas na vitrine pública (o painel admin não carrega estes
          scripts). Deixe em branco o que não for usar. Pageviews ficam automáticos — não é
          necessário disparar eventos manuais.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {trackingActiveItems(s.tracking).map((item) => (
            <span
              key={item.key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                item.active
                  ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${item.active ? "bg-emerald-600" : "bg-muted-foreground/40"}`}
              />
              {item.label}
              {item.active ? " · ativo" : " · off"}
            </span>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Google Tag (GT-… ou G-…)
            </span>
            <input
              className={`${inp} mt-1 font-mono`}
              placeholder="GT-XXXX ou G-XXXX"
              value={s.tracking.googleTagId ?? ""}
              onChange={(e) =>
                setS({ ...s, tracking: { ...s.tracking, googleTagId: e.target.value } })
              }
            />
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Google Analytics GA4 (G-…)
            </span>
            <input
              className={`${inp} mt-1 font-mono`}
              placeholder="G-XXXXXXXX"
              value={s.tracking.googleAnalyticsId ?? ""}
              onChange={(e) =>
                setS({ ...s, tracking: { ...s.tracking, googleAnalyticsId: e.target.value } })
              }
            />
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">Google Ads (AW-…)</span>
            <input
              className={`${inp} mt-1 font-mono`}
              placeholder="AW-XXXXXXXX"
              value={s.tracking.googleAdsId ?? ""}
              onChange={(e) =>
                setS({ ...s, tracking: { ...s.tracking, googleAdsId: e.target.value } })
              }
            />
          </label>
          <label>
            <span className="text-xs uppercase text-muted-foreground">
              Conversão Google Ads (send_to)
            </span>
            <input
              className={`${inp} mt-1 font-mono`}
              placeholder="AW-XXXXXXXX/label"
              value={s.tracking.googleAdsConversionSendTo ?? ""}
              onChange={(e) =>
                setS({
                  ...s,
                  tracking: { ...s.tracking, googleAdsConversionSendTo: e.target.value },
                })
              }
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Disparado só na página de obrigado, quando o pagamento estiver confirmado.
            </span>
          </label>
          <label className="md:col-span-2">
            <span className="text-xs uppercase text-muted-foreground">Microsoft Clarity</span>
            <input
              className={`${inp} mt-1 font-mono`}
              placeholder="ID do projeto ou cole o snippet inteiro"
              value={s.tracking.microsoftClarityId ?? ""}
              onChange={(e) =>
                setS({ ...s, tracking: { ...s.tracking, microsoftClarityId: e.target.value } })
              }
              onBlur={(e) =>
                setS({
                  ...s,
                  tracking: {
                    ...s.tracking,
                    microsoftClarityId: normalizeClarityId(e.target.value),
                  },
                })
              }
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Aceita o ID puro ou a colagem do snippet oficial — o ID é extraído automaticamente ao
              sair do campo.
            </span>
          </label>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-sm bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}

function FooterAdmin() {
  const qc = useQueryClient();
  const [s, setS] = useState<StoreSettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStoreSettings()
      .then(setS)
      .catch(() => setS(DEFAULT_SETTINGS));
  }, []);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      await saveStoreSettings(s);
      qc.invalidateQueries({ queryKey: ["store-settings"] });
      toast.success("Rodapé salvo.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <p>Carregando…</p>;

  const f = s.footer;
  const inp = "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm";
  const lbl = "mb-1 block text-xs uppercase text-muted-foreground";
  const setF = (patch: Partial<typeof f>) => setS({ ...s, footer: { ...f, ...patch } });

  // Categories
  const addCategory = () =>
    setF({ categories: [...f.categories, { label: "Nova categoria", href: "/colecao/" }] });
  const updateCategory = (i: number, patch: Partial<FooterLink>) =>
    setF({ categories: f.categories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const removeCategory = (i: number) =>
    setF({ categories: f.categories.filter((_, idx) => idx !== i) });

  // Institutional pages
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const addPage = () => {
    const id = `p-${Date.now().toString(36)}`;
    setF({
      institutional: [
        ...f.institutional,
        {
          id,
          label: "Nova página",
          slug: `pagina-${f.institutional.length + 1}`,
          content: "Conteúdo aqui.",
        },
      ],
    });
  };
  const updatePage = (i: number, patch: Partial<InstitutionalPage>) =>
    setF({ institutional: f.institutional.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  const removePage = (i: number) =>
    setF({ institutional: f.institutional.filter((_, idx) => idx !== i) });

  // Security badges
  const addBadge = () =>
    setF({
      securityBadges: [
        ...f.securityBadges,
        {
          id: `b-${Date.now().toString(36)}`,
          imageUrl: "",
          href: "",
          alt: "Selo de segurança",
          height: 40,
        },
      ],
    });
  const updateBadge = (i: number, patch: Partial<(typeof f.securityBadges)[number]>) =>
    setF({
      securityBadges: f.securityBadges.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    });
  const removeBadge = (i: number) =>
    setF({ securityBadges: f.securityBadges.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 font-serif text-2xl font-bold text-primary">
          Rodapé & Páginas Institucionais
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Edite todos os textos, links e a logo do rodapé. Adicione quantas páginas institucionais
          quiser — elas ficam disponíveis em{" "}
          <code className="rounded bg-muted px-1">/pagina/&lt;slug&gt;</code>.
        </p>
      </div>

      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-1 font-serif text-lg font-bold text-primary">Logo do rodapé</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Imagem exibida no topo da primeira coluna do rodapé. Deixe vazio para usar a logo padrão
          da loja.
        </p>
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            <ImageField
              value={f.logoUrl}
              onChange={(url) => setF({ logoUrl: url })}
              bucket="banner-images"
              previewClass="mt-2 max-h-28 w-full rounded-sm border border-border bg-muted object-contain p-2"
            />
            {f.logoUrl && (
              <button
                type="button"
                onClick={() => setF({ logoUrl: "" })}
                className="mt-2 text-xs text-destructive hover:underline"
              >
                Remover e usar logo padrão
              </button>
            )}
          </div>
          <label className="block max-w-xs">
            <span className={lbl}>Altura máxima (px)</span>
            <input
              type="number"
              min={24}
              max={160}
              className={inp}
              value={f.logoMaxHeight}
              onChange={(e) =>
                setF({ logoMaxHeight: Math.max(24, Math.min(160, Number(e.target.value) || 56)) })
              }
            />
            <span className="mt-1 block text-xs text-muted-foreground">Recomendado: 48–80 px</span>
          </label>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-primary">Sobre a loja</h3>
        <label className="block">
          <span className={lbl}>Texto descritivo</span>
          <textarea
            className={`${inp} min-h-[100px]`}
            value={f.aboutText}
            onChange={(e) => setF({ aboutText: e.target.value })}
          />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className={lbl}>Endereço</span>
            <input
              className={inp}
              value={f.address}
              onChange={(e) => setF({ address: e.target.value })}
            />
          </label>
          <label>
            <span className={lbl}>Telefone</span>
            <input
              className={inp}
              value={f.phone}
              onChange={(e) => setF({ phone: e.target.value })}
            />
          </label>
          <label>
            <span className={lbl}>E-mail</span>
            <input
              className={inp}
              value={f.email}
              onChange={(e) => setF({ email: e.target.value })}
            />
          </label>
          <label>
            <span className={lbl}>Instagram (URL)</span>
            <input
              className={inp}
              value={f.instagramUrl}
              onChange={(e) => setF({ instagramUrl: e.target.value })}
            />
          </label>
          <label>
            <span className={lbl}>Facebook (URL)</span>
            <input
              className={inp}
              value={f.facebookUrl}
              onChange={(e) => setF({ facebookUrl: e.target.value })}
            />
          </label>
          <label>
            <span className={lbl}>Título Newsletter</span>
            <input
              className={inp}
              value={f.newsletterTitle}
              onChange={(e) => setF({ newsletterTitle: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-1 font-serif text-lg font-bold text-primary">Área do Cliente</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Esta coluna é fixa no site e não precisa ser configurada aqui. Links automáticos:{" "}
          <strong>Fale conosco</strong>, <strong>Rastrear Pedido</strong> e{" "}
          <strong>Quem somos</strong>.
        </p>
        <ul className="space-y-1 rounded-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          <li>/fale-conosco</li>
          <li>/rastreio</li>
          <li>/quem-somos</li>
        </ul>
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-primary">
              Coluna: Categorias (opcional)
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Links para coleções (ex.: Tintos, Brancos). Se ficar vazia, a coluna não aparece no
              rodapé. Não use este bloco para Área do Cliente.
            </p>
          </div>
          <button
            onClick={addCategory}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        <label className="mb-3 block">
          <span className={lbl}>Título da coluna</span>
          <input
            className={inp}
            value={f.categoriesTitle}
            onChange={(e) => setF({ categoriesTitle: e.target.value })}
            placeholder="Categorias"
          />
        </label>
        {f.categories.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum link de categoria. Opcional — deixe vazio se não quiser essa coluna.
          </p>
        ) : (
          <div className="space-y-2">
            {f.categories.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inp}
                  placeholder="Rótulo"
                  value={c.label}
                  onChange={(e) => updateCategory(i, { label: e.target.value })}
                />
                <input
                  className={inp}
                  placeholder="/colecao/slug"
                  value={c.href}
                  onChange={(e) => updateCategory(i, { href: e.target.value })}
                />
                <button
                  onClick={() => removeCategory(i)}
                  className="rounded-sm border border-border px-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-primary">
            Coluna: Institucional (páginas)
          </h3>
          <button
            onClick={addPage}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Adicionar política/página
          </button>
        </div>
        <label className="mb-3 block">
          <span className={lbl}>Título da coluna</span>
          <input
            className={inp}
            value={f.institutionalTitle}
            onChange={(e) => setF({ institutionalTitle: e.target.value })}
          />
        </label>
        <div className="space-y-4">
          {f.institutional.map((p, i) => (
            <div key={p.id} className="rounded-sm border border-border bg-background p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <label>
                  <span className={lbl}>Título (aparece no rodapé)</span>
                  <input
                    className={inp}
                    value={p.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      const auto = slugify(label);
                      updatePage(i, {
                        label,
                        slug:
                          p.slug && p.slug !== slugify(f.institutional[i].label) ? p.slug : auto,
                      });
                    }}
                  />
                </label>
                <label>
                  <span className={lbl}>Slug (URL)</span>
                  <input
                    className={inp}
                    value={p.slug}
                    onChange={(e) => updatePage(i, { slug: slugify(e.target.value) })}
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className={lbl}>Conteúdo (texto)</span>
                <textarea
                  className={`${inp} min-h-[160px] font-mono text-xs`}
                  value={p.content}
                  onChange={(e) => updatePage(i, { content: e.target.value })}
                />
              </label>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  URL: <code className="rounded bg-muted px-1">/pagina/{p.slug}</code>
                </span>
                <button
                  onClick={() => removePage(i)}
                  className="inline-flex items-center gap-1 text-destructive hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-primary">Selos de segurança (rodapé)</h3>
          <button
            onClick={addBadge}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Adicionar selo
          </button>
        </div>
        <label className="mb-3 block max-w-md">
          <span className={lbl}>Título da seção (deixe vazio para esconder)</span>
          <input
            className={inp}
            value={f.securityBadgesTitle}
            onChange={(e) => setF({ securityBadgesTitle: e.target.value })}
          />
        </label>
        {f.securityBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum selo adicionado. Clique em "Adicionar selo" para incluir imagens de segurança
            (SSL, antifraude, bandeiras, etc).
          </p>
        ) : (
          <div className="space-y-4">
            {f.securityBadges.map((b, i) => (
              <div key={b.id} className="rounded-sm border border-border bg-background p-3">
                <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                  <div>
                    <ImageField
                      value={b.imageUrl}
                      onChange={(url) => updateBadge(i, { imageUrl: url })}
                      bucket="banner-images"
                      previewClass="mt-2 max-h-24 w-auto max-w-full rounded-sm border border-border bg-[oklch(0.18_0.04_20)] object-contain p-2"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label>
                      <span className={lbl}>Link ao clicar (URL)</span>
                      <input
                        className={inp}
                        placeholder="https://..."
                        value={b.href}
                        onChange={(e) => updateBadge(i, { href: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className={lbl}>Texto alternativo</span>
                      <input
                        className={inp}
                        value={b.alt}
                        onChange={(e) => updateBadge(i, { alt: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className={lbl}>Altura (px)</span>
                      <input
                        type="number"
                        min={16}
                        max={120}
                        className={inp}
                        value={b.height}
                        onChange={(e) =>
                          updateBadge(i, {
                            height: Math.max(16, Math.min(120, Number(e.target.value) || 40)),
                          })
                        }
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        onClick={() => removeBadge(i)}
                        className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" /> Remover
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-primary">Copyright</h3>
        <label className="block">
          <span className={lbl}>Texto (use {"{year}"} para o ano atual)</span>
          <textarea
            className={`${inp} min-h-[80px]`}
            value={f.copyrightText}
            onChange={(e) => setF({ copyrightText: e.target.value })}
          />
        </label>
      </section>

      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-sm bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar rodapé"}
        </button>
      </div>
    </div>
  );
}
