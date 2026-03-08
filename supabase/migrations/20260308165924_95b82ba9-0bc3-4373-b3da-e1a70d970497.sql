
-- Continue watching sync table
CREATE TABLE public.continue_watching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anime_id TEXT NOT NULL,
  anime_name TEXT NOT NULL,
  poster TEXT,
  episode_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, anime_id)
);

ALTER TABLE public.continue_watching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own continue watching"
  ON public.continue_watching FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own continue watching"
  ON public.continue_watching FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own continue watching"
  ON public.continue_watching FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own continue watching"
  ON public.continue_watching FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
