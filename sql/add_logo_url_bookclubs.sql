-- ============================================================
-- Migration levr_bookclubs — colonne logo_url
-- ────────────────────────────────────────────────────────────
-- La table levr_bookclubs n'avait pas encore cette colonne.
-- Idempotent : ADD COLUMN IF NOT EXISTS
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS logo_url text NULL;

-- Rechargement du cache PostgREST
NOTIFY pgrst, 'reload schema';
