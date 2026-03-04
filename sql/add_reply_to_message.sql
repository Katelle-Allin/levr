-- ============================================================
-- Migration levr_messages — ajout de la colonne reply_to
-- ────────────────────────────────────────────────────────────
-- Permet à un message de citer un autre message de la même
-- discussion (feature "répondre à").
-- Idempotent : ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.levr_messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
        REFERENCES public.levr_messages(id) ON DELETE SET NULL;

-- Index pour retrouver facilement les réponses à un message
CREATE INDEX IF NOT EXISTS levr_messages_reply_to_idx
    ON public.levr_messages (reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

-- ── Rechargement du cache PostgREST ──────────────────────────
NOTIFY pgrst, 'reload schema';
