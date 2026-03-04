(function () {
    'use strict';

    angular.module('levrApp').controller('BookclubCtrl', [
        '$scope', '$rootScope', '$routeParams', '$location', '$q',
        'BookclubService', 'AuthService',
        function ($scope, $rootScope, $routeParams, $location, $q,
                  BookclubService, AuthService) {

            var clubId = $routeParams.id;

            // ── État principal ────────────────────────────────────────────────
            $scope.club              = null;
            $scope.members           = [];
            $scope.discussions       = [];
            $scope.myRole            = null;      // 'owner' | 'member' | null
            $scope.currentUser       = null;
            $scope.loading           = true;
            $scope.error             = '';
            $scope.activeSection     = 'discussions';
            $scope.membershipLoading = false;

            // Lecture en cours (lecture seule — géré depuis les paramètres)
            $scope.currentBook = null;

            // Formulaire création discussion
            $scope.showDiscForm  = false;
            $scope.disc          = { title: '' };
            $scope.creatingDisc  = false;
            $scope.discError     = '';

            // ── Init ─────────────────────────────────────────────────────────
            function init() {
                if (!clubId) { $location.path('/bookclubs'); return; }
                AuthService.getUser().then(function (user) {
                    if (user) { $scope.currentUser = user; }
                    loadAll();
                }).catch(function () { loadAll(); });
            }

            function loadAll() {
                $scope.loading = true;
                $scope.error   = '';

                var clubP    = BookclubService.getBookclubById(clubId);
                var membersP = BookclubService.getMembers(clubId);
                var discsP   = BookclubService.getDiscussions(clubId);

                clubP.then(function (club) {
                    $scope.club = club;
                    // Hydrate le bloc "Lecture en cours" depuis les colonnes dénormalisées
                    if (club && club.current_book_id) {
                        $scope.currentBook = {
                            book_id:   club.current_book_id,
                            title:     club.current_book_title  || '(titre inconnu)',
                            author:    club.current_book_author || null,
                            cover_url: club.current_book_cover  || null
                        };
                    } else {
                        $scope.currentBook = null;
                    }
                });

                membersP.then(function (members) {
                    $scope.members = members;
                    if ($scope.currentUser) {
                        var me = null;
                        for (var i = 0; i < members.length; i++) {
                            if (members[i].user_id === $scope.currentUser.id) {
                                me = members[i];
                                break;
                            }
                        }
                        $scope.myRole = me ? me.role : null;
                    }
                });

                discsP.then(function (discs) {
                    $scope.discussions = discs;
                });

                $q.all([clubP, membersP, discsP])
                    .then(function () {
                        $scope.loading = false;
                    })
                    .catch(function (err) {
                        $scope.error   = err;
                        $scope.loading = false;
                    });
            }

            // ── Navigation ────────────────────────────────────────────────────
            $scope.goToBook = function () {
                if (!$scope.club || !$scope.club.current_book_id) { return; }
                $location.path('/book/' + $scope.club.current_book_id);
            };

            $scope.goToSettings = function () {
                $location.path('/bookclubs/' + clubId + '/settings');
            };

            $scope.goBack = function () {
                $location.path('/bookclubs');
            };

            // ── Sections ──────────────────────────────────────────────────────
            $scope.switchSection = function (section) {
                $scope.activeSection = section;
            };

            // ── Discussions ───────────────────────────────────────────────────
            $scope.goToDiscussion = function (disc) {
                if (!disc || !disc.id) { return; }
                $location.path('/bookclubs/' + clubId + '/discussions/' + disc.id);
            };

            $scope.toggleDiscForm = function () {
                $scope.showDiscForm  = !$scope.showDiscForm;
                $scope.disc.title    = '';
                $scope.discError     = '';
            };

            $scope.submitDiscussion = function () {
                if (!$scope.disc.title || !$scope.disc.title.trim()) {
                    $scope.discError = 'Le titre est obligatoire.';
                    return;
                }
                $scope.discError    = '';
                $scope.creatingDisc = true;
                BookclubService.createDiscussion(clubId, $scope.disc.title)
                    .then(function (disc) {
                        $scope.discussions.unshift(disc);
                        $scope.showDiscForm = false;
                        $scope.disc.title   = '';
                        $scope.goToDiscussion(disc);
                    })
                    .catch(function (err) {
                        $scope.discError = err;
                    })
                    .finally(function () {
                        $scope.creatingDisc = false;
                    });
            };

            // ── Adhésion ──────────────────────────────────────────────────────
            $scope.joinClub = function () {
                $scope.membershipLoading = true;
                BookclubService.joinBookclub(clubId)
                    .then(function () {
                        $scope.myRole = 'member';
                        var appUser = $rootScope.appUser;
                        if ($scope.currentUser) {
                            $scope.members.push({
                                user_id: $scope.currentUser.id,
                                role:    'member',
                                user:    appUser || null
                            });
                        }
                    })
                    .catch(function (err) {
                        $scope.error = err;
                    })
                    .finally(function () {
                        $scope.membershipLoading = false;
                    });
            };

            $scope.leaveClub = function () {
                if (!window.confirm('Quitter ce bookclub ?')) { return; }
                $scope.membershipLoading = true;
                BookclubService.leaveBookclub(clubId)
                    .then(function () {
                        $scope.myRole  = null;
                        if ($scope.currentUser) {
                            $scope.members = $scope.members.filter(function (m) {
                                return m.user_id !== $scope.currentUser.id;
                            });
                        }
                    })
                    .catch(function (err) {
                        $scope.error = err;
                    })
                    .finally(function () {
                        $scope.membershipLoading = false;
                    });
            };

            // ── Helpers ───────────────────────────────────────────────────────
            $scope.isOwner = function () {
                return $scope.myRole === 'owner';
            };

            $scope.isMember = function () {
                return $scope.myRole === 'owner' || $scope.myRole === 'member';
            };

            $scope.formatDate = function (dateStr) {
                if (!dateStr) { return ''; }
                return new Date(dateStr).toLocaleDateString('fr-FR', {
                    day:   'numeric',
                    month: 'long',
                    year:  'numeric'
                });
            };

            init();
        }
    ]);

}());
