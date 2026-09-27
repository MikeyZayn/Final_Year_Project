-- ============================================================
-- dot_registry — SEPARATE DATABASE from the main THEMBA app DB.
--
-- Stands in for a real Department of Transport driver-licensing
-- lookup. THEMBA's backend must never query this schema directly
-- or join across it from the main DB — all access goes through a
-- single adapter function (e.g. verify_driver(id_number,
-- license_number) in the Django backend), so that swapping this
-- simulation for a real external API later means changing that
-- one function, not every call site.
-- ============================================================

CREATE TABLE licensed_drivers(
    record_id            SERIAL PRIMARY KEY,
    id_number            TEXT NOT NULL UNIQUE,   -- SA ID number: the real lookup key
    first_name           TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    license_number         TEXT NOT NULL UNIQUE,
    license_class           TEXT NOT NULL,          -- e.g. 'C1', 'EB'
    pdp_number              TEXT,
    pdp_valid_until          DATE,
    license_status            TEXT NOT NULL
        CHECK( license_status IN ('valid', 'suspended', 'expired', 'revoked') ),
    issued_date               DATE NOT NULL,
    license_expiry_date        DATE NOT NULL
);

-- Verification should match on id_number AND license_number together,
-- not license number alone — this stops someone entering a stolen but
-- valid license number under their own name. Match both, then check
-- license_status = 'valid' and pdp_valid_until >= current_date.
