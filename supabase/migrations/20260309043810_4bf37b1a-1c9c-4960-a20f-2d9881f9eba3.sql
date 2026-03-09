-- Table to store user region and anime view tracking
CREATE TABLE public.regional_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  anime_id text NOT NULL,
  anime_name text NOT NULL,
  anime_poster text,
  country_code text NOT NULL,
  country_name text NOT NULL,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add indexes for efficient regional queries
CREATE INDEX idx_regional_views_country ON public.regional_views(country_code);
CREATE INDEX idx_regional_views_anime ON public.regional_views(anime_id);
CREATE INDEX idx_regional_views_created ON public.regional_views(created_at DESC);

-- Unique constraint to avoid duplicate views per user/anime/day
CREATE UNIQUE INDEX idx_regional_views_unique ON public.regional_views(user_id, anime_id, view_date);

-- Store user's detected region in profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_name text;

-- Enable RLS
ALTER TABLE public.regional_views ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can insert own views" ON public.regional_views
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can read regional stats" ON public.regional_views
  FOR SELECT USING (true);