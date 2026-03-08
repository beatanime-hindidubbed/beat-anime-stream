
-- Comments table for video episodes
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id text NOT NULL,
  anime_id text NOT NULL,
  content text NOT NULL,
  is_censored boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast episode lookups
CREATE INDEX idx_comments_episode ON public.comments(episode_id, created_at DESC);
CREATE INDEX idx_comments_anime ON public.comments(anime_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-deleted comments
CREATE POLICY "Anyone can read comments"
ON public.comments FOR SELECT
TO authenticated
USING (is_deleted = false);

-- Users can insert their own comments
CREATE POLICY "Users can insert comments"
ON public.comments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
ON public.comments FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Admins can update any comment (for moderation)
CREATE POLICY "Admins can moderate comments"
ON public.comments FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete any comment
CREATE POLICY "Admins can delete comments"
ON public.comments FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

-- Rate limiting table for anti-spam
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_user_action ON public.rate_limits(user_id, action, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own rate limits"
ON public.rate_limits FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own rate limits"
ON public.rate_limits FOR SELECT
TO authenticated
USING (user_id = auth.uid());
