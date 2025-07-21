-- Create module_settings table to control module states
CREATE TABLE public.module_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations on module_settings" 
ON public.module_settings 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Insert default module settings
INSERT INTO public.module_settings (module_name, enabled) VALUES
('primary-search', true),
('extended-search', true),
('discovery-crawler', true),
('contextual-finder', true),
('widenet-explorer', true),
('price-suggester', true),
('notifier', true);

-- Add trigger for updated_at
CREATE TRIGGER update_module_settings_updated_at
BEFORE UPDATE ON public.module_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();