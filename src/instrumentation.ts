export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startPressureMonitor } = await import(
    "@/lib/observability/pressure"
  );
  startPressureMonitor();
}
