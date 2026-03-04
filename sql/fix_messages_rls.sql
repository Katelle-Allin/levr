-- ============================================================
-- RLS : levr_messages — correction de la policy INSERT
-- ────────────────────────────────────────────────────────────
-- Problème : setup_levr_bookclubs.sql crée "messages_insert_own"
--            avec CHECK (user_id = auth.uid()) mais la colonne
--            réelle est sender_id (pas user_id).
-- Solution : supprimer l'ancienne policy, créer la bonne.
-- Idempotent : DROP POLICY IF EXISTS avant CREATE.
-- ============================================================

DROP POLICY IF EXISTS "messages_insert_own"    ON public.levr_messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.levr_messages;

CREATE POLICY "messages_insert_sender"
    ON public.levr_messages FOR INSERT
    WITH CHECK (sender_id = auth.uid());

-- ── Rechargement du cache PostgREST ──────────────────────────
NOTIFY pgrst, 'reload schema';
