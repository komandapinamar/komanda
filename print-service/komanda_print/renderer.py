from contextlib import suppress
from datetime import datetime
from textwrap import wrap
from typing import Any
from zoneinfo import ZoneInfo


PRINTER_LINE_WIDTH = 32


def safe_float(value: object, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def safe_int(value: object, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def format_money(value: object, currency: str = "ARS") -> str:
    amount = safe_float(value)
    formatted = f"{amount:,.2f}"
    formatted = formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    if formatted.endswith(",00"):
        formatted = formatted[:-3]
    if currency.upper() == "ARS":
        return f"${formatted}"
    return f"{currency.upper()} {formatted}"


def format_timestamp(value: object, timezone: ZoneInfo) -> str:
    if isinstance(value, str) and value.strip():
        try:
            normalized = value.strip().replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
            parsed = parsed.astimezone(timezone)
            return parsed.strftime("%d/%m %H:%M")
        except ValueError:
            pass
    return datetime.now(timezone).strftime("%d/%m %H:%M")


def print_rule(printer: Any, char: str = "-") -> None:
    printer.text(f"{char * PRINTER_LINE_WIDTH}\n")


def print_wrapped(printer: Any, text: str, indent: str = "") -> None:
    cleaned = " ".join(text.split())
    if not cleaned:
        return
    width = max(PRINTER_LINE_WIDTH - len(indent), 8)
    for line in wrap(cleaned, width=width, break_long_words=False, break_on_hyphens=False):
        printer.text(f"{indent}{line}\n")


def get_copy_label(source: str, copy_index: int, copies: int) -> str:
    if source in {"admin-direct", "admin_direct"}:
        return "COCINA" if copy_index == 0 else "CAJA / ENTREGA"
    if copies > 1:
        return f"COPIA {copy_index + 1}/{copies}"
    return "COCINA"


def get_status_label(source: str) -> str:
    if source in {"admin-direct", "admin_direct"}:
        return "COBRAR EN CAJA"
    return "PAGADO"


def render_ticket(printer: Any, payload: dict, timezone: ZoneInfo) -> None:
    raw_copies = payload.get("copies", 1)
    source = str(payload.get("source") or "")
    currency = str(payload.get("currency") or "ARS")
    approved_at = format_timestamp(payload.get("approvedAt"), timezone)
    customer = payload.get("customer") or {}
    customer_name = str(customer.get("name") or "Sin nombre")
    phone = customer.get("phone")
    notes = str(payload.get("notes") or "").strip()
    items = payload.get("items", [])
    summary = payload.get("summary") or {}
    subtotal = safe_float(summary.get("subtotal", 0))
    discount_total = safe_float(summary.get("discountTotal", 0))
    total = safe_float(summary.get("total", 0))
    total_units = sum(max(safe_int(item.get("quantity", 0)), 0) for item in items)

    try:
        copies = max(int(raw_copies), 1)
    except (TypeError, ValueError):
        copies = 1

    try:
        tenant_name = str(payload.get("tenant") or "Komanda")
        for copy_index in range(copies):
            printer.set(align="center", bold=True, width=2, height=2)
            printer.text(f"{tenant_name.upper()}\n")
            printer.set(align="center", bold=True, width=1, height=1)
            printer.text(f"{get_copy_label(source, copy_index, copies)}\n")
            printer.set(align="center", bold=False, width=1, height=1)
            printer.text(f"{get_status_label(source)}\n")
            purchase_number = payload.get("purchaseNumber")
            if purchase_number:
                printer.text(f"Compra #{purchase_number}\n")
            else:
                printer.text(f"Orden #{payload['orderId']}\n")
            printer.text(f"{approved_at}\n")
            print_rule(printer)

            printer.set(align="left", bold=True)
            printer.text("CLIENTE\n")
            printer.set(align="left", bold=False)
            print_wrapped(printer, customer_name)
            if phone:
                print_wrapped(printer, f"Telefono: {phone}")

            if notes:
                print_rule(printer)
                printer.set(align="left", bold=True)
                printer.text("OBSERVACIONES\n")
                printer.set(align="left", bold=False)
                print_wrapped(printer, notes)

            print_rule(printer)
            printer.set(align="left", bold=True)
            printer.text("PEDIDO\n")
            printer.set(align="left", bold=False)
            for item in items:
                quantity = item.get("quantity", 0)
                name = item.get("name", "Item")
                line_total = safe_float(item.get("lineTotal", 0))
                printer.set(align="left", bold=True)
                print_wrapped(printer, f"{quantity} x {name}")
                printer.set(align="left", bold=False)
                for option in item.get("options", []):
                    print_wrapped(printer, f"+ {option.get('name', 'Adicional')}", "  ")
                printer.text(f"    {format_money(line_total, currency)}\n")

            print_rule(printer)
            printer.text(f"Lineas: {len(items)}\n")
            printer.text(f"Unidades: {total_units}\n")
            if discount_total > 0:
                printer.text(f"Subtotal: {format_money(subtotal, currency)}\n")
                printer.text(f"Descuento: {format_money(discount_total, currency)}\n")
            printer.set(align="left", bold=True)
            printer.text(f"Total: {format_money(total, currency)}\n")
            printer.set(align="left", bold=False)
            print_rule(printer)
            printer.text(f"Orden interna: {payload.get('orderId', '-')}\n")
            printer.text("\n\n")
            printer.cut()
    finally:
        with suppress(Exception):
            printer.close()
