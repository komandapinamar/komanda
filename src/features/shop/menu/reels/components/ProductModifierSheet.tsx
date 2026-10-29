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

  const isValid = useMemo(() => {
    return groups.every((group) => {
      const selections = selectedOptions[group.id] ?? [];
      return (
        selections.length >= groupMinSelect(group) &&
        selections.length <= groupMaxSelect(group)
      );
    });
  }, [groups, selectedOptions]);

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
          ? "bg-black/70 backdrop-blur-xl opacity-100"
          : "bg-black/0 backdrop-blur-none opacity-0"
      }`}
      onClick={triggerAnimatedClose}
    >
      <div
        data-testid="product-modifier-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-sheet-title"
        className={`liquid-prism-ring liquid-glass-card relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden bg-[#161822] text-[#f4f3f1] rounded-[28px] p-6 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          showActiveState
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-5 scale-[0.95] opacity-0"
        }`}
        style={{
          backgroundColor: "#161822",
        }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative z-10 flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="flex min-w-0 items-center gap-3.5">
            {item.image ? (
              <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-[#202024] ring-1 ring-white/15">
                <img
                  src={item.image}
                  alt={item.name}
                  className="size-full object-cover"
                />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-[#9b9ba4]">
                <span className="size-1.5 rounded-full bg-[#d97757]" />
                <span>Dale tu toque</span>
              </span>
              <h3
                id="modifier-sheet-title"
                data-testid="modifier-sheet-title"
                className="truncate text-xl font-medium tracking-tight text-[#f4f3f1]"
              >
                {item.name}
              </h3>
              <p
                data-testid="modifier-sheet-subtitle"
                className="text-xs text-[#9b9ba4]"
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
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-xs text-[#9b9ba4] transition duration-200 hover:bg-white/15 hover:text-[#f4f3f1] active:scale-95 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Options Groups (Dabbit Divided Widget Style) */}
        <div className="relative z-10 mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => {
            const currentSelected = selectedOptions[group.id] ?? [];
            const minSelect = groupMinSelect(group);
            const maxSelect = groupMaxSelect(group);
            const isSingleSelect = maxSelect === 1;
            return (
              <div
                key={group.id}
                data-testid={`modifier-group-${group.id}`}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <div>
                    <span className="block text-sm font-medium tracking-tight text-[#f4f3f1]">
                      {group.name}
                    </span>
                    <p className="mt-0.5 text-xs text-[#9b9ba4]">
                      {isSingleSelect
                        ? minSelect > 0
                          ? "Elegí tu opción preferida"
                          : "Sumá 1 adicional para realzar tu plato o continuá así"
                        : `Combiná${minSelect > 0 ? ` al menos ${minSelect} y` : ""} hasta ${maxSelect} adicionales a tu gusto`}
                    </p>
                  </div>
                  {minSelect > 0 ? (
                    <span className="shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-[#f4f3f1]">
                      Requerido
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9ba4]">
                      Sugerido
                    </span>
                  )}
                </div>

                <div
                  className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/10 bg-[#141416]/75"
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
                        className={`group flex items-center justify-between gap-3 px-4 py-3.5 transition duration-200 ${
                          isSelected
                            ? "bg-white/[0.09] text-[#f4f3f1] cursor-pointer"
                            : reachedLimit
                              ? "text-[#9b9ba4]/40 opacity-50 cursor-not-allowed"
                              : "text-[#f4f3f1]/90 hover:bg-white/[0.04] cursor-pointer"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex size-4.5 shrink-0 items-center justify-center border transition duration-200 ${
                              isSingleSelect ? "rounded-full" : "rounded-[5px]"
                            } ${
                              isSelected
                                ? "border-[#f4f3f1] bg-[#f4f3f1] text-[#141416]"
                                : "border-white/25 bg-transparent group-hover:border-white/45"
                            }`}
                          >
                            {isSelected ? (
                              <span className="text-[10px] font-bold leading-none">
                                ✓
                              </span>
                            ) : null}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <span className="block text-sm font-medium leading-snug text-[#f4f3f1]">
                              {option.name}
                            </span>
                            {option.description ? (
                              <p className="text-xs leading-4 text-[#9b9ba4]">
                                {option.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                            isSelected
                              ? "bg-[#f4f3f1] text-[#141416]"
                              : option.priceDelta && option.priceDelta > 0
                                ? "border border-white/10 bg-white/[0.04] text-[#f4f3f1]"
                                : "text-[#9ec4b5]"
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

        {/* Footer Summary & Dabbit Pill CTA */}
        <div className="relative z-10 mt-5 border-t border-white/[0.08] pt-4 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-[#9b9ba4] tabular-nums">
            <span>
              {selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? "adicional elegido" : "adicionales elegidos"}`
                : "Sin adicionales extra"}
            </span>
            {totalDelta > 0 ? (
              <span className="font-medium text-[#f4f3f1]">
                +${formatReelPrice(totalDelta)} en adicionales
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
            className="flex h-11 w-full items-center justify-between rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] shadow-lg transition duration-200 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span>
              {selectedCount > 0
                ? "Sumar a mi pedido"
                : "Confirmar sin adicionales"}
            </span>
            <span className="rounded-full bg-[#141416]/12 px-3 py-0.5 text-xs font-semibold tabular-nums text-[#141416]">
              ${formatReelPrice(calculatedPrice)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
