-- Migration : ajout de la colonne genre_levr normalisé sur LEVR_books
-- Idempotent (ADD COLUMN IF NOT EXISTS)
-- Exécuter dans l'éditeur SQL Supabase.

ALTER TABLE public."LEVR_books"
    ADD COLUMN IF NOT EXISTS genre_levr text NULL;

NOTIFY pgrst, 'reload schema';
