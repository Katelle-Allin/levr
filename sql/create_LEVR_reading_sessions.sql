-- ============================================================
-- Table LEVR_reading_sessions — suivi de sessions de lecture
-- À exécuter dans Supabase > SQL Editor
--
-- Idempotent :
--   CREATE TABLE IF NOT EXISTS
--   ALTER TABLE … ADD COLUMN IF NOT EXISTS
--   DROP POLICY IF EXISTS … / CREATE POLICY
-- ============================================================

-- ── 1. Table principale ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public."LEVR_reading_sessions" (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id     text        NOT NULL REFERENCES public."LEVR_books"(book_id),
    date_local  date        NOT NULL,           -- jour local (YYYY-MM-DD), pas UTC
    start_page  int         NOT NULL DEFAULT 0,
    end_page    int         NOT NULL,
    pages_read  int         NOT NULL CHECK (pages_read >= 0),
    note        text        NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS levr_reading_sessions_user_date_idx
    ON public."LEVR_reading_sessions" (user_id, date_local);

CREATE INDEX IF NOT EXISTS levr_reading_sessions_user_book_idx
    ON public."LEVR_reading_sessions" (user_id, book_id, created_at DESC);

-- ── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public."LEVR_reading_sessions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own" ON public."LEVR_reading_sessions";
CREATE POLICY "sessions_select_own"
    ON public."LEVR_reading_sessions" FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_insert_own" ON public."LEVR_reading_sessions";
CREATE POLICY "sessions_insert_own"
    ON public."LEVR_reading_sessions" FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_update_own" ON public."LEVR_reading_sessions";
CREATE POLICY "sessions_update_own"
    ON public."LEVR_reading_sessions" FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_delete_own" ON public."LEVR_reading_sessions";
CREATE POLICY "sessions_delete_own"
    ON public."LEVR_reading_sessions" FOR DELETE
    USING (user_id = auth.uid());

-- ── 3. Colonne "total pages de mon édition" sur LEVR_user_books ───────────
-- Stockée par user+livre : un utilisateur peut avoir une édition différente
-- de celle enregistrée dans le catalogue global (LEVR_books.page_count).

ALTER TABLE public."LEVR_user_books"
    ADD COLUMN IF NOT EXISTS edition_total_pages int NULL;

-- ── 4. Rechargement du cache de schéma PostgREST ─────────────────────────
NOTIFY pgrst, 'reload schema';
