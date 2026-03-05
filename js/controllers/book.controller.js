/**
 * Contrôleur de la page Détail Livre
 * ─────────────────────────────────────────────────────────────
 * Route : #!/book/:bookId  (bookId = OpenLibrary work key, ex: OL12345W)
 *
 * Sources de données :
 *  1. Cache mémoire BookService (peuplé par SearchCtrl ou BookclubDetailCtrl)
 *  2. Table LEVR_books (si le livre a déjà été ajouté par quelqu'un)
 *  3. OpenLibrary works API (description, covers, année, auteur fallback)
 *
 * Fonctionnalités :
 *  - Affichage couverture, titre, auteur, année, description collapsible
 *  - Stats communauté : moyenne ★ + nb avis
 *  - Formulaire "Mon avis" : sélecteur d'étoiles + textarea + upsert
 *  - Suppression de son propre avis
 *  - Liste avis communauté avec "Afficher plus"
 */

angular.module('levrApp').controller('BookCtrl', [
    '$scope', '$routeParams', '$location', '$http', '$q', '$timeout', '$window',
    'BookService', 'ReviewService', 'AuthService', 'ToastService',
    function($scope, $routeParams, $location, $http, $q, $timeout, $window,
             BookService, ReviewService, AuthService, ToastService) {

        var bookId = $routeParams.bookId;

        // ── État principal ────────────────────────────────────────────────────

        $scope.book           = null;    // données fusionnées
        $scope.description    = null;    // texte complet
        $scope.descTrimmed    = false;   // description > 300 chars
        $scope.showFullDesc   = false;
        $scope.loading        = true;
        $scope.error          = '';
        $scope.currentUser    = null;

        // Avis
        $scope.myReview       = null;
        $scope.reviews        = [];
        $scope.avgRating      = null;
        $scope.reviewCount    = 0;
        $scope.reviewsVisible = 5;

        // Formulaire "Mon avis"
        $scope.editForm       = { rating: 0, content: '' };
        $scope.hoverRating    = 0;
        $scope.saving         = false;
        $scope.deleting       = false;
        $scope.saveError      = '';

        // Bibliothèque
        $scope.userBook        = null;   // {book_id, shelf} si dans la bibliothèque
        $scope.addingToLib     = false;
        $scope.libShelf        = 'A_LIRE';
        $scope.showShelfPicker = false;
        $scope.libError        = '';

        // Amazon affiliate
        $scope.amazonUrl = null;

        // ── Helpers bibliothèque ─────────────────────────────────────────────

        $scope.formatShelfName = function(shelf) {
            var names = { 'A_LIRE': 'À lire', 'EN_COURS': 'En cours', 'LU': 'Lu' };
            return names[shelf] || (shelf || '').replace(/_/g, ' ');
        };

        $scope.addToLibrary = function() {
            if (!$scope.book || $scope.addingToLib) return;

            $scope.addingToLib = true;
            $scope.libError    = '';

            // book_id toujours depuis la closure (bookId = $routeParams.bookId)
            // pour ne pas dépendre de $scope.book.book_id qui peut être undefined
            // si le livre n'a jamais été ajouté et qu'il n'y a pas de cache.
            var bookData = angular.extend({}, $scope.book, { book_id: bookId });

            console.log('[BookCtrl] addToLibrary → bookId:', bookId,
                        '| shelf:', $scope.libShelf,
                        '| title:', bookData.title);

            BookService.addBookToLibrary(bookData, $scope.libShelf)
                .then(function() {
                    $scope.userBook        = { book_id: bookId, shelf: $scope.libShelf };
                    $scope.showShelfPicker = false;
                    $scope.addingToLib     = false;
                    ToastService.add({
                        type:    'success',
                        message: '\uD83D\uDCDA\u00a0"' + (bookData.title || 'Ce livre') + '" ajout\u00e9 \u00e0 votre biblioth\u00e8que\u00a0!',
                        duration: 4000
                    });
                })
                .catch(function(err) {
                    var msg = typeof err === 'string' ? err
                            : (err && (err.message || JSON.stringify(err)))
                            || 'Erreur lors de l\'ajout';
                    console.error('[BookCtrl] addToLibrary error:', err);
                    $scope.libError    = msg;
                    $scope.addingToLib = false;
                });
        };

        $scope.changeLibShelf = function(newShelf) {
            if (!newShelf || !$scope.userBook) return;
            BookService.updateShelf(bookId, newShelf)
                .then(function() {
                    $scope.userBook.shelf    = newShelf;
                    $scope.userBook.newShelf = '';
                })
                .catch(angular.noop);
        };

        // ng-if crée des scopes enfants — les assignations primitives (showShelfPicker = true)
        // dans un ng-click imbriqué ne remontent pas au scope parent.
        // On passe par une fonction pour modifier le scope du contrôleur directement.
        $scope.setShowShelfPicker = function(show) {
            $scope.showShelfPicker = show;
        };

        // ── Helpers étoiles ──────────────────────────────────────────────────

        $scope.ratingArray = [1, 2, 3, 4, 5];

        $scope.setRating = function(n) {
            $scope.editForm.rating = n;
        };

        $scope.hoverStar = function(n) {
            $scope.hoverRating = n;
        };

        $scope.leaveStar = function() {
            $scope.hoverRating = 0;
        };

        $scope.starClass = function(n) {
            var active = $scope.hoverRating || $scope.editForm.rating;
            return n <= active ? 'star--filled' : '';
        };

        $scope.starClassRo = function(n, rating) {
            return n <= rating ? 'star--filled' : '';
        };

        // ── Helpers affichage ────────────────────────────────────────────────

        $scope.toggleDesc = function() {
            $scope.showFullDesc = !$scope.showFullDesc;
        };

        $scope.showMoreReviews = function() {
            $scope.reviewsVisible += 5;
        };

        $scope.hasMore = function() {
            return $scope.reviews.length > $scope.reviewsVisible;
        };

        $scope.goBack = function() {
            $window.history.back();
        };

        $scope.formatReviewDate = function(dateStr) {
            if (!dateStr) return '';
            var d = new Date(dateStr);
            return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        };

        // ── Calcul stats ─────────────────────────────────────────────────────

        function updateStats(reviews) {
            $scope.reviewCount = reviews.length;
            if (reviews.length === 0) {
                $scope.avgRating = null;
                return;
            }
            var sum = reviews.reduce(function(acc, r) { return acc + r.rating; }, 0);
            $scope.avgRating = Math.round((sum / reviews.length) * 10) / 10;
        }

        // ── Amazon affiliate helper ──────────────────────────────────────────

        /**
         * Convertit un ISBN-13 débutant par "978" en ISBN-10.
         * Retourne null si la conversion est impossible (préfixe "979" ou format invalide).
         */
        function isbn13ToIsbn10(isbn13) {
            var digits = String(isbn13).replace(/[^0-9]/g, '');
            if (digits.length !== 13 || digits.slice(0, 3) !== '978') return null;
            var core = digits.slice(3, 12); // 9 chiffres après "978"
            var sum = 0;
            for (var i = 0; i < 9; i++) {
                sum += parseInt(core[i]) * (10 - i);
            }
            var check = (11 - (sum % 11)) % 11;
            return core + (check === 10 ? 'X' : String(check));
        }

        /** Normalise un objet langue OpenLibrary ({key:"/languages/eng"} ou string) en code court. */
        function normalizeLang(lang) {
            if (!lang) return '';
            var key = (typeof lang === 'object') ? (lang.key || '') : String(lang);
            var idx = key.lastIndexOf('/');
            return (idx >= 0 ? key.slice(idx + 1) : key).toLowerCase();
        }

        var EN_LANGS = ['eng', 'en'];
        var FR_LANGS = ['fre', 'fra', 'fr'];

        /**
         * Cherche le meilleur ISBN (isbn_10 préféré) dans les éditions OpenLibrary
         * dont la langue correspond au code normalisé.
         * Si la langue est inconnue (hors EN/FR), toutes les éditions sont candidates.
         * Retourne { isbn10, isbn13 } ou null.
         */
        function findIsbnForLang(editions, langCode) {
            if (!editions || !editions.entries) return null;

            var isEn = EN_LANGS.indexOf(langCode) >= 0;
            var isFr = FR_LANGS.indexOf(langCode) >= 0;
            var knownLang = isEn || isFr;
            var targetSet = isEn ? EN_LANGS : (isFr ? FR_LANGS : null);

            var isbn10 = null, isbn13 = null;
            var entries = editions.entries;

            // Langue inconnue → pas de filtre fiable, forcer le fallback recherche
            if (!knownLang) return null;

            for (var i = 0; i < entries.length; i++) {
                var ent   = entries[i];
                var langs = ent.languages || [];
                if (langs.length === 0) continue;
                var match = langs.some(function(l) {
                    return targetSet.indexOf(normalizeLang(l)) >= 0;
                });
                if (!match) continue;
                if (!isbn10 && ent.isbn_10 && ent.isbn_10.length > 0) isbn10 = ent.isbn_10[0];
                if (!isbn13 && ent.isbn_13 && ent.isbn_13.length > 0) isbn13 = ent.isbn_13[0];
                if (isbn10) break;
            }
            return (isbn10 || isbn13) ? { isbn10: isbn10, isbn13: isbn13 } : null;
        }

        /**
         * Construit le lien Amazon FR affilié le plus précis possible.
         *  1. ISBN-10 direct                   → /dp/{isbn10}
         *  2. ISBN-13 "978…" converti          → /dp/{isbn10 calculé}
         *  3. Sinon                             → /s?k={titre+auteur[+ "english edition"]}
         * "english edition" ajouté au fallback uniquement pour les livres EN.
         */
        function buildAmazonUrl(isbn10, isbn13, title, author, langCode) {
            var tag  = 'thebookclubap-21';
            var asin = isbn10 || null;

            if (!asin && isbn13) {
                asin = isbn13ToIsbn10(isbn13); // null si "979…"
            }

            if (asin) {
                return 'https://www.amazon.fr/dp/' + asin + '/?tag=' + tag;
            }

            // Fallback : recherche par titre + auteur
            var base = ((title || '') + ' ' + (author || '')).trim();
            if (EN_LANGS.indexOf(langCode) >= 0) base += ' english edition';
            return 'https://www.amazon.fr/s?k=' + encodeURIComponent(base) + '&tag=' + tag;
        }

        // ── Chargement ────────────────────────────────────────────────────────

        function loadAll() {
            $scope.loading = true;
            $scope.error   = '';

            AuthService.getSession().then(function(user) {
                $scope.currentUser = user;

                // Précharge depuis le cache mémoire si disponible
                var cached = BookService.getCache(bookId);
                if (cached) {
                    $scope.book = cached;
                }

                // Promesses parallèles
                var dbPromise        = BookService.getBookById(bookId);
                var olPromise        = $http.get('https://openlibrary.org/works/' + bookId + '.json')
                                           .then(function(r) { return r.data; })
                                           .catch(function() { return null; });
                var editionsPromise  = $http.get('https://openlibrary.org/works/' + bookId + '/editions.json?limit=30')
                                           .then(function(r) { return r.data; })
                                           .catch(function() { return null; });
                var reviewsPromise   = ReviewService.getBookReviews(bookId);
                var myRevPromise     = user
                                         ? ReviewService.getMyReview(bookId, user.id)
                                         : $q.resolve(null);
                var userBookPromise  = user
                                         ? BookService.getMyLibraryEntry(bookId)
                                         : $q.resolve(null);

                $q.all([dbPromise, olPromise, editionsPromise, reviewsPromise, myRevPromise, userBookPromise])
                    .then(function(results) {
                        var dbBook    = results[0];
                        var olWork    = results[1];
                        var editions  = results[2];
                        var reviews   = results[3];
                        var myRev     = results[4];
                        var userBook  = results[5];

                        // ── Fusion des données ────────────────────────────────
                        var merged = cached || {};

                        if (dbBook) {
                            merged = angular.extend({}, dbBook, merged);
                        }

                        // Titre / auteur depuis OpenLibrary si manquants
                        if (!merged.title && olWork && olWork.title) {
                            merged.title = olWork.title;
                        }

                        // Année depuis OpenLibrary
                        if (!merged.first_publish_year && olWork) {
                            var dateStr = olWork.first_publish_date || '';
                            var yearMatch = dateStr.match(/\d{4}/);
                            if (yearMatch) merged.first_publish_year = parseInt(yearMatch[0]);
                        }

                        // Cover : LEVR_books > OpenLibrary covers[0] > null
                        if (!merged.cover_url && olWork && olWork.covers && olWork.covers.length > 0) {
                            merged.cover_url = 'https://covers.openlibrary.org/b/id/' + olWork.covers[0] + '-L.jpg';
                        }

                        // Garantir book_id depuis la route (absent si ni cache ni entrée DB)
                        if (!merged.book_id) merged.book_id = bookId;

                        // ── Genre LEVR ────────────────────────────────────────
                        // Si le genre n'est pas encore en base, on le calcule depuis
                        // les subjects OpenLibrary et on met à jour silencieusement.
                        if (!merged.genre_levr && olWork && olWork.subjects && olWork.subjects.length > 0) {
                            var computedGenre = BookService.mapGenreLevr(olWork.subjects);
                            if (computedGenre) {
                                merged.genre_levr = computedGenre;
                                if (dbBook && user) {
                                    BookService.updateGenreLevr(bookId, computedGenre);
                                }
                            }
                        }

                        $scope.book = merged;

                        // ── Description OpenLibrary ───────────────────────────
                        if (olWork && olWork.description) {
                            var raw = olWork.description;
                            var text = (typeof raw === 'object' && raw.value) ? raw.value : String(raw);
                            $scope.description = text;
                            $scope.descTrimmed = text.length > 300;
                        }

                        // ── Auteur fallback via OpenLibrary /authors ───────────
                        if (!merged.author && olWork && olWork.authors && olWork.authors.length > 0) {
                            var authorKey = olWork.authors[0].author && olWork.authors[0].author.key;
                            if (authorKey) {
                                $http.get('https://openlibrary.org' + authorKey + '.json')
                                    .then(function(r) {
                                        if (r.data && r.data.name) {
                                            $scope.book.author = r.data.name;
                                        }
                                    })
                                    .catch(angular.noop);
                            }
                        }

                        // ── ISBN → lien Amazon FR affilié (langue cible) ─────
                        // Langue du work OpenLibrary normalisée (ex: "eng", "fre", "fra")
                        var langCode = '';
                        if (olWork && olWork.languages && olWork.languages.length > 0) {
                            langCode = normalizeLang(olWork.languages[0]);
                        }
                        var isbnResult = findIsbnForLang(editions, langCode);
                        $scope.amazonUrl = buildAmazonUrl(
                            isbnResult ? isbnResult.isbn10 : null,
                            isbnResult ? isbnResult.isbn13 : null,
                            merged.title, merged.author, langCode
                        );

                        // ── Bibliothèque ──────────────────────────────────────
                        $scope.userBook = userBook || null;

                        // ── Avis ──────────────────────────────────────────────
                        $scope.reviews    = reviews || [];
                        $scope.myReview   = myRev   || null;
                        updateStats($scope.reviews);

                        if ($scope.myReview) {
                            $scope.editForm.rating  = $scope.myReview.rating;
                            $scope.editForm.content = $scope.myReview.content || '';
                        }

                        $scope.loading = false;
                    })
                    .catch(function(err) {
                        $scope.error   = typeof err === 'string' ? err : (err && err.message) || 'Erreur de chargement';
                        $scope.loading = false;
                    });
            });
        }

        // ── Sauvegarder un avis ───────────────────────────────────────────────

        $scope.saveReview = function() {
            if (!$scope.currentUser || $scope.editForm.rating < 1 || $scope.saving) return;
            $scope.saving    = true;
            $scope.saveError = '';

            ReviewService.saveReview(
                bookId,
                $scope.currentUser.id,
                $scope.editForm.rating,
                $scope.editForm.content
            ).then(function(saved) {
                $scope.myReview = saved;
                // Rafraîchir la liste complète pour inclure l'avis mis à jour
                return ReviewService.getBookReviews(bookId);
            }).then(function(reviews) {
                $scope.reviews = reviews;
                updateStats(reviews);
                $scope.saving  = false;
            }).catch(function(err) {
                $scope.saveError = typeof err === 'string' ? err : (err && err.message) || 'Erreur lors de la sauvegarde';
                $scope.saving    = false;
            });
        };

        // ── Supprimer son avis ────────────────────────────────────────────────

        $scope.deleteReview = function() {
            if (!$scope.myReview || $scope.deleting) return;
            if (!window.confirm('Supprimer votre avis ? Cette action est irréversible.')) return;

            $scope.deleting  = true;
            $scope.saveError = '';

            ReviewService.deleteReview($scope.myReview.id)
                .then(function() {
                    $scope.myReview         = null;
                    $scope.editForm.rating  = 0;
                    $scope.editForm.content = '';
                    return ReviewService.getBookReviews(bookId);
                })
                .then(function(reviews) {
                    $scope.reviews  = reviews;
                    updateStats(reviews);
                    $scope.deleting = false;
                })
                .catch(function(err) {
                    $scope.saveError = typeof err === 'string' ? err : (err && err.message) || 'Erreur lors de la suppression';
                    $scope.deleting  = false;
                });
        };

        loadAll();
    }
]);
