-- ============================================================
-- Table LEVR_post_likes — Likes sur les posts
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public."LEVR_post_likes" (
    post_id    uuid        NOT NULL REFERENCES public."LEVR_posts"(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES public."LEVR_users"(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)   -- unicité : un user = un like par post
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public."LEVR_post_likes" ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "likes_select_all"
    ON public."LEVR_post_likes"
    FOR SELECT
    USING (true);

-- Insertion : uniquement son propre like
CREATE POLICY "likes_insert_own"
    ON public."LEVR_post_likes"
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Suppression : uniquement son propre like
CREATE POLICY "likes_delete_own"
    ON public."LEVR_post_likes"
    FOR DELETE
    USING (user_id = auth.uid());
