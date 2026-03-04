-- ============================================================
-- Bucket Storage : levr-bookclubs
-- À exécuter dans Supabase > SQL Editor
--
-- Ce fichier est idempotent :
--   - ON CONFLICT DO NOTHING pour le bucket
--   - DROP POLICY IF EXISTS avant chaque CREATE POLICY
-- ============================================================

-- ── 1. Créer le bucket public ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'levr-bookclubs',
    'levr-bookclubs',
    true,
    2097152,                -- 2 Mo max par fichier
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Policies sur storage.objects ──────────────────────────────────────

-- Lecture publique (tout le monde peut voir les photos de clubs)
DROP POLICY IF EXISTS "levr_bookclubs_select_public" ON storage.objects;
CREATE POLICY "levr_bookclubs_select_public"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'levr-bookclubs');

-- Upload : l'utilisateur ne peut uploader que dans son propre dossier (userId/)
-- Le chemin attendu est : <userId>/<timestamp>.<ext>
DROP POLICY IF EXISTS "levr_bookclubs_insert_owner" ON storage.objects;
CREATE POLICY "levr_bookclubs_insert_owner"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'levr-bookclubs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Remplacement de fichier (même contrainte de dossier)
DROP POLICY IF EXISTS "levr_bookclubs_update_owner" ON storage.objects;
CREATE POLICY "levr_bookclubs_update_owner"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'levr-bookclubs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Suppression (même contrainte de dossier)
DROP POLICY IF EXISTS "levr_bookclubs_delete_owner" ON storage.objects;
CREATE POLICY "levr_bookclubs_delete_owner"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'levr-bookclubs'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
