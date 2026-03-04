-- ============================================================
-- Migration : ajout de current_chapter dans levr_bookclubs
-- current_book_id existe déjà dans la table.
-- À exécuter dans Supabase > SQL Editor
-- Idempotent : ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS current_chapter text NULL;

-- ============================================================
-- Rechargement du cache PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- RLS pour UPDATE current_book_id / current_chapter
-- La policy "bookclubs_update_owner" (dans setup_levr_bookclubs.sql)
-- couvre déjà l'UPDATE pour les membres avec role='owner'.
-- Si cette policy n'a pas encore été appliquée, la voici :
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'levr_bookclubs'
          AND policyname = 'bookclubs_update_owner'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY "bookclubs_update_owner"
                ON public.levr_bookclubs FOR UPDATE
                USING (
                    id IN (
                        SELECT club_id FROM public.levr_bookclub_members
                        WHERE user_id = auth.uid() AND role = 'owner'
                    )
                )
        $policy$;
    END IF;
END $$;
