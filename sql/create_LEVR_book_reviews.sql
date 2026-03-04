-- ============================================================
-- LEVR_book_reviews — Notes et avis sur les livres
-- ============================================================
-- Exécuter dans Supabase SQL Editor (idempotent).

-- ── Trigger helper updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."LEVR_book_reviews" (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id    text        NOT NULL,
    user_id    uuid        NOT NULL REFERENCES public."LEVR_users"(id) ON DELETE CASCADE,
    rating     int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT levr_book_reviews_book_user_unique UNIQUE (book_id, user_id)
);

CREATE INDEX IF NOT EXISTS levr_book_reviews_book_id_idx
    ON public."LEVR_book_reviews" (book_id);
CREATE INDEX IF NOT EXISTS levr_book_reviews_user_id_idx
    ON public."LEVR_book_reviews" (user_id);

-- ── Trigger updated_at ───────────────────────────────────────
DROP TRIGGER IF EXISTS set_LEVR_book_reviews_updated_at ON public."LEVR_book_reviews";
CREATE TRIGGER set_LEVR_book_reviews_updated_at
    BEFORE UPDATE ON public."LEVR_book_reviews"
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public."LEVR_book_reviews" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_reviews_select_all" ON public."LEVR_book_reviews";
CREATE POLICY "book_reviews_select_all"
    ON public."LEVR_book_reviews" FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "book_reviews_insert_own" ON public."LEVR_book_reviews";
CREATE POLICY "book_reviews_insert_own"
    ON public."LEVR_book_reviews" FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "book_reviews_update_own" ON public."LEVR_book_reviews";
CREATE POLICY "book_reviews_update_own"
    ON public."LEVR_book_reviews" FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "book_reviews_delete_own" ON public."LEVR_book_reviews";
CREATE POLICY "book_reviews_delete_own"
    ON public."LEVR_book_reviews" FOR DELETE
    USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
