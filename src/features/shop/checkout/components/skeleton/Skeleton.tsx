export default function OfficialCartSkeleton() {
  return (
    <section className="animate-pulse rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-4">
      <div className="mb-4 space-y-2">
        <div className="h-7 w-40 rounded bg-[var(--color-accent-secondary)]/15" />
        <div className="h-4 w-64 rounded bg-[var(--color-accent-secondary)]/10" />
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="rounded-sm border border-[var(--color-accent-secondary)]/20 p-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-[var(--color-accent-secondary)]/15" />
                <div className="h-4 w-24 rounded bg-[var(--color-accent-secondary)]/10" />
              </div>
              <div className="h-5 w-20 rounded bg-[var(--color-accent-secondary)]/15" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-[var(--color-accent-secondary)] pt-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 rounded bg-[var(--color-accent-secondary)]/10" />
          <div className="h-4 w-24 rounded bg-[var(--color-accent-secondary)]/10" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 rounded bg-[var(--color-accent-secondary)]/10" />
          <div className="h-4 w-20 rounded bg-[var(--color-accent-secondary)]/10" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 rounded bg-[var(--color-accent-secondary)]/15" />
          <div className="h-6 w-28 rounded bg-[var(--color-accent-secondary)]/15" />
        </div>
      </div>
    </section>
  );
}
