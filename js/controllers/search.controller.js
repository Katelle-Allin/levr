/**
 * Contrôleur de recherche de livres
 * Permet de chercher des livres via Open Library et de les ajouter à sa bibliothèque
 */

angular.module('levrApp').controller('SearchCtrl', [
    '$scope', '$location',
    'BookService',
    'ShelfService',
    'ToastService',
    'ReviewService',
    function($scope, $location, BookService, ShelfService, ToastService, ReviewService) {

        // Initialisation
        $scope.searchQuery = '';
        $scope.searchResults = [];
        $scope.searching = false;
        $scope.error = '';
        $scope.success = '';

        // Ratings communautaires
        $scope.ratingsMap    = {};
        $scope.ratingsLoaded = false;

        // Étagères par défaut (toujours disponibles)
        $scope.defaultShelves = [
            { value: 'A_LIRE', label: 'À lire' },
            { value: 'EN_COURS', label: 'En cours' },
            { value: 'LU', label: 'Lu' }
        ];

        // Modal d'ajout
        $scope.showAddModal = false;
        $scope.selectedBook = null;
        $scope.selectedShelf = 'A_LIRE';
        $scope.userShelves = [];        // Étagères personnalisées depuis DB

        // Création d'étagère inline
        $scope.creatingShelf = false;
        $scope.newShelfName = '';
        $scope.shelfError = '';
        $scope.savingShelf = false;

        /**
         * Naviguer vers la page détail d'un livre.
         * Met en cache les données du livre pour éviter un refetch.
         */
        $scope.goToBook = function(book) {
            BookService.setCache(book.book_id, book);
            $location.path('/book/' + book.book_id);
        };

        /**
         * Rechercher des livres
         */
        $scope.search = function() {
            if (!$scope.searchQuery || $scope.searchQuery.trim().length < 2) {
                $scope.error = 'Veuillez entrer au moins 2 caractères';
                return;
            }

            $scope.searching = true;
            $scope.error = '';
            $scope.searchResults = [];

            BookService.searchBooks($scope.searchQuery).then(function(results) {
                $scope.searchResults = results;
                $scope.searching = false;

                if (results.length === 0) {
                    $scope.error = 'Aucun livre trouvé';
                    return;
                }

                // Charger les ratings en un seul appel batch
                $scope.ratingsLoaded = false;
                var ids = results.map(function(b) { return b.book_id; });
                ReviewService.getRatingsSummary(ids).then(function(map) {
                    $scope.ratingsMap    = map;
                    $scope.ratingsLoaded = true;
                });
            }).catch(function(error) {
                $scope.error = error;
                $scope.searching = false;
            });
        };

        /**
         * Ouvrir le modal pour ajouter un livre
         * Charge les étagères personnalisées de l'utilisateur
         * @param {Object} book - Livre à ajouter
         */
        $scope.openAddModal = function(book) {
            $scope.selectedBook = book;
            $scope.showAddModal = true;
            $scope.selectedShelf = 'A_LIRE';
            $scope.userShelves = [];
            $scope.creatingShelf = false;
            $scope.newShelfName = '';
            $scope.shelfError = '';
            $scope.error = '';
            $scope.success = '';

            // Charger les étagères personnalisées depuis Supabase
            ShelfService.getUserShelves().then(function(shelves) {
                $scope.userShelves = shelves;
            }).catch(function() {
                $scope.userShelves = [];
            });
        };

        /**
         * Fermer le modal
         */
        $scope.closeAddModal = function() {
            $scope.showAddModal = false;
            $scope.selectedBook = null;
        };

        /**
         * Afficher le formulaire de création d'étagère inline
         */
        $scope.showCreateShelf = function() {
            $scope.creatingShelf = true;
            $scope.newShelfName = '';
            $scope.shelfError = '';
        };

        /**
         * Annuler la création d'étagère
         */
        $scope.cancelCreateShelf = function() {
            $scope.creatingShelf = false;
            $scope.newShelfName = '';
            $scope.shelfError = '';
        };

        /**
         * Valider et sauvegarder la nouvelle étagère dans Supabase
         * Auto-sélectionne l'étagère créée
         */
        $scope.validateNewShelf = function() {
            var name = ($scope.newShelfName || '').trim();

            if (!name) {
                $scope.shelfError = 'Le nom ne peut pas être vide';
                return;
            }

            $scope.savingShelf = true;
            $scope.shelfError = '';

            ShelfService.createShelf(name).then(function(newShelf) {
                $scope.userShelves.push(newShelf);
                $scope.selectedShelf = newShelf.name;   // auto-sélection
                $scope.creatingShelf = false;
                $scope.newShelfName = '';
                $scope.savingShelf = false;
            }).catch(function(errorMsg) {
                $scope.shelfError = typeof errorMsg === 'string'
                    ? errorMsg
                    : 'Erreur lors de la création de l\'étagère';
                $scope.savingShelf = false;
            });
        };

        /**
         * Valider avec la touche Entrée dans le champ de création
         */
        $scope.onShelfKeyPress = function($event) {
            if ($event.keyCode === 13) {
                $scope.validateNewShelf();
            }
        };

        /**
         * Ajouter le livre à la bibliothèque avec l'étagère sélectionnée
         */
        $scope.addToLibrary = function() {
            if (!$scope.selectedBook) return;

            var shelf = $scope.selectedShelf;

            if (!shelf) {
                $scope.error = 'Veuillez sélectionner une étagère';
                return;
            }

            $scope.adding = true;
            $scope.error = '';

            var bookSnapshot = angular.copy($scope.selectedBook);

            BookService.addBookToLibrary(bookSnapshot, shelf).then(function() {
                $scope.success = '✅ "' + bookSnapshot.title + '" ajouté à votre bibliothèque !';
                $scope.adding = false;
                $scope.closeAddModal();

                // Proposer de créer un post
                ToastService.addPostPrompt({
                    actionType: 'ADD_BOOK',
                    book:       bookSnapshot,
                    toShelf:    shelf
                });

                setTimeout(function() {
                    $scope.$apply(function() {
                        $scope.success = '';
                    });
                }, 3000);
            }).catch(function(error) {
                $scope.error = error.message || 'Erreur lors de l\'ajout';
                $scope.adding = false;
            });
        };

        /**
         * Recherche au clavier (Enter)
         */
        $scope.onKeyPress = function($event) {
            if ($event.keyCode === 13) {
                $scope.search();
            }
        };
    }
]);
