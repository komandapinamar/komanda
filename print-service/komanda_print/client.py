import json
import uuid

import requests


class PrintClient:
    def __init__(self, base_url: str, token: str, timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
        )

    def claim_job(self) -> dict | None:
        response = self.session.post(
            f"{self.base_url}/api/v1/print/jobs/claim",
            timeout=self.timeout,
        )
        if response.status_code == 204:
            return None
        response.raise_for_status()
        return response.json().get("job")

    def report_status(
        self,
        job_id: str,
        attempt_number: int,
        status: str,
        error: str | None = None,
    ) -> None:
        payload: dict[str, object] = {
            "status": status,
            "attemptNumber": attempt_number,
        }
        if error:
            payload["errorCode"] = "worker_failed"
            payload["errorMessage"] = error

        response = self.session.post(
            f"{self.base_url}/api/v1/print/jobs/{job_id}/result",
            data=json.dumps(payload),
            headers={"Idempotency-Key": str(uuid.uuid4())},
            timeout=self.timeout,
        )
        response.raise_for_status()
