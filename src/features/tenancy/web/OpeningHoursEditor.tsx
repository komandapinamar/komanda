"use client";

import {
  WEEKDAYS,
  type OpeningHours,
  type OpeningHoursRange,
  type Weekday,
} from "@/features/tenancy/domain/opening-hours";

const inputClass =
  "rounded-xl border border-white/15 bg-[#141416] px-2.5 py-1.5 text-sm text-[#f4f3f1] outline-none transition focus:border-white/35 focus:ring-2 focus:ring-white/15";

const DEFAULT_RANGE: OpeningHoursRange = { open: "09:00", close: "18:00" };

export function OpeningHoursEditor({
  value,
  onChange,
}: {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
}) {
  function setDayRanges(day: Weekday, ranges: OpeningHoursRange[]) {
    const next = { ...value };
    if (ranges.length === 0) {
      delete next[day];
    } else {
      next[day] = ranges;
    }
    onChange(next);
  }

  function addRange(day: Weekday) {
    const ranges = value[day] ?? [];
    const last = ranges[ranges.length - 1];
    setDayRanges(day, [
      ...ranges,
      last ? { open: last.close, close: last.close } : DEFAULT_RANGE,
    ]);
  }

  function updateRange(
    day: Weekday,
    index: number,
    field: keyof OpeningHoursRange,
    nextValue: string,
  ) {
    const ranges = [...(value[day] ?? [])];
    const current = ranges[index];
    if (!current) return;
    ranges[index] = { ...current, [field]: nextValue };
    setDayRanges(day, ranges);
  }

  function removeRange(day: Weekday, index: number) {
    setDayRanges(
      day,
      (value[day] ?? []).filter((_, current) => current !== index),
    );
  }

  function copyMondayToWeek() {
    const monday = value.monday ?? [];
    if (monday.length === 0) return;
    const next: OpeningHours = { ...value };
    for (const day of WEEKDAYS) next[day.key] = monday.map((range) => ({ ...range }));
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#c2c2cc]">
          Se publican en la página principal de Komanda. Si un día no tiene
          horarios, se muestra como cerrado.
        </p>
        {(value.monday ?? []).length > 0 ? (
          <button
            type="button"
            onClick={copyMondayToWeek}
            className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12]"
          >
            Copiar lunes a todos los días
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/12 bg-[#101013]/90">
        {WEEKDAYS.map((day) => {
          const ranges = value[day.key] ?? [];
          return (
            <div key={day.key} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[7rem_1fr]">
              <span className="pt-1.5 text-sm font-medium text-[#f4f3f1]">
                {day.label}
              </span>
              <div className="grid gap-2">
                {ranges.length === 0 ? (
                  <p className="py-1.5 text-sm text-[#9b9ba4]">Cerrado</p>
                ) : (
                  ranges.map((range, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        required
                        value={range.open}
                        aria-label={`${day.label} apertura ${index + 1}`}
                        onChange={(event) =>
                          updateRange(day.key, index, "open", event.target.value)
                        }
                        className={inputClass}
                      />
                      <span className="text-xs text-[#c2c2cc]">a</span>
                      <input
                        type="time"
                        required
                        value={range.close}
                        aria-label={`${day.label} cierre ${index + 1}`}
                        onChange={(event) =>
                          updateRange(day.key, index, "close", event.target.value)
                        }
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => removeRange(day.key, index)}
                        className="text-xs font-medium text-[#c2c2cc] underline underline-offset-4 transition hover:text-[#f4f3f1]"
                      >
                        Quitar
                      </button>
                    </div>
                  ))
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => addRange(day.key)}
                    className="text-xs font-medium text-[#d4d4dc] underline underline-offset-4 transition hover:text-white"
                  >
                    Agregar horario
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
