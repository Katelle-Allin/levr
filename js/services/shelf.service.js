/**
 * Service de gestion des étagères personnalisées
 * CRUD sur la table LEVR_shelves (Supabase)
 */

angular.module('levrApp').factory('ShelfService', ['$q', 'supabase', 'AuthService', function($q, supabase, AuthService) {

    return {
        /**
         * Récupérer les étagères personnalisées de l'utilisateur connecté
         * @returns {Promise<Array>} Liste des étagères [{id, user_id, name, created_at}]
         */
        getUserShelves: function() {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.resolve([]);
                    return;
                }

                supabase
                    .from('LEVR_shelves')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: true })
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
                        } else {
                            deferred.resolve(response.data || []);
                        }
                    });
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Créer une nouvelle étagère personnalisée
         * @param {string} name - Nom de l'étagère (sera trimé)
         * @returns {Promise<Object>} L'étagère créée {id, user_id, name, created_at}
         */
        createShelf: function(name) {
            var deferred = $q.defer();

            var trimmedName = (name || '').trim();

            if (!trimmedName) {
                deferred.reject('Le nom de l\'étagère ne peut pas être vide');
                return deferred.promise;
            }

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('Vous devez être connecté');
                    return;
                }

                supabase
                    .from('LEVR_shelves')
                    .insert([{ user_id: user.id, name: trimmedName }])
                    .select()
                    .then(function(response) {
                        if (response.error) {
                            // Code 23505 = violation de contrainte UNIQUE
                            if (response.error.code === '23505') {
                                deferred.reject('Une étagère "' + trimmedName + '" existe déjà');
                            } else {
                                deferred.reject(response.error.message || 'Erreur lors de la création');
                            }
                        } else {
                            deferred.resolve(response.data[0]);
                        }
                    });
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Supprimer une étagère personnalisée
         * @param {string} shelfId - UUID de l'étagère
         * @returns {Promise}
         */
        deleteShelf: function(shelfId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('Vous devez être connecté');
                    return;
                }

                supabase
                    .from('LEVR_shelves')
                    .delete()
                    .eq('id', shelfId)
                    .eq('user_id', user.id)
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
                        } else {
                            deferred.resolve();
                        }
                    });
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        }
    };
}]);
