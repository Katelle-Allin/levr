(function () {
    'use strict';

    angular.module('levrApp').controller('BookclubsCtrl', [
        '$scope', '$rootScope', '$q', '$location', 'BookclubService',
        function ($scope, $rootScope, $q, $location, BookclubService) {

            // ── État ─────────────────────────────────────────────────────────
            $scope.activeTab       = 'mes-clubs';
            $scope.myClubs         = [];
            $scope.publicClubs     = [];
            $scope.memberClubIds   = [];   // UUIDs des clubs où l'user est membre
            $scope.loading         = true;
            $scope.error           = '';

            // ── Init : charge les deux listes et filtre après $q.all ─────────
            function init() {
                $scope.loading = true;
                $scope.error   = '';

                // Chaque promesse est rendue "safe" (catch → []) pour que $q.all
                // se resolve toujours et qu'une erreur sur l'une ne bloque pas l'autre.
                var myP = BookclubService.getMyBookclubs()
                    .then(function (clubs) {
                        $scope.myClubs       = clubs;
                        $scope.memberClubIds = clubs.map(function (c) { return c.id; });
                        return clubs;
                    })
                    .catch(function (err) {
                        console.error('[BookclubsCtrl] getMyBookclubs:', err);
                        $scope.error = typeof err === 'string' ? err : (err.message || 'Impossible de charger vos bookclubs. Vérifiez votre connexion.');
                        return [];
                    });

                var pubP = BookclubService.getPublicBookclubs()
                    .catch(function (err) {
                        console.error('[BookclubsCtrl] getPublicBookclubs:', err);
                        if (!$scope.error) {
                            $scope.error = typeof err === 'string' ? err : (err.message || 'Impossible de charger les bookclubs publics.');
                        }
                        return [];
                    });

                // Le filtre ne s'applique qu'une fois les deux listes connues
                $q.all([myP, pubP])
                    .then(function (results) {
                        var myIds     = (results[0] || []).map(function (c) { return c.id; });
                        var allPublic = results[1] || [];
                        $scope.publicClubs = allPublic.filter(function (c) {
                            return c && c.id && myIds.indexOf(c.id) === -1;
                        });
                    })
                    .finally(function () {
                        $scope.loading = false;
                    });
            }

            // Rafraîchir quand un club est créé depuis la modale root
            $rootScope.$on('club:created', function (evt, club) {
                if (!club || !club.id) { return; }
                var exists = $scope.myClubs.some(function (c) { return c.id === club.id; });
                if (!exists) {
                    $scope.myClubs.unshift(club);
                    $scope.memberClubIds.unshift(club.id);
                }
                $scope.activeTab = 'mes-clubs';
            });

            // ── Onglets ───────────────────────────────────────────────────────
            $scope.switchTab = function (tab) {
                $scope.activeTab = tab;
                $scope.error     = '';
            };

            // ── Navigation ────────────────────────────────────────────────────
            $scope.goToClub = function (club) {
                if (!club || !club.id) { return; }
                $location.path('/bookclubs/' + club.id);
            };

            // ── Rejoindre depuis Découvrir ────────────────────────────────────
            $scope.joinClub = function (club) {
                if (!club || !club.id) { return; }
                // Guard : déjà membre (ne devrait pas arriver après le fix du filtre)
                if ($scope.memberClubIds.indexOf(club.id) !== -1) {
                    $scope.publicClubs = $scope.publicClubs.filter(function (c) { return c.id !== club.id; });
                    return;
                }
                club._joining = true;
                $scope.error  = '';
                BookclubService.joinBookclub(club.id)
                    .then(function () {
                        // Déplacer le club dans "Mes clubs"
                        $scope.publicClubs = $scope.publicClubs.filter(function (c) {
                            return c.id !== club.id;
                        });
                        var newClub = angular.extend({}, club, { myRole: 'member' });
                        $scope.myClubs.unshift(newClub);
                        $scope.memberClubIds.push(club.id);
                        $scope.activeTab = 'mes-clubs';
                    })
                    .catch(function (err) {
                        $scope.error = err;
                    })
                    .finally(function () {
                        club._joining = false;
                    });
            };

            init();
        }
    ]);

}());
