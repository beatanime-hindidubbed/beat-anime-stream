
-- Reviews table for anime
CREATE TABLE public.anime_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anime_id text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, anime_id)
);

ALTER TABLE public.anime_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
CREATE POLICY "Anyone can read reviews" ON public.anime_reviews
  FOR SELECT TO authenticated USING (true);

-- Users can insert own review
CREATE POLICY "Users can insert own review" ON public.anime_reviews
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can update own review
CREATE POLICY "Users can update own review" ON public.anime_reviews
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Users can delete own review
CREATE POLICY "Users can delete own review" ON public.anime_reviews
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Admins can delete any review
CREATE POLICY "Admins can delete any review" ON public.anime_reviews
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
