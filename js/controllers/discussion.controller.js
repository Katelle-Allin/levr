(function () {
    'use strict';

    angular.module('levrApp').controller('DiscussionCtrl', [
        '$scope', '$rootScope', '$routeParams', '$location', '$q', '$timeout',
        'BookclubService', 'AuthService',
        function ($scope, $rootScope, $routeParams, $location, $q, $timeout,
                  BookclubService, AuthService) {

            var clubId       = $routeParams.clubId;
            var discussionId = $routeParams.discussionId;

            // ── État ─────────────────────────────────────────────────────────
            $scope.club         = null;
            $scope.discussion   = null;
            $scope.messages     = [];
            $scope.loading      = true;
            $scope.error        = '';
            $scope.currentUser  = null;
            $scope.myRole       = null;

            // Compose
            $scope.compose        = { message: '' };
            $scope.sendingMessage = false;
            $scope.messagesError  = '';
            $scope.replyTo        = null;
            $scope.emojis         = ['👍', '❤️', '😂', '😮', '😢'];

            // ── Helpers ───────────────────────────────────────────────────────
            function scrollToBottom() {
                $timeout(function () {
                    var list = document.querySelector('.message-list');
                    if (list) { list.scrollTop = list.scrollHeight; }
                }, 80);
            }

            $scope.isMember = function () {
                return $scope.myRole === 'owner' || $scope.myRole === 'member';
            };

            $scope.isOwner = function () {
                return $scope.myRole === 'owner';
            };

            $scope.goBack = function () {
                $location.path('/bookclubs/' + clubId);
            };

            $scope.formatDate = function (dateStr) {
                if (!dateStr) { return ''; }
                return new Date(dateStr).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
            };

            // ── Init ─────────────────────────────────────────────────────────
            function init() {
                if (!clubId || !discussionId) { $location.path('/bookclubs'); return; }

                // getUser() valide le JWT côté serveur → currentUser toujours fiable
                AuthService.getUser().then(function (user) {
                    if (!user) { $location.path('/login'); return; }
                    $scope.currentUser = user;

                    var clubP = BookclubService.getBookclubById(clubId)
                        .then(function (club) { $scope.club = club; })
                        .catch(angular.noop);

                    var discP = BookclubService.getDiscussionById(discussionId)
                        .then(function (disc) { $scope.discussion = disc; })
                        .catch(function () {
                            $scope.discussion = { id: discussionId, title: 'Discussion' };
                        });

                    var msgsP = BookclubService.getMessages(discussionId)
                        .then(function (msgs) { $scope.messages = msgs; });

                    var roleP = BookclubService.getMyRole(clubId, user.id)
                        .then(function (role) { $scope.myRole = role; })
                        .catch(angular.noop);

                    $q.all([clubP, discP, msgsP, roleP])
                        .then(function () {
                            $scope.loading = false;
                            scrollToBottom();
                        })
                        .catch(function (err) {
                            $scope.error   = typeof err === 'string' ? err : (err.message || 'Erreur de chargement.');
                            $scope.loading = false;
                        });

                }).catch(function () {
                    $location.path('/login');
                });
            }

            // ── Envoi de message ──────────────────────────────────────────────
            $scope.submitMessage = function () {
                var text = ($scope.compose.message || '').trim();
                if (!text) { return; }
                if ($scope.sendingMessage) { return; }   // anti double-clic

                $scope.sendingMessage  = true;
                $scope.messagesError   = '';
                var replyTo = $scope.replyTo;

                BookclubService.postMessage(discussionId, text, replyTo)
                    .then(function (msg) {
                        var appUser = $rootScope.appUser;
                        msg.user = {
                            id:              $scope.currentUser.id,
                            username:        appUser ? appUser.username        : '—',
                            profile_picture: appUser ? appUser.profile_picture : null
                        };
                        if (replyTo) {
                            msg.reply_to_message_id = replyTo.id;
                            msg.reply_to_username   = replyTo.username;
                            msg.reply_to_excerpt    = replyTo.excerpt;
                        }
                        msg._reactions  = {};
                        msg._showPicker = false;
                        $scope.messages.push(msg);
                        $scope.compose.message = '';
                        $scope.replyTo         = null;
                        scrollToBottom();
                    })
                    .catch(function (err) {
                        $scope.messagesError = typeof err === 'string' ? err
                            : (err.message || 'Erreur lors de l\'envoi.');
                    })
                    .finally(function () {
                        $scope.sendingMessage = false;
                    });
            };

            // Gère Enter (envoi) vs Shift+Enter (saut de ligne)
            $scope.onComposeKeydown = function ($event) {
                if ($event.keyCode === 13 && !$event.shiftKey) {
                    $event.preventDefault();
                    $scope.submitMessage();
                }
            };

            // ── Reply ─────────────────────────────────────────────────────────
            $scope.setReply = function (msg) {
                $scope.replyTo = {
                    id:       msg.id,
                    username: msg.user ? msg.user.username : '—',
                    excerpt:  (msg.content || '').substring(0, 80)
                };
                $timeout(function () {
                    var ta = document.querySelector('.message-input');
                    if (ta) { ta.focus(); }
                }, 50);
            };

            $scope.clearReply = function () { $scope.replyTo = null; };

            // ── Réactions emoji ───────────────────────────────────────────────
            $scope.toggleEmojiPicker = function (msg, $event) {
                $event.stopPropagation();
                var wasOpen = !!msg._showPicker;
                $scope.messages.forEach(function (m) { m._showPicker = false; });
                msg._showPicker = !wasOpen;
            };

            $scope.closeAllPickers = function () {
                $scope.messages.forEach(function (m) { m._showPicker = false; });
            };

            $scope.toggleReaction = function (msg, emoji, $event) {
                if ($event) { $event.stopPropagation(); }
                if (!$scope.currentUser) { return; }
                var uid       = $scope.currentUser.id;
                var reactions = msg._reactions || {};
                var data      = reactions[emoji];
                var hasMine   = data && data.users && data.users.indexOf(uid) !== -1;
                msg._showPicker = false;

                if (hasMine) {
                    data.count = Math.max(0, data.count - 1);
                    data.users = data.users.filter(function (u) { return u !== uid; });
                    if (data.count === 0) { delete reactions[emoji]; }
                    BookclubService.removeReaction(msg.id, emoji).catch(angular.noop);
                } else {
                    if (!reactions[emoji]) { reactions[emoji] = { count: 0, users: [] }; }
                    reactions[emoji].count++;
                    reactions[emoji].users.push(uid);
                    msg._reactions = reactions;
                    BookclubService.addReaction(msg.id, emoji).catch(angular.noop);
                }
            };

            $scope.getReactionEntries = function (msg) {
                var entries   = [];
                var uid       = $scope.currentUser ? $scope.currentUser.id : null;
                var reactions = msg._reactions || {};
                Object.keys(reactions).forEach(function (emoji) {
                    var d = reactions[emoji];
                    if (d && d.count > 0) {
                        entries.push({
                            emoji: emoji,
                            count: d.count,
                            mine:  !!(uid && d.users && d.users.indexOf(uid) !== -1)
                        });
                    }
                });
                return entries;
            };

            $scope.hasReactions = function (msg) {
                var reactions = msg._reactions || {};
                return Object.keys(reactions).some(function (e) {
                    return reactions[e] && reactions[e].count > 0;
                });
            };

            init();
        }
    ]);

}());
