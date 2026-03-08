
-- Chat messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text,
  avatar_url text,
  content text NOT NULL,
  type text NOT NULL DEFAULT 'group' CHECK (type IN ('group', 'whisper', 'report')),
  recipient_id uuid,
  reply_to uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Chat bans table
CREATE TABLE public.chat_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text,
  ban_type text NOT NULL DEFAULT 'mute' CHECK (ban_type IN ('mute', 'ban')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_bans ENABLE ROW LEVEL SECURITY;

-- Chat messages policies
CREATE POLICY "Authenticated users can view group messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    type = 'group' 
    OR (type = 'whisper' AND (user_id = auth.uid() OR recipient_id = auth.uid()))
    OR (type = 'report' AND has_role(auth.uid(), 'admin'))
    OR user_id = auth.uid()
  );

CREATE POLICY "Authenticated users can insert messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can delete messages" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Chat bans policies
CREATE POLICY "Admins can manage bans" ON public.chat_bans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own bans" ON public.chat_bans
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
