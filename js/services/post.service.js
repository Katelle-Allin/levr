/**
 * Service de gestion des posts (feed Agora)
 * ─────────────────────────────────────────
 * Gère :
 *   - CRUD sur LEVR_posts (créer, supprimer, lister)
 *   - Likes  (LEVR_post_likes)
 *   - Commentaires (LEVR_post_comments)
 *   - Upload d'images dans le bucket Supabase levr-posts
 *   - État de la modale de création (via $rootScope.postModal)
 *
 * ARCHITECTURE REQUÊTES
 * ─────────────────────
 * Les likes et commentaires sont chargés en requêtes SÉPARÉES (pas en join
 * inline dans le select). Cela permet au feed de fonctionner même si les
 * tables LEVR_post_likes / LEVR_post_comments n'ont pas encore été créées —
 * elles dégradent silencieusement (warning console) au lieu de tout casser.
 */

angular.module('levrApp').factory('PostService', [
    '$q', '$rootScope', 'supabase', 'AuthService',
    function($q, $rootScope, supabase, AuthService) {

    // ── État initial de la modale de création ───────────────────────────────
    $rootScope.postModal = $rootScope.postModal || {
        show:       false,
        payload:    null,
        content:    '',
        imageUrl:   '',
        previewUrl: '',
        imageFile:  null,
        uploading:  false,
        saving:     false,
        error:      ''
    };

    // ────────────────────────────────────────────────────────────────────────
    // Helpers privés
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Construit un message d'erreur lisible depuis une erreur Supabase.
     * Inclut message + hint + code pour faciliter le debug.
     * @param {Object|string} err
     * @returns {string}
     */
    function buildErrMsg(err) {
        if (!err)                    return 'Erreur inconnue';
        if (typeof err === 'string') return err;
        var msg = err.message || 'Erreur inconnue';
        if (err.hint)    msg += ' — ' + err.hint;
        if (err.code)    msg += ' [' + err.code + ']';
        if (err.details) msg += ' (' + err.details + ')';
        return msg;
    }

    /**
     * Retourne les données structurées pour la ligne d'activité d'un post.
     * @param {Object} post - post enrichi (doit avoir LEVR_books, action_type, to_shelf)
     * @returns {{ prefix: string, suffix: string|null, book: Object|null }|null}
     */
    function getActivityLabel(post) {
        var type  = post.action_type;
        var shelf = (post.to_shelf || '').toUpperCase();
        var book  = post.LEVR_books || null;

        if (!type || type === 'MANUAL') {
            if (!book) return null;
            return { prefix: 'a publi\u00e9 \u00e0 propos de', suffix: null, book: book };
        }

        if (type === 'ADD_BOOK') {
            if (shelf === 'EN_COURS') return { prefix: 'a commenc\u00e9 sa lecture de', suffix: null,                        book: book };
            if (shelf === 'LU')       return { prefix: 'a termin\u00e9',                suffix: null,                        book: book };
            if (shelf === 'A_LIRE')   return { prefix: 'a ajout\u00e9',                 suffix: '\u00e0 sa liste \u00c0 lire', book: book };
            return                           { prefix: 'a ajout\u00e9',                 suffix: '\u00e0 sa biblioth\u00e8que', book: book };
        }

        if (type === 'MOVE_SHELF') {
            if (shelf === 'EN_COURS') return { prefix: 'a commenc\u00e9 sa lecture de', suffix: null,                        book: book };
            if (shelf === 'LU')       return { prefix: 'a termin\u00e9',                suffix: null,                        book: book };
            if (shelf === 'A_LIRE')   return { prefix: 'a ajout\u00e9',                 suffix: '\u00e0 sa liste \u00c0 lire', book: book };
            return                           { prefix: 'a mis \u00e0 jour',             suffix: null,                        book: book };
        }

        if (type === 'READ_SESSION') {
            return book
                ? { prefix: 'a lu aujourd\'hui dans', suffix: null, book: book }
                : null;
        }

        return null;
    }

    /**
     * Génère un texte pré-rempli selon l'action effectuée sur un livre.
     * @param {Object} payload - { actionType, book, fromShelf, toShelf }
     * @returns {string}
     */
    function generateContent(payload) {
        var title = payload.book ? '\u00ab\u00a0' + payload.book.title + '\u00a0\u00bb' : '';
        var shelf  = payload.toShelf || '';

        if (payload.actionType === 'ADD_BOOK') {
            if (shelf === 'A_LIRE')   return 'J\'ai ajout\u00e9 ' + title + ' \u00e0 ma liste \u00e0 lire.';
            if (shelf === 'EN_COURS') return 'J\'ai commenc\u00e9 ' + title + '.';
            if (shelf === 'LU')       return 'J\'ai termin\u00e9 ' + title + '.';
            return 'J\'ai ajout\u00e9 ' + title + ' dans mon \u00e9tag\u00e8re \u00ab\u00a0' + shelf + '\u00a0\u00bb.';
        }

        if (payload.actionType === 'MOVE_SHELF') {
            if (shelf === 'EN_COURS') return 'Je commence ' + title + '.';
            if (shelf === 'LU')       return 'Je viens de terminer ' + title + '.';
            return 'J\'ai d\u00e9plac\u00e9 ' + title + ' dans mon \u00e9tag\u00e8re \u00ab\u00a0' + shelf + '\u00a0\u00bb.';
        }

        if (payload.actionType === 'READ_SESSION') {
            var pages = payload.pagesTotal || 0;
            var pStr  = pages + '\u00a0page' + (pages > 1 ? 's' : '');
            var text  = '\uD83D\uDCDA J\'ai lu ' + pStr + ' aujourd\'hui\u00a0!';
            if (payload.book && payload.book.title) {
                text += '\n\n\u00ab\u00a0' + payload.book.title + '\u00a0\u00bb';
            }
            return text;
        }

        return '';
    }

    /**
     * Formate une date ISO en temps relatif en français.
     * @param {string} dateStr
     * @returns {string}
     */
    function formatRelativeTime(dateStr) {
        var now  = new Date();
        var date = new Date(dateStr);
        var diff = Math.floor((now - date) / 1000);

        if (diff < 60)     return '\u00e0 l\'instant';
        if (diff < 3600)   return 'il y a ' + Math.floor(diff / 60) + ' min';
        if (diff < 86400)  return 'il y a ' + Math.floor(diff / 3600) + ' h';
        if (diff < 604800) return 'il y a ' + Math.floor(diff / 86400) + ' j';
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    /**
     * Enrichit un post brut avec les données calculées côté client.
     * @param {Object} post           - post brut (doit avoir LEVR_post_likes[] et LEVR_post_comments[])
     * @param {string} currentUserId  - null si non connecté
     * @returns {Object}
     */
    function enrichPost(post, currentUserId) {
        var likes    = post.LEVR_post_likes    || [];
        var comments = post.LEVR_post_comments || [];

        post.likes_count    = likes.length;
        post.liked_by_me    = currentUserId
            ? likes.some(function(l) { return l.user_id === currentUserId; })
            : false;

        var sorted = comments.slice().sort(function(a, b) {
            return new Date(a.created_at) - new Date(b.created_at);
        });

        // Build reply tree: root comments in post.comments, replies nested in comment._replies
        var rootComments = [];
        var commentMap   = {};
        sorted.forEach(function(c) {
            c._replies          = [];
            c._showReplyInput   = false;
            c._replyText        = '';
            commentMap[c.id]    = c;
        });
        sorted.forEach(function(c) {
            if (c.parent_comment_id && commentMap[c.parent_comment_id]) {
                commentMap[c.parent_comment_id]._replies.push(c);
            } else {
                rootComments.push(c);
            }
        });

        post.comments         = rootComments;
        post.comments_count   = sorted.length; // total including replies
        post.showAllComments  = false;
        post.showCommentInput = false;
        post.newComment       = '';

        // Ligne d'activité (dépend de LEVR_books qui doit être attaché avant cet appel)
        post._activity = getActivityLabel(post);

        return post;
    }

    /**
     * Charge likes et commentaires pour une liste de posts (requêtes séparées).
     * Si LEVR_post_likes ou LEVR_post_comments n'existent pas encore, un warning
     * console est affiché mais les posts sont quand même renvoyés (sans données).
     *
     * @param {Array}  posts          - tableau de posts déjà chargés
     * @param {string} currentUserId
     * @param {Object} deferred       - $q deferred à résoudre avec les posts enrichis
     */
    function loadInteractionsAndResolve(posts, currentUserId, deferred) {
        if (!posts.length) {
            deferred.resolve([]);
            return;
        }

        var ids = posts.map(function(p) { return p.id; });

        // IDs de livres uniques (pour la ligne d'activité)
        var bookIds = [];
        posts.forEach(function(p) {
            if (p.book_id && bookIds.indexOf(p.book_id) < 0) bookIds.push(p.book_id);
        });

        // Requête likes (échoue silencieusement si table absente)
        var pLikes = supabase
            .from('LEVR_post_likes')
            .select('post_id, user_id')
            .in('post_id', ids);

        // Requête commentaires (échoue silencieusement si table absente)
        var pComments = supabase
            .from('LEVR_post_comments')
            .select('id, post_id, parent_comment_id, user_id, content, created_at, LEVR_users!user_id(username, profile_picture)')
            .in('post_id', ids)
            .order('created_at', { ascending: true });

        // Requête livres (batch, 0 requête si aucun post n'a de book_id)
        var pBooks = bookIds.length > 0
            ? supabase.from('LEVR_books').select('book_id, title, author, cover_url').in('book_id', bookIds)
            : Promise.resolve({ data: [], error: null });

        Promise.all([pLikes, pComments, pBooks]).then(function(results) {
            var lRes = results[0];
            var cRes = results[1];
            var bRes = results[2];

            var likesByPost    = {};
            var commentsByPost = {};
            var bookById       = {};

            if (!lRes.error) {
                (lRes.data || []).forEach(function(l) {
                    likesByPost[l.post_id] = likesByPost[l.post_id] || [];
                    likesByPost[l.post_id].push(l);
                });
            } else {
                console.warn(
                    '[PostService] LEVR_post_likes indisponible — ex\u00e9cute sql/create_LEVR_post_likes.sql dans Supabase.',
                    lRes.error.message
                );
            }

            if (!cRes.error) {
                (cRes.data || []).forEach(function(c) {
                    commentsByPost[c.post_id] = commentsByPost[c.post_id] || [];
                    commentsByPost[c.post_id].push(c);
                });
            } else {
                console.warn(
                    '[PostService] LEVR_post_comments indisponible — ex\u00e9cute sql/create_LEVR_post_comments.sql dans Supabase.',
                    cRes.error.message
                );
            }

            if (!bRes.error) {
                (bRes.data || []).forEach(function(b) { bookById[b.book_id] = b; });
            }

            // Injecter likes, commentaires et livre dans chaque post, puis enrichir
            posts.forEach(function(p) {
                p.LEVR_post_likes    = likesByPost[p.id]               || [];
                p.LEVR_post_comments = commentsByPost[p.id]            || [];
                p.LEVR_books         = p.book_id ? (bookById[p.book_id] || null) : null;
            });

            deferred.resolve(posts.map(function(p) {
                return enrichPost(p, currentUserId);
            }));
        }).catch(function(e) {
            // En cas d'erreur réseau totale, renvoyer les posts sans interactions
            console.error('[PostService] loadInteractionsAndResolve catch:', e);
            posts.forEach(function(p) {
                p.LEVR_post_likes    = p.LEVR_post_likes    || [];
                p.LEVR_post_comments = p.LEVR_post_comments || [];
                p.LEVR_books         = p.LEVR_books         || null;
            });
            deferred.resolve(posts.map(function(p) { return enrichPost(p, currentUserId); }));
        });
    }

    // ────────────────────────────────────────────────────────────────────────
    // Service public
    // ────────────────────────────────────────────────────────────────────────

    var service = {

        generateContent:    generateContent,
        formatRelativeTime: formatRelativeTime,
        getActivityLabel:   getActivityLabel,

        // ── Modale de création ───────────────────────────────────────────────

        /**
         * Ouvre la modale avec contenu et image pré-remplis.
         * @param {Object} payload - { actionType, book, fromShelf, toShelf }
         */
        openModal: function(payload) {
            $rootScope.postModal = {
                show:       true,
                payload:    payload,
                content:    generateContent(payload),
                imageUrl:   (payload.book && payload.book.cover_url) ? payload.book.cover_url : '',
                previewUrl: (payload.book && payload.book.cover_url) ? payload.book.cover_url : '',
                imageFile:  null,
                uploading:  false,
                saving:     false,
                error:      ''
            };
        },

        /**
         * Ouvre la modale en mode création manuelle (aucun livre ni étagère liés).
         * Utilisé depuis "Mon profil → Commencer un post".
         */
        openManualModal: function() {
            $rootScope.postModal = {
                show:       true,
                payload:    { actionType: 'MANUAL' },
                content:    '',
                imageUrl:   '',
                previewUrl: '',
                imageFile:  null,
                uploading:  false,
                saving:     false,
                error:      ''
            };
        },

        /** Ferme la modale. */
        closeModal: function() {
            $rootScope.postModal.show = false;
        },

        // ── Storage ──────────────────────────────────────────────────────────

        /**
         * Upload une image dans le bucket levr-posts.
         * @param {File}   file
         * @param {string} userId
         * @returns {Promise<string>} URL publique
         */
        uploadImage: function(file, userId) {
            var deferred = $q.defer();
            if (!file) { deferred.reject('Aucun fichier'); return deferred.promise; }

            var ext      = file.name.split('.').pop();
            var filePath = userId + '/' + Date.now() + '.' + ext;

            supabase.storage
                .from('levr-posts')
                .upload(filePath, file, { cacheControl: '3600', upsert: false })
                .then(function(response) {
                    if (response.error) {
                        console.error('[PostService] uploadImage error:', response.error);
                        deferred.reject(buildErrMsg(response.error));
                        return;
                    }
                    var urlData = supabase.storage.from('levr-posts').getPublicUrl(filePath);
                    deferred.resolve(urlData.data.publicUrl);
                })
                .catch(function(e) { deferred.reject(e); });

            return deferred.promise;
        },

        // ── CRUD Posts ───────────────────────────────────────────────────────

        /**
         * Crée un post.
         * Le select ne joint PAS les likes/commentaires (le post est nouveau, il en a 0).
         * @param {Object} data - { bookId, actionType, fromShelf, toShelf, content, imageUrl }
         * @returns {Promise<Object>} post enrichi
         */
        createPost: function(data) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) { deferred.reject('Non authentifi\u00e9'); return; }

                var row = {
                    user_id:     user.id,
                    book_id:     data.bookId     || null,
                    action_type: data.actionType || 'MANUAL',
                    from_shelf:  data.fromShelf  || null,
                    to_shelf:    data.toShelf    || null,
                    content:     data.content,
                    image_url:   data.imageUrl   || null
                };

                console.log('[PostService] createPost payload:', row);

                supabase
                    .from('LEVR_posts')
                    .insert([row])
                    // Pas de join likes/comments ici : le post vient d'être créé, il en a 0
                    .select('*, LEVR_users!user_id(username, profile_picture)')
                    .then(function(response) {
                        console.log('[PostService] createPost response:', response.data, response.error);
                        if (response.error) {
                            deferred.reject(buildErrMsg(response.error));
                            return;
                        }
                        var post = response.data[0];
                        post.LEVR_post_likes    = [];
                        post.LEVR_post_comments = [];
                        // Données livre depuis le payload (le INSERT RETURNING ne joint pas LEVR_books)
                        post.LEVR_books = data.bookData || null;
                        deferred.resolve(enrichPost(post, user.id));
                    });
            }).catch(function(e) {
                console.error('[PostService] createPost auth error:', e);
                deferred.reject(buildErrMsg(e));
            });

            return deferred.promise;
        },

        /**
         * Supprime un post (et ses likes/commentaires par cascade SQL).
         * @param {string} postId
         * @returns {Promise}
         */
        deletePost: function(postId) {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) { deferred.reject('Non authentifi\u00e9'); return; }

                supabase
                    .from('LEVR_posts')
                    .delete()
                    .eq('id', postId)
                    .eq('user_id', user.id)
                    .then(function(response) {
                        if (response.error) {
                            console.error('[PostService] deletePost error:', response.error);
                            deferred.reject(buildErrMsg(response.error));
                            return;
                        }
                        deferred.resolve();
                    });
            }).catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Charge le feed global.
         * Étape 1 : posts + auteur (requête principale — échoue seulement si LEVR_posts est absent)
         * Étape 2 : likes + commentaires (requêtes séparées — dégradent silencieusement)
         * @param {number} limit  (défaut 30)
         * @param {number} offset (défaut 0)
         * @returns {Promise<Array>}
         */
        getAgoraFeed: function(limit, offset) {
            var deferred = $q.defer();
            var from = offset || 0;
            var to   = from + (limit || 30) - 1;

            AuthService.getUser().then(function(user) {
                var currentUserId = user ? user.id : null;

                supabase
                    .from('LEVR_posts')
                    .select('*, LEVR_users!user_id(username, profile_picture)')
                    .order('created_at', { ascending: false })
                    .range(from, to)
                    .then(function(res) {
                        if (res.error) {
                            console.error('[PostService] getAgoraFeed error:', res.error);
                            deferred.reject(buildErrMsg(res.error));
                            return;
                        }
                        loadInteractionsAndResolve(res.data || [], currentUserId, deferred);
                    })
                    .catch(function(e) { deferred.reject(buildErrMsg(e)); });
            }).catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Charge les posts de l'utilisateur connecté (pour "Mon profil").
         * @returns {Promise<Array>}
         */
        getMyPosts: function() {
            var deferred = $q.defer();

            AuthService.getUser().then(function(user) {
                if (!user) { deferred.resolve([]); return; }

                supabase
                    .from('LEVR_posts')
                    .select('*, LEVR_users!user_id(username, profile_picture)')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .then(function(res) {
                        if (res.error) {
                            console.error('[PostService] getMyPosts error:', res.error);
                            deferred.reject(buildErrMsg(res.error));
                            return;
                        }
                        loadInteractionsAndResolve(res.data || [], user.id, deferred);
                    })
                    .catch(function(e) { deferred.reject(buildErrMsg(e)); });
            }).catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Charge les posts d'un utilisateur par son userId (pour profil public).
         * @param {string} userId
         * @returns {Promise<Array>}
         */
        listUserPosts: function(userId) {
            var deferred = $q.defer();

            supabase
                .from('LEVR_posts')
                .select('*, LEVR_users!user_id(username, profile_picture)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .then(function(res) {
                    if (res.error) {
                        console.error('[PostService] listUserPosts error:', res.error);
                        deferred.reject(buildErrMsg(res.error));
                        return;
                    }
                    loadInteractionsAndResolve(res.data || [], null, deferred);
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        // ── Likes ────────────────────────────────────────────────────────────

        /**
         * Bascule le like d'un post (optimiste).
         * @param {Object} post          - objet post enrichi (modifié en place)
         * @param {string} currentUserId
         * @returns {Promise}
         */
        toggleLike: function(post, currentUserId) {
            var deferred = $q.defer();
            var wasLiked = post.liked_by_me;

            post.liked_by_me  = !wasLiked;
            post.likes_count += wasLiked ? -1 : 1;

            if (wasLiked) {
                supabase
                    .from('LEVR_post_likes')
                    .delete()
                    .eq('post_id', post.id)
                    .eq('user_id', currentUserId)
                    .then(function(response) {
                        if (response.error) {
                            post.liked_by_me = wasLiked;
                            post.likes_count += 1;
                            deferred.reject(buildErrMsg(response.error));
                        } else {
                            deferred.resolve();
                        }
                    });
            } else {
                supabase
                    .from('LEVR_post_likes')
                    .insert([{ post_id: post.id, user_id: currentUserId }])
                    .then(function(response) {
                        if (response.error) {
                            post.liked_by_me = wasLiked;
                            post.likes_count -= 1;
                            deferred.reject(buildErrMsg(response.error));
                        } else {
                            deferred.resolve();
                        }
                    });
            }

            return deferred.promise;
        },

        // ── Commentaires ─────────────────────────────────────────────────────

        /**
         * Ajoute un commentaire sur un post (optimiste).
         * @param {Object} post        - objet post enrichi (modifié en place)
         * @param {string} content     - texte du commentaire
         * @param {Object} currentUser - { id, username, profile_picture }
         * @returns {Promise}
         */
        addComment: function(post, content, currentUser) {
            var deferred = $q.defer();

            if (!content || !content.trim()) {
                deferred.reject('Commentaire vide');
                return deferred.promise;
            }

            var tempId = 'temp_' + Date.now();
            var tempComment = {
                id:         tempId,
                post_id:    post.id,
                user_id:    currentUser.id,
                content:    content.trim(),
                created_at: new Date().toISOString(),
                LEVR_users: {
                    username:        currentUser.username,
                    profile_picture: currentUser.profile_picture || null
                },
                _pending: true
            };

            post.comments.push(tempComment);
            post.comments_count++;
            post.newComment = '';
            post.showAllComments = true;

            supabase
                .from('LEVR_post_comments')
                .insert([{
                    post_id: post.id,
                    user_id: currentUser.id,
                    content: content.trim()
                }])
                .select('id, user_id, content, created_at, LEVR_users!user_id(username, profile_picture)')
                .then(function(response) {
                    if (response.error) {
                        var idx = -1;
                        for (var i = 0; i < post.comments.length; i++) {
                            if (post.comments[i].id === tempId) { idx = i; break; }
                        }
                        if (idx > -1) post.comments.splice(idx, 1);
                        post.comments_count--;
                        deferred.reject(buildErrMsg(response.error));
                        return;
                    }
                    var real = response.data[0];
                    real._pending = false;
                    var idx = -1;
                    for (var i = 0; i < post.comments.length; i++) {
                        if (post.comments[i].id === tempId) { idx = i; break; }
                    }
                    if (idx > -1) post.comments[idx] = real;
                    deferred.resolve(real);
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Supprime un commentaire (optimiste).
         * @param {Object} post          - objet post enrichi (modifié en place)
         * @param {Object} comment       - commentaire à supprimer
         * @param {string} currentUserId
         * @returns {Promise}
         */
        deleteComment: function(post, comment, currentUserId) {
            var deferred = $q.defer();

            var idx = -1;
            for (var i = 0; i < post.comments.length; i++) {
                if (post.comments[i].id === comment.id) { idx = i; break; }
            }
            if (idx > -1) post.comments.splice(idx, 1);
            // Decrement total: 1 for the comment + its replies
            post.comments_count -= (1 + (comment._replies ? comment._replies.length : 0));

            supabase
                .from('LEVR_post_comments')
                .delete()
                .eq('id', comment.id)
                .eq('user_id', currentUserId)
                .then(function(response) {
                    if (response.error) {
                        if (idx > -1) post.comments.splice(idx, 0, comment);
                        post.comments_count += (1 + (comment._replies ? comment._replies.length : 0));
                        deferred.reject(buildErrMsg(response.error));
                    } else {
                        deferred.resolve();
                    }
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Ajoute une réponse à un commentaire (optimiste).
         * @param {Object} post           - objet post enrichi
         * @param {Object} parentComment  - commentaire parent (modifié en place)
         * @param {string} content        - texte de la réponse
         * @param {Object} currentUser    - { id, username, profile_picture }
         * @returns {Promise}
         */
        addReply: function(post, parentComment, content, currentUser) {
            var deferred = $q.defer();

            if (!content || !content.trim()) {
                deferred.reject('Réponse vide');
                return deferred.promise;
            }

            var tempId = 'temp_' + Date.now();
            var tempReply = {
                id:                tempId,
                post_id:           post.id,
                parent_comment_id: parentComment.id,
                user_id:           currentUser.id,
                content:           content.trim(),
                created_at:        new Date().toISOString(),
                LEVR_users: {
                    username:        currentUser.username,
                    profile_picture: currentUser.profile_picture || null
                },
                _replies:  [],
                _pending:  true
            };

            parentComment._replies = parentComment._replies || [];
            parentComment._replies.push(tempReply);
            post.comments_count++;
            parentComment._showReplyInput = false;
            parentComment._replyText      = '';

            supabase
                .from('LEVR_post_comments')
                .insert([{
                    post_id:           post.id,
                    parent_comment_id: parentComment.id,
                    user_id:           currentUser.id,
                    content:           content.trim()
                }])
                .select('id, post_id, parent_comment_id, user_id, content, created_at, LEVR_users!user_id(username, profile_picture)')
                .then(function(response) {
                    if (response.error) {
                        var idx = -1;
                        for (var i = 0; i < parentComment._replies.length; i++) {
                            if (parentComment._replies[i].id === tempId) { idx = i; break; }
                        }
                        if (idx > -1) parentComment._replies.splice(idx, 1);
                        post.comments_count--;
                        deferred.reject(buildErrMsg(response.error));
                        return;
                    }
                    var real = response.data[0];
                    real._pending = false;
                    real._replies = [];
                    var idx = -1;
                    for (var i = 0; i < parentComment._replies.length; i++) {
                        if (parentComment._replies[i].id === tempId) { idx = i; break; }
                    }
                    if (idx > -1) parentComment._replies[idx] = real;
                    deferred.resolve(real);
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        },

        /**
         * Supprime une réponse (optimiste).
         * @param {Object} post           - objet post enrichi
         * @param {Object} parentComment  - commentaire parent
         * @param {Object} reply          - réponse à supprimer
         * @param {string} currentUserId
         * @returns {Promise}
         */
        deleteReply: function(post, parentComment, reply, currentUserId) {
            var deferred = $q.defer();

            var idx = -1;
            for (var i = 0; i < parentComment._replies.length; i++) {
                if (parentComment._replies[i].id === reply.id) { idx = i; break; }
            }
            if (idx > -1) parentComment._replies.splice(idx, 1);
            post.comments_count--;

            supabase
                .from('LEVR_post_comments')
                .delete()
                .eq('id', reply.id)
                .eq('user_id', currentUserId)
                .then(function(response) {
                    if (response.error) {
                        if (idx > -1) parentComment._replies.splice(idx, 0, reply);
                        post.comments_count++;
                        deferred.reject(buildErrMsg(response.error));
                    } else {
                        deferred.resolve();
                    }
                })
                .catch(function(e) { deferred.reject(buildErrMsg(e)); });

            return deferred.promise;
        }

    };

    return service;
}]);
