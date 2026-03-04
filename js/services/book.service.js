/**
 * Service de gestion de la bibliothèque
 * Gère la recherche de livres via Open Library et les opérations CRUD sur la bibliothèque personnelle
 */

angular.module('levrApp').factory('BookService', ['$q', '$http', 'supabase', 'AuthService', function($q, $http, supabase, AuthService) {

    // ── Cache mémoire (navigation search → page livre) ──────────────────────
    var _bookCache = {};

    // ── Dictionnaire genres LEVR ─────────────────────────────────────────────
    // Ordre : du plus spécifique au plus générique.
    // La correspondance se fait par sous-chaîne sur les subjects OpenLibrary mis en minuscule.
    var LEVR_GENRES = [
        { label: 'Policier',            keywords: ['detective', 'crime fiction', 'mystery fiction', 'whodunit', 'police procedural', 'criminal investigation'] },
        { label: 'Thriller',            keywords: ['thriller', 'suspense fiction', 'espionage', 'spy stories', 'conspiracy'] },
        { label: 'Horreur',             keywords: ['horror', 'ghost stories', 'supernatural fiction', 'occult fiction', 'paranormal'] },
        { label: 'Fantasy',             keywords: ['fantasy fiction', 'fantasy', 'magic', 'wizards', 'dragons', 'fairy tales', 'mythology', 'epic fantasy'] },
        { label: 'Science-fiction',     keywords: ['science fiction', 'sci-fi', 'space opera', 'cyberpunk', 'dystopian', 'dystopia', 'post-apocalyptic', 'time travel', 'artificial intelligence', 'robots'] },
        { label: 'Romance',             keywords: ['romance', 'love stories', 'chick lit', 'romantic fiction'] },
        { label: 'Aventure',            keywords: ['adventure stories', 'adventure fiction', 'action', 'sea stories', 'war stories', 'pirates'] },
        { label: 'Jeunesse',            keywords: ['juvenile fiction', 'young adult fiction', "children's fiction", 'children fiction', 'picture books', 'middle grade', 'juvenile literature'] },
        { label: 'Manga / BD',          keywords: ['manga', 'comics', 'graphic novels', 'comic books', 'bande dessin'] },
        { label: 'Biographie',          keywords: ['biography', 'autobiography', 'memoir', 'personal memoirs', 'biographies'] },
        { label: 'Histoire',            keywords: ['history', 'historical fiction', 'ancient history', 'medieval', 'world war'] },
        { label: 'Philosophie',         keywords: ['philosophy', 'ethics', 'existentialism', 'logic', 'phenomenology'] },
        { label: 'Science',             keywords: ['science', 'physics', 'biology', 'chemistry', 'astronomy', 'mathematics', 'medicine', 'technology'] },
        { label: 'Développement perso', keywords: ['self-help', 'personal development', 'motivation', 'productivity', 'psychology'] },
        { label: 'Essai',               keywords: ['essays', 'nonfiction', 'non-fiction', 'politics', 'economics', 'sociology', 'journalism'] },
        { label: 'Roman',               keywords: ['fiction', 'novel', 'literary fiction', 'short stories', 'drama'] }
    ];

    /**
     * Mappe un tableau de subjects OpenLibrary vers un genre LEVR normalisé.
     * Retourne null si aucune correspondance (affichage "Non classé" côté template).
     * @param {string[]} subjects
     * @returns {string|null}
     */
    function mapGenreLevr(subjects) {
        if (!subjects || subjects.length === 0) return null;
        var haystack = subjects.map(function(s) { return (s || '').toLowerCase(); }).join(' | ');
        for (var i = 0; i < LEVR_GENRES.length; i++) {
            var g = LEVR_GENRES[i];
            for (var j = 0; j < g.keywords.length; j++) {
                if (haystack.indexOf(g.keywords[j]) !== -1) {
                    return g.label;
                }
            }
        }
        return null;
    }

    return {

        /**
         * Expose le mappeur genre pour les contrôleurs (BookCtrl, etc.).
         * @param {string[]} subjects
         * @returns {string|null}
         */
        mapGenreLevr: mapGenreLevr,

        /**
         * Mise à jour silencieuse (fire-and-forget) du genre_levr dans LEVR_books.
         * Appelé depuis BookCtrl quand le genre est calculé depuis OpenLibrary
         * et n'était pas encore stocké en base.
         * @param {string} bookId
         * @param {string} genreLevr
         */
        updateGenreLevr: function(bookId, genreLevr) {
            supabase
                .from('LEVR_books')
                .update({ genre_levr: genreLevr })
                .eq('book_id', bookId)
                .then(angular.noop)
                .catch(angular.noop);
        },

        /**
         * Stocke un objet livre en mémoire (avant navigation).
         * @param {string} bookId
         * @param {Object} bookData
         */
        setCache: function(bookId, bookData) {
            _bookCache[bookId] = bookData;
        },

        /**
         * Récupère un livre depuis le cache mémoire (ou null).
         * @param {string} bookId
         * @returns {Object|null}
         */
        getCache: function(bookId) {
            return _bookCache[bookId] || null;
        },

        /**
         * Charge un livre depuis la table LEVR_books (peut retourner null).
         * @param {string} bookId
         * @returns {Promise<Object|null>}
         */
        getBookById: function(bookId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_books')
                .select('*')
                .eq('book_id', bookId)
                .maybeSingle()
                .then(function(res) {
                    if (res.error) { deferred.resolve(null); return; }
                    deferred.resolve(res.data || null);
                })
                .catch(function() { deferred.resolve(null); });

            return deferred.promise;
        },
        /**
         * Récupère l'entrée LEVR_user_books de l'utilisateur pour un livre donné.
         * Retourne null si le livre n'est pas dans sa bibliothèque.
         * @param {string} bookId
         * @returns {Promise<Object|null>}
         */
        getMyLibraryEntry: function(bookId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) { deferred.resolve(null); return; }

                supabase
                    .from('LEVR_user_books')
                    .select('book_id, shelf')
                    .eq('user_id', user.id)
                    .eq('book_id', bookId)
                    .maybeSingle()
                    .then(function(res) {
                        if (res.error) { deferred.resolve(null); return; }
                        deferred.resolve(res.data || null);
                    })
                    .catch(function() { deferred.resolve(null); });
            }).catch(function() { deferred.resolve(null); });

            return deferred.promise;
        },

        /**
         * Rechercher des livres via l'API Open Library
         * @param {string} query - Terme de recherche (titre, auteur, ISBN)
         * @returns {Promise} Liste de livres formatés
         */
        searchBooks: function(query) {
            var deferred = $q.defer();

            if (!query || query.trim().length < 2) {
                deferred.reject('Veuillez entrer au moins 2 caractères');
                return deferred.promise;
            }

            var url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(query) + '&limit=20';

            $http.get(url).then(function(response) {
                var results = response.data.docs || [];
                
                if (results.length === 0) {
                    deferred.resolve([]);
                    return;
                }

                // Formater les résultats
                var books = results.map(function(book) {
                    var coverId = book.cover_i;
                    var coverUrl = coverId
                        ? 'https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg'
                        : null;

                    var subjects = book.subject || [];

                    return {
                        book_id: book.key.replace('/works/', ''), // Utiliser la clé OpenLibrary
                        title: book.title || 'Titre inconnu',
                        author: (book.author_name && book.author_name[0]) || 'Auteur inconnu',
                        cover_url: coverUrl,
                        genre: subjects[0] || null,
                        genre_levr: mapGenreLevr(subjects),
                        subjects: subjects,
                        page_count: book.number_of_pages_median || null,
                        first_publish_year: book.first_publish_year || null
                    };
                });

                deferred.resolve(books);
            }).catch(function(error) {
                console.error('Erreur API Open Library:', error);
                deferred.reject('Erreur lors de la recherche. Vérifiez votre connexion.');
            });

            return deferred.promise;
        },

        /**
         * Ajouter un livre à la bibliothèque personnelle
         * @param {Object} book - Données du livre
         * @param {string} shelf - Étagère (A_LIRE, EN_COURS, LU, ou personnalisée)
         * @param {string} note - Note personnelle (optionnel)
         * @returns {Promise}
         */
        addBookToLibrary: function(book, shelf, note) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('Vous devez être connecté');
                    return;
                }

                // Étape 1 : Ajouter le livre au catalogue global (upsert)
                supabase
                    .from('LEVR_books')
                    .upsert([{
                        book_id: book.book_id,
                        title: book.title,
                        author: book.author,
                        cover_url: book.cover_url,
                        genre: book.genre,
                        genre_levr: book.genre_levr || mapGenreLevr(book.subjects || []) || null,
                        page_count: book.page_count
                    }], { onConflict: 'book_id' })
                    .then(function(bookResponse) {
                        if (bookResponse.error) {
                            deferred.reject(bookResponse.error);
                            return;
                        }

                        // Étape 2 : Ajouter à la bibliothèque personnelle
                        supabase
                            .from('LEVR_user_books')
                            .upsert([{
                                user_id: user.id,
                                book_id: book.book_id,
                                shelf: shelf || 'A_LIRE',
                                note: note || null,
                                status: shelf === 'LU' ? 'LU' : (shelf === 'EN_COURS' ? 'EN_COURS' : 'A_LIRE')
                            }], { onConflict: 'user_id,book_id' })
                            .then(function(userBookResponse) {
                                if (userBookResponse.error) {
                                    deferred.reject(userBookResponse.error);
                                } else {
                                    deferred.resolve(userBookResponse.data);
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
         * Récupérer la bibliothèque personnelle de l'utilisateur connecté
         * @returns {Promise} Liste des livres avec leurs étagères
         */
        getMyLibrary: function() {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('Vous devez être connecté');
                    return;
                }

                supabase
                    .from('LEVR_user_books')
                    .select('*, LEVR_books(*)')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
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
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Changer l'étagère d'un livre
         * @param {string} bookId - ID du livre
         * @param {string} newShelf - Nouvelle étagère
         * @returns {Promise}
         */
        updateShelf: function(bookId, newShelf) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('Vous devez être connecté');
                    return;
                }

                var updateData = { shelf: newShelf };
                
                // Mettre à jour aussi le status si c'est une étagère par défaut
                if (newShelf === 'LU') {
                    updateData.status = 'LU';
                } else if (newShelf === 'EN_COURS') {
                    updateData.status = 'EN_COURS';
                } else if (newShelf === 'A_LIRE') {
                    updateData.status = 'A_LIRE';
                }

                supabase
                    .from('LEVR_user_books')
                    .update(updateData)
                    .eq('user_id', user.id)
                    .eq('book_id', bookId)
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
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Supprimer un livre de la bibliothèque personnelle
         * @param {string} bookId - ID du livre
         * @returns {Promise}
         */
        deleteBook: function(bookId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) {
                    deferred.reject('Vous devez être connecté');
                    return;
                }

                supabase
                    .from('LEVR_user_books')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('book_id', bookId)
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
         * Récupérer toutes les étagères uniques de l'utilisateur
         * @returns {Promise} Liste des noms d'étagères
         */
        getMyShelves: function() {
            var deferred = $q.defer();

            this.getMyLibrary().then(function(books) {
                var shelves = {};
                books.forEach(function(book) {
                    shelves[book.shelf] = true;
                });
                deferred.resolve(Object.keys(shelves));
            }).catch(function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        },

        /**
         * Compter le nombre total de livres de l'utilisateur
         * @param {string} userId - ID de l'utilisateur (optionnel, sinon user connecté)
         * @returns {Promise}
         */
        getBookCount: function(userId) {
            var deferred = $q.defer();

            var getUserId = userId 
                ? Promise.resolve(userId)
                : AuthService.getUser().then(function(user) { return user ? user.id : null; });

            getUserId.then(function(uid) {
                if (!uid) {
                    deferred.resolve(0);
                    return;
                }

                supabase
                    .from('LEVR_user_books')
                    .select('book_id', { count: 'exact', head: true })
                    .eq('user_id', uid)
                    .then(function(response) {
                        if (response.error) {
                            deferred.reject(response.error);
                        } else {
                            deferred.resolve(response.count || 0);
                        }
                    });
            });

            return deferred.promise;
        }
    };
}]);
