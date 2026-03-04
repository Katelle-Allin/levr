/**
 * Contrôleur de la barre de navigation latérale
 * Gère la navigation active (logout déplacé vers AppController)
 */

angular.module('levrApp').controller('SidebarController', [
    '$scope',
    '$location',
    function($scope, $location) {

        /**
         * Vérifie si une route est active
         * @param {string} path - Chemin de la route
         * @returns {boolean}
         */
        $scope.isActive = function(path) {
            return $location.path() === path;
        };
    }
]);
