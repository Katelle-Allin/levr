/**
 * Contrôleur de la page Agora — Feed de posts social
 * ──────────────────────────────────────────────────
 * Affiche les posts de tous les utilisateurs (du plus récent au plus ancien).
 * Gère les likes, les commentaires et la suppression de ses propres posts.
 * Écoute les événements globaux 'post:created' et 'post:deleted' pour
 * synchroniser le feed sans rechargement complet.
 */

angular.module('levrApp').controller('AgoraController', [
    '$scope', '$rootScope', '$location', '$document', 'PostService', 'AuthService', 'ProfileService', 'BookService', 'supabase',
    function($scope, $rootScope, $location, $document, PostService, AuthService, ProfileService, BookService, supabase) {

        $scope.posts           = [];
        $scope.loading         = true;
        $scope.error           = '';
        $scope.currentUser     = null;     // objet auth Supabase (a .id)
        $scope.currentLevrUser = null;    // ligne LEVR_users (a .username + .profile_picture)

        // ── Helpers ──────────────────────────────────────────────────────────

        /** Formate une date ISO en temps relatif français. */
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

        /**
         * Renvoie les commentaires à afficher selon l'état showAllComments.
         * Par défaut : 2 derniers commentaires seulement.
         */
        $scope.visibleComments = function(post) {
            if (post.showAllComments || post.comments.length <= 2) {
                return post.comments;
            }
            return post.comments.slice(-2);
        };

        // ── Chargement du feed ───────────────────────────────────────────────

        function loadFeed() {
            $scope.loading = true;
            $scope.error   = '';

            PostService.getAgoraFeed(30, 0).then(function(posts) {
                $scope.posts   = posts;
                $scope.loading = false;
            }).catch(function(err) {
                var detail = (typeof err === 'string') ? err : (err.message || JSON.stringify(err));
                $scope.error   = 'Feed indisponible\u00a0: ' + detail;
                $scope.loading = false;
                console.error('[AgoraController] loadFeed error:', err);
            });
        }

        // Récupérer le user auth, puis son profil LEVR (username + avatar pour les commentaires)
        AuthService.getUser().then(function(user) {
            $scope.currentUser = user;
            if (!user) { loadFeed(); return; }

            // Le profil LEVR est nécessaire pour remplir le champ "auteur" du commentaire optimiste
            return ProfileService.getMyProfile();
        }).then(function(levrProfile) {
            if (levrProfile) $scope.currentLevrUser = levrProfile;
            loadFeed();
        }).catch(function() {
            loadFeed();
        });

        // ── Actions sur les posts ─────────────────────────────────────────────

        /**
         * Bascule le like d'un post (optimiste).
         * Désactivé si non connecté.
         */
        $scope.toggleLike = function(post) {
            if (!$scope.currentUser) return;
            PostService.toggleLike(post, $scope.currentUser.id).catch(function(err) {
                console.error('[AgoraController] toggleLike error:', err);
            });
        };

        /**
         * Affiche / masque la section commentaires + champ de saisie.
         */
        $scope.toggleComments = function(post) {
            post.showAllComments  = !post.showAllComments;
            post.showCommentInput = post.showAllComments;
        };

        /**
         * Affiche tous les commentaires (au-delà des 2 visibles par défaut).
         */
        $scope.expandComments = function(post) {
            post.showAllComments = true;
        };

        /**
         * Ajoute un commentaire sur un post.
         * Utilise currentLevrUser (LEVR_users) pour le username + avatar optimiste.
         */
        $scope.addComment = function(post) {
            if (!$scope.currentLevrUser || !post.newComment || !post.newComment.trim()) return;
            PostService.addComment(post, post.newComment, $scope.currentLevrUser).catch(function(err) {
                console.error('[AgoraController] addComment error:', err);
            });
        };

        /**
         * Gère la touche Entrée dans le champ commentaire.
         * Shift+Entrée = saut de ligne, Entrée seul = envoyer.
         */
        $scope.onCommentKeypress = function(event, post) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                $scope.addComment(post);
            }
        };

        /** Supprime un de ses propres commentaires. */
        $scope.deleteComment = function(post, comment) {
            if (!$scope.currentUser) return;
            PostService.deleteComment(post, comment, $scope.currentUser.id).catch(function(err) {
                console.error('[AgoraController] deleteComment error:', err);
            });
        };

        /** Affiche / masque le champ de réponse sous un commentaire. */
        $scope.toggleReply = function(comment) {
            comment._showReplyInput = !comment._showReplyInput;
            if (comment._showReplyInput) comment._replyText = '';
        };

        /** Envoie une réponse à un commentaire. */
        $scope.submitReply = function(post, comment) {
            if (!$scope.currentLevrUser || !comment._replyText || !comment._replyText.trim()) return;
            PostService.addReply(post, comment, comment._replyText, $scope.currentLevrUser).catch(function(err) {
                console.error('[AgoraController] addReply error:', err);
            });
        };

        /** Gère Entrée dans le champ de réponse. */
        $scope.onReplyKeypress = function(event, post, comment) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                $scope.submitReply(post, comment);
            }
        };

        /** Supprime une réponse. */
        $scope.deleteReply = function(post, parentComment, reply) {
            if (!$scope.currentUser) return;
            PostService.deleteReply(post, parentComment, reply, $scope.currentUser.id).catch(function(err) {
                console.error('[AgoraController] deleteReply error:', err);
            });
        };

        /**
         * Supprime un de ses propres posts.
         * Diffuse 'post:deleted' pour synchroniser Mon profil si ouvert.
         */
        $scope.deletePost = function(post) {
            if (!$scope.currentUser || post.user_id !== $scope.currentUser.id) return;
            post._menuOpen = false;
            if (!window.confirm('Supprimer ce post d\u00e9finitivement\u00a0?')) return;

            PostService.deletePost(post.id).then(function() {
                for (var i = 0; i < $scope.posts.length; i++) {
                    if ($scope.posts[i].id === post.id) {
                        $scope.posts.splice(i, 1);
                        break;
                    }
                }
                $rootScope.$broadcast('post:deleted', post.id);
            }).catch(function(err) {
                console.error('[AgoraController] deletePost error:', err);
            });
        };

        /** Ouvre/ferme le menu contextuel d'un post. Ferme les autres menus ouverts. */
        $scope.togglePostMenu = function($event, post) {
            $event.stopPropagation();
            var isOpen = post._menuOpen;
            // Fermer tous les menus
            for (var i = 0; i < $scope.posts.length; i++) {
                $scope.posts[i]._menuOpen = false;
            }
            post._menuOpen = !isOpen;
        };

        /** Signale un post appartenant à un autre utilisateur. */
        $scope.reportPost = function(post) {
            if (!$scope.currentUser || post.user_id === $scope.currentUser.id) return;
            post._menuOpen = false;
            if (!window.confirm('Signaler ce post comme inappropri\u00e9\u00a0?')) return;

            supabase
                .from('LEVR_post_reports')
                .insert({ post_id: post.id, user_id: $scope.currentUser.id })
                .then(function(res) {
                    if (res.error) {
                        // Doublon = déjà signalé, on ignore silencieusement
                        if (res.error.code !== '23505') {
                            console.error('[AgoraController] reportPost error:', res.error);
                        }
                    }
                });
        };

        // Ferme tous les menus au clic en dehors
        function closeAllMenus() {
            for (var i = 0; i < $scope.posts.length; i++) {
                $scope.posts[i]._menuOpen = false;
            }
            $scope.$apply();
        }
        $document.on('click', closeAllMenus);

        // ── Écoute des événements globaux ────────────────────────────────────

        // Nouveau post créé via la modale → insérer en tête du feed
        var unsubCreate = $rootScope.$on('post:created', function(_event, post) {
            $scope.posts.unshift(post);
        });

        // Post supprimé depuis Mon profil → retirer du feed
        var unsubDelete = $rootScope.$on('post:deleted', function(_event, postId) {
            for (var i = 0; i < $scope.posts.length; i++) {
                if ($scope.posts[i].id === postId) {
                    $scope.posts.splice(i, 1);
                    break;
                }
            }
        });

        // Nettoyage des listeners quand on quitte la page
        $scope.$on('$destroy', function() {
            unsubCreate();
            unsubDelete();
            $document.off('click', closeAllMenus);
        });
    }
]);
