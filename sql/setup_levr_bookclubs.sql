-- ============================================================
-- Migration levr_bookclubs — colonnes optionnelles
-- À exécuter dans Supabase > SQL Editor
--
-- Ce fichier est idempotent : il utilise ADD COLUMN IF NOT EXISTS
-- et CREATE TABLE IF NOT EXISTS, donc sans danger si la table
-- ou les colonnes existent déjà.
-- ============================================================

-- ── 1. Table levr_bookclubs (création si absente) ─────────────
CREATE TABLE IF NOT EXISTS public.levr_bookclubs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    description text        NULL,
    logo_url    text        NULL,
    is_public   boolean     NOT NULL DEFAULT true,
    created_by  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Ajout des colonnes manquantes si la table existait déjà sans elles
ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS description text        NULL;
ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS logo_url    text        NULL;
ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS is_public   boolean     NOT NULL DEFAULT true;
ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS created_by  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Table levr_bookclub_members ────────────────────────────
CREATE TABLE IF NOT EXISTS public.levr_bookclub_members (
    club_id    uuid NOT NULL REFERENCES public.levr_bookclubs(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member', -- 'admin' | 'member'
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (club_id, user_id)
);

-- ── 3. Table levr_discussions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.levr_discussions (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    uuid        NOT NULL REFERENCES public.levr_bookclubs(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS levr_discussions_club_idx
    ON public.levr_discussions (club_id, created_at DESC);

-- ── 4. Table levr_messages ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.levr_messages (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id   uuid        NOT NULL REFERENCES public.levr_discussions(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content         text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS levr_messages_discussion_idx
    ON public.levr_messages (discussion_id, created_at ASC);

-- ── 5. Table levr_events ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.levr_events (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     uuid        NOT NULL REFERENCES public.levr_bookclubs(id) ON DELETE CASCADE,
    title       text        NOT NULL,
    description text        NULL,
    starts_at   timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Si la table existait déjà avec un autre nom de colonne date,
-- on ajoute starts_at (timestamptz) si elle n'existe pas encore.
ALTER TABLE public.levr_events
    ADD COLUMN IF NOT EXISTS starts_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS levr_events_club_idx
    ON public.levr_events (club_id, starts_at ASC);

-- ============================================================
-- Row Level Security
-- ============================================================

-- levr_bookclubs
ALTER TABLE public.levr_bookclubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookclubs_select_public"
    ON public.levr_bookclubs FOR SELECT
    USING (is_public = true OR id IN (
        SELECT club_id FROM public.levr_bookclub_members
        WHERE user_id = auth.uid()
    ));

CREATE POLICY "bookclubs_insert_auth"
    ON public.levr_bookclubs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "bookclubs_update_admin"
    ON public.levr_bookclubs FOR UPDATE
    USING (id IN (
        SELECT club_id FROM public.levr_bookclub_members
        WHERE user_id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "bookclubs_delete_admin"
    ON public.levr_bookclubs FOR DELETE
    USING (id IN (
        SELECT club_id FROM public.levr_bookclub_members
        WHERE user_id = auth.uid() AND role = 'admin'
    ));

-- levr_bookclub_members
ALTER TABLE public.levr_bookclub_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_all"
    ON public.levr_bookclub_members FOR SELECT
    USING (true);

CREATE POLICY "members_insert_own"
    ON public.levr_bookclub_members FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "members_delete_own"
    ON public.levr_bookclub_members FOR DELETE
    USING (user_id = auth.uid());

-- levr_discussions
ALTER TABLE public.levr_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discussions_select_all"
    ON public.levr_discussions FOR SELECT
    USING (true);

CREATE POLICY "discussions_insert_member"
    ON public.levr_discussions FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND club_id IN (
        SELECT club_id FROM public.levr_bookclub_members
        WHERE user_id = auth.uid()
    ));

-- levr_messages
ALTER TABLE public.levr_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_all"
    ON public.levr_messages FOR SELECT
    USING (true);

CREATE POLICY "messages_insert_own"
    ON public.levr_messages FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_delete_own"
    ON public.levr_messages FOR DELETE
    USING (user_id = auth.uid());

-- levr_events
ALTER TABLE public.levr_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_all"
    ON public.levr_events FOR SELECT
    USING (true);

CREATE POLICY "events_insert_admin"
    ON public.levr_events FOR INSERT
    WITH CHECK (club_id IN (
        SELECT club_id FROM public.levr_bookclub_members
        WHERE user_id = auth.uid() AND role = 'admin'
    ));

-- ============================================================
-- Rechargement du cache de schéma PostgREST
-- (évite les erreurs PGRST204 après ALTER TABLE)
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Storage bucket levr-bookclubs
-- À créer manuellement dans Supabase Dashboard :
--   Storage > New bucket
--   Name    : levr-bookclubs
--   Public  : true  (les logos sont visibles par tous)
--
-- Puis ajouter ces policies dans Storage > levr-bookclubs > Policies :
--
-- SELECT (lecture publique) :
--   USING (true)
--
-- INSERT (upload — dossier = userId de l'uploadeur) :
--   WITH CHECK (auth.uid()::text = (storage.foldername(name))[1])
--
-- UPDATE :
--   USING (auth.uid()::text = (storage.foldername(name))[1])
--
-- DELETE :
--   USING (auth.uid()::text = (storage.foldername(name))[1])
-- ============================================================
