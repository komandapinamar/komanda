export type SlackCashOrderAlertInput = {
  webhookUrl: string;
  ticketNumber: string;
  total: string;
  currency: string;
  items: Array<{ name: string; quantity: number; lineTotal: string }>;
  timestamp?: Date;
};

export class SlackAlertService {
  async dispatchCashOrderAlert(input: SlackCashOrderAlertInput): Promise<boolean> {
    if (!input.webhookUrl.trim().startsWith("https://")) {
      return false;
    }

    const time = (input.timestamp ?? new Date()).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const itemsSummary = input.items
      .map((it) => `• ${it.quantity}x ${it.name} ($${it.lineTotal})`)
      .join("\n");

    const payload = {
      text: `🚨 Nuevo cobro pendiente en efectivo: Ticket #${input.ticketNumber} ($${input.total} ${input.currency})`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🔔 Cobro en Efectivo Pendiente",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Ticket:*\n#${input.ticketNumber}`,
            },
            {
              type: "mrkdwn",
              text: `*Total a Cobrar:*\n*$${input.total} ${input.currency}*`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Detalle de ítems:*\n${itemsSummary.length > 0 ? itemsSummary : "Sin ítems especificados"}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📍 Terminal: Komanda Espresso | 🕒 ${time} hs`,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(input.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
