"use client";

import { useState, useMemo, useCallback, type MouseEvent } from "react";
import type { MenuItem, ProductModifierGroup, ProductModifierOption } from "@/types/types";
import { formatReelPrice } from "./ReelOverlay";

export interface ProductModifierSheetProps {
  item: MenuItem;
  isOpen?: boolean;
  onConfirm: (configuredItem: MenuItem) => void;
  onClose: () => void;
}

const DEFAULT_SAUCE_GROUP: ProductModifierGroup = {
  id: "default-sauces",
  name: "Elegí tus aderezos",
  required: true,
  options: [
    { id: "mayo-trufa", name: "Mayonesa Trufada de la casa", priceDelta: 0 },
    { id: "bbq-smoke", name: "Salsa Barbacoa Ahumada", priceDelta: 0 },
    { id: "alioli-garlic", name: "Alioli con Ajo Asado", priceDelta: 0 },
  ],
};

export default function ProductModifierSheet({
  item,
  isOpen = true,
  onConfirm,
  onClose,
}: ProductModifierSheetProps) {
  // Use item's modifier groups or fall back to default sauces if empty
  const groups: ProductModifierGroup[] = useMemo(() => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      return item.modifierGroups;
    }
    return [DEFAULT_SAUCE_GROUP];
  }, [item.modifierGroups]);

  // Initial selection: for required single-choice groups, select first option by default
  const initialSelections = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const group of groups) {
      if (group.required && group.options.length > 0) {
        map[group.id] = [group.options[0].id];
      } else {
        map[group.id] = [];
      }
    }
    return map;
  }, [groups]);

  const [selectedOptions, setSelectedOptions] =
    useState<Record<string, string[]>>(initialSelections);

  const handleToggleOption = useCallback(
    (groupId: string, optionId: string, isSingleSelect: boolean = true) => {
      setSelectedOptions((prev) => {
        const current = prev[groupId] ?? [];
        if (isSingleSelect) {
          return { ...prev, [groupId]: [optionId] };
        }
        if (current.includes(optionId)) {
          return {
            ...prev,
            [groupId]: current.filter((id) => id !== optionId),
          };
        }
        return {
          ...prev,
          [groupId]: [...current, optionId],
        };
      });
    },
    []
  );

  // Validation: all required groups must have at least one selection
  const isValid = useMemo(() => {
    return groups.every((group) => {
      if (!group.required) return true;
      const selections = selectedOptions[group.id] ?? [];
      return selections.length > 0;
    });
  }, [groups, selectedOptions]);

  // Calculate total price with option deltas
  const calculatedPrice = useMemo(() => {
    let totalDelta = 0;
    for (const group of groups) {
      const selections = selectedOptions[group.id] ?? [];
      for (const optId of selections) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt?.priceDelta) {
          totalDelta += opt.priceDelta;
        }
      }
    }
    return item.price + totalDelta;
  }, [groups, item.price, selectedOptions]);

  const handleConfirm = useCallback(() => {
    if (!isValid) return;

    // Build human-readable option summary
    const selectedOptionNames: string[] = [];
    for (const group of groups) {
      const selections = selectedOptions[group.id] ?? [];
      for (const optId of selections) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) {
          selectedOptionNames.push(opt.name);
        }
      }
    }

    const optionsNote = selectedOptionNames.join(", ");
    const configuredItem: MenuItem = {
      ...item,
      price: calculatedPrice,
      description: optionsNote
        ? `${item.description ? `${item.description} • ` : ""}[${optionsNote}]`
        : item.description,
    };

    onConfirm(configuredItem);
  }, [calculatedPrice, groups, isValid, item, onConfirm, selectedOptions]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="product-modifier-overlay"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm pointer-events-auto select-none"
      onClick={onClose}
    >
      <div
        data-testid="product-modifier-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-sheet-title"
        className="relative w-full max-w-md bg-[#161822] text-white rounded-t-[28px] border-t border-white/16 p-6 pb-8 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-300"
        style={{
          borderTopLeftRadius: "28px",
          borderTopRightRadius: "28px",
          backgroundColor: "#161822",
        }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          data-testid="modifier-sheet-handle"
          className="w-10 h-1 bg-white/25 rounded-full mx-auto -mt-2 mb-3"
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="space-y-1">
            <h3
              id="modifier-sheet-title"
              data-testid="modifier-sheet-title"
              className="text-xl font-extrabold text-white leading-tight"
            >
              {item.name}
            </h3>
            <p
              data-testid="modifier-sheet-subtitle"
              className="text-xs text-neutral-400"
            >
              Elegí tus aderezos y opciones para continuar
            </p>
          </div>
          <button
            type="button"
            data-testid="modifier-sheet-close-btn"
            onClick={onClose}
            aria-label="Cerrar opciones"
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-neutral-300 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Options Groups */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {groups.map((group) => {
            const currentSelected = selectedOptions[group.id] ?? [];
            return (
              <div
                key={group.id}
                data-testid={`modifier-group-${group.id}`}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-neutral-200">
                    {group.name}
                  </span>
                  {group.required ? (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                      Obligatorio
                    </span>
                  ) : (
                    <span className="text-[11px] text-neutral-400">Opcional</span>
                  )}
                </div>

                <div className="space-y-1.5" data-testid="modifier-options-group">
                  {group.options.map((option: ProductModifierOption) => {
                    const isSelected = currentSelected.includes(option.id);
                    return (
                      <div
                        key={option.id}
                        data-testid={`modifier-option-${option.id}`}
                        data-selected={String(isSelected)}
                        onClick={() => handleToggleOption(group.id, option.id, true)}
                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? "bg-[#ff4d2d]/15 border-[#ff4d2d] text-white shadow-sm"
                            : "bg-white/5 border-transparent text-neutral-300 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Radio visual indicator */}
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? "border-[#ff4d2d]"
                                : "border-neutral-500"
                            }`}
                          >
                            {isSelected ? (
                              <div className="w-2 h-2 rounded-full bg-[#ff4d2d]" />
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold">
                            {option.name}
                          </span>
                        </div>

                        <span
                          className={`text-xs font-bold ${
                            isSelected ? "text-[#ff4d2d]" : "text-[#22c55e]"
                          }`}
                        >
                          {option.priceDelta && option.priceDelta > 0
                            ? `+$${formatReelPrice(option.priceDelta)}`
                            : "Incluido"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Confirmation Button */}
        <div className="pt-2">
          <button
            type="button"
            data-testid="modifier-confirm-btn"
            disabled={!isValid}
            onClick={handleConfirm}
            className="w-full py-4 rounded-full bg-[#ff4d2d] hover:bg-[#e03e1f] text-white font-extrabold text-base tracking-wide shadow-[0_8px_24px_rgba(255,77,45,0.35)] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Confirmar y agregar</span>
            <span className="text-white/80 font-normal">·</span>
            <span>${formatReelPrice(calculatedPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
