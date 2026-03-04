/**
 * Contrôleur global de l'application (monté sur <body>)
 * Gère :
 *   - La queue de toasts (lecture depuis $rootScope.toasts via ToastService)
 *   - La modale de création de post (lecture depuis $rootScope.postModal via PostService)
 *   - La modale de session de lecture ($rootScope.sessionModal via ReadingService)
 */

angular.module('levrApp').controller('AppController', [
    '$scope',
    '$rootScope',
    '$location',
    '$timeout',
    'ToastService',
    'PostService',
    'AuthService',
    'ProfileService',
    'ReadingService',
    'BookService',
    'BookclubService',
    'supabase',
    function($scope, $rootScope, $location, $timeout,
             ToastService, PostService, AuthService, ProfileService,
             ReadingService, BookService, BookclubService, supabase) {

        // ── User menu (top bar) ──────────────────────────────────────────────

        $scope.appUser      = null;
        $scope.showUserMenu = false;

        // Séquence pour ignorer les réponses périmées (race condition)
        var profileLoadSeq = 0;

        /**
         * Charge le profil LEVR_users du user actuellement authentifié
         * et le place dans $scope.appUser.
         * L'incrément de séquence garantit que si plusieurs chargements
         * sont en vol, seul le plus récent met à jour l'état.
         */
        function loadTopbarProfile() {
            var seq = ++profileLoadSeq;
            ProfileService.getMyProfile()
                .then(function(profile) {
                    if (seq !== profileLoadSeq) return; // réponse périmée
                    $scope.appUser = profile;
                    console.log('[AppController] topbar profile loaded:', profile && profile.username);
                })
                .catch(function(err) {
                    if (seq !== profileLoadSeq) return;
                    console.warn('[AppController] loadTopbarProfile error:', err);
                    $scope.appUser = null;
                });
        }

        // ── Listener onAuthStateChange ─────────────────────────────────────
        //
        // Supabase émet :
        //   INITIAL_SESSION  → session restaurée depuis localStorage au chargement
        //   SIGNED_IN        → login effectué (nouvel utilisateur)
        //   SIGNED_OUT       → logout effectué
        //   TOKEN_REFRESHED  → token silencieusement rafraîchi (pas besoin d'agir)
        //
        // Cette approche garantit que :
        //   1) appUser est toujours celui de la session active (jamais d'un autre)
        //   2) Le switch user A → logout → login user B met bien à jour le topbar
        //   3) Les réponses périmées (requête lente d'une session précédente) sont ignorées
        //
        var _authSubscription = null;
        var _authResult = supabase.auth.onAuthStateChange(function(event, session) {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session && session.user) {
                    // Charge le profil du nouvel utilisateur.
                    // $q gère le digest Angular automatiquement dans le .then().
                    loadTopbarProfile();

                    // Pour les connexions OAuth, s'assurer qu'un profil LEVR_users existe.
                    // Identifie les providers OAuth via app_metadata.provider (pas 'email').
                    var provider = session.user.app_metadata && session.user.app_metadata.provider;
                    if (provider && provider !== 'email') {
                        AuthService.ensureLEVRProfile(session.user).catch(function(err) {
                            console.warn('[AppController] ensureLEVRProfile error:', err);
                        });
                    }
                } else {
                    $timeout(function() { $scope.appUser = null; }, 0);
                }
            } else if (event === 'PASSWORD_RECOVERY') {
                // L'utilisateur a cliqué le lien de reset depuis son email.
                // Supabase a créé une session temporaire de type "recovery".
                // On redirige vers la page de choix du nouveau mot de passe.
                $timeout(function() {
                    $location.path('/reset-password');
                }, 0);
            } else if (event === 'SIGNED_OUT') {
                // Invalide tout chargement en vol
                profileLoadSeq++;
                $timeout(function() { $scope.appUser = null; }, 0);
            }
            // TOKEN_REFRESHED / USER_UPDATED : pas de rechargement nécessaire
        });

        if (_authResult && _authResult.data) {
            _authSubscription = _authResult.data.subscription;
        }

        // ── Mise à jour de l'avatar depuis la page Profil ─────────────────
        //
        // ProfileCtrl broadcast 'profile:avatarUpdated' après un upload réussi.
        // On met à jour directement $scope.appUser.profile_picture
        // sans refaire de requête réseau.
        //
        var _unsubAvatarUpdate = $rootScope.$on('profile:avatarUpdated', function(_evt, newUrl) {
            if ($scope.appUser) {
                $scope.appUser.profile_picture = newUrl;
            }
        });

        $scope.toggleUserMenu = function(e) {
            if (e) e.stopPropagation();
            $scope.showUserMenu = !$scope.showUserMenu;
        };

        $scope.logout = function() {
            // Vider immédiatement pour éviter tout flash de l'ancien avatar
            $scope.appUser      = null;
            $scope.showUserMenu = false;
            profileLoadSeq++;   // invalide tout chargement en vol
            AuthService.logout().then(function() {
                $location.path('/login');
            });
        };

        function handleOutsideClick() {
            if ($scope.showUserMenu) {
                $scope.$apply(function() { $scope.showUserMenu = false; });
            }
        }
        document.addEventListener('click', handleOutsideClick);

        // ── Fermeture par ESC ────────────────────────────────────────────────

        /**
         * Ferme la modale de post ou de session si on appuie sur Échap (ESC).
         * Le listener est proprement supprimé quand le contrôleur est détruit.
         */
        function handleEscKey(e) {
            if (e.key !== 'Escape') return;
            $scope.$apply(function() {
                if ($rootScope.postModal && $rootScope.postModal.show) {
                    PostService.closeModal();
                } else if ($rootScope.sessionModal && $rootScope.sessionModal.show) {
                    $scope.closeSessionModal();
                } else if ($rootScope.clubModal && $rootScope.clubModal.show) {
                    $scope.closeClubModal();
                }
            });
        }
        document.addEventListener('keydown', handleEscKey);
        $scope.$on('$destroy', function() {
            document.removeEventListener('keydown', handleEscKey);
            document.removeEventListener('click', handleOutsideClick);
            _unsubAvatarUpdate();
            if (_authSubscription) _authSubscription.unsubscribe();
        });

        // ── Toasts ───────────────────────────────────────────────────────────

        /**
         * Ferme un toast
         * @param {number} toastId
         */
        $scope.dismissToast = function(toastId) {
            ToastService.dismiss(toastId);
        };

        /**
         * Gère le clic sur un bouton d'action d'un toast
         * Si l'action porte un payload, ouvre la modale de post.
         * @param {Object} toast
         * @param {Object} action - { label, primary, payload }
         */
        $scope.handleToastAction = function(toast, action) {
            ToastService.dismiss(toast.id);
            if (action.payload) {
                PostService.openModal(action.payload);
            }
        };

        // ── Modale de création de post ────────────────────────────────────────

        /**
         * Ferme la modale de création de post
         */
        $scope.closePostModal = function() {
            PostService.closeModal();
        };

        /**
         * Gère la sélection d'un fichier image dans la modale
         * Appelé via onchange="..." (file input ne supporte pas ng-change)
         * @param {HTMLInputElement} input
         */
        $scope.handlePostImageFile = function(input) {
            var file = input.files && input.files[0];
            if (!file) return;

            $rootScope.postModal.imageFile = file;

            var reader = new FileReader();
            reader.onload = function(e) {
                $scope.$apply(function() {
                    $rootScope.postModal.previewUrl = e.target.result;
                });
            };
            reader.readAsDataURL(file);
        };

        /**
         * Déclenche le file input caché
         */
        $scope.triggerPostImageInput = function() {
            var el = document.getElementById('post-image-file-input');
            if (el) el.click();
        };

        /**
         * Publie le post
         */
        $scope.submitPost = function() {
            var modal = $rootScope.postModal;

            if (!modal.content || !modal.content.trim()) {
                modal.error = 'Le texte du post ne peut pas être vide.';
                return;
            }

            modal.saving = true;
            modal.error  = '';

            function doCreate(imageUrl) {
                var payload = modal.payload || {};

                PostService.createPost({
                    bookId:     payload.book     ? payload.book.book_id : null,
                    actionType: payload.actionType || 'MANUAL',
                    fromShelf:  payload.fromShelf  || null,
                    toShelf:    payload.toShelf    || null,
                    content:    modal.content.trim(),
                    imageUrl:   imageUrl || null,
                    bookData:   payload.book     || null
                }).then(function(post) {
                    modal.saving = false;
                    PostService.closeModal();
                    // Notifier le feed Agora (s'il est actif) pour insérer le post en tête
                    $rootScope.$broadcast('post:created', post);
                }).catch(function(err) {
                    modal.saving = false;
                    // Affiche l'erreur Supabase exacte (message + hint + code)
                    var detail = (typeof err === 'string') ? err : (err.message || JSON.stringify(err));
                    modal.error = 'Publication impossible\u00a0: ' + detail;
                    console.error('[AppController] submitPost error:', err);
                });
            }

            if (modal.imageFile) {
                modal.uploading = true;
                AuthService.getUser().then(function(user) {
                    return PostService.uploadImage(modal.imageFile, user.id);
                }).then(function(url) {
                    modal.uploading = false;
                    doCreate(url);
                }).catch(function(err) {
                    console.error('[AppController] image upload failed, posting without image:', err);
                    modal.uploading = false;
                    // On publie quand même sans l'image uploadée
                    doCreate(modal.imageUrl || null);
                });
            } else {
                doCreate(modal.imageUrl || null);
            }
        };

        // ── Modale de session de lecture ─────────────────────────────────────

        /** État initial de la modale session (réutilisé à chaque fermeture) */
        function freshSessionModal() {
            return {
                show:           false,
                books:          [],
                booksLoading:   false,
                selectedEntry:  null,   // {shelf, edition_total_pages, LEVR_books:{...}}
                lastEndPage:    0,
                lastEndLoading: false,
                currentPage:    '',
                editionPages:   '',
                note:           '',
                showSearch:     false,
                searchQuery:    '',
                searchResults:  [],
                searchLoading:  false,
                searchError:    '',
                saving:         false,
                error:          ''
            };
        }

        $rootScope.sessionModal = freshSessionModal();

        /** Retourne la date locale au format 'YYYY-MM-DD' */
        function getLocalDateString() {
            var d = new Date();
            var mm = String(d.getMonth() + 1);
            var dd = String(d.getDate());
            if (mm.length < 2) mm = '0' + mm;
            if (dd.length < 2) dd = '0' + dd;
            return d.getFullYear() + '-' + mm + '-' + dd;
        }

        /**
         * Ouvre la modale et charge les livres EN_COURS + À_LIRE de l'utilisateur.
         */
        $scope.openSessionModal = function() {
            $rootScope.sessionModal = freshSessionModal();
            $rootScope.sessionModal.show = true;
            $rootScope.sessionModal.booksLoading = true;

            AuthService.getUser().then(function(user) {
                if (!user) {
                    $rootScope.sessionModal.show = false;
                    $location.path('/login');
                    return;
                }
                return ReadingService.getReadingBooks(user.id);
            }).then(function(books) {
                if (!books) return;
                $rootScope.sessionModal.books        = books;
                $rootScope.sessionModal.booksLoading = false;
            }).catch(function(err) {
                $rootScope.sessionModal.booksLoading = false;
                $rootScope.sessionModal.error = typeof err === 'string' ? err : (err.message || 'Erreur de chargement.');
                console.error('[AppController] openSessionModal:', err);
            });
        };

        /**
         * Ferme et réinitialise la modale.
         */
        $scope.closeSessionModal = function() {
            $rootScope.sessionModal = freshSessionModal();
        };

        /**
         * Sélectionne un livre et charge sa dernière page enregistrée.
         * @param {Object} entry - {shelf, edition_total_pages, LEVR_books}
         */
        $scope.selectSessionBook = function(entry) {
            var modal = $rootScope.sessionModal;
            modal.selectedEntry  = entry;
            modal.lastEndPage    = 0;
            modal.lastEndLoading = true;
            modal.error          = '';

            AuthService.getUser().then(function(user) {
                if (!user) return;
                return ReadingService.getLastEndPage(user.id, entry.LEVR_books.book_id);
            }).then(function(page) {
                if (page === undefined || page === null) return;
                modal.lastEndPage    = page;
                modal.lastEndLoading = false;
                // Pré-remplir le champ edition_total_pages si déjà connu
                if (entry.edition_total_pages) {
                    modal.editionPages = String(entry.edition_total_pages);
                }
            }).catch(function() {
                modal.lastEndLoading = false;
            });
        };

        /**
         * Déselectionne le livre pour revenir à la liste.
         */
        $scope.deselectSessionBook = function() {
            var modal = $rootScope.sessionModal;
            modal.selectedEntry  = null;
            modal.lastEndPage    = 0;
            modal.currentPage    = '';
            modal.editionPages   = '';
            modal.note           = '';
            modal.error          = '';
        };

        /**
         * Lance une recherche OpenLibrary depuis la modale.
         */
        $scope.sessionSearchBooks = function() {
            var modal = $rootScope.sessionModal;
            if (!modal.searchQuery || modal.searchQuery.trim().length < 2) {
                modal.searchError = 'Saisissez au moins 2 caractères.';
                return;
            }
            modal.searchLoading = true;
            modal.searchError   = '';
            modal.searchResults = [];

            BookService.searchBooks(modal.searchQuery).then(function(results) {
                modal.searchResults = results || [];
                modal.searchLoading = false;
            }).catch(function(err) {
                modal.searchError   = typeof err === 'string' ? err : (err.message || 'Erreur lors de la recherche.');
                modal.searchLoading = false;
            });
        };

        /**
         * Ajoute un livre à EN_COURS depuis le sous-panel recherche,
         * puis le pré-sélectionne dans la modale.
         * @param {Object} book - résultat OpenLibrary formaté
         */
        $scope.addBookFromSearch = function(book) {
            var modal = $rootScope.sessionModal;
            modal.searchLoading = true;
            modal.searchError   = '';

            BookService.addBookToLibrary(book, 'EN_COURS', null).then(function() {
                // Reconstruire une entrée compatible avec le format de getReadingBooks
                var newEntry = {
                    shelf:               'EN_COURS',
                    edition_total_pages: null,
                    LEVR_books: {
                        book_id:    book.book_id,
                        title:      book.title,
                        author:     book.author,
                        cover_url:  book.cover_url,
                        page_count: book.page_count || null
                    }
                };
                // Insérer en tête de la liste (EN_COURS first)
                modal.books.unshift(newEntry);
                modal.showSearch    = false;
                modal.searchQuery   = '';
                modal.searchResults = [];
                modal.searchLoading = false;
                $scope.selectSessionBook(newEntry);
            }).catch(function(err) {
                modal.searchError   = typeof err === 'string' ? err : (err.message || "Impossible d'ajouter le livre.");
                modal.searchLoading = false;
            });
        };

        /**
         * Valide et enregistre la session de lecture.
         * Après l'insert, gère l'auto-promotion d'étagère :
         *   - À_LIRE → EN_COURS systématiquement
         *   - → LU si endPage >= totalPages (edition_total_pages ou page_count global)
         */
        $scope.submitSession = function() {
            var modal = $rootScope.sessionModal;

            if (!modal.selectedEntry) {
                modal.error = 'Veuillez sélectionner un livre.';
                return;
            }

            var endPage = parseInt(modal.currentPage, 10);
            if (!modal.currentPage || isNaN(endPage) || endPage <= 0) {
                modal.error = 'La page atteinte doit être un nombre supérieur à 0.';
                return;
            }

            var startPage = modal.lastEndPage || 0;

            if (endPage < startPage) {
                modal.error = 'La page saisie (' + endPage + ') est inférieure à votre dernière session (page\u00a0' + startPage + '). Corrigez la valeur.';
                return;
            }

            var pagesRead    = Math.max(0, endPage - startPage);
            var dateLocal    = getLocalDateString();
            var bookId       = modal.selectedEntry.LEVR_books.book_id;
            var note         = modal.note && modal.note.trim() ? modal.note.trim() : null;
            var edPages      = parseInt(modal.editionPages, 10);
            // Capture avant fermeture de la modale (closeSessionModal recrée l'objet)
            var currentShelf = modal.selectedEntry.shelf;
            var bookForPost  = modal.selectedEntry.LEVR_books;

            modal.saving = true;
            modal.error  = '';

            AuthService.getUser().then(function(user) {
                if (!user) {
                    modal.saving = false;
                    modal.error  = 'Vous devez être connecté.';
                    return;
                }

                var userId = user.id;

                ReadingService.createSession(userId, bookId, startPage, endPage, pagesRead, dateLocal, note)
                    .then(function() {
                        // ── 1. Sauvegarder edition_total_pages si nouvelle valeur ──────
                        var updateEdition = (edPages > 0 && !modal.selectedEntry.edition_total_pages)
                            ? ReadingService.updateEditionPages(userId, bookId, edPages)
                            : Promise.resolve();

                        return updateEdition.then(function() {
                            // ── 2. Total pages effectif (priorité : saisi > stocké > global) ──
                            var effectiveTotalPages = null;
                            if (edPages > 0) {
                                effectiveTotalPages = edPages;
                            } else if (modal.selectedEntry.edition_total_pages) {
                                effectiveTotalPages = modal.selectedEntry.edition_total_pages;
                            } else if (modal.selectedEntry.LEVR_books.page_count) {
                                effectiveTotalPages = modal.selectedEntry.LEVR_books.page_count;
                            }

                            // ── 3. Calcul de la nouvelle étagère ─────────────────────────
                            var newShelf = currentShelf;
                            if (currentShelf === 'A_LIRE') {
                                newShelf = 'EN_COURS';
                            }
                            if (effectiveTotalPages && endPage >= effectiveTotalPages) {
                                newShelf = 'LU';
                            }

                            var shelfChanged = (newShelf !== currentShelf);
                            var shelfPromise = shelfChanged
                                ? BookService.updateShelf(bookId, newShelf)
                                : Promise.resolve();

                            return shelfPromise.then(function() {
                                return { newShelf: newShelf, shelfChanged: shelfChanged, effectiveTotalPages: effectiveTotalPages };
                            });
                        });
                    })
                    .then(function(shelfInfo) {
                        return ReadingService.getTodayTotal(userId, dateLocal).then(function(total) {
                            return { total: total, shelfInfo: shelfInfo };
                        });
                    })
                    .then(function(result) {
                        var total     = result.total;
                        var shelfInfo = result.shelfInfo;

                        modal.saving = false;
                        $scope.closeSessionModal();

                        // ── Toast principal : pages lues + CTA "Faire un post" ────────
                        ToastService.addSessionPrompt(total, bookForPost, {
                            actionType: 'READ_SESSION',
                            pagesTotal: total,
                            book:       bookForPost || null
                        });

                        // ── Toast secondaire : changement d'étagère ───────────────────
                        if (shelfInfo.shelfChanged) {
                            if (shelfInfo.newShelf === 'LU') {
                                ToastService.add({
                                    type:    'success',
                                    message: '\uD83C\uDF89 F\u00e9licitations\u00a0! Tu as termin\u00e9 ce livre\u00a0!',
                                    duration: 7000
                                });
                            } else if (shelfInfo.newShelf === 'EN_COURS') {
                                ToastService.add({
                                    type:    'success',
                                    message: '\uD83D\uDCD6 Lecture commenc\u00e9e\u00a0! Livre d\u00e9plac\u00e9 dans \u00ab\u00a0En cours\u00a0\u00bb.',
                                    duration: 4000
                                });
                            }
                        }
                    })
                    .catch(function(err) {
                        modal.saving = false;
                        modal.error  = typeof err === 'string' ? err : (err.message || 'Erreur lors de l\'enregistrement.');
                        console.error('[AppController] submitSession:', err);
                    });
            });
        };

        // ── Modale de création de bookclub ───────────────────────────────────

        function freshClubModal() {
            return {
                show:        false,
                name:        '',
                description: '',
                isPublic:    true,
                creating:    false,
                error:       ''
            };
        }

        $rootScope.clubModal = freshClubModal();

        $scope.openClubModal = function() {
            $rootScope.clubModal = freshClubModal();
            $rootScope.clubModal.show = true;
        };

        $scope.closeClubModal = function() {
            $rootScope.clubModal.show = false;
        };

        $scope.submitClubCreate = function() {
            var m = $rootScope.clubModal;
            if (!m.name || !m.name.trim()) {
                m.error = 'Le nom du bookclub est obligatoire.';
                return;
            }
            m.error    = '';
            m.creating = true;
            BookclubService.createBookclub(m.name, m.description, m.isPublic)
                .then(function(club) {
                    if (!club || !club.id) {
                        m.error = 'Bookclub créé mais identifiant manquant — rechargez la page.';
                        console.error('[AppController] submitClubCreate: club resolved without id', club);
                        return;
                    }
                    $scope.closeClubModal();
                    // Notifie la page /bookclubs si elle est active
                    $rootScope.$broadcast('club:created', club);
                    $location.path('/bookclubs/' + club.id);
                })
                .catch(function(err) {
                    m.error = typeof err === 'string' ? err : (err.message || 'Erreur lors de la création.');
                })
                .finally(function() {
                    m.creating = false;
                });
        };
    }
]);
