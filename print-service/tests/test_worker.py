from komanda_print.renderer import render_ticket


class FakePrinter:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.closed = False

    def set(self, **_kwargs) -> None:
        return None

    def text(self, value: str) -> None:
        self.lines.append(value)

    def cut(self) -> None:
        self.lines.append("<cut>")

    def close(self) -> None:
        self.closed = True


def test_renderer_prints_order_and_options():
    from zoneinfo import ZoneInfo

    printer = FakePrinter()
    render_ticket(
        printer,
        {
            "orderId": "order-1",
            "purchaseNumber": "7",
            "source": "admin_direct",
            "copies": 1,
            "customer": {"name": "Ada"},
            "currency": "ARS",
            "amount": "1000.00",
            "approvedAt": "2026-07-05T12:00:00Z",
            "items": [
                {
                    "name": "Burger",
                    "quantity": 1,
                    "lineTotal": "1000.00",
                    "options": [{"name": "Extra queso"}],
                }
            ],
            "summary": {
                "subtotal": "1000.00",
                "discountTotal": "0.00",
                "total": "1000.00",
            },
        },
        ZoneInfo("UTC"),
    )

    output = "".join(printer.lines)
    assert "Compra #7" in output
    assert "Burger" in output
    assert "Extra queso" in output
    assert printer.closed is True


def test_client_uses_v1_claim_and_idempotent_result(monkeypatch):
    from komanda_print.client import PrintClient

    calls: list[tuple[str, str, dict | None]] = []

    class Response:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"job": {"id": "job-1", "attemptNumber": 2, "payload": {}}}

    class Session:
        headers: dict[str, str]

        def __init__(self) -> None:
            self.headers = {}

        def post(self, url: str, **kwargs):
            calls.append((url, kwargs.get("data", ""), kwargs.get("headers")))
            return Response()

    monkeypatch.setattr("requests.Session", Session)
    client = PrintClient("https://core.test", "agent-token", 3)

    assert client.claim_job()["id"] == "job-1"
    client.report_status("job-1", 2, "printed")

    assert calls[0][0] == "https://core.test/api/v1/print/jobs/claim"
    assert calls[1][0] == "https://core.test/api/v1/print/jobs/job-1/result"
    assert calls[1][2]["Idempotency-Key"]
