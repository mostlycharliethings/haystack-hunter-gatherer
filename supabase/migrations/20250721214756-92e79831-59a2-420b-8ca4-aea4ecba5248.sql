-- Add unique constraint on URL for tertiary_sources table to enable upserts
ALTER TABLE public.tertiary_sources 
ADD CONSTRAINT tertiary_sources_url_unique UNIQUE (url);