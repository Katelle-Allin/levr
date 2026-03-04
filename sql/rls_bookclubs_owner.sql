-- ============================================================
-- RLS : levr_bookclubs — correction des policies UPDATE/DELETE
-- ────────────────────────────────────────────────────────────
-- Problème : setup_levr_bookclubs.sql utilise role = 'admin'
--            mais l'application crée les propriétaires avec
--            role = 'owner' (levr_bookclub_members).
-- Solution : remplacer les policies par des versions correctes.
-- Idempotent : DROP POLICY IF EXISTS avant chaque CREATE.
-- ============================================================

-- ── UPDATE : propriétaire du club uniquement ──────────────
DROP POLICY IF EXISTS "bookclubs_update_admin"  ON public.levr_bookclubs;
DROP POLICY IF EXISTS "bookclubs_update_owner"  ON public.levr_bookclubs;
CREATE POLICY "bookclubs_update_owner"
    ON public.levr_bookclubs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.levr_bookclub_members m
            WHERE m.club_id = levr_bookclubs.id
              AND m.user_id = auth.uid()
              AND m.role    = 'owner'
        )
    );

-- ── DELETE : propriétaire du club uniquement ──────────────
DROP POLICY IF EXISTS "bookclubs_delete_admin"  ON public.levr_bookclubs;
DROP POLICY IF EXISTS "bookclubs_delete_owner"  ON public.levr_bookclubs;
CREATE POLICY "bookclubs_delete_owner"
    ON public.levr_bookclubs FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.levr_bookclub_members m
            WHERE m.club_id = levr_bookclubs.id
              AND m.user_id = auth.uid()
              AND m.role    = 'owner'
        )
    );

-- ── Rechargement du cache PostgREST ──────────────────────
NOTIFY pgrst, 'reload schema';
