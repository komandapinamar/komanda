import {
  formatOpeningHoursLines,
  hasOpeningHours,
  type OpeningHours,
} from "@/features/tenancy/domain/opening-hours";

export function OpeningHoursSummary({
  openingHours,
}: {
  openingHours?: OpeningHours | null;
}) {
  if (!hasOpeningHours(openingHours)) {
    return <p className="text-sm text-zinc-400">Horarios no informados.</p>;
  }

  return (
    <dl className="grid gap-1">
      {formatOpeningHoursLines(openingHours).map((line) => (
        <div
          key={line.days}
          className="flex items-baseline justify-between gap-3"
        >
          <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-400">
            {line.days}
          </dt>
          <dd className="text-right text-sm font-semibold text-white">
            {line.schedule}
          </dd>
        </div>
      ))}
    </dl>
  );
}
