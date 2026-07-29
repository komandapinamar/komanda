import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("printing tenant isolation", () => {
  it("defines tenant/location-scoped agents, jobs, attempts and RLS", async () => {
    const migration = await readFile("drizzle/0010_multitenant_printing.sql", "utf8");

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "print_agents"');
    expect(migration).toContain('FOREIGN KEY ("tenant_id", "location_id")');
    expect(migration).toContain('UNIQUE ("tenant_id", "idempotency_key")');
    for (const table of ["print_agents", "print_jobs", "print_job_attempts"]) {
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`${table}_runtime_isolation`);
    }
  });

  it("authenticates agents by server-side token prefix lookup and derives scope", async () => {
    const [agentService, jobService] = await Promise.all([
      readFile("features/printing/application/print-agent.service.ts", "utf8"),
      readFile("features/printing/application/print-job.service.ts", "utf8"),
    ]);

    expect(agentService).toContain("tokenPrefix");
    expect(agentService).toContain("timingSafeEqual");
    expect(agentService).not.toContain("PRINT_SERVICE_TOKEN");
    expect(jobService).toContain("source: \"agent\"");
    expect(jobService).toContain("locationId: agent.locationId");
  });

  it("claims jobs with a lease and reports results idempotently", async () => {
    const repository = await readFile(
      "features/printing/infrastructure/print-job.repository.ts",
      "utf8",
    );
    const service = await readFile(
      "features/printing/application/print-job.service.ts",
      "utf8",
    );

    expect(repository.toLowerCase()).toContain("for update skip locked");
    expect(repository).toContain("lease_expires_at");
    expect(repository).toContain("attemptCount");
    expect(service).toContain("print-result:${input.jobId}:${request.attemptNumber}");
    expect(service).toContain("IdempotencyService");
  });
});
