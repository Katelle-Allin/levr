-- ============================================================
-- Migration : ajout de parent_comment_id sur LEVR_post_comments
-- Permet les réponses imbriquées (1 niveau de profondeur).
-- À exécuter dans Supabase > SQL Editor
-- Idempotent (IF NOT EXISTS / IF EXISTS)
-- ============================================================

ALTER TABLE public."LEVR_post_comments"
    ADD COLUMN IF NOT EXISTS parent_comment_id uuid NULL
        REFERENCES public."LEVR_post_comments"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS levr_post_comments_parent_idx
    ON public."LEVR_post_comments" (parent_comment_id)
    WHERE parent_comment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
