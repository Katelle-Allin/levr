-- ============================================================
-- Fonction delete_account()
-- Appelée via supabase.rpc('delete_account') par l'utilisateur
-- connecté qui veut supprimer définitivement son compte.
--
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire
-- (postgres), ce qui autorise la suppression dans auth.users
-- sans exposer la clé service_role côté client.
--
-- Idempotent (CREATE OR REPLACE).
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    _uid uuid := auth.uid();
BEGIN
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Supprimer les données LEVR (cascade gère les sous-tables)
    DELETE FROM public."LEVR_users" WHERE id = _uid;

    -- 2. Supprimer le compte auth (sessions incluses)
    DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- Seuls les utilisateurs authentifiés peuvent appeler cette fonction
REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

-- Rechargement du cache PostgREST
NOTIFY pgrst, 'reload schema';
