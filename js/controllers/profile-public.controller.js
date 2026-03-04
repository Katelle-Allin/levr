/**
 * Contrôleur du profil public
 * Affiche le profil d'un autre utilisateur avec possibilité de suivre/se désabonner
 * + section "Posts" avec les posts de cet utilisateur
 */

angular.module('levrApp').controller('ProfilePublicCtrl', [
    '$scope',
    '$routeParams',
    'ProfileService',
    'FollowService',
    'AuthService',
    'PostService',
    function($scope, $routeParams, ProfileService, FollowService, AuthService, PostService) {

        // Initialisation
        $scope.profile      = null;
        $scope.stats        = null;
        $scope.posts        = [];
        $scope.postsLoading = false;
        $scope.currentUser  = null;
        $scope.isOwnProfile = false;
        $scope.isFollowing  = false;
        $scope.isPrivate    = false;
        $scope.loading      = true;
        $scope.followLoading = false;
        $scope.error        = '';

        /**
         * Formate une date en temps relatif
         */
        $scope.formatTime = function(dateStr) {
            return PostService.formatRelativeTime(dateStr);
        };

        /**
         * Charger le profil public
         */
        function loadProfile() {
            $scope.loading = true;
            $scope.error   = '';

            var username = $routeParams.username;

            AuthService.getUser().then(function(currentUser) {
                $scope.currentUser = currentUser;
                return ProfileService.getProfileByUsername(username);
            }).then(function(profile) {
                $scope.profile = profile;

                if ($scope.currentUser && $scope.currentUser.id === profile.id) {
                    $scope.isOwnProfile = true;
                }

                if (!profile.is_public && !$scope.isOwnProfile) {
                    $scope.isPrivate = true;
                    $scope.loading   = false;
                    return;
                }

                var statsPromise = $scope.isOwnProfile
                    ? ProfileService.getMyStats()
                    : ProfileService.getUserStats(profile.id);

                return statsPromise;
            }).then(function(stats) {
                if (!$scope.isPrivate) {
                    $scope.stats = stats;

                    // Charger les posts de cet utilisateur
                    loadUserPosts($scope.profile.id);

                    if (!$scope.isOwnProfile && $scope.currentUser) {
                        return FollowService.isFollowing($scope.profile.id);
                    }
                }
            }).then(function(isFollowing) {
                if (isFollowing !== undefined) {
                    $scope.isFollowing = isFollowing;
                }
                $scope.loading = false;
            }).catch(function(error) {
                $scope.error   = error.message || 'Erreur lors du chargement du profil';
                $scope.loading = false;
                console.error('[ProfilePublicCtrl] loadProfile error:', error);
            });
        }

        /**
         * Charger les posts de l'utilisateur affiché
         * @param {string} userId
         */
        function loadUserPosts(userId) {
            $scope.postsLoading = true;

            PostService.listUserPosts(userId).then(function(posts) {
                $scope.posts        = posts;
                $scope.postsLoading = false;
            }).catch(function(err) {
                $scope.postsLoading = false;
                console.error('[ProfilePublicCtrl] loadUserPosts error:', err);
            });
        }

        /**
         * Suivre un utilisateur
         */
        $scope.follow = function() {
            if (!$scope.currentUser) {
                $scope.error = 'Vous devez être connecté pour suivre un utilisateur';
                return;
            }

            $scope.followLoading = true;
            $scope.error = '';

            FollowService.follow($scope.profile.id).then(function() {
                $scope.isFollowing = true;
                $scope.profile.followers_count++;
                $scope.followLoading = false;
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors du suivi';
                $scope.followLoading = false;
            });
        };

        /**
         * Se désabonner d'un utilisateur
         */
        $scope.unfollow = function() {
            $scope.followLoading = true;
            $scope.error = '';

            FollowService.unfollow($scope.profile.id).then(function() {
                $scope.isFollowing = false;
                $scope.profile.followers_count--;
                $scope.followLoading = false;
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors du désuivi';
                $scope.followLoading = false;
            });
        };

        loadProfile();
    }
]);
