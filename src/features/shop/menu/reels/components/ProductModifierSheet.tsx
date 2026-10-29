"use client";

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  type MouseEvent,
} from "react";
import type {
  MenuItem,
  ProductModifierGroup,
  ProductModifierOption,
} from "@/types/types";
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

const EXIT_DURATION_MS = 240;

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
      if (
        groupMinSelect(group) > 0 &&
        groupMaxSelect(group) === 1 &&
        group.options.length > 0
      ) {
        map[group.id] = [group.options[0].id];
      } else {
        map[group.id] = [];
      }
    }
    return map;
  }, [groups]);

  const [selectedOptions, setSelectedOptions] =
    useState<Record<string, string[]>>(initialSelections);
  const [isClosing, setIsClosing] = useState(false);
  const [isEntered, setIsEntered] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(true);
      return;
    }
    setIsClosing(false);
    const frame = window.requestAnimationFrame(() => {
      setIsEntered(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const triggerAnimatedClose = useCallback(() => {
    if (typeof window === "undefined") {
      onClose();
      return;
    }
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, EXIT_DURATION_MS);
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        triggerAnimatedClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerAnimatedClose]);

  const handleToggleOption = useCallback(
    (
      group: ProductModifierGroup,
      optionId: string,
      isSingleSelect: boolean = true,
    ) => {
      const groupId = group.id;
      const maxSelect = groupMaxSelect(group);
      setSelectedOptions((prev) => {
        const current = prev[groupId] ?? [];
        if (isSingleSelect) {
          if (groupMinSelect(group) === 0 && current.includes(optionId)) {
            return { ...prev, [groupId]: [] };
          }
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
    [],
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

  // Calculate total price and selected details
  const { calculatedPrice, totalDelta, selectedCount } = useMemo(() => {
    let delta = 0;
    let count = 0;
    for (const group of groups) {
      const selections = selectedOptions[group.id] ?? [];
      count += selections.length;
      for (const optId of selections) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt?.priceDelta) {
          delta += opt.priceDelta;
        }
      }
    }
    return {
      calculatedPrice: item.price + delta,
      totalDelta: delta,
      selectedCount: count,
    };
  }, [groups, item.price, selectedOptions]);

  const handleConfirm = useCallback(() => {
    if (!isValid) return;

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

    if (typeof window !== "undefined") {
      setIsClosing(true);
    }
    onConfirm(configuredItem);
  }, [calculatedPrice, groups, isValid, item, onConfirm, selectedOptions]);

  if (!isOpen && !isClosing) return null;
  if (groups.length === 0) return null;

  const showActiveState = isEntered && !isClosing;

  return (
    <div
      data-testid="product-modifier-overlay"
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 select-none pointer-events-auto transition-all duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        showActiveState
          ? "bg-black/80 backdrop-blur-md opacity-100"
          : "bg-black/0 backdrop-blur-none opacity-0"
      }`}
      onClick={triggerAnimatedClose}
    >
      <div
        data-testid="product-modifier-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-sheet-title"
        className={`relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden bg-[#161822] text-white rounded-[28px] border border-white/15 p-6 shadow-[0_28px_80px_-12px_rgba(0,0,0,0.85),0_0_40px_-10px_rgba(255,77,45,0.22)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          showActiveState
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-6 scale-[0.94] opacity-0"
        }`}
        style={{
          backgroundColor: "#161822",
        }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Top Ambient Highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-[#ff4d2d]/20 blur-3xl"
        />

        {/* Header */}
        <div className="relative z-10 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3.5">
            {item.image ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-inner">
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff4d2d]/30 bg-[#ff4d2d]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#ff7a61]">
                <span>✦</span>
                <span>Dale tu toque</span>
              </span>
              <h3
                id="modifier-sheet-title"
                data-testid="modifier-sheet-title"
                className="truncate text-xl font-extrabold leading-tight text-white"
              >
                {item.name}
              </h3>
              <p
                data-testid="modifier-sheet-subtitle"
                className="text-xs font-medium text-zinc-300"
              >
                Acompañá tu pedido con un adicional
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="modifier-sheet-close-btn"
            onClick={triggerAnimatedClose}
            aria-label="Cerrar opciones"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition-all duration-200 hover:scale-105 hover:border-white/25 hover:bg-white/15 hover:text-white active:scale-95 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Options Groups */}
        <div className="relative z-10 mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {groups.map((group) => {
            const currentSelected = selectedOptions[group.id] ?? [];
            const minSelect = groupMinSelect(group);
            const maxSelect = groupMaxSelect(group);
            const isSingleSelect = maxSelect === 1;
            return (
              <div
                key={group.id}
                data-testid={`modifier-group-${group.id}`}
                className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="block text-sm font-bold tracking-tight text-white">
                      {group.name}
                    </span>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {isSingleSelect
                        ? minSelect > 0
                          ? "Elegí tu opción preferida"
                          : "Sumá 1 adicional para realzar tu plato o continuá así"
                        : `Combiná${minSelect > 0 ? ` al menos ${minSelect} y` : ""} hasta ${maxSelect} adicionales a tu gusto`}
                    </p>
                  </div>
                  {minSelect > 0 ? (
                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Requerido
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      Sugerido
                    </span>
                  )}
                </div>

                <div
                  className="space-y-2 pt-1"
                  data-testid="modifier-options-group"
                >
                  {group.options.map((option: ProductModifierOption) => {
                    const isSelected = currentSelected.includes(option.id);
                    const reachedLimit =
                      !isSingleSelect &&
                      !isSelected &&
                      currentSelected.length >= maxSelect;
                    return (
                      <div
                        key={option.id}
                        data-testid={`modifier-option-${option.id}`}
                        data-selected={String(isSelected)}
                        onClick={() =>
                          handleToggleOption(group, option.id, isSingleSelect)
                        }
                        aria-disabled={reachedLimit}
                        className={`group flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all duration-200 ${
                          isSelected
                            ? "border-[#ff4d2d] bg-[#ff4d2d]/15 text-white shadow-[0_6px_20px_-6px_rgba(255,77,45,0.45)] scale-[1.01] cursor-pointer"
                            : reachedLimit
                              ? "border-transparent bg-white/[0.02] text-neutral-500 opacity-50 cursor-not-allowed"
                              : "border-white/8 bg-white/[0.04] text-neutral-200 hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.99] cursor-pointer"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {/* Radio / checkbox visual indicator */}
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-all duration-200 ${
                              isSingleSelect ? "rounded-full" : "rounded-md"
                            } ${
                              isSelected
                                ? "border-[#ff4d2d] bg-[#ff4d2d] text-white shadow-[0_0_10px_rgba(255,77,45,0.5)]"
                                : "border-zinc-500 bg-black/20 group-hover:border-zinc-300"
                            }`}
                          >
                            {isSelected ? (
                              <span className="text-[11px] font-black leading-none">
                                ✓
                              </span>
                            ) : null}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <span className="block text-sm font-semibold leading-snug text-white">
                              {option.name}
                            </span>
                            {option.description ? (
                              <p className="text-xs leading-4 text-zinc-400">
                                {option.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                            isSelected
                              ? "bg-[#ff4d2d] text-white"
                              : option.priceDelta && option.priceDelta > 0
                                ? "bg-white/8 text-emerald-400 group-hover:bg-white/12"
                                : "bg-emerald-500/15 text-emerald-300"
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

        {/* Footer Summary & CTA Confirmation Button */}
        <div className="relative z-10 mt-4 border-t border-white/10 pt-4 space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs text-zinc-400">
            <span>
              {selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? "adicional elegido" : "adicionales elegidos"}`
                : "Sin adicionales extra"}
            </span>
            {totalDelta > 0 ? (
              <span className="font-semibold text-emerald-400">
                Adicionales +${formatReelPrice(totalDelta)}
              </span>
            ) : (
              <span>Base ${formatReelPrice(item.price)}</span>
            )}
          </div>

          <button
            type="button"
            data-testid="modifier-confirm-btn"
            disabled={!isValid}
            onClick={handleConfirm}
            className="flex w-full items-center justify-between rounded-2xl bg-[#ff4d2d] px-5 py-4 text-base font-extrabold tracking-wide text-white shadow-[0_10px_28px_-4px_rgba(255,77,45,0.5)] transition-all duration-200 hover:bg-[#ff5c3e] hover:shadow-[0_14px_32px_-4px_rgba(255,77,45,0.65)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span>
              {selectedCount > 0
                ? "Sumar a mi pedido"
                : "Confirmar sin adicionales"}
            </span>
            <span className="rounded-xl bg-black/25 px-3 py-1 text-sm font-black text-white">
              ${formatReelPrice(calculatedPrice)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
