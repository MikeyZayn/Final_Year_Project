"""
Adapter into the (simulated) Department of Transport driver registry.

This is the ONLY module in THEMBA that reads from the DOT database.
If the simulation is swapped for a real external API later, only this
file changes — no views, serializers, or models touch the DOT DB.

Usage:
    result = verify_driver(id_number="9001015800083", license_number="NDL 001")
    # -> {"verified": True, "reason": "ok", "record": {...}}
"""
import sqlite3
from datetime import date
from pathlib import Path

# The simulated DOT database lives alongside manage.py
DOT_DB_PATH = Path(__file__).resolve().parent.parent / "dot_registry.db"


class DOTUnavailable(Exception):
    """Raised if the DOT registry cannot be reached (simulated here as a missing file)."""


def _connect():
    if not DOT_DB_PATH.exists():
        raise DOTUnavailable(
            f"DOT registry not initialised. Run: python init_dot_registry.py"
        )
    con = sqlite3.connect(DOT_DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def verify_driver(id_number: str, license_number: str) -> dict:
    """Query the DOT registry for a driver's licence status.

    Returns:
        {
          "verified": bool,
          "reason":   "ok" | "missing_credentials" | "not_found" |
                      "license_suspended" | "license_expired" | "license_revoked" |
                      "pdp_expired" | "dot_unavailable",
          "record":   dict | None
        }
    """
    if not id_number or not license_number:
        return {"verified": False, "reason": "missing_credentials", "record": None}

    try:
        con = _connect()
    except DOTUnavailable:
        return {"verified": False, "reason": "dot_unavailable", "record": None}

    try:
        row = con.execute(
            """SELECT * FROM licensed_drivers
               WHERE id_number = ? AND license_number = ?""",
            (id_number.strip(), license_number.strip()),
        ).fetchone()
    finally:
        con.close()

    if row is None:
        return {"verified": False, "reason": "not_found", "record": None}

    rec = dict(row)

    # Licence status must be valid
    if rec["license_status"] != "valid":
        return {
            "verified": False,
            "reason": f"license_{rec['license_status']}",   # suspended / expired / revoked
            "record": rec,
        }

    # Licence expiry
    expiry = date.fromisoformat(rec["license_expiry_date"])
    if expiry < date.today():
        return {"verified": False, "reason": "license_expired", "record": rec}

    # PDP expiry (if a PDP is recorded)
    pdp_until = rec.get("pdp_valid_until")
    if pdp_until:
        if date.fromisoformat(pdp_until) < date.today():
            return {"verified": False, "reason": "pdp_expired", "record": rec}

    return {"verified": True, "reason": "ok", "record": rec}