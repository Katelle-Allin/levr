(function () {
    'use strict';

    angular.module('levrApp').controller('BookclubSettingsCtrl', [
        '$scope', '$routeParams', '$location', '$q', 'BookclubService', 'BookService',
        function ($scope, $routeParams, $location, $q, BookclubService, BookService) {

            var clubId = $routeParams.id;

            // ── État général ──────────────────────────────────────────────────
            $scope.club     = null;
            $scope.loading  = true;
            $scope.saving   = false;
            $scope.deleting = false;
            $scope.error    = '';
            $scope.success  = '';

            $scope.form = {
                name:        '',
                description: '',
                isPublic:    true
            };

            // ── Photo du club ─────────────────────────────────────────────────
            $scope.avatarUploading = false;
            $scope.avatarError     = '';
            $scope.avatarSuccess   = '';

            // ── Lecture en cours ──────────────────────────────────────────────
            $scope.libraryBooks      = [];
            $scope.filteredLibrary   = [];
            $scope.libraryFilter     = '';
            $scope.showLibraryPicker = false;
            $scope.selectedBook      = null;  // { book_id, title, author, cover_url, shelf }
            $scope.chapterForm       = { number: '', total: '' };
            $scope.readingError      = '';
            $scope.readingSuccess    = '';
            $scope.readingSaving     = false;
            $scope.libraryLoading    = false;
            $scope.libraryError      = '';

            // ── Init ─────────────────────────────────────────────────────────
            function init() {
                if (!clubId) { $location.path('/bookclubs'); return; }

                $scope.loading        = true;
                $scope.libraryLoading = true;

                var clubP    = BookclubService.getBookclubById(clubId);
                var libraryP = BookService.getMyLibrary();

                clubP.then(function (club) {
                    $scope.club             = club;
                    $scope.form.name        = club.name        || '';
                    $scope.form.description = club.description || '';
                    $scope.form.isPublic    = club.is_public !== false;
                }).catch(function (err) {
                    $scope.error = err;
                });

                libraryP.then(function (entries) {
                    // Flatten LEVR_user_books + LEVR_books join
                    $scope.libraryBooks = (entries || []).map(function (e) {
                        var b = e.LEVR_books || {};
                        return {
                            book_id:   e.book_id   || b.book_id,
                            title:     b.title     || '(titre inconnu)',
                            author:    b.author    || null,
                            cover_url: b.cover_url || null,
                            shelf:     e.shelf     || null
                        };
                    });
                    $scope.filteredLibrary = $scope.libraryBooks.slice();
                }).catch(function () {
                    $scope.libraryError = 'Impossible de charger votre bibliothèque.';
                }).finally(function () {
                    $scope.libraryLoading = false;
                });

                $q.all([clubP, libraryP])
                    .then(function () {
                        // Pré-remplir selectedBook si une lecture est déjà définie
                        if ($scope.club && $scope.club.current_book_id) {
                            var found = null;
                            for (var i = 0; i < $scope.libraryBooks.length; i++) {
                                if ($scope.libraryBooks[i].book_id === $scope.club.current_book_id) {
                                    found = $scope.libraryBooks[i];
                                    break;
                                }
                            }
                            // Fallback sur les colonnes dénormalisées si le livre n'est plus en bibliothèque
                            $scope.selectedBook = found || {
                                book_id:   $scope.club.current_book_id,
                                title:     $scope.club.current_book_title  || '(titre inconnu)',
                                author:    $scope.club.current_book_author || null,
                                cover_url: $scope.club.current_book_cover  || null,
                                shelf:     null
                            };
                            $scope.chapterForm.number = $scope.club.current_chapter_number || '';
                            $scope.chapterForm.total  = $scope.club.current_chapter_total  || '';
                        }
                    })
                    .catch(function (err) {
                        $scope.error = err;
                    })
                    .finally(function () {
                        $scope.loading = false;
                    });
            }

            // ── Picker bibliothèque ───────────────────────────────────────────
            $scope.toggleLibraryPicker = function () {
                $scope.showLibraryPicker = !$scope.showLibraryPicker;
                $scope.libraryFilter     = '';
                $scope.filteredLibrary   = $scope.libraryBooks.slice();
                $scope.readingError      = '';
            };

            $scope.filterLibrary = function () {
                var q = ($scope.libraryFilter || '').toLowerCase().trim();
                if (!q) {
                    $scope.filteredLibrary = $scope.libraryBooks.slice();
                    return;
                }
                $scope.filteredLibrary = $scope.libraryBooks.filter(function (b) {
                    return (b.title  || '').toLowerCase().indexOf(q) !== -1 ||
                           (b.author || '').toLowerCase().indexOf(q) !== -1;
                });
            };

            $scope.pickBook = function (book) {
                $scope.selectedBook      = book;
                $scope.showLibraryPicker = false;
                $scope.libraryFilter     = '';
                $scope.readingError      = '';
            };

            $scope.clearSelectedBook = function () {
                $scope.selectedBook      = null;
                $scope.showLibraryPicker = false;
                $scope.readingError      = '';
            };

            // ── Enregistrer lecture en cours ──────────────────────────────────
            $scope.saveReading = function () {
                if (!$scope.selectedBook || !$scope.selectedBook.book_id) {
                    $scope.readingError = 'Sélectionnez un livre dans votre bibliothèque.';
                    return;
                }
                $scope.readingError   = '';
                $scope.readingSuccess = '';
                $scope.readingSaving  = true;

                var chap  = $scope.chapterForm.number ? parseInt($scope.chapterForm.number, 10) : null;
                var total = $scope.chapterForm.total  ? parseInt($scope.chapterForm.total,  10) : null;

                BookclubService.updateBookclub(clubId, {
                    current_book_id:        $scope.selectedBook.book_id,
                    current_book_title:     $scope.selectedBook.title     || null,
                    current_book_author:    $scope.selectedBook.author    || null,
                    current_book_cover:     $scope.selectedBook.cover_url || null,
                    current_chapter_number: isNaN(chap)  ? null : chap,
                    current_chapter_title:  null,
                    current_chapter_total:  isNaN(total) ? null : total
                })
                .then(function (updated) {
                    $scope.club           = updated;
                    $scope.readingSuccess = 'Lecture en cours mise à jour.';
                })
                .catch(function (err) {
                    $scope.readingError = err;
                })
                .finally(function () {
                    $scope.readingSaving = false;
                });
            };

            // ── Retirer la lecture en cours ───────────────────────────────────
            $scope.clearReading = function () {
                if (!window.confirm('Retirer la lecture en cours du bookclub ?')) { return; }
                $scope.readingError   = '';
                $scope.readingSuccess = '';
                $scope.readingSaving  = true;

                BookclubService.updateBookclub(clubId, {
                    current_book_id:        null,
                    current_book_title:     null,
                    current_book_author:    null,
                    current_book_cover:     null,
                    current_chapter_number: null,
                    current_chapter_title:  null,
                    current_chapter_total:  null
                })
                .then(function (updated) {
                    $scope.club           = updated;
                    $scope.selectedBook   = null;
                    $scope.chapterForm    = { number: '', total: '' };
                    $scope.readingSuccess = 'Lecture en cours retirée.';
                })
                .catch(function (err) {
                    $scope.readingError = err;
                })
                .finally(function () {
                    $scope.readingSaving = false;
                });
            };

            // ── Upload photo du club ──────────────────────────────────────────
            $scope.triggerAvatarInput = function () {
                document.getElementById('bc-settings-avatar-input').click();
            };

            // Appelé depuis onchange DOM (hors digest) — $apply() requis pour le state initial
            $scope.onAvatarChange = function (files) {
                if (!files || !files.length) { return; }
                var file = files[0];
                $scope.$apply(function () {
                    $scope.avatarError     = '';
                    $scope.avatarSuccess   = '';
                    $scope.avatarUploading = true;
                });
                BookclubService.uploadAvatar(clubId, file)
                    .then(function (url) {
                        $scope.club.logo_url = url;
                        $scope.avatarSuccess = 'Photo mise à jour.';
                    })
                    .catch(function (err) {
                        $scope.avatarError = typeof err === 'string' ? err : 'Erreur lors de l\'upload.';
                    })
                    .finally(function () {
                        $scope.avatarUploading = false;
                        var input = document.getElementById('bc-settings-avatar-input');
                        if (input) { input.value = ''; }
                    });
            };

            // ── Enregistrer les informations du club ──────────────────────────
            $scope.saveChanges = function () {
                if (!$scope.form.name || !$scope.form.name.trim()) {
                    $scope.error = 'Le nom est obligatoire.';
                    return;
                }
                $scope.error   = '';
                $scope.success = '';
                $scope.saving  = true;
                BookclubService.updateBookclub(clubId, {
                    name:        $scope.form.name.trim(),
                    description: ($scope.form.description || '').trim(),
                    is_public:   !!$scope.form.isPublic
                })
                .then(function (updated) {
                    $scope.club    = updated;
                    $scope.success = 'Modifications enregistrées.';
                })
                .catch(function (err) {
                    $scope.error = err;
                })
                .finally(function () {
                    $scope.saving = false;
                });
            };

            // ── Supprimer ─────────────────────────────────────────────────────
            $scope.confirmDelete = function () {
                if (!window.confirm(
                    'Supprimer définitivement ce bookclub ?\n' +
                    'Toutes les discussions et messages seront perdus. Cette action est irréversible.'
                )) { return; }
                $scope.error    = '';
                $scope.deleting = true;
                BookclubService.deleteBookclub(clubId)
                    .then(function () {
                        $location.path('/bookclubs');
                    })
                    .catch(function (err) {
                        $scope.error = err;
                    })
                    .finally(function () {
                        $scope.deleting = false;
                    });
            };

            // ── Navigation ────────────────────────────────────────────────────
            $scope.goBack = function () {
                $location.path('/bookclubs/' + clubId);
            };

            // ── Helper badge étagère ──────────────────────────────────────────
            $scope.shelfLabel = function (shelf) {
                var labels = {
                    'EN_COURS': 'En cours',
                    'A_LIRE':   'À lire',
                    'LU':       'Lu',
                    'ABANDONNE':'Abandonné'
                };
                return labels[shelf] || shelf || '';
            };

            init();
        }
    ]);

}());
