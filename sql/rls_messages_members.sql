-- ============================================================
-- RLS : levr_messages — accès restreint aux membres du club
-- ────────────────────────────────────────────────────────────
-- SELECT : visible par tous (lecture publique du fil de discussion)
-- INSERT : uniquement les membres du bookclub auquel appartient
--          la discussion (role quelconque : owner/moderator/member)
-- DELETE : uniquement l'auteur du message (sender_id)
-- Idempotent : DROP POLICY IF EXISTS avant chaque CREATE
-- ============================================================

-- Activer RLS si ce n'est pas encore fait
ALTER TABLE public.levr_messages ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_select_all" ON public.levr_messages;
CREATE POLICY "messages_select_all"
    ON public.levr_messages FOR SELECT
    USING (true);

-- ── INSERT : membres du club uniquement ───────────────────────
DROP POLICY IF EXISTS "messages_insert_member" ON public.levr_messages;
CREATE POLICY "messages_insert_member"
    ON public.levr_messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.levr_discussions d
            JOIN public.levr_bookclub_members m ON m.club_id = d.club_id
            WHERE d.id        = levr_messages.discussion_id
              AND m.user_id   = auth.uid()
        )
    );

-- ── DELETE : auteur du message seulement ─────────────────────
DROP POLICY IF EXISTS "messages_delete_own" ON public.levr_messages;
CREATE POLICY "messages_delete_own"
    ON public.levr_messages FOR DELETE
    USING (sender_id = auth.uid());

-- ── Rechargement du cache PostgREST ──────────────────────────
NOTIFY pgrst, 'reload schema';
