/**
 * Contrôleur d'authentification
 * Gère l'inscription, la connexion (email + OAuth), "mot de passe oublié"
 * et la réinitialisation du mot de passe.
 */

angular.module('levrApp').controller('AuthController', [
    '$scope',
    '$location',
    '$timeout',
    'AuthService',
    function($scope, $location, $timeout, AuthService) {

        // Liste des genres littéraires disponibles
        $scope.availableGenres = [
            'Roman', 'Science-Fiction', 'Fantasy', 'Policier', 'Thriller',
            'Romance', 'Historique', 'Biographie', 'Essai', 'Poésie',
            'Jeunesse', 'BD/Comics', 'Manga', 'Développement personnel'
        ];

        // Initialisation des modèles
        $scope.signupData = {
            username:        '',
            email:           '',
            password:        '',
            passwordConfirm: '',
            favoriteGenres:  []
        };

        $scope.loginData = {
            email:    '',
            password: ''
        };

        $scope.forgotData = {
            email: ''
        };

        $scope.resetData = {
            password: '',
            confirm:  ''
        };

        $scope.error   = '';
        $scope.success = '';
        $scope.loading = false;

        /**
         * Bascule la sélection d'un genre
         * Maximum 3 genres autorisés
         * @param {string} genre - Genre à ajouter/retirer
         */
        $scope.toggleGenre = function(genre) {
            var index = $scope.signupData.favoriteGenres.indexOf(genre);

            if (index > -1) {
                // Genre déjà sélectionné, on le retire
                $scope.signupData.favoriteGenres.splice(index, 1);
            } else {
                // Limite à 3 genres
                if ($scope.signupData.favoriteGenres.length < 3) {
                    $scope.signupData.favoriteGenres.push(genre);
                }
            }
        };

        /**
         * Vérifie si un genre est sélectionné
         * @param {string} genre - Genre à vérifier
         * @returns {boolean}
         */
        $scope.isGenreSelected = function(genre) {
            return $scope.signupData.favoriteGenres.indexOf(genre) > -1;
        };

        /**
         * Inscription d'un nouvel utilisateur
         */
        $scope.signup = function() {
            $scope.error   = '';
            $scope.success = '';

            // Validation
            if (!$scope.signupData.username || !$scope.signupData.email || !$scope.signupData.password) {
                $scope.error = 'Tous les champs sont obligatoires';
                return;
            }

            if ($scope.signupData.favoriteGenres.length === 0) {
                $scope.error = 'Veuillez sélectionner au moins 1 genre';
                return;
            }

            if ($scope.signupData.password.length < 6) {
                $scope.error = 'Le mot de passe doit contenir au moins 6 caractères';
                return;
            }

            if ($scope.signupData.password !== $scope.signupData.passwordConfirm) {
                $scope.error = 'Les mots de passe ne correspondent pas';
                return;
            }

            $scope.loading = true;

            AuthService.signup(
                $scope.signupData.username,
                $scope.signupData.email,
                $scope.signupData.password,
                $scope.signupData.favoriteGenres
            ).then(function() {
                $scope.success = 'Inscription réussie ! Redirection...';
                $timeout(function() {
                    $location.path('/agora');
                }, 1500);
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors de l\'inscription';
            }).finally(function() {
                $scope.loading = false;
            });
        };

        /**
         * Connexion d'un utilisateur existant (email + mot de passe)
         */
        $scope.login = function() {
            $scope.error   = '';
            $scope.success = '';

            // Validation
            if (!$scope.loginData.email || !$scope.loginData.password) {
                $scope.error = 'Email et mot de passe requis';
                return;
            }

            $scope.loading = true;

            AuthService.login(
                $scope.loginData.email,
                $scope.loginData.password
            ).then(function() {
                $location.path('/agora');
            }).catch(function(error) {
                $scope.error = error.message || 'Email ou mot de passe incorrect';
            }).finally(function() {
                $scope.loading = false;
            });
        };

        /**
         * Connexion via un fournisseur OAuth (Google ou Apple).
         * Déclenche la redirection vers la page de consentement du provider.
         * Le retour se fait automatiquement via Supabase + onAuthStateChange dans AppController.
         * @param {string} provider - 'google' | 'apple'
         */
        $scope.loginWithOAuth = function(provider) {
            $scope.error   = '';
            $scope.loading = true;

            AuthService.signInWithOAuth(provider).catch(function(error) {
                $scope.error   = error.message || 'Erreur lors de la connexion avec ' + provider;
                $scope.loading = false;
            });
            // Pas de .finally : la page se redirige vers le provider, loading reste affiché
        };

        /**
         * Envoie le lien de réinitialisation de mot de passe.
         * Utilisé depuis la page /forgot-password.
         */
        $scope.sendResetEmail = function() {
            $scope.error   = '';
            $scope.success = '';

            if (!$scope.forgotData.email) {
                $scope.error = 'Veuillez saisir votre adresse email';
                return;
            }

            $scope.loading = true;

            AuthService.resetPasswordForEmail($scope.forgotData.email).then(function() {
                // Supabase ne révèle pas si l'email existe ou non (sécurité)
                $scope.success = 'Si un compte existe pour cet email, vous allez recevoir un lien de réinitialisation.';
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors de l\'envoi. Vérifiez l\'adresse email.';
            }).finally(function() {
                $scope.loading = false;
            });
        };

        /**
         * Valide et enregistre le nouveau mot de passe.
         * Utilisé depuis la page /reset-password (après clic sur le lien email).
         * L'utilisateur a une session "recovery" active.
         */
        $scope.doResetPassword = function() {
            $scope.error   = '';
            $scope.success = '';

            if (!$scope.resetData.password) {
                $scope.error = 'Veuillez saisir un nouveau mot de passe';
                return;
            }

            if ($scope.resetData.password.length < 6) {
                $scope.error = 'Le mot de passe doit contenir au moins 6 caractères';
                return;
            }

            if ($scope.resetData.password !== $scope.resetData.confirm) {
                $scope.error = 'Les mots de passe ne correspondent pas';
                return;
            }

            $scope.loading = true;

            AuthService.resetPassword($scope.resetData.password).then(function() {
                $scope.success = 'Mot de passe modifié ! Redirection vers la connexion...';
                $timeout(function() {
                    $location.path('/login');
                }, 2000);
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors du changement de mot de passe. Le lien a peut-être expiré.';
            }).finally(function() {
                $scope.loading = false;
            });
        };
    }
]);
