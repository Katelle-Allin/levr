-- ============================================================
-- Table levr_message_reactions + RLS
-- ────────────────────────────────────────────────────────────
-- Stocke les réactions emoji (👍❤️😂😮😢) sur les messages.
-- Une seule réaction par (message, user, emoji) — UNIQUE constraint.
-- Idempotent : CREATE TABLE IF NOT EXISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.levr_message_reactions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid        NOT NULL REFERENCES public.levr_messages(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji       text        NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS levr_message_reactions_message_idx
    ON public.levr_message_reactions (message_id);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.levr_message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT : visible par tous
DROP POLICY IF EXISTS "reactions_select_all" ON public.levr_message_reactions;
CREATE POLICY "reactions_select_all"
    ON public.levr_message_reactions FOR SELECT
    USING (true);

-- INSERT : uniquement sa propre réaction
DROP POLICY IF EXISTS "reactions_insert_own" ON public.levr_message_reactions;
CREATE POLICY "reactions_insert_own"
    ON public.levr_message_reactions FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- DELETE : uniquement sa propre réaction
DROP POLICY IF EXISTS "reactions_delete_own" ON public.levr_message_reactions;
CREATE POLICY "reactions_delete_own"
    ON public.levr_message_reactions FOR DELETE
    USING (user_id = auth.uid());

-- ── Rechargement du cache PostgREST ──────────────────────────
NOTIFY pgrst, 'reload schema';
