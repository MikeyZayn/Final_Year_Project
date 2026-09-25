"""Creates dot_registry.db (simulated Department of Transport registry).
Run once:  python init_dot_registry.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "dot_registry.db"

SCHEMA = """
CREATE TABLE licensed_drivers(
    record_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number          TEXT NOT NULL UNIQUE,
    first_name         TEXT NOT NULL,
    last_name          TEXT NOT NULL,
    license_number     TEXT NOT NULL UNIQUE,
    license_class      TEXT NOT NULL,
    pdp_number         TEXT,
    pdp_valid_until    DATE,
    license_status     TEXT NOT NULL
        CHECK( license_status IN ('valid', 'suspended', 'expired', 'revoked') ),
    issued_date        DATE NOT NULL,
    license_expiry_date DATE NOT NULL
);
"""

SEED = [
    # id_number, first_name, last_name, license_number, class, pdp, pdp_until, status, issued, expires
    ("9001015800083", "Bongani", "Mthembu", "NDL 001", "C1", "PDP-0001", "2027-06-30", "valid",     "2019-07-01", "2027-06-30"),
    ("8805055800081", "Sipho",   "Ndlovu",  "NDL 002", "EB", "PDP-0002", "2025-01-15", "suspended", "2018-02-01", "2026-01-15"),
    ("9507075800082", "Thabo",   "Khumalo", "NDL 003", "C1", None,       None,         "expired",   "2020-05-10", "2023-05-10"),
    ("9203035800090", "Musa",    "Dube",    "NDL 004", "C1", "PDP-0004", "2028-03-20", "valid",     "2020-03-20", "2028-03-20"),
    ("8908085800075", "Lucky",   "Mahlangu","NDL 005", "EB", "PDP-0005", "2026-12-01", "valid",     "2017-12-01", "2026-12-01"),
    ("9412125800066", "Peter",   "Ncube",   "NDL 006", "C1", "PDP-0006", "2027-02-15", "valid",     "2021-02-15", "2027-02-15"),
]


def main():
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    con.executemany(
        """INSERT INTO licensed_drivers
           (id_number, first_name, last_name, license_number, license_class,
            pdp_number, pdp_valid_until, license_status, issued_date, license_expiry_date)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        SEED,
    )
    con.commit()
    con.close()
    print(f"Created {DB_PATH} with {len(SEED)} records")


if __name__ == "__main__":
    main()