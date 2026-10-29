"use client";

import { FormEvent, useMemo, useState } from "react";
import { MediaUploader } from "@/features/catalog/web/MediaUploader";
import {
  catalogFetch,
  catalogHeaders,
  CatalogRequestError,
  normalizeMoneyInput,
} from "@/features/catalog/web/catalog-client";

type Category = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  version: number;
};
type MediaValue = { assetId: string | null; publicUrl: string | null };
type Item = {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  price: string;
  currency: string;
  itemType?: "unit" | "weighted";
  imageAssetId?: string | null;
  videoAssetId?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  barcode?: string | null;
  isGeneric?: boolean;
  genericIcon?: string | null;
  trackStock?: boolean;
  stockQuantity?: number;
  addonGroupIds?: string[];
  status: "draft" | "active" | "unavailable" | "archived";
  version: number;
};
type AddonOption = {
  id: string;
  name: string;
  description?: string | null;
  priceDelta: string;
  status: string;
  sortOrder?: number;
};
type AddonGroup = {
  id: string;
  name: string;
  minSelected: number;
  maxSelected: number;
  status: string;
  version: number;
  options: AddonOption[];
};
type Combo = {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  price: string;
  currency: string;
  imageAssetId?: string | null;
  imageUrl?: string | null;
  status: string;
  version: number;
  items: { itemId: string; itemName: string; quantity: number }[];
};

export type Props = {
  tenantId: string;
  initialCategories: Category[];
  initialItems: Item[];
  initialAddonGroups?: AddonGroup[];
  initialCombos?: Combo[];
  isReadOnly?: boolean;
  preset?: "gastronomy" | "express_retail";
};

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent-tertiary)]";

async function mutate<T>(url: string, init: RequestInit) {
  return catalogFetch<T>(url, init);
}

export function CatalogEditor({
  tenantId,
  initialCategories,
  initialItems,
  initialAddonGroups = [],
  initialCombos = [],
  isReadOnly = false,
  preset = "gastronomy",
}: Props) {
  const isExpress = preset === "express_retail";
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [groups, setGroups] = useState(initialAddonGroups);
  const [combos, setCombos] = useState(initialCombos);
  const [tab, setTab] = useState<"menu" | "addons" | "combos">("menu");
  const [categoryId, setCategoryId] = useState(
    initialCategories.find((c) => c.status === "active")?.id ??
      initialCategories[0]?.id ??
      "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null | undefined>(undefined);
  const [newCategory, setNewCategory] = useState("");

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) => item.categoryId === categoryId && item.status !== "archived",
      ),
    [items, categoryId],
  );
  const activeCategories = categories.filter(
    (category) => category.status !== "archived",
  );

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!newCategory.trim()) return;
    try {
      const category = await mutate<Category>(
        `/api/v1/tenants/${tenantId}/catalog/categories`,
        {
          method: "POST",
          headers: catalogHeaders(),
          body: JSON.stringify({
            name: newCategory,
            status: "draft",
            sortOrder: categories.length,
          }),
        },
      );
      setCategories((current) => [...current, category]);
      setCategoryId(category.id);
      setNewCategory("");
      setMessage(
        "Categoría creada. Publicala antes de publicar sus productos.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear la categoría.",
      );
    }
  }

  async function categoryAction(
    category: Category,
    action: "publish" | "archive",
  ) {
    try {
      if (action === "archive") {
        const categoryItems = items.filter(
          (entry) =>
            entry.categoryId === category.id && entry.status !== "archived",
        );
        for (const entry of categoryItems) {
          await mutate<Item>(
            `/api/v1/tenants/${tenantId}/catalog/items/${entry.id}`,
            {
              method: "PATCH",
              headers: catalogHeaders(entry.version),
              body: JSON.stringify({ status: "archived" }),
            },
          );
        }
        const categoryCombos = combos.filter(
          (entry) =>
            entry.categoryId === category.id && entry.status !== "archived",
        );
        for (const entry of categoryCombos) {
          await mutate<null>(
            `/api/v1/tenants/${tenantId}/catalog/combos/${entry.id}`,
            {
              method: "DELETE",
              headers: { "If-Match": String(entry.version) },
            },
          );
        }
        await mutate<null>(
          `/api/v1/tenants/${tenantId}/catalog/categories/${category.id}`,
          {
            method: "DELETE",
            headers: { "If-Match": String(category.version) },
          },
        );
        setItems((current) =>
          current.filter((entry) => entry.categoryId !== category.id),
        );
        setCombos((current) =>
          current.filter((entry) => entry.categoryId !== category.id),
        );
        setCategories((current) =>
          current.filter((item) => item.id !== category.id),
        );
      } else {
        const updated = await mutate<Category>(
          `/api/v1/tenants/${tenantId}/catalog/categories/${category.id}`,
          {
            method: "PATCH",
            headers: catalogHeaders(category.version),
            body: JSON.stringify({ status: "active" }),
          },
        );
        setCategories((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      if (action === "archive" && categoryId === category.id)
        setCategoryId(
          activeCategories.find((item) => item.id !== category.id)?.id ?? "",
        );
      setMessage(
        action === "publish" ? "Categoría publicada." : "Categoría archivada.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la categoría.",
      );
    }
  }

  async function itemAction(
    item: Item,
    action: "publish" | "pause" | "archive",
  ) {
    try {
      const updated = await mutate<Item>(
        `/api/v1/tenants/${tenantId}/catalog/items/${item.id}`,
        {
          method: "PATCH",
          headers: catalogHeaders(item.version),
          body: JSON.stringify({
            status:
              action === "publish"
                ? "active"
                : action === "pause"
                  ? "unavailable"
                  : "archived",
          }),
        },
      );
      setItems((current) =>
        action === "archive"
          ? current.filter((entry) => entry.id !== item.id)
          : current.map((entry) =>
              entry.id === updated.id ? { ...entry, ...updated } : entry,
            ),
      );
      setMessage(
        action === "publish"
          ? "Producto publicado."
          : action === "pause"
            ? "Producto pausado."
            : "Producto archivado.",
      );
    } catch (error) {
      if (error instanceof CatalogRequestError && error.status === 409) {
        try {
          const [latestItems, latestCategories] = await Promise.all([
            mutate<{ data: Item[] }>(`/api/v1/tenants/${tenantId}/catalog/items`, { method: "GET" }),
            mutate<{ data: Category[] }>(`/api/v1/tenants/${tenantId}/catalog/categories`, { method: "GET" }),
          ]);
          setItems(latestItems.data);
          setCategories(latestCategories.data);
        } catch {
          // Preserve the original, actionable conflict message if refresh fails.
        }
      }
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el producto.",
      );
    }
  }

  function updateItem(item: Item) {
    setItems((current) =>
      current.some((entry) => entry.id === item.id)
        ? current.map((entry) => (entry.id === item.id ? item : entry))
        : [...current, item],
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-accent-tertiary)]/50 bg-[var(--color-accent-tertiary)]/10 p-4 text-sm text-[var(--color-accent-tertiary)]"
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      ) : null}
      {!isExpress ? (
        <nav
          className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1"
          aria-label="Secciones del catálogo"
        >
          {(
            [
              ["menu", "Menú"],
              ["addons", "Adicionales"],
              ["combos", "Combos"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-bold transition ${tab === value ? "bg-[var(--color-accent-tertiary)] text-[var(--color-accent-primary)]" : "text-zinc-400 hover:text-[var(--color-accent-tertiary)]"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      {tab === "menu" ? (
        <section className="grid gap-6 lg:grid-cols-[230px_1fr]">
          <aside className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Categorías</h2>
              <span className="text-xs text-zinc-500">
                {activeCategories.length}
              </span>
            </div>
            <div className="space-y-1">
              {activeCategories.map((category) => (
                <div
                  key={category.id}
                  className={`group flex items-center gap-2 rounded-lg p-2 ${categoryId === category.id ? "bg-zinc-800" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setCategoryId(category.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                  >
                    {category.name}
                  </button>
                  {category.status === "draft" && !isReadOnly ? (
                    <button
                      type="button"
                      title="Publicar categoría"
                      onClick={() => void categoryAction(category, "publish")}
                      className="text-xs text-[var(--color-accent-tertiary)] cursor-pointer hover:underline"
                    >
                      Publicar
                    </button>
                  ) : null}
                  {!isReadOnly ? (
                    <button
                      type="button"
                      title="Eliminar categoría"
                      aria-label={`Eliminar categoría ${category.name}`}
                      onClick={() => void categoryAction(category, "archive")}
                      className="text-xs text-red-400 transition hover:text-red-300 cursor-pointer"
                    >
                      Borrar
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {!isReadOnly ? (
              <form
                onSubmit={createCategory}
                className="mt-4 border-t border-zinc-800 pt-4"
              >
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Nueva categoría"
                  className={inputClass}
                />
                <button className="mt-2 w-full rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-950">
                  Agregar categoría
                </button>
              </form>
            ) : null}
          </aside>
          <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-tertiary)]">
                  {isExpress ? "Catálogo" : "Menú"}
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  {categories.find((category) => category.id === categoryId)
                    ?.name ?? "Seleccioná una categoría"}
                </h2>
              </div>
              {!isReadOnly && categoryId ? (
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg bg-[var(--color-accent-tertiary)] px-4 py-2 text-sm font-bold text-[var(--color-accent-primary)]"
                >
                  + Nuevo producto
                </button>
              ) : null}
            </header>
            {visibleItems.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
                  >
                    <div className="relative h-40 bg-zinc-800">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl text-zinc-600">
                          {isExpress ? (
                            <svg
                              className="h-12 w-12 text-zinc-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                              />
                            </svg>
                          ) : (
                            "🍽"
                          )}
                        </div>
                      )}
                      {item.videoUrl ? (
                        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs">
                          Video
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold">{item.name}</h3>
                            {item.itemType === "weighted" ? (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                Balanza {item.barcode ? `• PLU ${item.barcode}` : ""}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-lg font-black text-[var(--color-accent-tertiary)]">
                            ${item.price}
                            {item.itemType === "weighted" ? (
                              <span className="ml-1 text-xs font-medium text-zinc-400">
                                / kg ref.
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      {item.description ? (
                        <p className="line-clamp-2 text-xs text-zinc-400">
                          {item.description}
                        </p>
                      ) : null}
                      {isExpress && item.trackStock ? (
                        <p className="text-xs text-zinc-400">
                          Stock: {item.stockQuantity ?? 0}
                        </p>
                      ) : null}
                      {!isReadOnly ? (
                        <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-3 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            className="text-[var(--color-accent-tertiary)]"
                          >
                            Editar
                          </button>
                          {item.status === "draft" ||
                          item.status === "unavailable" ? (
                            <button
                              type="button"
                              onClick={() => void itemAction(item, "publish")}
                              className="text-green-600"
                            >
                              Publicar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void itemAction(item, "pause")}
                              className="text-[var(--color-accent-tertiary)]"
                            >
                              Pausar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void itemAction(item, "archive")}
                            className="text-[var(--color-accent-tertiary)]"
                          >
                            Borrar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
                <p className="font-semibold">
                  Todavía no hay productos en esta categoría.
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Creá el primero y agregale una imagen para que el menú sea más
                  atractivo.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
      {tab === "addons" ? (
        <AddonPanel
          tenantId={tenantId}
          groups={groups}
          setGroups={setGroups}
          readOnly={isReadOnly}
          onMessage={setMessage}
        />
      ) : null}
      {tab === "combos" ? (
        <ComboPanel
          tenantId={tenantId}
          combos={combos}
          setCombos={setCombos}
          categories={activeCategories}
          items={items.filter((item) => item.status !== "archived")}
          readOnly={isReadOnly}
          onMessage={setMessage}
        />
      ) : null}
      {editing !== undefined ? (
        <ItemModal
          tenantId={tenantId}
          item={editing}
          categories={activeCategories}
          groups={groups}
          isExpress={isExpress}
          onClose={() => setEditing(undefined)}
          onSaved={(item) => {
            updateItem(item);
            setEditing(undefined);
            setMessage(
              editing
                ? "Producto actualizado."
                : "Producto creado como borrador.",
            );
          }}
        />
      ) : null}
    </div>
  );
}

function ItemModal({
  tenantId,
  item,
  categories,
  groups,
  isExpress,
  onClose,
  onSaved,
}: {
  tenantId: string;
  item: Item | null;
  categories: Category[];
  groups: AddonGroup[];
  isExpress: boolean;
  onClose: () => void;
  onSaved: (item: Item) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.price ?? "");
  const [selectedCategory, setSelectedCategory] = useState(
    item?.categoryId ?? categories[0]?.id ?? "",
  );
  const [image, setImage] = useState<MediaValue>({
    assetId: item?.imageAssetId ?? null,
    publicUrl: item?.imageUrl ?? null,
  });
  const [video, setVideo] = useState<MediaValue>({
    assetId: item?.videoAssetId ?? null,
    publicUrl: item?.videoUrl ?? null,
  });
  const [selectedGroups, setSelectedGroups] = useState(
    item?.addonGroupIds ?? [],
  );
  const [itemType, setItemType] = useState<"unit" | "weighted">(
    item?.itemType ?? "unit",
  );
  const [trackStock, setTrackStock] = useState(item?.trackStock ?? false);
  const [stock, setStock] = useState(String(item?.stockQuantity ?? 0));
  const [barcode, setBarcode] = useState(item?.barcode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    const normalizedPrice = normalizeMoneyInput(price);
    if (!normalizedPrice) {
      setError("Ingresá un precio válido, por ejemplo 3500 o 3500,50.");
      return;
    }
    const rawDigits = barcode.trim().replace(/\D/g, "");
    const normalizedPlu = /^(2[0-9])\d{11}$/.test(rawDigits)
      ? rawDigits.slice(2, 7)
      : rawDigits
        ? rawDigits.slice(-5).padStart(5, "0")
        : "";
    if (isExpress && itemType === "weighted" && !/^(?!00000)\d{5}$/.test(normalizedPlu)) {
      setError("Ingresá un Código PLU numérico válido de hasta 5 dígitos (ej. 00123).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const normalizedBarcode = isExpress
        ? itemType === "weighted"
          ? normalizedPlu
          : barcode.trim() || null
        : null;
      const body = {
        categoryId: selectedCategory,
        name,
        description: description.trim() || null,
        price: normalizedPrice,
        currency: "ARS",
        itemType: isExpress ? itemType : "unit",
        imageAssetId: image.assetId,
        videoAssetId: video.assetId,
        barcode: normalizedBarcode,
        isGeneric: false,
        genericIcon: null,
        trackStock: isExpress && itemType === "unit" && trackStock,
        stockQuantity:
          isExpress && itemType === "unit" && trackStock
            ? Number(stock) || 0
            : 0,
        status: item?.status ?? "draft",
        addonGroupIds: isExpress ? [] : selectedGroups,
        ...(item ? { version: item.version } : {}),
      };
      const saved = await mutate<Item>(
        item
          ? `/api/v1/tenants/${tenantId}/catalog/items/${item.id}`
          : `/api/v1/tenants/${tenantId}/catalog/items`,
        {
          method: item ? "PATCH" : "POST",
          headers: item ? catalogHeaders(item.version) : catalogHeaders(),
          body: JSON.stringify(body),
        },
      );
      onSaved({
        ...saved,
        imageUrl: image.publicUrl,
        videoUrl: video.publicUrl,
        addonGroupIds: selectedGroups,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el producto.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Editar producto" : "Nuevo producto"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
    >
      <form
        onSubmit={save}
        className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl"
      >
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-tertiary)]">
              {item ? "Editar producto" : "Nuevo producto"}
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              Información del producto
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl text-zinc-400"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        {error ? (
          <p className="mb-4 rounded-lg bg-[var(--color-accent-tertiary)]/10 p-3 text-sm text-[var(--color-accent-tertiary)]">
            {error}
          </p>
        ) : null}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-semibold">
              Nombre
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Descripción
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className={`${inputClass} mt-1`}
                placeholder="Contale al cliente qué incluye"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">
                Precio
                <input
                  required
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className={`${inputClass} mt-1`}
                  placeholder="3500,50"
                />
              </label>
              <label className="block text-sm font-semibold">
                Categoría
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  className={`${inputClass} mt-1`}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {isExpress ? (
              <>
                <label className="block text-sm font-semibold">
                  Tipo de producto
                  <select
                    value={itemType}
                    onChange={(event) =>
                      setItemType(event.target.value as "unit" | "weighted")
                    }
                    className={`${inputClass} mt-1`}
                  >
                    <option value="unit">Unidad (código de barras estándar)</option>
                    <option value="weighted">Balanza (PLU 5 dígitos)</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  {itemType === "weighted"
                    ? "Código PLU (5 dígitos, ej. 00123)"
                    : "Código de barras"}
                  <input
                    value={barcode}
                    onChange={(event) => setBarcode(event.target.value)}
                    className={`${inputClass} mt-1`}
                    placeholder={
                      itemType === "weighted" ? "Ej: 00123" : "Opcional"
                    }
                  />
                </label>
                {itemType === "unit" ? (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={trackStock}
                        onChange={(event) => setTrackStock(event.target.checked)}
                      />{" "}
                      Controlar stock
                    </label>
                    {trackStock ? (
                      <label className="block text-sm font-semibold">
                        Stock inicial
                        <input
                          type="number"
                          min="0"
                          value={stock}
                          onChange={(event) => setStock(event.target.value)}
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="space-y-5">
            <MediaUploader
              tenantId={tenantId}
              kind="image"
              value={image}
              onChange={setImage}
            />
            <MediaUploader
              tenantId={tenantId}
              kind="video"
              value={video}
              onChange={setVideo}
            />
            {!isExpress ? (
              <div>
                <p className="mb-2 text-sm font-semibold">
                  Adicionales disponibles
                </p>
                {groups.filter((group) => group.status !== "archived").length ? (
                  <div className="space-y-2">
                    {groups
                      .filter((group) => group.status !== "archived")
                      .map((group) => (
                        <label
                          key={group.id}
                          className="flex items-center gap-2 text-sm text-zinc-300"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(group.id)}
                            onChange={(event) =>
                              setSelectedGroups((current) =>
                                event.target.checked
                                  ? [...current, group.id]
                                  : current.filter((id) => id !== group.id),
                              )
                            }
                          />
                          {group.name}
                        </label>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Creá grupos desde la pestaña Adicionales.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <footer className="mt-6 flex justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-400"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-[var(--color-accent-tertiary)] px-5 py-2 text-sm font-bold text-[var(--color-accent-primary)] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar producto"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function AddonPanel({
  tenantId,
  groups,
  setGroups,
  readOnly,
  onMessage,
}: {
  tenantId: string;
  groups: AddonGroup[];
  setGroups: (value: AddonGroup[]) => void;
  readOnly: boolean;
  onMessage: (value: string) => void;
}) {
  const [name, setName] = useState("");
  const [optionName, setOptionName] = useState("");
  const [optionDescription, setOptionDescription] = useState("");
  const [optionPrice, setOptionPrice] = useState("0");
  const [saving, setSaving] = useState(false);
  const [editingOption, setEditingOption] = useState<{
    groupId: string;
    optionId: string;
    name: string;
    description: string;
    priceDelta: string;
  } | null>(null);
  async function create(event: FormEvent) {
    event.preventDefault();
    const price = normalizeMoneyInput(optionPrice);
    if (!price) {
      onMessage("El precio adicional no es válido.");
      return;
    }
    setSaving(true);
    try {
      const group = await mutate<AddonGroup>(
        `/api/v1/tenants/${tenantId}/catalog/addon-groups`,
        {
          method: "POST",
          headers: catalogHeaders(),
          body: JSON.stringify({
            name,
            minSelected: 0,
            maxSelected: 1,
            status: "draft",
            sortOrder: groups.length,
            options: [
              {
                name: optionName,
                description: optionDescription.trim() || null,
                priceDelta: price,
                status: "active",
                sortOrder: 0,
              },
            ],
          }),
        },
      );
      setGroups([...groups, group]);
      setName("");
      setOptionName("");
      setOptionDescription("");
      setOptionPrice("0");
      onMessage("Grupo de adicionales creado.");
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "No se pudo crear el grupo.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function publishGroup(group: AddonGroup) {
    setSaving(true);
    try {
      const updated = await mutate<AddonGroup>(
        `/api/v1/tenants/${tenantId}/catalog/addon-groups/${group.id}`,
        {
          method: "PATCH",
          headers: catalogHeaders(group.version),
          body: JSON.stringify({ status: "active" }),
        },
      );
      setGroups(
        groups.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      onMessage("Grupo de adicionales publicado.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "No se pudo publicar el grupo.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function archiveGroup(group: AddonGroup) {
    setSaving(true);
    try {
      await mutate<null>(
        `/api/v1/tenants/${tenantId}/catalog/addon-groups/${group.id}`,
        {
          method: "DELETE",
          headers: { "If-Match": String(group.version) },
        },
      );
      setGroups(groups.filter((entry) => entry.id !== group.id));
      onMessage("Grupo de adicionales eliminado.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el grupo de adicionales.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeOption(group: AddonGroup, optionId: string) {
    if (group.options.length <= 1) {
      await archiveGroup(group);
      return;
    }
    setSaving(true);
    try {
      const options = group.options
        .filter((option) => option.id !== optionId)
        .map((option, index) => ({
          name: option.name,
          description: option.description ?? null,
          priceDelta: option.priceDelta,
          status: option.status === "unavailable" ? "unavailable" : "active",
          sortOrder: index,
        }));
      const updated = await mutate<AddonGroup>(
        `/api/v1/tenants/${tenantId}/catalog/addon-groups/${group.id}`,
        {
          method: "PATCH",
          headers: catalogHeaders(group.version),
          body: JSON.stringify({ options, version: group.version }),
        },
      );
      setGroups(
        groups.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      onMessage("Opción adicional eliminada.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la opción adicional.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveOption(group: AddonGroup) {
    if (!editingOption) return;
    const price = normalizeMoneyInput(editingOption.priceDelta);
    if (!price) {
      onMessage("El precio adicional no es válido.");
      return;
    }
    setSaving(true);
    try {
      const options = group.options.map((option, index) => {
        const isTarget = option.id === editingOption.optionId;
        return {
          name: isTarget ? editingOption.name : option.name,
          description: isTarget
            ? editingOption.description.trim() || null
            : option.description ?? null,
          priceDelta: isTarget ? price : option.priceDelta,
          status: option.status === "unavailable" ? "unavailable" : "active",
          sortOrder: option.sortOrder ?? index,
        };
      });
      const updated = await mutate<AddonGroup>(
        `/api/v1/tenants/${tenantId}/catalog/addon-groups/${group.id}`,
        {
          method: "PATCH",
          headers: catalogHeaders(group.version),
          body: JSON.stringify({ options, version: group.version }),
        },
      );
      setGroups(
        groups.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setEditingOption(null);
      onMessage("Adicional actualizado.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el adicional.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-tertiary)]">
            Configuración reutilizable
          </p>
          <h2 className="mt-1 text-2xl font-bold">Adicionales</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Creá opciones como salsas, tamaños o extras y asignalas a cualquier
            producto.
          </p>
        </header>
        {groups.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups
              .filter((group) => group.status !== "archived")
              .map((group) => (
                <article
                  key={group.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{group.name}</h3>
                    <div className="flex items-center gap-2">
                      {group.status === "draft" && !readOnly ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void publishGroup(group)}
                          className="rounded-md bg-[var(--color-accent-tertiary)] px-2 py-1 text-xs font-bold text-[var(--color-accent-primary)] disabled:opacity-50 cursor-pointer"
                        >
                          Publicar
                        </button>
                      ) : (
                        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                          {group.status === "active" ? "Publicado" : group.status}
                        </span>
                      )}
                      {!readOnly ? (
                        <button
                          type="button"
                          disabled={saving}
                          aria-label={`Eliminar grupo ${group.name}`}
                          onClick={() => void archiveGroup(group)}
                          className="text-xs font-bold text-red-400 transition hover:text-red-300 disabled:opacity-50 cursor-pointer"
                        >
                          Borrar
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Elegir entre {group.minSelected} y {group.maxSelected}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {(group.options ?? []).map((option) => {
                      const isEditing =
                        editingOption?.groupId === group.id &&
                        editingOption.optionId === option.id;
                      if (isEditing && editingOption) {
                        return (
                          <li
                            key={option.id}
                            className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                          >
                            <input
                              value={editingOption.name}
                              onChange={(event) =>
                                setEditingOption({
                                  ...editingOption,
                                  name: event.target.value,
                                })
                              }
                              placeholder="Nombre"
                              className={inputClass}
                            />
                            <input
                              value={editingOption.description}
                              onChange={(event) =>
                                setEditingOption({
                                  ...editingOption,
                                  description: event.target.value,
                                })
                              }
                              placeholder="Descripción para el cliente"
                              className={inputClass}
                            />
                            <input
                              value={editingOption.priceDelta}
                              onChange={(event) =>
                                setEditingOption({
                                  ...editingOption,
                                  priceDelta: event.target.value,
                                })
                              }
                              placeholder="Precio extra"
                              className={inputClass}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveOption(group)}
                                className="rounded-md bg-[var(--color-accent-tertiary)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent-primary)] disabled:opacity-50"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOption(null)}
                                className="px-3 py-1.5 text-xs font-bold text-zinc-400"
                              >
                                Cancelar
                              </button>
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li key={option.id} className="space-y-1">
                          <div className="flex justify-between gap-2">
                            <span>{option.name}</span>
                            <span className="shrink-0 text-zinc-500">
                              +${option.priceDelta}
                            </span>
                          </div>
                          {option.description ? (
                            <p className="text-xs text-zinc-500">
                              {option.description}
                            </p>
                          ) : null}
                          {!readOnly ? (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingOption({
                                    groupId: group.id,
                                    optionId: option.id,
                                    name: option.name,
                                    description: option.description ?? "",
                                    priceDelta: option.priceDelta,
                                  })
                                }
                                className="text-xs text-[var(--color-accent-tertiary)] underline underline-offset-2 cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void removeOption(group, option.id)}
                                className="text-xs text-red-400 underline underline-offset-2 hover:text-red-300 disabled:opacity-50 cursor-pointer"
                              >
                                Borrar
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
            Aún no hay grupos de adicionales.
          </p>
        )}
      </div>
      {!readOnly ? (
        <form
          onSubmit={create}
          className="h-fit space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
        >
          <h2 className="font-bold">Nuevo grupo</h2>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre del grupo"
            className={inputClass}
          />
          <input
            required
            value={optionName}
            onChange={(event) => setOptionName(event.target.value)}
            placeholder="Primera opción"
            className={inputClass}
          />
          <input
            value={optionDescription}
            onChange={(event) => setOptionDescription(event.target.value)}
            placeholder="Descripción para el cliente (opcional)"
            className={inputClass}
          />
          <input
            required
            value={optionPrice}
            onChange={(event) => setOptionPrice(event.target.value)}
            placeholder="Precio extra"
            className={inputClass}
          />
          <button
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent-tertiary)] px-4 py-2 text-sm font-bold text-[var(--color-accent-primary)]"
          >
            {saving ? "Creando..." : "Crear grupo"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ComboPanel({
  tenantId,
  combos,
  setCombos,
  categories,
  items,
  readOnly,
  onMessage,
}: {
  tenantId: string;
  combos: Combo[];
  setCombos: (value: Combo[]) => void;
  categories: Category[];
  items: Item[];
  readOnly: boolean;
  onMessage: (value: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [comboCategory, setComboCategory] = useState(categories[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  async function create(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeMoneyInput(price);
    if (!normalized || !selected.length) {
      onMessage("Un combo necesita un precio válido y al menos un producto.");
      return;
    }
    try {
      const created = await mutate<Combo>(
        `/api/v1/tenants/${tenantId}/catalog/combos`,
        {
          method: "POST",
          headers: catalogHeaders(),
          body: JSON.stringify({
            categoryId: comboCategory,
            name,
            description: null,
            price: normalized,
            currency: "ARS",
            status: "draft",
            items: selected.map((itemId, sortOrder) => ({
              itemId,
              quantity: 1,
              sortOrder,
            })),
          }),
        },
      );
      setCombos([
        ...combos,
        {
          ...created,
          items: selected.map((itemId) => ({
            itemId,
            itemName:
              items.find((item) => item.id === itemId)?.name ?? "Producto",
            quantity: 1,
          })),
        },
      ]);
      setName("");
      setPrice("");
      setSelected([]);
      onMessage("Combo creado.");
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "No se pudo crear el combo.",
      );
    }
  }
  async function publishCombo(combo: Combo) {
    try {
      const updated = await mutate<Combo>(
        `/api/v1/tenants/${tenantId}/catalog/combos/${combo.id}`,
        {
          method: "PATCH",
          headers: catalogHeaders(combo.version),
          body: JSON.stringify({ status: "active" }),
        },
      );
      setCombos(
        combos.map((entry) =>
          entry.id === updated.id ? { ...entry, ...updated } : entry,
        ),
      );
      onMessage("Combo publicado.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "No se pudo publicar el combo.",
      );
    }
  }
  async function archiveCombo(combo: Combo) {
    try {
      await mutate<null>(
        `/api/v1/tenants/${tenantId}/catalog/combos/${combo.id}`,
        {
          method: "DELETE",
          headers: { "If-Match": String(combo.version) },
        },
      );
      setCombos(combos.filter((entry) => entry.id !== combo.id));
      onMessage("Combo eliminado.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el combo.",
      );
    }
  }
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-tertiary)]">
            Venta agrupada
          </p>
          <h2 className="mt-1 text-2xl font-bold">Combos</h2>
        </header>
        {combos.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {combos
              .filter((combo) => combo.status !== "archived")
              .map((combo) => (
                <article
                  key={combo.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{combo.name}</h3>
                    {!readOnly ? (
                      <div className="flex items-center gap-2">
                        {combo.status === "draft" ? (
                          <button
                            type="button"
                            onClick={() => void publishCombo(combo)}
                            className="rounded-md bg-[var(--color-accent-tertiary)] px-2 py-1 text-xs font-bold text-[var(--color-accent-primary)] cursor-pointer"
                          >
                            Publicar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Eliminar combo ${combo.name}`}
                          onClick={() => void archiveCombo(combo)}
                          className="text-xs font-bold text-red-400 transition hover:text-red-300 cursor-pointer"
                        >
                          Borrar
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 text-lg font-black text-[var(--color-accent-tertiary)]">
                    ${combo.price}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-zinc-400">
                    {combo.items.map((line) => (
                      <li key={line.itemId}>
                        {line.quantity} × {line.itemName}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
            Aún no hay combos.
          </p>
        )}
      </div>
      {!readOnly ? (
        <form
          onSubmit={create}
          className="h-fit space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
        >
          <h2 className="font-bold">Nuevo combo</h2>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre del combo"
            className={inputClass}
          />
          <input
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Precio del combo"
            className={inputClass}
          />
          <select
            required
            value={comboCategory}
            onChange={(event) => setComboCategory(event.target.value)}
            className={inputClass}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 p-3">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Productos incluidos
            </p>
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
          </div>
          <button className="w-full rounded-lg bg-[var(--color-accent-tertiary)] px-4 py-2 text-sm font-bold text-[var(--color-accent-primary)]">
            Crear combo
          </button>
        </form>
      ) : null}
    </section>
  );
}
