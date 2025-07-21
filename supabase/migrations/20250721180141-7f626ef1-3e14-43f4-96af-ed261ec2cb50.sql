-- 1. Remove normalize_url triggers that are corrupting URLs
DROP TRIGGER IF EXISTS normalize_url_secondary_sources ON secondary_sources;
DROP TRIGGER IF EXISTS normalize_url_tertiary_sources ON tertiary_sources;