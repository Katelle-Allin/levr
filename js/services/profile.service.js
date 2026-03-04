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
         * Récupérer les statistiques de lecture de l'utilisateur connecté
         * @returns {Promise}
         */
        getMyStats: function() {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('User not authenticated');
                    return;
                }

                var stats = {
                    lu: 0,
                    en_cours: 0,
                    a_lire: 0,
                    total_pages: 0,
                    genre_favori: null
                };

                // Récupérer les livres avec leurs informations
                supabase
                    .from('LEVR_user_books')
                    .select('status, book_id, LEVR_books(page_count)')
                    .eq('user_id', user.id)
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
                            return;
                        }

                        var books = response.data;

                        // Compter par statut
                        books.forEach(function(book) {
                            if (book.status === 'LU') {
                                stats.lu++;
                                // Ajouter les pages si disponibles
                                if (book.LEVR_books && book.LEVR_books.page_count) {
                                    stats.total_pages += book.LEVR_books.page_count;
                                }
                            } else if (book.status === 'EN_COURS') {
                                stats.en_cours++;
                            } else if (book.status === 'A_LIRE') {
                                stats.a_lire++;
                            }
                        });

                        // Récupérer le profil pour avoir favorite_genres
                        supabase
                            .from('LEVR_users')
                            .select('favorite_genres')
                            .eq('id', user.id)
                            .single()
                            .then(function(profileResponse) {
                                if (profileResponse.data && profileResponse.data.favorite_genres && profileResponse.data.favorite_genres.length > 0) {
                                    stats.genre_favori = profileResponse.data.favorite_genres[0];
                                }
                                deferred.resolve(stats);
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
         * Récupérer les statistiques d'un autre utilisateur (si profil public)
         * @param {string} userId - ID de l'utilisateur
         * @returns {Promise}
         */
        getUserStats: function(userId) {
            var deferred = $q.defer();

            var stats = {
                lu: 0,
                en_cours: 0,
                a_lire: 0,
                total_pages: 0,
                genre_favori: null
            };

            // Vérifier si le profil est public
            supabase
                .from('LEVR_users')
                .select('is_public, favorite_genres')
                .eq('id', userId)
                .single()
                .then(function(profileResponse) {
                    if (profileResponse.error || !profileResponse.data.is_public) {
                        deferred.reject('Profil privé');
                        return;
                    }

                    if (profileResponse.data.favorite_genres && profileResponse.data.favorite_genres.length > 0) {
                        stats.genre_favori = profileResponse.data.favorite_genres[0];
                    }

                    // Récupérer les livres
                    supabase
                        .from('LEVR_user_books')
                        .select('status, book_id, LEVR_books(page_count)')
                        .eq('user_id', userId)
                        .then(function(response) {
                            if (response.error) {
                                deferred.reject(response.error);
                                return;
                            }

                            var books = response.data;

                            books.forEach(function(book) {
                                if (book.status === 'LU') {
                                    stats.lu++;
                                    if (book.LEVR_books && book.LEVR_books.page_count) {
                                        stats.total_pages += book.LEVR_books.page_count;
                                    }
                                } else if (book.status === 'EN_COURS') {
                                    stats.en_cours++;
                                } else if (book.status === 'A_LIRE') {
                                    stats.a_lire++;
                                }
                            });

                            deferred.resolve(stats);
                        });
                })
                .catch(function(error) {
                    deferred.reject(error);
                });

            return deferred.promise;
        }
    };
}]);