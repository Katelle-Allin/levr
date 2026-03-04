/**
 * Service de sessions de lecture
 * ───────────────────────────────
 * Gère LEVR_reading_sessions et la colonne edition_total_pages sur LEVR_user_books.
 */

angular.module('levrApp').factory('ReadingService', ['$q', 'supabase', function($q, supabase) {

    function buildErr(e) {
        if (!e)                    return 'Erreur inconnue';
        if (typeof e === 'string') return e;
        var msg = e.message || 'Erreur inconnue';
        if (e.hint)    msg += ' — ' + e.hint;
        if (e.code)    msg += ' [' + e.code + ']';
        if (e.details) msg += ' (' + e.details + ')';
        return msg;
    }

    return {

        /**
         * Retourne les livres EN_COURS + À_LIRE de l'utilisateur, triés
         * EN_COURS en premier puis par date d'ajout décroissante.
         * @param {string} userId
         * @returns {Promise<Array<{shelf, edition_total_pages, LEVR_books}>>}
         */
        getReadingBooks: function(userId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_user_books')
                .select('shelf, edition_total_pages, LEVR_books(book_id, title, author, cover_url, page_count)')
                .eq('user_id', userId)
                .in('shelf', ['EN_COURS', 'A_LIRE'])
                .order('created_at', { ascending: false })
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErr(res.error)); return; }
                    // Trier : EN_COURS d'abord
                    var rows = (res.data || []).filter(function(r) { return r.LEVR_books; });
                    rows.sort(function(a, b) {
                        if (a.shelf === b.shelf) return 0;
                        return a.shelf === 'EN_COURS' ? -1 : 1;
                    });
                    deferred.resolve(rows);
                })
                .catch(function(e) { deferred.reject(buildErr(e)); });

            return deferred.promise;
        },

        /**
         * Retourne la dernière end_page enregistrée pour ce user+livre.
         * Résout 0 si aucune session précédente.
         * @param {string} userId
         * @param {string} bookId
         * @returns {Promise<number>}
         */
        getLastEndPage: function(userId, bookId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_reading_sessions')
                .select('end_page')
                .eq('user_id', userId)
                .eq('book_id', bookId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
                .then(function(res) {
                    if (res.error) { deferred.resolve(0); return; }
                    deferred.resolve(res.data ? (res.data.end_page || 0) : 0);
                })
                .catch(function() { deferred.resolve(0); });

            return deferred.promise;
        },

        /**
         * Insère une session de lecture.
         * @param {string} userId
         * @param {string} bookId
         * @param {number} startPage
         * @param {number} endPage
         * @param {number} pagesRead
         * @param {string} dateLocal  — 'YYYY-MM-DD'
         * @param {string|null} note
         * @returns {Promise<Object>}
         */
        createSession: function(userId, bookId, startPage, endPage, pagesRead, dateLocal, note) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_reading_sessions')
                .insert([{
                    user_id:    userId,
                    book_id:    bookId,
                    date_local: dateLocal,
                    start_page: startPage,
                    end_page:   endPage,
                    pages_read: pagesRead,
                    note:       note || null
                }])
                .select()
                .single()
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErr(res.error)); return; }
                    deferred.resolve(res.data);
                })
                .catch(function(e) { deferred.reject(buildErr(e)); });

            return deferred.promise;
        },

        /**
         * Retourne le total de pages lues par l'utilisateur pour un jour donné
         * (toutes sessions, tous livres confondus).
         * Résout 0 si aucune session ce jour.
         * @param {string} userId
         * @param {string} dateLocal — 'YYYY-MM-DD'
         * @returns {Promise<number>}
         */
        getTodayTotal: function(userId, dateLocal) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_reading_sessions')
                .select('pages_read')
                .eq('user_id', userId)
                .eq('date_local', dateLocal)
                .then(function(res) {
                    if (res.error) { deferred.resolve(0); return; }
                    var total = (res.data || []).reduce(function(sum, row) {
                        return sum + (row.pages_read || 0);
                    }, 0);
                    deferred.resolve(total);
                })
                .catch(function() { deferred.resolve(0); });

            return deferred.promise;
        },

        /**
         * Met à jour edition_total_pages sur LEVR_user_books pour ce user+livre.
         * @param {string} userId
         * @param {string} bookId
         * @param {number} pages
         * @returns {Promise}
         */
        updateEditionPages: function(userId, bookId, pages) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_user_books')
                .update({ edition_total_pages: pages })
                .eq('user_id', userId)
                .eq('book_id', bookId)
                .then(function(res) {
                    if (res.error) { deferred.reject(buildErr(res.error)); return; }
                    deferred.resolve();
                })
                .catch(function(e) { deferred.reject(buildErr(e)); });

            return deferred.promise;
        }
    };
}]);
