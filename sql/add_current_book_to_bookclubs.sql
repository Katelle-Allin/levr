-- ============================================================
-- Migration levr_bookclubs — lecture en cours du bookclub
-- ────────────────────────────────────────────────────────────
-- Ajoute les colonnes nécessaires pour référencer un livre
-- en cours de lecture dans un bookclub.
--
-- current_book_id       : identifiant OpenLibrary du livre (ex: "OL12345W")
-- current_book_title    : titre mis en cache (évite un join)
-- current_book_author   : auteur mis en cache
-- current_book_cover    : URL couverture mise en cache
-- current_chapter_number: numéro du chapitre en cours
-- current_chapter_title : titre du chapitre (optionnel)
-- current_chapter_total : nombre total de chapitres (optionnel)
--
-- Idempotent : ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.levr_bookclubs
    ADD COLUMN IF NOT EXISTS current_book_id        text NULL,
    ADD COLUMN IF NOT EXISTS current_book_title     text NULL,
    ADD COLUMN IF NOT EXISTS current_book_author    text NULL,
    ADD COLUMN IF NOT EXISTS current_book_cover     text NULL,
    ADD COLUMN IF NOT EXISTS current_chapter_number int  NULL,
    ADD COLUMN IF NOT EXISTS current_chapter_title  text NULL,
    ADD COLUMN IF NOT EXISTS current_chapter_total  int  NULL;

-- Rechargement du cache PostgREST
NOTIFY pgrst, 'reload schema';
