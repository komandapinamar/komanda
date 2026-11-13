import { runtimePool } from "@/db";
import { emitMetric } from "@/lib/observability/metrics";

/**
 * Runtime comun de los procesos de background.
 *
 * Un worker es un proceso de una sola responsabilidad que corre en bucle:
 * reclama trabajo, lo aplica y duerme. Este modulo centraliza lo que todos
 * necesitan igual:
 *
 * - ejecucion inmediata y luego por intervalo (sin setInterval, para que dos
 *   iteraciones nunca se solapen);
 * - detencion ordenada: SIGTERM/SIGINT terminan la iteracion en curso y
 *   cierran el pool, para que el rollout no corte una entrega a medio hacer;
 * - errores por iteracion que no matan el proceso ni producen un hot loop.
 */
export type WorkerRunResult = {
  iterations: number;
  last?: unknown;
  lastError?: unknown;
};

export type WorkerDefinition<T> = {
  /** Nombre corto para logs y metricas. */
  name: string;
  /** Espera entre iteraciones, en milisegundos. */
  intervalMs: number;
  /** Trabajo de una iteracion. */
  run: () => Promise<T>;
  /** Ejecuta una sola iteracion y termina. Util para jobs programados. */
  once?: boolean;
  /** Señal externa de detencion (tests, plataformas). */
  signal?: AbortSignal;
  /** Inyeccion de espera (tests). Por defecto usa la espera interrumpible. */
  sleep?: (ms: number) => Promise<void>;
  /** Registra SIGTERM/SIGINT. Desactivarlo en tests. */
  registerSignals?: boolean;
  /** Cierra el pool de base al terminar. Desactivarlo en tests. */
  closePool?: boolean;
};

function createInterruptibleSleeper() {
  let wake: (() => void) | null = null;
  return {
    sleep(ms: number) {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
      });
    },
    interrupt() {
      wake?.();
    },
  };
}

export function parseWorkerInterval(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export async function runWorkerLoop<T>(
  definition: WorkerDefinition<T>,
): Promise<WorkerRunResult> {
  const {
    name,
    intervalMs,
    run,
    once = false,
    signal,
    registerSignals = true,
    closePool = true,
  } = definition;

  const sleeper = createInterruptibleSleeper();
  const sleep = definition.sleep ?? sleeper.sleep;

  let stopping = false;
  const stop = (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.info(
      `[worker:${name}] Stop requested (${reason}). Finishing the current iteration before exiting.`,
    );
    sleeper.interrupt();
  };

  if (registerSignals) {
    process.once("SIGTERM", () => stop("SIGTERM"));
    process.once("SIGINT", () => stop("SIGINT"));
  }
  if (signal) {
    if (signal.aborted) {
      stopping = true;
    } else {
      signal.addEventListener("abort", () => stop("abort"), { once: true });
    }
  }

  let iterations = 0;
  let last: T | undefined;
  let lastError: unknown;

  console.info(
    `[worker:${name}] Started (interval ${intervalMs}ms${once ? ", single run" : ""}).`,
  );

  while (!stopping) {
    const started = performance.now();
    try {
      last = await run();
      lastError = undefined;
      iterations += 1;
      emitMetric("worker.iteration_completed", {
        latencyMs: Math.round(performance.now() - started),
        result: "ok",
        tags: { worker: name },
      });
    } catch (error) {
      lastError = error;
      emitMetric("worker.iteration_failed", {
        latencyMs: Math.round(performance.now() - started),
        result: "failed",
        tags: {
          worker: name,
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        },
      });
      console.error(`[worker:${name}] Iteration failed:`, error);
    }

    if (once || stopping) break;
    await sleep(intervalMs);
  }

  if (closePool) {
    try {
      await runtimePool.end();
    } catch (error) {
      console.error(`[worker:${name}] Error closing the database pool:`, error);
    }
  }

  console.info(`[worker:${name}] Stopped after ${iterations} iteration(s).`);
  return { iterations, last, lastError };
}
