/**
 * Service de gestion des profils utilisateurs
 * Gère les opérations CRUD sur les profils, avatars et statistiques
 */

angular.module('levrApp').factory('ProfileService', ['$q', 'supabase', 'AuthService', function($q, supabase, AuthService) {
    
    return {
        /**
         * Récupérer le profil de l'utilisateur connecté
         * @returns {Promise}
         */
        getMyProfile: function() {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('User not authenticated');
                    return;
                }

                supabase
                    .from('LEVR_users')
                    .select('*')
                    .eq('id', user.id)
                    .single()
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
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
         * Récupérer un profil public par username
         * @param {string} username - Nom d'utilisateur
         * @returns {Promise}
         */
        getProfileByUsername: function(username) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_users')
                .select('*')
                .eq('username', username)
                .single()
                .then(function(response) {
                    if (response.error) {
                        deferred.reject(response.error);
                    } else {
                        deferred.resolve(response.data);
                    }
                });

            return deferred.promise;
        },

        /**
         * Mettre à jour son propre profil
         * @param {Object} payload - Données à mettre à jour (username, bio, favorite_genres, is_public)
         * @returns {Promise}
         */
        updateMyProfile: function(payload) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('User not authenticated');
                    return;
                }

                supabase
                    .from('LEVR_users')
                    .update(payload)
                    .eq('id', user.id)
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
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
         * Upload d'un avatar (image de profil)
         * @param {File} file - Fichier image (PNG/JPG)
         * @returns {Promise} Retourne l'URL publique de l'avatar
         */
        uploadAvatar: function(file) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('User not authenticated');
                    return;
                }

                // Vérifier le type de fichier
                if (!file.type.match(/image\/(png|jpg|jpeg)/)) {
                    deferred.reject('Le fichier doit être une image PNG ou JPG');
                    return;
                }

                // Vérifier la taille (max 2MB)
                if (file.size > 2 * 1024 * 1024) {
                    deferred.reject('Le fichier ne doit pas dépasser 2MB');
                    return;
                }

                // Nom du fichier : userId + timestamp + extension
                var fileExt = file.name.split('.').pop();
                var fileName = user.id + '_' + Date.now() + '.' + fileExt;
                var filePath = 'avatars/' + fileName;

                // Upload vers Supabase Storage
                supabase.storage
                    .from('levr-avatars')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    })
                    .then(function(uploadResponse) {
                        if (uploadResponse.error) {
                            deferred.reject(uploadResponse.error);
                            return;
                        }

                        // Récupérer l'URL publique
                        var publicUrlResponse = supabase.storage
                            .from('levr-avatars')
                            .getPublicUrl(filePath);

                        var publicUrl = publicUrlResponse.data.publicUrl;

                        // Mettre à jour le profil avec la nouvelle URL
                        supabase
                            .from('LEVR_users')
                            .update({ profile_picture: publicUrl })
                            .eq('id', user.id)
                            .then(function(updateResponse) {
                                if (updateResponse.error) {
                                    deferred.reject(updateResponse.error);
                                } else {
                                    deferred.resolve(publicUrl);
                                }
                            });
                    })
                    .catch(function(error) {
                        deferred.reject(error);
                    });
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Récupérer les statistiques de lecture de l'utilisateur connecté.
         * Retourne : { lu, lu_annee, pages_annee }
         *   lu          – livres lus au total (tous statuts 'LU')
         *   lu_annee    – livres ajoutés comme 'LU' cette année (proxy via created_at)
         *   pages_annee – pages réellement lues cette année (LEVR_reading_sessions)
         * @returns {Promise<{lu, lu_annee, pages_annee}>}
         */
        getMyStats: function() {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) { deferred.reject('User not authenticated'); return; }

                var yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString(); // e.g. 2026-01-01T00:00:00.000Z
                var yearStartDate = new Date().getFullYear() + '-01-01';               // for date_local (plain date column)

                // Requête 1 : livres lus (total + cette année via created_at)
                var booksP = $q(function(resolve) {
                    supabase
                        .from('LEVR_user_books')
                        .select('status, created_at')
                        .eq('user_id', user.id)
                        .eq('status', 'LU')
                        .then(function(res) {
                            var rows  = res.error ? [] : (res.data || []);
                            var lu    = rows.length;
                            var lu_annee = rows.filter(function(r) {
                                return r.created_at && r.created_at >= yearStart;
                            }).length;
                            resolve({ lu: lu, lu_annee: lu_annee });
                        })
                        .catch(function() { resolve({ lu: 0, lu_annee: 0 }); });
                });

                // Requête 2 : pages réelles lues cette année (LEVR_reading_sessions)
                var pagesP = $q(function(resolve) {
                    supabase
                        .from('LEVR_reading_sessions')
                        .select('pages_read')
                        .eq('user_id', user.id)
                        .gte('date_local', yearStartDate)
                        .then(function(res) {
                            var rows  = res.error ? [] : (res.data || []);
                            var total = rows.reduce(function(sum, r) {
                                return sum + (parseInt(r.pages_read, 10) || 0);
                            }, 0);
                            resolve(total);
                        })
                        .catch(function() { resolve(0); });
                });

                $q.all([booksP, pagesP]).then(function(results) {
                    deferred.resolve({
                        lu:          results[0].lu,
                        lu_annee:    results[0].lu_annee,
                        pages_annee: results[1]
                    });
                }).catch(function() {
                    deferred.resolve({ lu: 0, lu_annee: 0, pages_annee: 0 });
                });

            }).catch(function(error) { deferred.reject(error); });

            return deferred.promise;
        },

        /**
         * Récupérer les statistiques d'un autre utilisateur (si profil public).
         * Retourne : { lu, lu_annee, pages_annee }
         * Note : pages_annee est estimé via page_count des livres (les sessions sont privées via RLS).
         * @param {string} userId - ID de l'utilisateur
         * @returns {Promise<{lu, lu_annee, pages_annee}>}
         */
        getUserStats: function(userId) {
            var deferred = $q.defer();

            // Vérifier si le profil est public
            supabase
                .from('LEVR_users')
                .select('is_public')
                .eq('id', userId)
                .single()
                .then(function(profileResponse) {
                    if (profileResponse.error || !profileResponse.data || !profileResponse.data.is_public) {
                        deferred.reject('Profil privé');
                        return;
                    }

                    var yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

                    supabase
                        .from('LEVR_user_books')
                        .select('status, created_at, LEVR_books(page_count)')
                        .eq('user_id', userId)
                        .eq('status', 'LU')
                        .then(function(res) {
                            var rows      = res.error ? [] : (res.data || []);
                            var lu        = rows.length;
                            var lu_annee  = 0;
                            var pages_annee = 0;
                            rows.forEach(function(r) {
                                var isThisYear = r.created_at && r.created_at >= yearStart;
                                if (isThisYear) {
                                    lu_annee++;
                                    if (r.LEVR_books && r.LEVR_books.page_count) {
                                        pages_annee += (parseInt(r.LEVR_books.page_count, 10) || 0);
                                    }
                                }
                            });
                            deferred.resolve({ lu: lu, lu_annee: lu_annee, pages_annee: pages_annee });
                        })
                        .catch(function() {
                            deferred.resolve({ lu: 0, lu_annee: 0, pages_annee: 0 });
                        });
                })
                .catch(function(error) { deferred.reject(error); });

            return deferred.promise;
        }
    };
}]);