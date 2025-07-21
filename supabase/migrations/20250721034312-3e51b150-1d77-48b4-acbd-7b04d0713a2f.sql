-- Add validation status column to secondary_sources table
ALTER TABLE public.secondary_sources 
ADD COLUMN validation_passed boolean DEFAULT false;