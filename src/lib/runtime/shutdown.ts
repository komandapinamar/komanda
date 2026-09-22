import "server-only";

import { runtimePool } from "@/db";

type ShutdownHook = () => Promise<void> | void;

class GracefulShutdownManager {
  private isShuttingDown = false;
  private readonly hooks = new Set<ShutdownHook>();
  private readonly sseClients = new Set<() => void>();
  private activeRequests = 0;

  constructor() {
    this.registerSignalHandlers();
  }

  isTerminating() {
    return this.isShuttingDown;
  }

  registerSseClient(closeStream: () => void): () => void {
    if (this.isShuttingDown) {
      closeStream();
      return () => undefined;
    }
    this.sseClients.add(closeStream);
    return () => {
      this.sseClients.delete(closeStream);
    };
  }

  registerHook(hook: ShutdownHook): () => void {
    this.hooks.add(hook);
    return () => {
      this.hooks.delete(hook);
    };
  }

  trackRequest(): () => void {
    if (this.isShuttingDown) {
      throw new Error("Server is shutting down. Please retry on another replica.");
    }
    this.activeRequests += 1;
    let finished = false;
    return () => {
      if (!finished) {
        finished = true;
        this.activeRequests = Math.max(0, this.activeRequests - 1);
      }
    };
  }

  private registerSignalHandlers() {
    if (process.env.NODE_ENV === "test") return;

    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      console.info(`[shutdown] Received ${signal}. Draining active connections...`);

      // 1. Close SSE streams to make clients reconnect to sister replicas
      for (const closeClient of this.sseClients) {
        try {
          closeClient();
        } catch {}
      }
      this.sseClients.clear();

      // 2. Execute custom shutdown hooks
      for (const hook of this.hooks) {
        try {
          await hook();
        } catch (err) {
          console.error("[shutdown] Error in shutdown hook:", err);
        }
      }

      // 3. Drain in-flight requests with deadline (max 10s)
      const deadline = Date.now() + 10_000;
      while (this.activeRequests > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // 4. Close database pool
      try {
        console.info("[shutdown] Closing database connection pool...");
        await runtimePool.end();
        console.info("[shutdown] Pool closed successfully.");
      } catch (err) {
        console.error("[shutdown] Error closing pool:", err);
      }

      process.exit(0);
    };

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  }
}

export const shutdownManager = new GracefulShutdownManager();
