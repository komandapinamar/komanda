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

function groupMinSelect(group: ProductModifierGroup) {
  return group.minSelect ?? (group.required ? 1 : 0);
}

function groupMaxSelect(group: ProductModifierGroup) {
  return group.maxSelect ?? (group.required ? 1 : group.options.length);
}

export default function ProductModifierSheet({
  item,
  isOpen = true,
  onConfirm,
  onClose,
}: ProductModifierSheetProps) {
  const groups: ProductModifierGroup[] = useMemo(
    () => item.modifierGroups ?? [],
    [item.modifierGroups],
  );

  // Initial selection: for required single-choice groups, select first option by default
  const initialSelections = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const group of groups) {
      if (groupMinSelect(group) > 0 && groupMaxSelect(group) === 1 && group.options.length > 0) {
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
    (group: ProductModifierGroup, optionId: string, isSingleSelect: boolean = true) => {
      const groupId = group.id;
      const maxSelect = groupMaxSelect(group);
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
        if (current.length >= maxSelect) {
          return prev;
        }
        return {
          ...prev,
          [groupId]: [...current, optionId],
        };
      });
    },
    []
  );

  // Validation: every group must respect its min/max selection bounds
  const isValid = useMemo(() => {
    return groups.every((group) => {
      const selections = selectedOptions[group.id] ?? [];
      return (
        selections.length >= groupMinSelect(group) &&
        selections.length <= groupMaxSelect(group)
      );
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
    const selectedOptionIds: string[] = [];
    const selectedOptionNames: string[] = [];
    const selectedOptionDetails: ProductModifierOption[] = [];
    for (const group of groups) {
      const selections = selectedOptions[group.id] ?? [];
      for (const optId of selections) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) {
          selectedOptionIds.push(opt.id);
          selectedOptionNames.push(opt.name);
          selectedOptionDetails.push(opt);
        }
      }
    }

    const optionsNote = selectedOptionNames.join(", ");
    const configuredItem: MenuItem = {
      ...item,
      price: calculatedPrice,
      basePrice: item.basePrice ?? item.price,
      description: optionsNote
        ? `${item.description ? `${item.description} • ` : ""}[${optionsNote}]`
        : item.description,
      selectedOptionIds,
      selectedOptionSummary: optionsNote || null,
      selectedOptions: selectedOptionDetails,
    };

    onConfirm(configuredItem);
  }, [calculatedPrice, groups, isValid, item, onConfirm, selectedOptions]);

  if (!isOpen || groups.length === 0) return null;

  return (
    <div
      data-testid="product-modifier-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 backdrop-blur-sm pointer-events-auto select-none p-4"
      onClick={onClose}
    >
      <div
        data-testid="product-modifier-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-sheet-title"
        className="relative flex max-h-[88dvh] w-full max-w-md flex-col bg-[#161822] text-white rounded-[28px] border border-white/16 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: "#161822",
        }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
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
              ¿Querés agregar adicionales? Elegí tus opciones para continuar
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
        <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => {
            const currentSelected = selectedOptions[group.id] ?? [];
            const minSelect = groupMinSelect(group);
            const maxSelect = groupMaxSelect(group);
            const isSingleSelect = maxSelect === 1;
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
                  {minSelect > 0 ? (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                      Obligatorio
                    </span>
                  ) : (
                    <span className="text-[11px] text-neutral-400">Opcional</span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500">
                  {isSingleSelect
                    ? minSelect > 0
                      ? "Elegí 1 opción"
                      : "Elegí 1 opción o continuá sin adicionales"
                    : `Elegí${minSelect > 0 ? ` al menos ${minSelect}` : ""} hasta ${maxSelect} opciones`}
                </p>

                <div className="space-y-1.5" data-testid="modifier-options-group">
                  {group.options.map((option: ProductModifierOption) => {
                    const isSelected = currentSelected.includes(option.id);
                    const reachedLimit =
                      !isSingleSelect && !isSelected && currentSelected.length >= maxSelect;
                    return (
                      <div
                        key={option.id}
                        data-testid={`modifier-option-${option.id}`}
                        data-selected={String(isSelected)}
                        onClick={() =>
                          handleToggleOption(group, option.id, isSingleSelect)
                        }
                        aria-disabled={reachedLimit}
                        className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? "bg-[#ff4d2d]/15 border-[#ff4d2d] text-white shadow-sm"
                            : reachedLimit
                              ? "bg-white/[0.02] border-transparent text-neutral-500 cursor-not-allowed"
                              : "bg-white/5 border-transparent text-neutral-300 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          {/* Radio / checkbox visual indicator */}
                          <div
                            className={`mt-0.5 w-4 h-4 shrink-0 border-2 flex items-center justify-center transition-colors ${
                              isSingleSelect ? "rounded-full" : "rounded-[4px]"
                            } ${
                              isSelected
                                ? "border-[#ff4d2d]"
                                : "border-neutral-500"
                            }`}
                          >
                            {isSelected ? (
                              <div
                                className={
                                  isSingleSelect
                                    ? "w-2 h-2 rounded-full bg-[#ff4d2d]"
                                    : "w-2 h-2 rounded-[2px] bg-[#ff4d2d]"
                                }
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <span className="block text-sm font-semibold">
                              {option.name}
                            </span>
                            {option.description ? (
                              <p className="text-xs leading-4 text-neutral-400">
                                {option.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <span
                          className={`shrink-0 text-xs font-bold ${
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
            <span>Confirmar</span>
            <span className="text-white/80 font-normal">·</span>
            <span>${formatReelPrice(calculatedPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
