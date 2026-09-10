"""Redact credentials in Playwright text, trace ZIPs and embedded HTML reports."""

import base64
import io
import json
import os
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SENSITIVE = re.compile(
    r"password|access.?token|refresh.?token|authorization|cookie|apikey|service.?role.?key",
    re.I,
)
SECRETS = [
    value for key, value in os.environ.items()
    if re.search(r"KEY|TOKEN|PASSWORD|SECRET", key, re.I) and len(value) > 5
]
for name in ("auth-fixtures.ts", "auth-seeds.ts"):
    source = ROOT / "tests/e2e/utils" / name
    SECRETS.extend(re.findall(r'password:\s*"([^"]+)"', source.read_text()))
SECRETS.extend(["wrong-password", "smoke-invite-client-token"])


def clean_text(value):
    for secret in SECRETS:
        value = value.replace(secret, "[REDACTED]")
    value = re.sub(r"eyJ[\w-]+\.[\w-]+\.[\w-]+", "[REDACTED-JWT]", value)
    value = re.sub(r'(?i)(Bearer\s+)[^\s"\\]+', r'\1[REDACTED]', value)
    value = re.sub(
        r'(?i)((?:access_token|refresh_token|token|code|invite)=)[^&\s"\\]+',
        r'\1[REDACTED]', value,
    )
    return re.sub(r"(?i)smoke-(?:invite-)?[a-f0-9]{20}", "[REDACTED-INVITE]", value)


def clean(value):
    if isinstance(value, dict):
        sensitive_value = SENSITIVE.search(str(value.get("name", ""))) or value.get("type") == "password"
        return {
            key: "[REDACTED]" if SENSITIVE.search(key) or (sensitive_value and key == "value") else clean(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, str):
        if value.startswith(("{", "[")):
            try:
                return json.dumps(clean(json.loads(value)))
            except (ValueError, RecursionError):
                pass
        return clean_text(value)
    return value


def scrub(data):
    if data.startswith(b"PK\x03\x04"):
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
            for entry in source.infolist():
                target.writestr(entry.filename, scrub(source.read(entry.filename)))
        return output.getvalue()
    try:
        value = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    if "\x00" in value:
        return data
    value = re.sub(
        r"data:application/zip;base64,([A-Za-z0-9+/=]+)",
        lambda match: "data:application/zip;base64," + base64.b64encode(scrub(base64.b64decode(match[1]))).decode(),
        value,
    )
    try:
        return (json.dumps(clean(json.loads(value))) + "\n").encode()
    except ValueError:
        pass
    lines = []
    for line in value.splitlines(keepends=True):
        try:
            lines.append(json.dumps(clean(json.loads(line))) + "\n")
        except ValueError:
            lines.append(clean_text(line))
    return "".join(lines).encode()


if __name__ == "__main__":
    count = 0
    for folder in ("playwright-report", "test-results", "playwright-report-configured", "test-results-configured"):
        for path in (ROOT / folder).rglob("*"):
            if path.is_file():
                path.write_bytes(scrub(path.read_bytes()))
                count += 1
    print(f"Sanitized {count} Playwright artifact files.")
