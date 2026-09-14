"use client";

import { FormEvent, useState } from "react";

type Category = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  version: number;
};

type Item = {
  id: string;
  categoryId: string;
  name: string;
  price: string;
  currency: string;
  barcode?: string | null;
  isGeneric?: boolean;
  genericIcon?: string | null;
  trackStock?: boolean;
  stockQuantity?: number;
  status: "draft" | "active" | "unavailable" | "archived";
  version: number;
};

async function jsonOrThrow(response: Response) {
  if (response.ok) return response.status === 204 ? null : response.json();
  if (response.status === 409) {
    throw new Error(
      "Otro operador modificó este recurso. Recargá antes de volver a intentar.",
    );
  }
  throw new Error("No se pudo guardar el cambio.");
}

export function CatalogEditor({
  tenantId,
  initialCategories,
  initialItems,
  isReadOnly = false,
  preset = "gastronomy",
}: {
  tenantId: string;
  initialCategories: Category[];
  initialItems: Item[];
  isReadOnly?: boolean;
  preset?: "gastronomy" | "express_retail";
}) {
  const isExpress = preset === "express_retail";
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<string | null>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [isGeneric, setIsGeneric] = useState(false);
  const [genericIcon, setGenericIcon] = useState("General");
  const [trackStock, setTrackStock] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  async function handleBarcodeLookup(code: string) {
    if (!code.trim()) return;
    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/v1/tenants/${tenantId}/catalog/lookup?barcode=${encodeURIComponent(code.trim())}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.source === "tenant") {
          setMessage(`El código ya pertenece a un producto local: "${data.item.name}"`);
        } else if (data.suggestion) {
          setNameInput(data.suggestion.name);
          setMessage(
            `Sugerencia autocompletada (${data.source === "global" ? "Red Komanda" : "Open Food Facts"}): ${data.suggestion.name}`,
          );
        } else {
          setMessage("Código no encontrado en catálogo global. Ingresá el nombre manualmente.");
        }
      }
    } catch {
      setMessage("Error al consultar el código de barras.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const category = (await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            description: null,
            sortOrder: categories.length,
            status: "draft",
          }),
        }),
      )) as Category;
      setCategories((current) => [...current, category]);
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const rawBarcode = (form.get("barcode") as string)?.trim();
      const rawPrice = form.get("price") as string;
      const formattedPrice = rawPrice.includes(".")
        ? rawPrice
        : `${rawPrice}.00`;

      const item = (await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: form.get("categoryId"),
            name: nameInput || form.get("name"),
            description: null,
            price: formattedPrice,
            currency: "ARS",
            barcode: isExpress ? (isGeneric ? null : rawBarcode || null) : null,
            isGeneric: isExpress ? isGeneric : false,
            genericIcon: isExpress && isGeneric ? genericIcon : null,
            trackStock: isExpress ? trackStock : false,
            stockQuantity: isExpress && trackStock ? Number(form.get("stockQuantity") || 0) : 0,
            status: "draft",
            sortOrder: items.length,
            addonGroupIds: [],
          }),
        }),
      )) as Item;
      setItems((current) => [...current, item]);
      formElement.reset();
      setNameInput("");
      setBarcodeInput("");
      setIsGeneric(false);
      setTrackStock(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function archive(
    kind: "categories" | "items",
    resource: Category | Item,
  ) {
    setMessage(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/${kind}/${resource.id}`, {
          method: "DELETE",
          headers: { "If-Match": String(resource.version) },
        }),
      );
      if (kind === "categories") {
        setCategories((current) => current.filter(({ id }) => id !== resource.id));
      } else {
        setItems((current) => current.filter(({ id }) => id !== resource.id));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function publish(
    kind: "categories" | "items",
    resource: Category | Item,
  ) {
    setMessage(null);
    try {
      const updated = (await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/${kind}/${resource.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/merge-patch+json",
            "If-Match": String(resource.version),
          },
          body: JSON.stringify({ status: "active" }),
        }),
      )) as Category | Item;

      if (kind === "categories") {
        setCategories((current) =>
          current.map((category) =>
            category.id === updated.id ? (updated as Category) : category,
          ),
        );
      } else {
        setItems((current) =>
          current.map((item) =>
            item.id === updated.id ? (updated as Item) : item,
          ),
        );
      }
      setMessage("Recurso publicado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function createAddonGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/addon-groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            minSelected: 0,
            maxSelected: 1,
            status: "draft",
            sortOrder: 0,
            options: [
              {
                name: form.get("optionName"),
                priceDelta: form.get("priceDelta"),
                status: "active",
                sortOrder: 0,
              },
            ],
          }),
        }),
      );
      setMessage("Grupo de adicionales creado.");
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function createCombo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/combos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: form.get("categoryId"),
            name: form.get("name"),
            description: null,
            price: form.get("price"),
            currency: "ARS",
            status: "draft",
            items: [{ itemId: form.get("itemId"), quantity: 1, sortOrder: 0 }],
          }),
        }),
      );
      setMessage("Combo creado.");
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  const inputClass =
    "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";

  return (
    <div className="space-y-8">
      {message ? (
        <p role="alert" className="rounded-md border border-amber-700 bg-amber-950 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Categorías</h2>
          {!isReadOnly && (
            <form onSubmit={createCategory} className="mt-4 flex gap-2">
              <input required name="name" placeholder="Nueva categoría" className={inputClass} />
              <button className="rounded-md bg-amber-400 px-4 text-sm font-semibold text-zinc-950">
                Agregar
              </button>
            </form>
          )}
          <ul className="mt-4 space-y-2">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 rounded border border-zinc-800 p-3">
                <span>{category.name}</span>
                {!isReadOnly && (
                  <span className="flex shrink-0 gap-3">
                    {category.status === "draft" ? (
                      <button
                        type="button"
                        onClick={() => publish("categories", category)}
                        className="text-sm text-emerald-300"
                      >
                        Publicar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => archive("categories", category)}
                      className="text-sm text-red-300"
                    >
                      Eliminar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Productos</h2>
          {!isReadOnly && (
            <form onSubmit={createItem} className="mt-4 space-y-3">
              {isExpress && (
                <>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isGeneric}
                        onChange={(e) => setIsGeneric(e.target.checked)}
                        className="accent-[var(--color-accent-tertiary)]"
                      />
                      <span>Producto genérico (sin código)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trackStock}
                        onChange={(e) => setTrackStock(e.target.checked)}
                        className="accent-[var(--color-accent-tertiary)]"
                      />
                      <span>Controlar stock</span>
                    </label>
                  </div>

                  {!isGeneric ? (
                    <div className="flex gap-2">
                      <input
                        name="barcode"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && barcodeInput.trim()) {
                            e.preventDefault();
                            handleBarcodeLookup(barcodeInput);
                          }
                        }}
                        placeholder="Código de barras (EAN/UPC)"
                        className={`${inputClass} flex-1`}
                      />
                      <button
                        type="button"
                        disabled={lookupLoading || !barcodeInput.trim()}
                        onClick={() => handleBarcodeLookup(barcodeInput)}
                        className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {lookupLoading ? "Buscando..." : "Buscar EAN"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Etiqueta rápida:</span>
                      <div className="flex gap-1.5 overflow-x-auto py-1">
                        {["General", "Bebida", "Snack", "Cafetería", "Panadería", "Comida", "Golosinas", "Fruta"].map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            onClick={() => setGenericIcon(tag)}
                            className={`rounded px-2.5 py-1 text-xs border transition ${
                              genericIcon === tag
                                ? "border-[var(--color-accent-tertiary)] bg-[var(--color-accent-tertiary)]/20 text-[var(--color-accent-tertiary)]"
                                : "border-zinc-800 bg-zinc-950 text-zinc-400"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  required
                  name="name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Nombre del producto"
                  className={inputClass}
                />
                <input
                  required
                  name="price"
                  pattern="[0-9]+(\.[0-9]{2})?"
                  placeholder="Precio (ej. 3500 o 3500.00)"
                  className={inputClass}
                />
                <select required name="categoryId" className={inputClass}>
                  <option value="">Categoría</option>
                  {categories
                    .filter(({ status }) => status !== "archived")
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
                {isExpress && trackStock && (
                  <input
                    type="number"
                    min="0"
                    name="stockQuantity"
                    defaultValue="10"
                    placeholder="Cantidad de stock inicial"
                    className={inputClass}
                  />
                )}
              </div>
              <button className="w-full rounded-md bg-[var(--color-accent-secondary)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-tertiary)] transition-colors">
                Agregar producto
              </button>
            </form>
          )}
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded border border-zinc-800 p-3"
              >
                <div>
                  <span className="font-medium">
                    {isExpress && item.isGeneric && item.genericIcon ? `[${item.genericIcon}] ` : ""}
                    {item.name}
                  </span>
                  <span className="text-zinc-400"> · ${item.price}</span>
                  {isExpress && item.barcode && (
                    <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                      EAN: {item.barcode}
                    </span>
                  )}
                  {isExpress && item.trackStock && (
                    <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-[var(--color-accent-tertiary)]">
                      Stock: {item.stockQuantity ?? 0}
                    </span>
                  )}
                </div>
                {!isReadOnly && (
                  <span className="flex shrink-0 gap-3">
                    {item.status === "draft" ? (
                      <button
                        type="button"
                        onClick={() => publish("items", item)}
                        className="text-sm text-emerald-300"
                      >
                        Publicar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => archive("items", item)}
                      className="text-sm text-red-300"
                    >
                      Eliminar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
      {!isReadOnly && (
        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createAddonGroup} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Nuevo grupo de adicionales</h2>
            <input required name="name" placeholder="Salsas" className={inputClass} />
            <input required name="optionName" placeholder="Cheddar" className={inputClass} />
            <input required name="priceDelta" pattern="[0-9]+\.[0-9]{2}" placeholder="500.00" className={inputClass} />
            <button className="rounded-md bg-amber-400 px-4 py-2 font-semibold text-zinc-950">Crear grupo</button>
          </form>
          <form onSubmit={createCombo} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Nuevo combo</h2>
            <input required name="name" placeholder="Combo clásico" className={inputClass} />
            <input required name="price" pattern="[0-9]+\.[0-9]{2}" placeholder="7000.00" className={inputClass} />
            <select required name="categoryId" className={inputClass}>
              <option value="">Categoría</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select required name="itemId" className={inputClass}>
              <option value="">Producto incluido</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="rounded-md bg-amber-400 px-4 py-2 font-semibold text-zinc-950">Crear combo</button>
          </form>
        </section>
      )}
    </div>
  );
}
