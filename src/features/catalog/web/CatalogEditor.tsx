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
}: {
  tenantId: string;
  initialCategories: Category[];
  initialItems: Item[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<string | null>(null);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const item = (await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/catalog/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: form.get("categoryId"),
            name: form.get("name"),
            description: null,
            price: form.get("price"),
            currency: "ARS",
            status: "draft",
            sortOrder: items.length,
            addonGroupIds: [],
          }),
        }),
      )) as Item;
      setItems((current) => [...current, item]);
      event.currentTarget.reset();
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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function createCombo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
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
          <form onSubmit={createCategory} className="mt-4 flex gap-2">
            <input required name="name" placeholder="Nueva categoría" className={inputClass} />
            <button className="rounded-md bg-amber-400 px-4 text-sm font-semibold text-zinc-950">
              Agregar
            </button>
          </form>
          <ul className="mt-4 space-y-2">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 rounded border border-zinc-800 p-3">
                <span>{category.name}</span>
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
                    Archivar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Productos</h2>
          <form onSubmit={createItem} className="mt-4 grid gap-2 sm:grid-cols-2">
            <input required name="name" placeholder="Producto" className={inputClass} />
            <input required name="price" pattern="[0-9]+\.[0-9]{2}" placeholder="3500.00" className={inputClass} />
            <select required name="categoryId" className={inputClass}>
              <option value="">Categoría</option>
              {categories.filter(({ status }) => status !== "archived").map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <button className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950">
              Agregar producto
            </button>
          </form>
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded border border-zinc-800 p-3">
                <span>{item.name} · ${item.price}</span>
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
                    Archivar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
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
    </div>
  );
}
