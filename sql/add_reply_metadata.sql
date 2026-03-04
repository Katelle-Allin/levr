-- ============================================================
-- Support des réponses (reply) dans levr_messages
-- ============================================================
-- Idempotent (ADD COLUMN IF NOT EXISTS).
-- À exécuter dans Supabase SQL Editor avant de tester les replies.

ALTER TABLE public.levr_messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
        REFERENCES public.levr_messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reply_to_username text,
    ADD COLUMN IF NOT EXISTS reply_to_excerpt  text;

-- Index pour accélérer les lookups
CREATE INDEX IF NOT EXISTS levr_messages_reply_idx
    ON public.levr_messages (reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
