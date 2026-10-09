import "server-only";

export async function sendReadyWhatsApp(phone: string, purchaseNumber: string) {
  const token = process.env.KOMANDA_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.KOMANDA_WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.KOMANDA_WHATSAPP_READY_TEMPLATE;
  if (!token || !phoneNumberId || !template) throw new Error("WhatsApp is not configured.");

  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: template,
        language: { code: "es_AR" },
        components: [{ type: "body", parameters: [{ type: "text", text: purchaseNumber }] }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`WhatsApp delivery failed (${response.status}).`);
}
