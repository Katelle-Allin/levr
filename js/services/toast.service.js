/**
 * Service de notifications toast (style LinkedIn)
 * Gère une queue de toasts stockée dans $rootScope pour être
 * accessible depuis n'importe quel scope (y compris AppController).
 */

angular.module('levrApp').factory('ToastService', ['$rootScope', '$timeout', function($rootScope, $timeout) {

    $rootScope.toasts = $rootScope.toasts || [];

    var nextId = 0;

    var service = {
        /**
         * Ajouter un toast à la queue
         * @param {Object} toast - { message, type, actions[], duration, autoDismiss }
         * @returns {number} id du toast
         */
        add: function(toast) {
            toast.id = ++nextId;
            $rootScope.toasts.push(toast);

            if (toast.autoDismiss !== false) {
                $timeout(function() {
                    service.dismiss(toast.id);
                }, toast.duration || 7000);
            }

            return toast.id;
        },

        /**
         * Supprimer un toast par son id
         * @param {number} id
         */
        dismiss: function(id) {
            for (var i = 0; i < $rootScope.toasts.length; i++) {
                if ($rootScope.toasts[i].id === id) {
                    $rootScope.toasts.splice(i, 1);
                    return;
                }
            }
        },

        /**
         * Proposer de créer un post après une action livre
         * @param {Object} payload - { actionType, book, fromShelf, toShelf }
         */
        addPostPrompt: function(payload) {
            return service.add({
                type: 'prompt',
                title: 'Partager sur l\'Agora',
                subtitle: 'Votre activité peut être vue par la communauté.',
                autoDismiss: true,
                duration: 9000,
                actions: [
                    { label: 'Plus tard',      primary: false, payload: null },
                    { label: 'Créer un post',  primary: true,  payload: payload }
                ]
            });
        },

        /**
         * Toast de fin de session de lecture avec résumé + CTA "Faire un post".
         * Remplace le toast success plat pour donner la possibilité de partager.
         * @param {number}      pagesTotal - total pages lues aujourd'hui
         * @param {Object|null} book       - { title, cover_url, ... } du livre de la session
         * @param {Object}      payload    - payload READ_SESSION pour PostService.openModal
         */
        addSessionPrompt: function(pagesTotal, book, payload) {
            var p     = pagesTotal || 0;
            var title = 'Bravo\u00a0! ' + p + '\u00a0page' + (p > 1 ? 's' : '') +
                        ' lue' + (p > 1 ? 's' : '') + ' aujourd\'hui\u00a0! \uD83C\uDF89';
            var subtitle = (book && book.title)
                ? '\u00ab\u00a0' + book.title + '\u00a0\u00bb \u2014 Partager sur l\'Agora\u00a0?'
                : 'Partager sur l\'Agora\u00a0?';

            return service.add({
                type:        'prompt',
                title:       title,
                subtitle:    subtitle,
                autoDismiss: true,
                duration:    9000,
                actions: [
                    { label: 'Pas maintenant', primary: false, payload: null },
                    { label: 'Faire un post',  primary: true,  payload: payload }
                ]
            });
        }
    };

    return service;
}]);
