-- ============================================================
-- Table LEVR_posts — Feed de posts / activité
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public."LEVR_posts" (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES public."LEVR_users"(id) ON DELETE CASCADE,
    book_id     text        NULL,   -- référence libre à LEVR_books.book_id
    action_type text        NOT NULL, -- 'ADD_BOOK' | 'MOVE_SHELF' | 'MANUAL'
    from_shelf  text        NULL,
    to_shelf    text        NULL,
    content     text        NOT NULL,
    image_url   text        NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour le feed (ordre chronologique décroissant)
CREATE INDEX IF NOT EXISTS levr_posts_created_at_idx
    ON public."LEVR_posts" (created_at DESC);

-- Index pour les posts d'un utilisateur
CREATE INDEX IF NOT EXISTS levr_posts_user_id_idx
    ON public."LEVR_posts" (user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public."LEVR_posts" ENABLE ROW LEVEL SECURITY;

-- Lecture publique (tout le monde peut lire les posts)
CREATE POLICY "posts_select_all"
    ON public."LEVR_posts"
    FOR SELECT
    USING (true);

-- Insertion : uniquement ses propres posts
CREATE POLICY "posts_insert_own"
    ON public."LEVR_posts"
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Modification : uniquement ses propres posts
CREATE POLICY "posts_update_own"
    ON public."LEVR_posts"
    FOR UPDATE
    USING (user_id = auth.uid());

-- Suppression : uniquement ses propres posts
CREATE POLICY "posts_delete_own"
    ON public."LEVR_posts"
    FOR DELETE
    USING (user_id = auth.uid());

-- ============================================================
-- Storage bucket levr-posts (à créer dans le dashboard Supabase)
-- Storage > New bucket > Name: levr-posts > Public: true
-- Puis ajouter ces policies dans Storage > levr-posts > Policies:
--
-- SELECT (lecture publique):
--   USING (true)
--
-- INSERT (upload par le propriétaire):
--   WITH CHECK (auth.uid()::text = (storage.foldername(name))[1])
--
-- DELETE (suppression par le propriétaire):
--   USING (auth.uid()::text = (storage.foldername(name))[1])
-- ============================================================
