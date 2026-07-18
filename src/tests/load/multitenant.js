import http from "k6/http";
import { check, sleep } from "k6";

const tenants = Number(__ENV.TENANTS ?? __ENV.tenants ?? 100);
const operators = Number(__ENV.OPERATORS ?? __ENV.operators ?? 50);
const baseUrl = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const expectedReadStatuses = http.expectedStatuses(200, 400, 401, 404);

export const options = {
  scenarios: {
    storefront: {
      executor: "constant-vus",
      vus: Math.max(tenants, 1),
      duration: "1m",
      exec: "storefront",
    },
    operators: {
      executor: "constant-vus",
      vus: Math.max(operators, 1),
      duration: "1m",
      exec: "orderDashboard",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "http_req_duration{surface:storefront}": ["p(95)<2000"],
    "http_req_duration{surface:orders}": ["p(95)<2000"],
    "http_req_duration{surface:sse}": ["p(95)<5000"],
  },
};

export function storefront() {
  const tenantNumber = (__VU % tenants) + 1;
  const response = http.get(
    `${baseUrl}/api/v1/storefronts/tenant-${tenantNumber}/catalog`,
    {
      tags: { surface: "storefront" },
      responseCallback: expectedReadStatuses,
    },
  );
  check(response, { "storefront useful": (res) => [200, 404].includes(res.status) });
  sleep(1);
}

export function orderDashboard() {
  const tenantNumber = (__VU % tenants) + 1;
  const orders = http.get(
    `${baseUrl}/api/v1/tenants/tenant-${tenantNumber}/orders`,
    {
      tags: { surface: "orders" },
      responseCallback: expectedReadStatuses,
    },
  );
  check(orders, { "orders bounded": (res) => res.status < 500 });

  const events = http.get(
    `${baseUrl}/api/v1/tenants/tenant-${tenantNumber}/orders/events?cursor=0`,
    {
      tags: { surface: "sse" },
      timeout: "5s",
      responseCallback: expectedReadStatuses,
    },
  );
  check(events, { "sse bounded": (res) => [200, 401, 404].includes(res.status) });
  sleep(1);
}
