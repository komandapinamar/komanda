export default function OfficialCartSkeleton() {
  return (
    <section className="liquid-glass-card animate-pulse rounded-3xl p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div className="h-6 w-32 rounded-full bg-white/[0.08]" />
        <div className="h-5 w-20 rounded-full bg-white/[0.06]" />
      </div>

      <div className="space-y-2.5">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#101013]/80 p-4"
          >
            <div className="space-y-2">
              <div className="h-4 w-36 rounded-full bg-white/[0.08]" />
              <div className="h-3 w-20 rounded-full bg-white/[0.05]" />
            </div>
            <div className="h-4 w-20 rounded-full bg-white/[0.08]" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
        <div className="h-5 w-16 rounded-full bg-white/[0.08]" />
        <div className="h-6 w-28 rounded-full bg-white/[0.1]" />
      </div>
    </section>
  );
}
