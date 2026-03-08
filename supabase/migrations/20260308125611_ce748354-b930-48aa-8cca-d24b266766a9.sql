
-- Premium codes table
CREATE TABLE public.premium_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  current_uses int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add premium_until to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_until timestamptz;

-- RLS for premium_codes
ALTER TABLE public.premium_codes ENABLE ROW LEVEL SECURITY;

-- Admins can manage codes
CREATE POLICY "Admins can manage premium codes"
ON public.premium_codes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can view active codes (needed for redemption)
CREATE POLICY "Users can view active codes for redemption"
ON public.premium_codes
FOR SELECT
TO authenticated
USING (is_active = true);
