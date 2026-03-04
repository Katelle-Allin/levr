-- ============================================================
-- RLS : discussions et événements réservés aux admins (owners)
-- Logique : INSERT autorisé uniquement si l'utilisateur est owner
--           du bookclub concerné (levr_bookclub_members.role = 'owner')
-- Idempotent : DROP POLICY IF EXISTS avant chaque CREATE
-- ============================================================

-- ── levr_discussions ─────────────────────────────────────────

-- SELECT : visible par tous (membres ou pas)
DROP POLICY IF EXISTS "discussions_select_all" ON public.levr_discussions;
CREATE POLICY "discussions_select_all"
    ON public.levr_discussions FOR SELECT
    USING (true);

-- INSERT : uniquement les owners du bookclub
DROP POLICY IF EXISTS "discussions_insert_owner" ON public.levr_discussions;
CREATE POLICY "discussions_insert_owner"
    ON public.levr_discussions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.levr_bookclub_members m
            WHERE m.club_id  = levr_discussions.club_id
              AND m.user_id  = auth.uid()
              AND m.role     = 'owner'
        )
    );

-- DELETE : uniquement l'owner du bookclub ou l'auteur de la discussion
DROP POLICY IF EXISTS "discussions_delete_owner" ON public.levr_discussions;
CREATE POLICY "discussions_delete_owner"
    ON public.levr_discussions FOR DELETE
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.levr_bookclub_members m
            WHERE m.club_id = levr_discussions.club_id
              AND m.user_id = auth.uid()
              AND m.role    = 'owner'
        )
    );

-- ── levr_events ───────────────────────────────────────────────

-- SELECT : visible par tous
DROP POLICY IF EXISTS "events_select_all" ON public.levr_events;
CREATE POLICY "events_select_all"
    ON public.levr_events FOR SELECT
    USING (true);

-- INSERT : uniquement les owners (et modérateurs) du bookclub
DROP POLICY IF EXISTS "events_insert_owner" ON public.levr_events;
CREATE POLICY "events_insert_owner"
    ON public.levr_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.levr_bookclub_members m
            WHERE m.club_id = levr_events.club_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'moderator')
        )
    );

-- DELETE : uniquement l'owner du bookclub
DROP POLICY IF EXISTS "events_delete_owner" ON public.levr_events;
CREATE POLICY "events_delete_owner"
    ON public.levr_events FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.levr_bookclub_members m
            WHERE m.club_id = levr_events.club_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'moderator')
        )
    );

-- ── Rechargement du cache PostgREST ──────────────────────────
NOTIFY pgrst, 'reload schema';
