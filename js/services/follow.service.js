/**
 * Service de gestion des relations de suivi (followers/following)
 * Gère le suivi, désuivi et vérification des relations
 */

angular.module('levrApp').factory('FollowService', ['$q', 'supabase', 'AuthService', function($q, supabase, AuthService) {
    
    return {
        /**
         * Vérifier si l'utilisateur connecté suit un autre utilisateur
         * @param {string} userId - ID de l'utilisateur à vérifier
         * @returns {Promise<boolean>}
         */
        isFollowing: function(userId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.resolve(false);
                    return;
                }

                supabase
                    .from('LEVR_followers')
                    .select('*')
                    .eq('follower_id', user.id)
                    .eq('followed_id', userId)
                    .single()
                    .then(function(response) {
                        // Si pas d'erreur, la relation existe
                        deferred.resolve(!response.error && response.data);
                    })
                    .catch(function() {
                        deferred.resolve(false);
                    });
            }).catch(function() {
                deferred.resolve(false);
            });

            return deferred.promise;
        },

        /**
         * Suivre un utilisateur
         * @param {string} userId - ID de l'utilisateur à suivre
         * @returns {Promise}
         */
        follow: function(userId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('User not authenticated');
                    return;
                }

                if (user.id === userId) {
                    deferred.reject('Vous ne pouvez pas vous suivre vous-même');
                    return;
                }

                supabase
                    .from('LEVR_followers')
                    .insert([{
                        follower_id: user.id,
                        followed_id: userId
                    }])
                    .then(function(response) {
                        if (response.error) {
                            // Si l'erreur est "duplicate key", l'utilisateur suit déjà
                            if (response.error.code === '23505') {
                                deferred.reject('Vous suivez déjà cet utilisateur');
                            } else {
                                deferred.reject(response.error);
                            }
                        } else {
                            deferred.resolve(response.data);
                        }
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
         * Se désabonner d'un utilisateur
         * @param {string} userId - ID de l'utilisateur à ne plus suivre
         * @returns {Promise}
         */
        unfollow: function(userId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('User not authenticated');
                    return;
                }

                supabase
                    .from('LEVR_followers')
                    .delete()
                    .eq('follower_id', user.id)
                    .eq('followed_id', userId)
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
                        } else {
                            deferred.resolve();
                        }
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
         * Récupérer la liste des followers d'un utilisateur
         * @param {string} userId - ID de l'utilisateur
         * @returns {Promise}
         */
        getFollowers: function(userId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_followers')
                .select('follower_id, LEVR_users!LEVR_followers_follower_id_fkey(username, profile_picture)')
                .eq('followed_id', userId)
                .then(function(response) {
                    if (response.error) {
                        deferred.reject(response.error);
                    } else {
                        deferred.resolve(response.data);
                    }
                })
                .catch(function(error) {
                    deferred.reject(error);
                });

            return deferred.promise;
        },

        /**
         * Récupérer la liste des utilisateurs suivis par un utilisateur
         * @param {string} userId - ID de l'utilisateur
         * @returns {Promise}
         */
        getFollowing: function(userId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_followers')
                .select('followed_id, LEVR_users!LEVR_followers_followed_id_fkey(username, profile_picture)')
                .eq('follower_id', userId)
                .then(function(response) {
                    if (response.error) {
                        deferred.reject(response.error);
                    } else {
                        deferred.resolve(response.data);
                    }
                })
                .catch(function(error) {
                    deferred.reject(error);
                });

            return deferred.promise;
        }
    };
}]);
