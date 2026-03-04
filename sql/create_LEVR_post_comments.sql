-- ============================================================
-- Table LEVR_post_comments — Commentaires sur les posts
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public."LEVR_post_comments" (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    uuid        NOT NULL REFERENCES public."LEVR_posts"(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES public."LEVR_users"(id) ON DELETE CASCADE,
    content    text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour récupérer les commentaires d'un post dans l'ordre chronologique
CREATE INDEX IF NOT EXISTS levr_post_comments_post_idx
    ON public."LEVR_post_comments" (post_id, created_at ASC);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public."LEVR_post_comments" ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "comments_select_all"
    ON public."LEVR_post_comments"
    FOR SELECT
    USING (true);

-- Insertion : uniquement ses propres commentaires
CREATE POLICY "comments_insert_own"
    ON public."LEVR_post_comments"
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Suppression : uniquement ses propres commentaires
CREATE POLICY "comments_delete_own"
    ON public."LEVR_post_comments"
    FOR DELETE
    USING (user_id = auth.uid());
