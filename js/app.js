/**
 * LEVR Application - Module principal
 * Application de communauté de lecteurs avec AngularJS 1.8.2 et Supabase
 */

// ==================== CONFIGURATION SUPABASE ====================
// 🔑 Remplacez ces valeurs par vos propres clés Supabase
const SUPABASE_URL = 'https://puwseltqmkbzgtcmyute.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1d3NlbHRxbWtiemd0Y215dXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTgxODgsImV4cCI6MjA3NjMzNDE4OH0.AcCIpkEWq6kJ_ISLJndqK5Ud7sRPq5xknLPLlqg5Uxw';

// Initialisation du client Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Message de bienvenue dans la console
console.log('🚀 LEVR Application initialisée');
console.log('✅ Client Supabase connecté:', SUPABASE_URL);

// ==================== MODULE ANGULARJS ====================
angular.module('levrApp', ['ngRoute'])
    .config(['$routeProvider', '$locationProvider', '$httpProvider', function($routeProvider, $locationProvider, $httpProvider) {
        // Intercepteur ngrok : ajoute le header bypass UNIQUEMENT pour les requêtes
        // vers l'origine locale (templates HTML). Les API externes (OpenLibrary,
        // Supabase) ne reçoivent pas ce header — leur CORS l'interdirait (status -1).
        $httpProvider.interceptors.push(['$window', function($window) {
            return {
                request: function(config) {
                    var url = config.url || '';
                    var isExternal = /^https?:\/\//.test(url) &&
                                     url.indexOf($window.location.origin) !== 0;
                    if (!isExternal) {
                        config.headers = config.headers || {};
                        config.headers['ngrok-skip-browser-warning'] = 'true';
                    }
                    return config;
                }
            };
        }]);

        $routeProvider
            // Mot de passe oublié (public)
            .when('/forgot-password', {
                templateUrl: 'partials/forgot_password.html',
                controller:  'AuthController'
            })
            // Réinitialisation du mot de passe (public — accédé via lien email)
            .when('/reset-password', {
                templateUrl: 'partials/reset_password.html',
                controller:  'AuthController'
            })
            // Page d'inscription
            .when('/signup', {
                templateUrl: 'partials/signup.html',
                controller: 'AuthController',
                resolve: {
                    redirectIfAuth: ['AuthService', '$location', function(AuthService, $location) {
                        return AuthService.getUser().then(function(user) {
                            if (user) {
                                $location.path('/agora');
                            }
                        });
                    }]
                }
            })
            // Page de connexion
            .when('/login', {
                templateUrl: 'partials/login.html',
                controller: 'AuthController',
                resolve: {
                    redirectIfAuth: ['AuthService', '$location', function(AuthService, $location) {
                        return AuthService.getUser().then(function(user) {
                            if (user) {
                                $location.path('/agora');
                            }
                        });
                    }]
                }
            })
            // Page Agora (liste des utilisateurs)
            .when('/agora', {
                templateUrl: 'partials/agora.html',
                controller: 'AgoraController',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Mon Profil
            .when('/profile/me', {
                templateUrl: 'partials/profile_me.html',
                controller: 'ProfileCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Profil Public
            .when('/profile/:username', {
                templateUrl: 'partials/profile_public.html',
                controller: 'ProfilePublicCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Paramètres
            .when('/settings', {
                templateUrl: 'partials/settings.html',
                controller: 'SettingsController',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Recherche de livres
            .when('/search', {
                templateUrl: 'partials/search.html',
                controller: 'SearchCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Bookclubs — liste
            .when('/bookclubs', {
                templateUrl: 'partials/bookclubs.html',
                controller: 'BookclubsCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Discussion — fil de messages dédié (WhatsApp-style)
            // ⚠ Doit être AVANT /bookclubs/:id (plus spécifique = 4 segments)
            .when('/bookclubs/:clubId/discussions/:discussionId', {
                templateUrl: 'partials/discussion.html',
                controller: 'DiscussionCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Bookclub — détail + liste discussions
            .when('/bookclubs/:id', {
                templateUrl: 'partials/bookclub.html',
                controller: 'BookclubCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Paramètres bookclub
            .when('/bookclubs/:id/settings', {
                templateUrl: 'partials/bookclub_settings.html',
                controller: 'BookclubSettingsCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Ma Bibliothèque
            .when('/library', {
                templateUrl: 'partials/library.html',
                controller: 'LibraryCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Page Détail Livre
            .when('/book/:bookId', {
                templateUrl: 'partials/book.html',
                controller: 'BookCtrl',
                resolve: {
                    auth: ['AuthService', '$location', '$q', function(AuthService, $location, $q) {
                        return AuthService.requireAuth().catch(function() {
                            $location.path('/login');
                            return $q.reject('not-authenticated');
                        });
                    }]
                }
            })
            // Redirection par défaut
            .otherwise({
                redirectTo: '/login'
            });

        // Désactivation du mode HTML5 pour éviter les problèmes avec le serveur local
        $locationProvider.html5Mode(false);
        $locationProvider.hashPrefix('!');
    }])
    // Injection du client Supabase comme constante
    .constant('supabase', supabaseClient)
    // Run block pour gérer l'état d'authentification global et le thème
    .run(['$rootScope', '$timeout', 'AuthService', 'ThemeService', function($rootScope, $timeout, AuthService, ThemeService) {
        // Initialiser le thème
        ThemeService.init();

        // Vérifier l'état d'authentification au chargement
        // getSession() lit le localStorage (pas de réseau) → plus rapide sur mobile, pas de flash
        AuthService.getSession().then(function(user) {
            $rootScope.isAuthenticated = !!user;
        });

        // Écouter les changements de route
        $rootScope.$on('$routeChangeStart', function() {
            AuthService.getUser().then(function(user) {
                $rootScope.isAuthenticated = !!user;
            });
        });

        // Initialiser les icônes Lucide (sidebar, hors ng-view) au chargement
        $timeout(function() {
            if (window.lucide) lucide.createIcons();
        }, 100);

        // Re-initialiser après chaque changement de route (pour le ng-view)
        $rootScope.$on('$routeChangeSuccess', function() {
            $timeout(function() {
                if (window.lucide) lucide.createIcons();
            }, 0);
        });
    }]);