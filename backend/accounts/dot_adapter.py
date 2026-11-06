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
from django.conf import settings
from datetime import date
from pathlib import Path

# The simulated DOT database lives alongside manage.py
DOT_DB_PATH = Path(__file__).resolve().parent.parent / "dot_registry.db"


class DOTUnavailable(Exception):
    """Raised if the DOT registry cannot be reached (simulated here as a missing file)."""


def _connect():
    registry_path = Path(getattr(settings, "DOT_REGISTRY_PATH", DOT_DB_PATH))
    if not registry_path.exists():
        raise DOTUnavailable(
            f"DOT registry not initialised. Run: python init_dot_registry.py"
        )
    con = sqlite3.connect(registry_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=3)
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
    except (DOTUnavailable, sqlite3.Error, OSError):
        return {"verified": False, "reason": "dot_unavailable", "record": None}

    try:
        row = con.execute(
            """SELECT * FROM licensed_drivers
               WHERE id_number = ? AND license_number = ?""",
            (id_number.strip(), license_number.strip()),
        ).fetchone()
    except sqlite3.Error:
        return {"verified": False, "reason": "dot_unavailable", "record": None}
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
    try:
        expiry = date.fromisoformat(rec["license_expiry_date"])
        pdp_expiry = date.fromisoformat(rec["pdp_valid_until"]) if rec.get("pdp_valid_until") else None
    except (ValueError, TypeError, KeyError):
        return {"verified": False, "reason": "dot_unavailable", "record": None}
    if expiry < date.today():
        return {"verified": False, "reason": "license_expired", "record": rec}

    # PDP expiry (if a PDP is recorded)
    pdp_until = rec.get("pdp_valid_until")
    if pdp_until:
        if pdp_expiry < date.today():
            return {"verified": False, "reason": "pdp_expired", "record": rec}

    return {"verified": True, "reason": "ok", "record": rec}

def verify_driver_license(license_number: str) -> dict:
    """Prototype-only licence check, not an identity or facial verification.

    Fail closed if more than one registry record shares this licence number.
    """
    if not license_number or not license_number.strip():
        return {"verified": False, "reason": "missing_credentials", "record": None}
    try:
        con = _connect()
    except (DOTUnavailable, sqlite3.Error, OSError):
        return {"verified": False, "reason": "dot_unavailable", "record": None}
    try:
        rows = con.execute(
            "SELECT * FROM licensed_drivers WHERE license_number = ?",
            (license_number.strip(),),
        ).fetchall()
    except sqlite3.Error:
        return {"verified": False, "reason": "dot_unavailable", "record": None}
    finally:
        con.close()
    if not rows:
        return {"verified": False, "reason": "not_found", "record": None}
    if len(rows) != 1:
        return {"verified": False, "reason": "ambiguous_license", "record": None}
    rec = dict(rows[0])
    if rec.get("license_status") != "valid":
        return {"verified": False, "reason": f"license_{rec.get('license_status')}", "record": None}
    try:
        if date.fromisoformat(rec["license_expiry_date"]) < date.today():
            return {"verified": False, "reason": "license_expired", "record": None}
        if rec.get("pdp_valid_until") and date.fromisoformat(rec["pdp_valid_until"]) < date.today():
            return {"verified": False, "reason": "pdp_expired", "record": None}
    except (ValueError, TypeError, KeyError):
        return {"verified": False, "reason": "dot_unavailable", "record": None}
    # Never expose the registry's hidden SA ID to clients, logs or driver records.
    return {"verified": True, "reason": "license_valid_demo", "record": {"pdp_number": rec.get("pdp_number") or ""}}
