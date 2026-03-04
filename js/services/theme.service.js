/**
 * Service de gestion du thème (clair/sombre)
 * Sauvegarde la préférence dans localStorage
 */

angular.module('levrApp').factory('ThemeService', ['$rootScope', function($rootScope) {
    
    var STORAGE_KEY = 'levr_theme';
    
    return {
        /**
         * Récupérer le thème actuel
         * @returns {string} 'light' ou 'dark'
         */
        getCurrentTheme: function() {
            return localStorage.getItem(STORAGE_KEY) || 'light'; // Par défaut : clair
        },

        /**
         * Définir le thème
         * @param {string} theme - 'light' ou 'dark'
         */
        setTheme: function(theme) {
            localStorage.setItem(STORAGE_KEY, theme);
            
            if (theme === 'dark') {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('light-mode');
            } else {
                document.body.classList.add('light-mode');
                document.body.classList.remove('dark-mode');
            }
            
            $rootScope.currentTheme = theme;
        },

        /**
         * Basculer entre clair et sombre
         */
        toggleTheme: function() {
            var current = this.getCurrentTheme();
            var newTheme = current === 'light' ? 'dark' : 'light';
            this.setTheme(newTheme);
        },

        /**
         * Initialiser le thème au chargement
         */
        init: function() {
            var theme = this.getCurrentTheme();
            this.setTheme(theme);
        }
    };
}]);