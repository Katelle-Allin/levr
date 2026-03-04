/**
 * Contrôleur de la bibliothèque personnelle
 * Affiche et gère les livres de l'utilisateur organisés par étagère
 */

angular.module('levrApp').controller('LibraryCtrl', [
    '$scope', '$location',
    'BookService',
    'ShelfService',
    'ToastService',
    function($scope, $location, BookService, ShelfService, ToastService) {

        // Initialisation
        $scope.books = [];
        $scope.filteredBooks = [];
        $scope.shelves = [];        // étagères déduites des livres (pour les chips de filtre)
        $scope.customShelves = [];  // étagères personnalisées depuis DB (pour le dropdown)
        $scope.selectedShelf = null;
        $scope.loading = true;
        $scope.error = '';
        $scope.success = '';

        /**
         * Charger la bibliothèque et les étagères personnalisées en parallèle
         */
        function loadLibrary() {
            $scope.loading = true;
            $scope.error = '';

            var booksPromise = BookService.getMyLibrary();
            var shelvesPromise = ShelfService.getUserShelves();

            booksPromise.then(function(books) {
                $scope.books = books;

                var shelvesSet = {};
                books.forEach(function(book) {
                    shelvesSet[book.shelf] = true;
                });
                $scope.shelves = Object.keys(shelvesSet).sort();

                filterBooks();
                $scope.loading = false;
            }).catch(function(error) {
                $scope.error = 'Erreur lors du chargement de votre bibliothèque';
                console.error('Erreur:', error);
                $scope.loading = false;
            });

            shelvesPromise.then(function(shelves) {
                $scope.customShelves = shelves;
            }).catch(function() {
                $scope.customShelves = [];
            });
        }

        /**
         * Filtrer les livres par étagère
         */
        function filterBooks() {
            if ($scope.selectedShelf === null) {
                $scope.filteredBooks = $scope.books;
            } else {
                $scope.filteredBooks = $scope.books.filter(function(book) {
                    return book.shelf === $scope.selectedShelf;
                });
            }
        }

        /**
         * Sélectionner une étagère pour filtrer
         */
        $scope.selectShelf = function(shelf) {
            $scope.selectedShelf = shelf;
            filterBooks();
        };

        /**
         * Vérifier si une étagère est sélectionnée
         */
        $scope.isShelfSelected = function(shelf) {
            return $scope.selectedShelf === shelf;
        };

        /**
         * Formater le nom d'une étagère pour l'affichage
         */
        $scope.formatShelfName = function(shelf) {
            var names = {
                'A_LIRE': 'À lire',
                'EN_COURS': 'En cours',
                'LU': 'Lu'
            };
            return names[shelf] || shelf.replace(/_/g, ' ');
        };

        /**
         * Changer l'étagère d'un livre
         */
        $scope.changeShelf = function(book, newShelf) {
            if (!newShelf || newShelf === book.shelf) return;

            $scope.error = '';
            $scope.success = '';

            var fromShelf    = book.shelf;
            var bookSnapshot = { book_id: book.book_id, title: book.LEVR_books.title, cover_url: book.LEVR_books.cover_url };

            BookService.updateShelf(book.book_id, newShelf).then(function() {
                book.shelf = newShelf;

                var shelvesSet = {};
                $scope.books.forEach(function(b) {
                    shelvesSet[b.shelf] = true;
                });
                $scope.shelves = Object.keys(shelvesSet).sort();

                filterBooks();

                $scope.success = 'Livre déplacé vers "' + $scope.formatShelfName(newShelf) + '" !';

                // Proposer de créer un post
                ToastService.addPostPrompt({
                    actionType: 'MOVE_SHELF',
                    book:       bookSnapshot,
                    fromShelf:  fromShelf,
                    toShelf:    newShelf
                });

                setTimeout(function() {
                    $scope.$apply(function() {
                        $scope.success = '';
                    });
                }, 2000);
            }).catch(function(error) {
                $scope.error = 'Erreur lors du déplacement';
                console.error('Erreur:', error);
            });
        };

        /**
         * Supprimer un livre de la bibliothèque
         */
        $scope.deleteBook = function(book) {
            if (!confirm('Supprimer "' + book.LEVR_books.title + '" de votre bibliothèque ?')) {
                return;
            }

            $scope.error = '';
            $scope.success = '';

            BookService.deleteBook(book.book_id).then(function() {
                var index = $scope.books.indexOf(book);
                if (index > -1) {
                    $scope.books.splice(index, 1);
                }
                
                var shelvesSet = {};
                $scope.books.forEach(function(b) {
                    shelvesSet[b.shelf] = true;
                });
                $scope.shelves = Object.keys(shelvesSet).sort();
                
                filterBooks();
                
                $scope.success = 'Livre supprimé de votre bibliothèque';
                setTimeout(function() {
                    $scope.$apply(function() {
                        $scope.success = '';
                    });
                }, 2000);
            }).catch(function(error) {
                $scope.error = 'Erreur lors de la suppression';
                console.error('Erreur:', error);
            });
        };

        /**
         * Obtenir les étagères disponibles pour le menu déroulant
         */
        $scope.getAvailableShelves = function(book) {
            return $scope.shelves.filter(function(shelf) {
                return shelf !== book.shelf;
            });
        };

        /**
         * Compter le nombre de livres par étagère
         */
        $scope.getShelfCount = function(shelf) {
            return $scope.books.filter(function(book) {
                return book.shelf === shelf;
            }).length;
        };

        /**
         * Naviguer vers la page détail d'un livre
         */
        $scope.goToBook = function(book) {
            BookService.setCache(book.book_id, book.LEVR_books);
            $location.path('/book/' + book.book_id);
        };

        // Charger la bibliothèque au démarrage
        loadLibrary();
    }
]);
