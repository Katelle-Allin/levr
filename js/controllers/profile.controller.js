        /**
         * Gérer la sélection d'un fichier avatar
         * @param {Event} event - Event du changement de fichier
         *//**
 * Contrôleur du profil personnel (Mon profil)
 * Permet d'afficher et d'éditer son propre profil
 */

angular.module('levrApp').controller('ProfileCtrl', [
    '$scope', '$rootScope', '$location',
    'ProfileService', 'AuthService', 'PostService', 'BookService',
    function($scope, $rootScope, $location, ProfileService, AuthService, PostService, BookService) {
        
        // Liste des genres disponibles
        $scope.availableGenres = [
            'Roman', 'Science-Fiction', 'Fantasy', 'Policier', 'Thriller',
            'Romance', 'Historique', 'Biographie', 'Essai', 'Poésie',
            'Jeunesse', 'BD/Comics', 'Manga', 'Développement personnel',
            'Horreur', 'Aventure', 'Classique', 'Contemporain'
        ];

        // Initialisation
        $scope.profile = null;
        $scope.stats   = null;
        $scope.editMode = false;
        $scope.loading  = true;
        $scope.saving   = false;
        $scope.uploadingAvatar = false;
        $scope.error   = '';
        $scope.success = '';

        // Posts personnels
        $scope.myPosts      = [];
        $scope.postsLoading = false;

        // Copie pour l'édition
        $scope.editedProfile = {};

        /**
         * Charger le profil et les stats
         */
        function loadProfile() {
            $scope.loading = true;
            $scope.error = '';

            ProfileService.getMyProfile().then(function(profile) {
                $scope.profile = profile;
                $scope.editedProfile = {
                    username: profile.username,
                    bio: profile.bio || '',
                    favorite_genres: profile.favorite_genres || [],
                    is_public: profile.is_public !== false
                };

                // Charger les statistiques
                return ProfileService.getMyStats();
            }).then(function(stats) {
                $scope.stats   = stats;
                $scope.loading = false;
                // Charger les posts en parallèle (non bloquant)
                loadMyPosts();
            }).catch(function(error) {
                $scope.error   = 'Erreur lors du chargement du profil';
                console.error('Erreur:', error);
                $scope.loading = false;
            });
        }

        /**
         * Charge les posts de l'utilisateur connecté.
         */
        function loadMyPosts() {
            $scope.postsLoading = true;
            PostService.getMyPosts().then(function(posts) {
                $scope.myPosts      = posts;
                $scope.postsLoading = false;
            }).catch(function(err) {
                console.error('[ProfileCtrl] loadMyPosts error:', err);
                $scope.postsLoading = false;
            });
        }

        /**
         * Supprime un de ses posts depuis Mon profil.
         * Diffuse 'post:deleted' pour synchroniser Agora si ouvert.
         * @param {Object} post
         */
        $scope.deleteMyPost = function(post) {
            if (!window.confirm('Supprimer ce post d\u00e9finitivement\u00a0?')) return;

            PostService.deletePost(post.id).then(function() {
                for (var i = 0; i < $scope.myPosts.length; i++) {
                    if ($scope.myPosts[i].id === post.id) {
                        $scope.myPosts.splice(i, 1);
                        break;
                    }
                }
                $rootScope.$broadcast('post:deleted', post.id);
            }).catch(function(err) {
                console.error('[ProfileCtrl] deleteMyPost error:', err);
            });
        };

        /**
         * Ouvre la modale de création de post en mode manuel.
         * Appelé depuis l'encart "Commencer un post" de la section "Mes posts".
         */
        $scope.openNewPostModal = function() {
            PostService.openManualModal();
        };

        /** Formate une date en temps relatif. */
        $scope.formatTime = function(dateStr) {
            return PostService.formatRelativeTime(dateStr);
        };

        /** Navigue vers la page de détail du livre associé au post. */
        $scope.goToBook = function(post) {
            if (!post.book_id || !post.LEVR_books) return;
            BookService.setCache(post.book_id, post.LEVR_books);
            $location.path('/book/' + post.book_id);
        };

        /** Retourne true si le contenu dépasse 280 caractères (affiche "Lire plus"). */
        $scope.needsExpand = function(post) {
            return post.content && post.content.length > 280;
        };

        /** Bascule l'état développé/réduit d'un post. */
        $scope.toggleExpand = function(post) {
            post.expanded = !post.expanded;
        };

        // Quand un nouveau post est créé via la modale, l'ajouter en tête
        var unsubCreate = $rootScope.$on('post:created', function(_event, post) {
            $scope.myPosts.unshift(post);
        });
        $scope.$on('$destroy', unsubCreate);

        /**
         * Activer le mode édition
         */
        $scope.enableEdit = function() {
            $scope.editMode = true;
            $scope.error = '';
            $scope.success = '';
        };

        /**
         * Annuler l'édition
         */
        $scope.cancelEdit = function() {
            $scope.editMode = false;
            $scope.editedProfile = {
                username: $scope.profile.username,
                bio: $scope.profile.bio || '',
                favorite_genres: $scope.profile.favorite_genres || [],
                is_public: $scope.profile.is_public !== false
            };
            $scope.error = '';
            $scope.success = '';
        };

        /**
         * Basculer la sélection d'un genre
         * @param {string} genre - Genre à ajouter/retirer
         */
        $scope.toggleGenre = function(genre) {
            var index = $scope.editedProfile.favorite_genres.indexOf(genre);
            
            if (index > -1) {
                $scope.editedProfile.favorite_genres.splice(index, 1);
            } else {
                if ($scope.editedProfile.favorite_genres.length < 5) {
                    $scope.editedProfile.favorite_genres.push(genre);
                }
            }
        };

        /**
         * Vérifier si un genre est sélectionné
         * @param {string} genre - Genre à vérifier
         * @returns {boolean}
         */
        $scope.isGenreSelected = function(genre) {
            return $scope.editedProfile.favorite_genres.indexOf(genre) > -1;
        };

        /**
         * Sauvegarder les modifications du profil
         */
        $scope.saveProfile = function() {
            $scope.error = '';
            $scope.success = '';

            // Validation
            if (!$scope.editedProfile.username || $scope.editedProfile.username.length < 3 || $scope.editedProfile.username.length > 20) {
                $scope.error = 'Le nom d\'utilisateur doit contenir entre 3 et 20 caractères';
                return;
            }

            if ($scope.editedProfile.bio && $scope.editedProfile.bio.length > 280) {
                $scope.error = 'La bio ne peut pas dépasser 280 caractères';
                return;
            }

            $scope.saving = true;

            ProfileService.updateMyProfile({
                username: $scope.editedProfile.username,
                bio: $scope.editedProfile.bio,
                favorite_genres: $scope.editedProfile.favorite_genres,
                is_public: $scope.editedProfile.is_public
            }).then(function() {
                $scope.success = 'Profil mis à jour avec succès !';
                $scope.saving = false;
                $scope.editMode = false;
                
                // Recharger le profil
                loadProfile();
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors de la sauvegarde';
                $scope.saving = false;
            });
        };

        /**
         * Gérer la sélection d'un fichier avatar
         * @param {Event} event - Event du changement de fichier
         */
        $scope.handleAvatarUpload = function(event) {
            var file = event.target.files[0];
            if (!file) return;

            $scope.error = '';
            $scope.uploadingAvatar = true;

            // Créer un aperçu local
            var reader = new FileReader();
            reader.onload = function(e) {
                $scope.avatarPreview = e.target.result;
            };
            reader.readAsDataURL(file);

            // Upload vers Supabase
            ProfileService.uploadAvatar(file).then(function(publicUrl) {
                $scope.profile.profile_picture = publicUrl;
                $scope.success = 'Photo de profil mise à jour !';
                $scope.uploadingAvatar = false;
                // Notifie AppController de mettre à jour l'avatar dans la topbar
                $rootScope.$broadcast('profile:avatarUpdated', publicUrl);
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors de l\'upload';
                $scope.uploadingAvatar = false;
                $scope.avatarPreview = null;
            });
        };

        /**
         * Déclencher le sélecteur de fichier
         */
        $scope.triggerFileInput = function() {
            document.getElementById('avatar-upload').click();
        };

        // Charger le profil au démarrage
        loadProfile();
    }
]);