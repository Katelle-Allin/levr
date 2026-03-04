/**
 * Service de gestion des utilisateurs
 * Gère les opérations CRUD sur la table LEVR_users
 */

angular.module('levrApp').factory('UserService', ['$q', 'supabase', function($q, supabase) {
    
    return {
        /**
         * Récupérer tous les utilisateurs depuis la table LEVR_users
         * @returns {Promise}
         */
        getAllUsers: function() {
            var deferred = $q.defer();

            supabase
                .from('LEVR_users')
                .select('*')
                .order('username', { ascending: true })
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
         * Récupérer un utilisateur spécifique par son ID
         * @param {string} userId - ID de l'utilisateur
         * @returns {Promise}
         */
        getUserById: function(userId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_users')
                .select('*')
                .eq('id', userId)
                .single()
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
         * Mettre à jour les genres favoris d'un utilisateur
         * @param {string} userId - ID de l'utilisateur
         * @param {Array} favoriteGenres - Nouveaux genres favoris
         * @returns {Promise}
         */
        updateFavoriteGenres: function(userId, favoriteGenres) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_users')
                .update({ favorite_genres: favoriteGenres })
                .eq('id', userId)
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