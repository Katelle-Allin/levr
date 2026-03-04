/**
 * Service Avis livres
 * ────────────────────
 * CRUD sur la table public."LEVR_book_reviews".
 * Un utilisateur = un avis par livre (contrainte UNIQUE book_id + user_id).
 */

angular.module('levrApp').factory('ReviewService', ['$q', 'supabase', function($q, supabase) {

    function buildErrMsg(err) {
        if (!err)                    return 'Erreur inconnue';
        if (typeof err === 'string') return err;
        var msg = err.message || 'Erreur inconnue';
        if (err.hint)    msg += ' — ' + err.hint;
        if (err.code)    msg += ' [' + err.code + ']';
        if (err.details) msg += ' (' + err.details + ')';
        return msg;
    }

    return {

        /**
         * Récupère tous les avis d'un livre, avec profil de l'auteur.
         * @param {string} bookId
         * @returns {Promise<Array>}
         */
        getBookReviews: function(bookId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_book_reviews')
                .select('*, LEVR_users!user_id(username, profile_picture)')
                .eq('book_id', bookId)
                .order('created_at', { ascending: false })
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErrMsg(res.error)); return; }
                    deferred.resolve(res.data || []);
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Récupère l'avis de l'utilisateur courant pour un livre donné.
         * @param {string} bookId
         * @param {string} userId
         * @returns {Promise<Object|null>}
         */
        getMyReview: function(bookId, userId) {
            var deferred = $q.defer();
            if (!userId) { deferred.resolve(null); return deferred.promise; }

            supabase
                .from('LEVR_book_reviews')
                .select('*')
                .eq('book_id', bookId)
                .eq('user_id', userId)
                .maybeSingle()
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErrMsg(res.error)); return; }
                    deferred.resolve(res.data || null);
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Crée ou met à jour l'avis de l'utilisateur (upsert).
         * @param {string} bookId
         * @param {string} userId
         * @param {number} rating  — entier 1-5
         * @param {string} content — texte libre (peut être null/vide)
         * @returns {Promise<Object>} avis sauvegardé
         */
        saveReview: function(bookId, userId, rating, content) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_book_reviews')
                .upsert(
                    {
                        book_id:    bookId,
                        user_id:    userId,
                        rating:     rating,
                        content:    content ? content.trim() : null,
                        updated_at: new Date().toISOString()
                    },
                    { onConflict: 'book_id,user_id' }
                )
                .select()
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErrMsg(res.error)); return; }
                    deferred.resolve(res.data[0]);
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Récupère avg + count de ratings pour une liste de bookIds en un seul appel.
         * Retourne un map { [bookId]: { avg: number, count: number } }.
         * @param {string[]} bookIds
         * @returns {Promise<Object>}
         */
        getRatingsSummary: function(bookIds) {
            var deferred = $q.defer();

            if (!bookIds || !bookIds.length) {
                deferred.resolve({});
                return deferred.promise;
            }

            supabase
                .from('LEVR_book_reviews')
                .select('book_id, rating')
                .in('book_id', bookIds)
                .then(function(res) {
                    if (res.error) { deferred.resolve({}); return; }
                    var acc = {};
                    (res.data || []).forEach(function(r) {
                        if (!acc[r.book_id]) acc[r.book_id] = { sum: 0, count: 0 };
                        acc[r.book_id].sum   += r.rating;
                        acc[r.book_id].count += 1;
                    });
                    var summary = {};
                    Object.keys(acc).forEach(function(bid) {
                        var m = acc[bid];
                        summary[bid] = {
                            avg:   Math.round((m.sum / m.count) * 10) / 10,
                            count: m.count
                        };
                    });
                    deferred.resolve(summary);
                })
                .catch(function() { deferred.resolve({}); });

            return deferred.promise;
        },

        /**
         * Supprime un avis par son id.
         * @param {string} reviewId
         * @returns {Promise}
         */
        deleteReview: function(reviewId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_book_reviews')
                .delete()
                .eq('id', reviewId)
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErrMsg(res.error)); return; }
                    deferred.resolve();
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        }
    };
}]);
