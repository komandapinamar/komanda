#!/usr/bin/env python3

import json
import os
import sys
import time
from contextlib import suppress
from datetime import datetime
from textwrap import wrap
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from escpos.printer import Usb
from komanda_print.client import PrintClient
from komanda_print.printer import build_usb_printer
from komanda_print.renderer import render_ticket


PRINTER_LINE_WIDTH = 32
DEFAULT_PRINT_TIMEZONE = "America/Argentina/Buenos_Aires"


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_int(value: str) -> int:
    return int(value, 0)


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


def get_print_timezone() -> ZoneInfo:
    timezone_name = os.getenv("PRINT_TIMEZONE", DEFAULT_PRINT_TIMEZONE).strip()
    if not timezone_name:
        timezone_name = DEFAULT_PRINT_TIMEZONE

    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        print(
            (
                "[print-worker] Invalid PRINT_TIMEZONE "
                f'"{timezone_name}". Falling back to {DEFAULT_PRINT_TIMEZONE}.'
            ),
            file=sys.stderr,
            flush=True,
        )
        return ZoneInfo(DEFAULT_PRINT_TIMEZONE)


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


def print_rule(printer: Usb, char: str = "-") -> None:
    printer.text(f"{char * PRINTER_LINE_WIDTH}\n")


def print_wrapped(printer: Usb, text: str, indent: str = "") -> None:
    cleaned = " ".join(text.split())
    if not cleaned:
        return

    width = max(PRINTER_LINE_WIDTH - len(indent), 8)
    lines = wrap(cleaned, width=width, break_long_words=False, break_on_hyphens=False)

    for line in lines:
        printer.text(f"{indent}{line}\n")


def get_copy_label(source: str, copy_index: int, copies: int) -> str:
    if source == "admin-direct":
        return "COCINA" if copy_index == 0 else "CAJA / ENTREGA"

    if copies > 1:
        return f"COPIA {copy_index + 1}/{copies}"

    return "COCINA"


def get_status_label(source: str) -> str:
    if source == "admin-direct":
        return "COBRAR EN CAJA"

    return "PAGADO"


class PrintWorker:
    def __init__(self) -> None:
        self.base_url = require_env("PRINT_SERVICE_BASE_URL").rstrip("/")
        self.token = require_env("PRINT_AGENT_TOKEN")
        self.vendor_id = parse_int(require_env("PRINTER_USB_VENDOR_ID"))
        self.product_id = parse_int(require_env("PRINTER_USB_PRODUCT_ID"))
        self.interface = parse_int(os.getenv("PRINTER_USB_INTERFACE", "0"))
        self.in_ep = parse_int(os.getenv("PRINTER_USB_IN_EP", "0x82"))
        self.out_ep = parse_int(os.getenv("PRINTER_USB_OUT_EP", "0x01"))
        self.timeout = int(os.getenv("PRINT_SERVICE_TIMEOUT_SECONDS", "15"))
        self.poll_interval = int(os.getenv("PRINT_SERVICE_POLL_INTERVAL_SECONDS", "5"))
        self.print_timezone = get_print_timezone()
        self.client = PrintClient(self.base_url, self.token, self.timeout)

    def claim_job(self) -> dict | None:
        return self.client.claim_job()

    def report_status(
        self,
        job_id: str,
        attempt_number: int,
        status: str,
        error: str | None = None,
    ) -> None:
        self.client.report_status(job_id, attempt_number, status, error)

    def build_printer(self) -> Usb:
        return build_usb_printer(
            vendor_id=self.vendor_id,
            product_id=self.product_id,
            timeout_seconds=self.timeout,
            in_ep=self.in_ep,
            out_ep=self.out_ep,
            interface=self.interface,
        )

    def print_job(self, job: dict) -> None:
        render_ticket(self.build_printer(), job["payload"], self.print_timezone)

    def run_forever(self) -> None:
        while True:
            try:
                job = self.claim_job()

                if not job:
                    time.sleep(self.poll_interval)
                    continue

                try:
                    self.print_job(job)
                    self.report_status(job["id"], job["attemptNumber"], "printed")
                except Exception as error:  # noqa: BLE001
                    self.report_status(
                        job["id"],
                        job["attemptNumber"],
                        "failed",
                        str(error),
                    )
            except requests.HTTPError as error:
                print(f"[print-worker] HTTP error: {error}", file=sys.stderr, flush=True)
                time.sleep(self.poll_interval)
            except Exception as error:  # noqa: BLE001
                print(f"[print-worker] Worker error: {error}", file=sys.stderr, flush=True)
                time.sleep(self.poll_interval)


if __name__ == "__main__":
    PrintWorker().run_forever()
