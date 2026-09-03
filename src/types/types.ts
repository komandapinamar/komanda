export type Category = {
  documentId: string;
  name: string;
  menu_items: MenuItem[] | null;
  combos: Combo[] | null;
};

export type Combo = {
  documentId: string;
  name: string;
  price: number;
  description: string | null;
  image: string;
  category: Category | null;
  menu_items: MenuItem[] | null;
};

export type MenuItem = {
  documentId: string;
  name: string;
  price: number;
  description: string | null;
  image: string;
  category: Category | null;
  combos: Combo[] | null;
};

export type CartLine = {
  item: MenuItem;
  quantity: number;
};

export type CartSnapshotLine = {
  documentId: string;
  quantity: number;
  name: string;
  unitPrice: number;
  image: string;
};

export type CartSyncStatus = "idle" | "syncing" | "ready" | "error";

export type OfficialCartLine = {
  documentId: string;
  quantity: number;
  name: string;
  unitPrice: number;
  lineTotal: number;
  image: string;
  available: boolean;
  note?: string;
};

export type OfficialCart = {
  id: string;
  currency: string;
  items: OfficialCartLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  version?: number;
  updatedAt?: string;
  expiresAt?: string;
};

export type CustomerInfo = {
  name: string;
  email?: string;
  phone?: string;
};

export type OrderSource = "mercadopago_webhook" | "admin_direct";

export type CheckoutFormValues = {
  customer: CustomerInfo;
  notes: string;
};

export type AdminDashboardLineOption = {
  name: string;
  priceDelta: string;
  quantity: number;
};

export type AdminDashboardLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  note: string | null;
  options: AdminDashboardLineOption[];
};

export type AdminDashboardOrder = {
  id: string;
  purchaseNumber: string;
  status: OrderStatus;
  paymentStatus?: "pending" | "paid" | "failed" | "refunded";
  customer: CustomerInfo;
  notes: string | null;
  source: OrderSource | null;
  lines: AdminDashboardLine[];
  subtotal: string;
  discountTotal: string;
  total: string;
  currency: string;
  approvedAt: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  version?: number;
};

export type AdminOrdersStreamPayload = {
  orders: AdminDashboardOrder[];
  generatedAt: string;
};

export type OrderStatus =
  | "approved"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type PrintJobStatus = "pending" | "processing" | "printed" | "failed";

export type CreatePaymentSessionPayload = {
  cartId: string;
  customer: CustomerInfo;
  notes?: string;
  cartVersion?: number;
};

export type PaymentSession = {
  paymentId: string;
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
  cartId: string;
  amount: number;
  currency: string;
};
