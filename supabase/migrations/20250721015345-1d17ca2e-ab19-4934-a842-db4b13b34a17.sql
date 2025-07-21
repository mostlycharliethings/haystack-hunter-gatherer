-- Enable the net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";

-- Check existing cron jobs
SELECT * FROM cron.job;