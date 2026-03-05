-- ============================================================
-- Migration : table LEVR_post_reports
-- Permet aux utilisateurs de signaler un post à la modération.
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public."LEVR_post_reports" (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     uuid        NOT NULL REFERENCES public."LEVR_posts"(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason      text        NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT levr_post_reports_unique UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS levr_post_reports_post_idx
    ON public."LEVR_post_reports" (post_id);

ALTER TABLE public."LEVR_post_reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_reports_insert_own" ON public."LEVR_post_reports";
CREATE POLICY "post_reports_insert_own"
    ON public."LEVR_post_reports" FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_reports_select_own" ON public."LEVR_post_reports";
CREATE POLICY "post_reports_select_own"
    ON public."LEVR_post_reports" FOR SELECT
    USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
