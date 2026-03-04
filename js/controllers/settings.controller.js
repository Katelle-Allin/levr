(function () {
    'use strict';

    angular.module('levrApp').controller('SettingsController', [
        '$scope', '$location', 'AuthService', 'UserService', 'ThemeService',
        function ($scope, $location, AuthService, UserService, ThemeService) {

            // ── Thème ──────────────────────────────────────────────────────
            $scope.currentTheme = ThemeService.getCurrentTheme();

            $scope.toggleTheme = function () {
                ThemeService.toggleTheme();
                $scope.currentTheme = ThemeService.getCurrentTheme();
            };

            // ── Genres ────────────────────────────────────────────────────
            $scope.availableGenres = [
                'Roman', 'Science-Fiction', 'Fantasy', 'Policier', 'Thriller',
                'Romance', 'Historique', 'Biographie', 'Essai', 'Poésie',
                'Jeunesse', 'BD/Comics', 'Manga', 'Développement personnel'
            ];
            $scope.selectedGenres = [];
            $scope.genreState     = { saving: false, error: '', success: '' };

            $scope.toggleGenre = function (genre) {
                var idx = $scope.selectedGenres.indexOf(genre);
                if (idx > -1) {
                    $scope.selectedGenres.splice(idx, 1);
                } else if ($scope.selectedGenres.length < 3) {
                    $scope.selectedGenres.push(genre);
                }
            };

            $scope.isGenreSelected = function (genre) {
                return $scope.selectedGenres.indexOf(genre) > -1;
            };

            $scope.saveGenres = function () {
                $scope.genreState.error   = '';
                $scope.genreState.success = '';
                if ($scope.selectedGenres.length === 0) {
                    $scope.genreState.error = 'Sélectionnez au moins 1 genre.';
                    return;
                }
                $scope.genreState.saving = true;
                UserService.updateFavoriteGenres($scope.currentUser.id, $scope.selectedGenres)
                    .then(function () {
                        $scope.genreState.success = 'Genres enregistrés.';
                    })
                    .catch(function () {
                        $scope.genreState.error = 'Erreur lors de la sauvegarde.';
                    })
                    .finally(function () { $scope.genreState.saving = false; });
            };

            // ── Changement d'email ────────────────────────────────────────
            $scope.emailForm  = { newEmail: '' };
            $scope.emailState = { saving: false, error: '', success: '' };

            $scope.changeEmail = function () {
                $scope.emailState.error   = '';
                $scope.emailState.success = '';
                var e = ($scope.emailForm.newEmail || '').trim().toLowerCase();
                if (!e || e.indexOf('@') === -1 || e.indexOf('.') === -1) {
                    $scope.emailState.error = 'Adresse email invalide.';
                    return;
                }
                if (e === ($scope.currentUser.email || '').toLowerCase()) {
                    $scope.emailState.error = 'C\'est déjà votre adresse email actuelle.';
                    return;
                }
                $scope.emailState.saving = true;
                AuthService.updateEmail(e)
                    .then(function () {
                        $scope.emailState.success =
                            'Un lien de confirmation a été envoyé à ' + e +
                            '. Cliquez dessus pour valider le changement.';
                        $scope.emailForm.newEmail = '';
                    })
                    .catch(function (err) {
                        $scope.emailState.error = typeof err === 'string'
                            ? err : (err && err.message) || 'Erreur lors du changement d\'email.';
                    })
                    .finally(function () { $scope.emailState.saving = false; });
            };

            // ── Changement de mot de passe ────────────────────────────────
            $scope.passwordForm  = { newPwd: '', confirm: '' };
            $scope.passwordState = { saving: false, error: '', success: '' };

            $scope.changePassword = function () {
                $scope.passwordState.error   = '';
                $scope.passwordState.success = '';
                var p = $scope.passwordForm.newPwd;
                var c = $scope.passwordForm.confirm;
                if (!p || p.length < 6) {
                    $scope.passwordState.error = 'Le mot de passe doit contenir au moins 6 caractères.';
                    return;
                }
                if (p !== c) {
                    $scope.passwordState.error = 'Les deux mots de passe ne correspondent pas.';
                    return;
                }
                $scope.passwordState.saving = true;
                AuthService.updatePassword(p)
                    .then(function () {
                        $scope.passwordState.success = 'Mot de passe mis à jour.';
                        $scope.passwordForm.newPwd  = '';
                        $scope.passwordForm.confirm  = '';
                    })
                    .catch(function (err) {
                        $scope.passwordState.error = typeof err === 'string'
                            ? err : (err && err.message) || 'Erreur lors du changement de mot de passe.';
                    })
                    .finally(function () { $scope.passwordState.saving = false; });
            };

            // ── Suppression du compte ─────────────────────────────────────
            $scope.deleteState = { saving: false, error: '' };

            $scope.deleteAccount = function () {
                if (!window.confirm(
                    'Supprimer définitivement votre compte ?\n\n' +
                    'Toutes vos données (bibliothèque, posts, sessions de lecture, avis) ' +
                    'seront effacées. Cette action est irréversible.'
                )) { return; }

                $scope.deleteState.error  = '';
                $scope.deleteState.saving = true;

                AuthService.deleteAccount()
                    .then(function () {
                        $location.path('/login');
                    })
                    .catch(function (err) {
                        $scope.deleteState.error = typeof err === 'string'
                            ? err : (err && err.message) || 'Erreur lors de la suppression.';
                        $scope.deleteState.saving = false;
                    });
            };

            // ── État général + init ───────────────────────────────────────
            $scope.currentUser = null;
            $scope.loading     = true;

            function init() {
                AuthService.getUser().then(function (user) {
                    if (!user) { $location.path('/login'); return null; }
                    return UserService.getUserById(user.id);
                }).then(function (userData) {
                    if (!userData) { return; }
                    $scope.currentUser    = userData;
                    $scope.selectedGenres = (userData.favorite_genres || []).slice();
                }).catch(function () {
                    $scope.currentUser = null;
                }).finally(function () {
                    $scope.loading = false;
                });
            }

            init();
        }
    ]);

}());
