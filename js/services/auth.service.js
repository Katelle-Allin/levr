/**
 * Service d'authentification
 * Gère l'inscription, la connexion et la déconnexion avec Supabase Auth
 */

angular.module('levrApp').factory('AuthService', ['$q', 'supabase', function($q, supabase) {
    
    return {
        /**
         * Inscription d'un nouvel utilisateur
         * @param {string} username - Nom d'utilisateur
         * @param {string} email - Email
         * @param {string} password - Mot de passe
         * @param {Array} favoriteGenres - Tableau des genres préférés (max 3)
         * @returns {Promise}
         */
        signup: function(username, email, password, favoriteGenres) {
            var deferred = $q.defer();

            // Étape 1 : Créer le compte avec Supabase Auth
            supabase.auth.signUp({
                email: email,
                password: password
            }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error);
                    return;
                }

                var userId = response.data.user.id;

                // Étape 2 : Insérer les données dans la table LEVR_users
                supabase
                    .from('LEVR_users')
                    .insert([{
                        id: userId,
                        username: username,
                        email: email,
                        favorite_genres: favoriteGenres
                    }])
                    .then(function(insertResponse) {
                        if (insertResponse.error) {
                            deferred.reject(insertResponse.error);
                        } else {
                            deferred.resolve(response.data);
                        }
                    });
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Connexion d'un utilisateur existant
         * @param {string} email - Email
         * @param {string} password - Mot de passe
         * @returns {Promise}
         */
        login: function(email, password) {
            var deferred = $q.defer();

            supabase.auth.signInWithPassword({
                email: email,
                password: password
            }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error);
                } else {
                    deferred.resolve(response.data);
                }
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Déconnexion de l'utilisateur
         * @returns {Promise}
         */
        logout: function() {
            var deferred = $q.defer();

            supabase.auth.signOut().then(function(response) {
                if (response.error) {
                    deferred.reject(response.error);
                } else {
                    deferred.resolve();
                }
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Récupérer l'utilisateur actuellement connecté
         * @returns {Promise}
         */
        getUser: function() {
            var deferred = $q.defer();

            supabase.auth.getUser().then(function(response) {
                if (response.error) {
                    deferred.resolve(null);
                } else {
                    deferred.resolve(response.data.user);
                }
            }).catch(function() {
                deferred.resolve(null);
            });

            return deferred.promise;
        },

        /**
         * Récupérer l'utilisateur depuis la session locale (localStorage).
         * Plus rapide que getUser() car ne fait pas de requête réseau.
         * Utilisé dans les contrôleurs pour éviter les race conditions avec le refresh de token.
         * @returns {Promise<User|null>}
         */
        getSession: function() {
            var deferred = $q.defer();
            supabase.auth.getSession().then(function(response) {
                var user = (response.data && response.data.session && response.data.session.user)
                    ? response.data.session.user
                    : null;
                deferred.resolve(user);
            }).catch(function() {
                deferred.resolve(null);
            });
            return deferred.promise;
        },

        /**
         * Connexion via un fournisseur OAuth (Google, Apple…)
         * Redirige le navigateur vers la page de consentement du provider.
         * Le retour se fait sur window.location.origin (géré dans onAuthStateChange).
         * @param {string} provider - 'google' | 'apple'
         * @returns {Promise}
         */
        signInWithOAuth: function(provider) {
            var deferred = $q.defer();
            supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: window.location.origin
                }
            }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error);
                } else {
                    deferred.resolve(response.data);
                }
            }).catch(function(error) {
                deferred.reject(error);
            });
            return deferred.promise;
        },

        /**
         * Envoie un email de réinitialisation de mot de passe.
         * Le lien redirige vers window.location.origin (Supabase ajoute le token en fragment).
         * @param {string} email
         * @returns {Promise}
         */
        resetPasswordForEmail: function(email) {
            var deferred = $q.defer();
            supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin
            }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error);
                } else {
                    deferred.resolve();
                }
            }).catch(function(error) {
                deferred.reject(error);
            });
            return deferred.promise;
        },

        /**
         * Met à jour le mot de passe de l'utilisateur courant (session recovery).
         * Doit être appelé après que l'utilisateur a une session PASSWORD_RECOVERY active.
         * @param {string} newPassword
         * @returns {Promise}
         */
        resetPassword: function(newPassword) {
            var deferred = $q.defer();
            supabase.auth.updateUser({ password: newPassword }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error);
                } else {
                    deferred.resolve(response.data);
                }
            }).catch(function(error) {
                deferred.reject(error);
            });
            return deferred.promise;
        },

        /**
         * S'assure qu'un profil LEVR_users existe pour cet utilisateur auth.
         * Utile pour les connexions OAuth où l'utilisateur n'a pas de ligne en DB.
         * Si le profil est absent, en crée un à partir des métadonnées OAuth.
         * @param {Object} user - objet user Supabase (id, email, user_metadata)
         * @returns {Promise<boolean>} - true si profil créé, false si déjà existant
         */
        ensureLEVRProfile: function(user) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_users')
                .select('id')
                .eq('id', user.id)
                .maybeSingle()
                .then(function(response) {
                    if (response.data) {
                        // Profil déjà en base
                        deferred.resolve(false);
                        return;
                    }

                    // Générer un username depuis l'email (préfixe + 5 chars aléatoires)
                    var emailPrefix = (user.email || 'user').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 12);
                    var suffix = Math.random().toString(36).substring(2, 7);
                    var username = (emailPrefix || 'user') + '_' + suffix;

                    supabase
                        .from('LEVR_users')
                        .insert([{
                            id:              user.id,
                            username:        username,
                            email:           user.email || '',
                            favorite_genres: []
                        }])
                        .then(function(insertResponse) {
                            if (insertResponse.error) {
                                deferred.reject(insertResponse.error);
                            } else {
                                deferred.resolve(true);
                            }
                        });
                })
                .catch(function(error) {
                    deferred.reject(error);
                });

            return deferred.promise;
        },

        /**
         * Met à jour l'email de l'utilisateur courant.
         * Supabase envoie un lien de confirmation à la nouvelle adresse.
         * L'email ne change dans auth.users qu'après clic sur le lien.
         * @param {string} newEmail
         * @returns {Promise}
         */
        updateEmail: function(newEmail) {
            var deferred = $q.defer();
            supabase.auth.updateUser({ email: newEmail }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error.message || response.error);
                } else {
                    deferred.resolve(response.data);
                }
            }).catch(function(error) {
                deferred.reject(error);
            });
            return deferred.promise;
        },

        /**
         * Met à jour le mot de passe de l'utilisateur courant (session active).
         * @param {string} newPassword
         * @returns {Promise}
         */
        updatePassword: function(newPassword) {
            var deferred = $q.defer();
            supabase.auth.updateUser({ password: newPassword }).then(function(response) {
                if (response.error) {
                    deferred.reject(response.error.message || response.error);
                } else {
                    deferred.resolve(response.data);
                }
            }).catch(function(error) {
                deferred.reject(error);
            });
            return deferred.promise;
        },

        /**
         * Supprime définitivement le compte de l'utilisateur courant.
         * Appelle la RPC delete_account() (SECURITY DEFINER) qui efface
         * LEVR_users + auth.users, puis déconnecte la session.
         * @returns {Promise}
         */
        deleteAccount: function() {
            var deferred = $q.defer();
            var self = this;
            supabase.rpc('delete_account').then(function(response) {
                if (response.error) {
                    deferred.reject(response.error.message || response.error);
                    return;
                }
                // Déconnexion locale après suppression (best-effort)
                self.logout().then(function() {
                    deferred.resolve();
                }).catch(function() {
                    deferred.resolve();
                });
            }).catch(function(error) {
                deferred.reject(error);
            });
            return deferred.promise;
        },

        /**
         * Vérifier si l'utilisateur est authentifié (pour les routes protégées)
         * @returns {Promise}
         */
        requireAuth: function() {
            var deferred = $q.defer();

            this.getUser().then(function(user) {
                if (user) {
                    deferred.resolve(user);
                } else {
                    deferred.reject('Not authenticated');
                }
            });

            return deferred.promise;
        }
    };
}]);