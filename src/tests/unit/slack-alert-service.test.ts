import { describe, expect, it, vi, beforeEach } from "vitest";
import { SlackAlertService } from "@/features/integrations/application/slack-alert.service";

describe("Epic 5: Slack Cash Order Alert Service", () => {
  const service = new SlackAlertService();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-https webhook URLs", async () => {
    const success = await service.dispatchCashOrderAlert({
      webhookUrl: "http://insecure.slack.com",
      ticketNumber: "1042",
      total: "3500.00",
      currency: "ARS",
      items: [{ name: "Coca-Cola", quantity: 1, lineTotal: "1500.00" }],
    });

    expect(success).toBe(false);
  });

  it("dispatches structured Block Kit payload to Slack webhook", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return { ok: true, status: 200 } as Response;
    });

    const success = await service.dispatchCashOrderAlert({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/XXXX",
      ticketNumber: "1042",
      total: "3500.00",
      currency: "ARS",
      items: [
        { name: "Coca-Cola 500ml", quantity: 1, lineTotal: "1500.00" },
        { name: "Alfajor Havanna", quantity: 2, lineTotal: "2000.00" },
      ],
    });

    expect(success).toBe(true);
    expect(capturedUrl).toBe("https://hooks.slack.com/services/T00/B00/XXXX");
    expect(capturedBody).toBeDefined();
    expect(capturedBody.text).toContain("Ticket #1042");
    expect(capturedBody.text).toContain("3500.00 ARS");

    // Check Block Kit structure
    const blocks = capturedBody.blocks;
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe("header");
    expect(blocks[1].fields[0].text).toContain("#1042");
    expect(blocks[1].fields[1].text).toContain("$3500.00 ARS");
    expect(blocks[2].text.text).toContain("1x Coca-Cola 500ml");
    expect(blocks[2].text.text).toContain("2x Alfajor Havanna");
    expect(blocks[3].elements[0].text).toContain("Komanda Espresso");
  });

  it("handles fetch network failure gracefully without throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const success = await service.dispatchCashOrderAlert({
      webhookUrl: "https://hooks.slack.com/services/test",
      ticketNumber: "1043",
      total: "1000.00",
      currency: "ARS",
      items: [],
    });

    expect(success).toBe(false);
  });
});
