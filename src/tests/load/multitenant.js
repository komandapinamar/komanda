import http from "k6/http";
import { check, sleep } from "k6";

// Target concurrency configuration (500 to 1000 concurrent users at peak)
const maxVus = Number(__ENV.MAX_VUS ?? 1000);
const tenants = Number(__ENV.TENANTS ?? 50);
const baseUrl = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const fastifyUrl = __ENV.FASTIFY_URL ?? baseUrl;

export const options = {
  scenarios: {
    // 1. Storefront Customers: Browsing, Carts & Checkout (up to 80% of traffic)
    storefront_customers: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "30s", target: Math.round(maxVus * 0.25) }, // Ramp to 250
        { duration: "1m",  target: Math.round(maxVus * 0.5) },  // Steady 500
        { duration: "1m",  target: maxVus },                     // Peak 1000
        { duration: "1m",  target: Math.round(maxVus * 0.5) },  // Back to 500
        { duration: "30s", target: 0 },                         // Cooldown
      ],
      exec: "storefrontCustomerJourney",
    },

    // 2. POS Mostrador / Cajeros: Consultas activas y creación de pedidos de salón
    pos_cashiers: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "3m",  target: 100 },
        { duration: "30s", target: 0 },
      ],
      exec: "posCashierJourney",
    },

    // 3. Pantallas de Cocina y Comanderas: Streaming SSE concurrente con cursor
    pos_sse_streams: {
      executor: "constant-vus",
      vus: Math.min(tenants * 2, 100),
      duration: "4m",
      exec: "posSseStream",
    },

    // 4. Agentes de impresión de red local: Polling de trabajos de impresión
    printer_agents: {
      executor: "constant-vus",
      vus: Math.min(tenants, 50),
      duration: "4m",
      exec: "printAgentPolling",
    },
  },

  thresholds: {
    // El criterio principal de calidad es la disponibilidad: tolerancia a fallos < 1%
    http_req_failed: ["rate<0.01"],
    "http_req_duration{surface:catalog}": ["p(95)<500", "p(99)<1200"],
    "http_req_duration{surface:cart}": ["p(95)<700", "p(99)<1500"],
    "http_req_duration{surface:checkout}": ["p(95)<1500", "p(99)<3000"],
    "http_req_duration{surface:pos_orders}": ["p(95)<600", "p(99)<1200"],
    "http_req_duration{surface:sse}": ["p(95)<4000"],
    "http_req_duration{surface:print_claim}": ["p(95)<400", "p(99)<800"],
  },
};

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function storefrontCustomerJourney() {
  const tenantNumber = (__VU % tenants) + 1;
  const tenantSlug = `tenant-${tenantNumber}`;

  // 1. Navegar Menú / Catálogo
  const catalogRes = http.get(`${baseUrl}/api/v1/storefronts/${tenantSlug}/catalog`, {
    tags: { surface: "catalog" },
  });
  check(catalogRes, {
    "catalog loaded 200": (r) => r.status === 200,
  });

  // Simular lectura y selección de platos (think time: 1 a 3 segundos)
  sleep(Math.random() * 2 + 1);

  // 2. 40% de los usuarios agregan items al carrito
  if (Math.random() < 0.40) {
    const cartId = uuidv4();
    const cartRes = http.post(
      `${baseUrl}/api/v1/storefronts/${tenantSlug}/carts`,
      JSON.stringify({
        lines: [
          {
            kind: "item",
            resourceId: uuidv4(),
            quantity: 1,
            optionIds: [],
            confirmedUnitPrice: "3500.00",
          },
        ],
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `cart-${cartId}`,
        },
        tags: { surface: "cart" },
      },
    );
    check(cartRes, {
      "cart created (200/201)": (r) => [200, 201].includes(r.status),
    });

    sleep(Math.random() * 2 + 1);

    // 3. 20% de los usuarios con carrito inician checkout / pago
    if (Math.random() < 0.50) {
      const checkoutRes = http.post(
        `${baseUrl}/api/v1/storefronts/${tenantSlug}/carts/${cartId}/payment-sessions`,
        JSON.stringify({
          tender: "mercadopago_webhook",
          deliveryType: "pickup",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `pay-${uuidv4()}`,
          },
          tags: { surface: "checkout" },
        },
      );
      check(checkoutRes, {
        "checkout response bounded": (r) => r.status < 500,
      });
    }
  }

  sleep(Math.random() * 2 + 1);
}

export function posCashierJourney() {
  const tenantNumber = (__VU % tenants) + 1;
  const tenantId = uuidv4(); // O id representativo

  // 1. Listado de pedidos activos en mostrador
  const ordersRes = http.get(
    `${baseUrl}/api/v1/tenants/${tenantId}/orders?status=active`,
    {
      headers: {
        Authorization: `Bearer test-pos-token-${tenantNumber}`,
      },
      tags: { surface: "pos_orders" },
    },
  );
  check(ordersRes, {
    "pos orders bounded": (r) => r.status < 500,
  });

  sleep(Math.random() * 3 + 2);
}

export function posSseStream() {
  const tenantNumber = (__VU % tenants) + 1;
  const tenantId = uuidv4();

  // Suscripción al stream de eventos en tiempo real (Fastify)
  const events = http.get(
    `${fastifyUrl}/api/v1/tenants/${tenantId}/orders/events?cursor=0`,
    {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer test-pos-token-${tenantNumber}`,
      },
      tags: { surface: "sse" },
      timeout: "15s",
    },
  );
  check(events, {
    "sse status bounded": (r) => [200, 204, 401, 404].includes(r.status),
  });

  sleep(5);
}

export function printAgentPolling() {
  const tenantNumber = (__VU % tenants) + 1;

  // Emulación de agente de comanderas solicitando trabajos pendientes
  const claimRes = http.post(
    `${fastifyUrl}/api/v1/print/jobs/claim`,
    null,
    {
      headers: {
        Authorization: `Bearer test-printer-token-${tenantNumber}`,
      },
      tags: { surface: "print_claim" },
    },
  );
  check(claimRes, {
    "print claim non-500": (r) => [200, 204, 401].includes(r.status),
  });

  sleep(2);
}

