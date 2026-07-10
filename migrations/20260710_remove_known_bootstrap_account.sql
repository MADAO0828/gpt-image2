-- Preserve every account and its settings, but invalidate the publicly shipped
-- bootstrap credential wherever it is still present. Run only together with
-- an approved password recovery/reset procedure for affected users.
UPDATE users
SET password_hash = 'disabled-bootstrap-credential-20260710-' || lower(hex(randomblob(32))),
    session_version = COALESCE(session_version, 1) + 1,
    updated_at = datetime('now')
WHERE password_hash = 'BtGs_bI3gUtzS6kpjjJyPE4e6GVrFhqjpCT-zoH3qb0';
