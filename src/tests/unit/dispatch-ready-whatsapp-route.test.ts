import { afterEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/features/orders/application/dispatch-ready-whatsapp.job", () => ({ dispatchReadyWhatsApp: dispatch }));
import { POST } from "@/app/api/v1/internal/cron/dispatch-ready-whatsapp/route";

describe("WhatsApp scheduler authorization", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects missing or incorrect cron credentials", async () => {
    vi.stubEnv("CRON_SECRET", "private-secret");
    const url = "https://komanda.example/api/v1/internal/cron/dispatch-ready-whatsapp";
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(401);
    expect((await POST(new Request(url, { method: "POST", headers: { Authorization: "Bearer incorrect" } }))).status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "private-secret");
    dispatch.mockResolvedValue({ sent: 2, failed: 0 });
    const response = await POST(new Request("https://komanda.example/api/v1/internal/cron/dispatch-ready-whatsapp", {
      method: "POST", headers: { Authorization: "Bearer private-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2, failed: 0 });
  });
});
