(function () {
    'use strict';

    // ── Helpers privés ────────────────────────────────────────────────────────

    function buildErrMsg(err) {
        if (!err)                    return 'Erreur inconnue';
        if (typeof err === 'string') return err;
        var msg = err.message || 'Erreur inconnue';
        if (err.hint)    msg += ' — ' + err.hint;
        if (err.code)    msg += ' [' + err.code + ']';
        if (err.details) msg += ' (' + err.details + ')';
        return msg;
    }

    angular.module('levrApp').factory('BookclubService', [
        '$q', 'supabase', 'AuthService',
        function ($q, supabase, AuthService) {

            // Enrichit un tableau d'objets avec les profils LEVR_users.
            // userField : nom du champ UUID auteur/expéditeur dans chaque item
            //   - 'user_id'    → levr_bookclub_members
            //   - 'created_by' → levr_discussions
            //   - 'sender_id'  → levr_messages
            function enrichWithUsers(items, userField) {
                userField = userField || 'user_id';
                var deferred = $q.defer();
                if (!items || !items.length) { deferred.resolve([]); return deferred.promise; }
                var ids = items.map(function (it) { return it[userField]; }).filter(Boolean);
                if (!ids.length) { deferred.resolve(items); return deferred.promise; }
                supabase
                    .from('LEVR_users')
                    .select('id, username, profile_picture')
                    .in('id', ids)
                    .then(function (resp) {
                        var map = {};
                        (resp.data || []).forEach(function (u) { map[u.id] = u; });
                        deferred.resolve(items.map(function (it) {
                            return angular.extend({}, it, { user: map[it[userField]] || null });
                        }));
                    })
                    .catch(function () { deferred.resolve(items); }); // fail silencieux
                return deferred.promise;
            }

            return {

                // ── LISTES ───────────────────────────────────────────────────

                /**
                 * Récupère les bookclubs dont l'utilisateur connecté est membre.
                 * @returns {Promise<Array>}
                 */
                getMyBookclubs: function () {
                    var deferred = $q.defer();
                    // getUser() valide le JWT côté serveur (plus fiable que getSession()
                    // qui lit uniquement le cache localStorage — peut être null si la
                    // session n'est pas encore hydratée au moment de l'appel).
                    AuthService.getUser().then(function (session) {
                        if (!session) { deferred.reject('Session introuvable — veuillez vous déconnecter puis vous reconnecter.'); return; }
                        // Étape 1 : récupérer les memberships de l'utilisateur
                        supabase
                            .from('levr_bookclub_members')
                            .select('club_id, role, joined_at')
                            .eq('user_id', session.id)
                            .order('joined_at', { ascending: false })
                            .then(function (memResp) {
                                if (memResp.error) { deferred.reject(buildErrMsg(memResp.error)); return; }
                                var memberships = memResp.data || [];
                                if (!memberships.length) { deferred.resolve([]); return; }
                                // Étape 2 : récupérer les clubs par leurs IDs
                                var clubIds = memberships.map(function (m) { return m.club_id; });
                                supabase
                                    .from('levr_bookclubs')
                                    .select('*')
                                    .in('id', clubIds)
                                    .then(function (clubResp) {
                                        if (clubResp.error) { deferred.reject(buildErrMsg(clubResp.error)); return; }
                                        var clubs = clubResp.data || [];
                                        // Construire un map role par club_id
                                        var roleMap = {};
                                        memberships.forEach(function (m) { roleMap[m.club_id] = m; });
                                        var result = clubs
                                            .filter(function (c) { return c && c.id; })
                                            .map(function (club) {
                                                var mem = roleMap[club.id] || {};
                                                return angular.extend({}, club, {
                                                    myRole:    mem.role      || null,
                                                    joined_at: mem.joined_at || null
                                                });
                                            });
                                        deferred.resolve(result);
                                    })
                                    .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Récupère tous les bookclubs publics.
                 * @returns {Promise<Array>}
                 */
                getPublicBookclubs: function () {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_bookclubs')
                        .select('*')
                        .eq('is_public', true)
                        .order('created_at', { ascending: false })
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            deferred.resolve(resp.data || []);
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                // ── DÉTAIL ───────────────────────────────────────────────────

                /**
                 * Récupère un bookclub par son id.
                 * @param {string} clubId
                 * @returns {Promise<Object>}
                 */
                getBookclubById: function (clubId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_bookclubs')
                        .select('*')
                        .eq('id', clubId)
                        .single()
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            deferred.resolve(resp.data);
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Récupère les membres d'un bookclub, enrichis de leur profil LEVR_users.
                 * @param {string} clubId
                 * @returns {Promise<Array>}
                 */
                getMembers: function (clubId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_bookclub_members')
                        .select('user_id, role, joined_at')
                        .eq('club_id', clubId)
                        .order('joined_at', { ascending: true })
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            enrichWithUsers(resp.data || []).then(function (enriched) {
                                deferred.resolve(enriched);
                            });
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Retourne le rôle de l'utilisateur dans un bookclub ('owner', 'member', ou null).
                 * @param {string} clubId
                 * @param {string} userId
                 * @returns {Promise<string|null>}
                 */
                getMyRole: function (clubId, userId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_bookclub_members')
                        .select('role')
                        .eq('club_id', clubId)
                        .eq('user_id', userId)
                        .maybeSingle()
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            deferred.resolve(resp.data ? resp.data.role : null);
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                // ── DISCUSSIONS ──────────────────────────────────────────────

                /**
                 * Récupère une discussion par son id.
                 * @param {string} discussionId
                 * @returns {Promise<Object>}
                 */
                getDiscussionById: function (discussionId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_discussions')
                        .select('id, title, created_by, created_at, club_id')
                        .eq('id', discussionId)
                        .single()
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            deferred.resolve(resp.data);
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Récupère les fils de discussion d'un bookclub.
                 * @param {string} clubId
                 * @returns {Promise<Array>}
                 */
                getDiscussions: function (clubId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_discussions')
                        .select('id, title, created_by, created_at')
                        .eq('club_id', clubId)
                        .order('created_at', { ascending: false })
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            enrichWithUsers(resp.data || [], 'created_by').then(function (enriched) {
                                deferred.resolve(enriched);
                            });
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Crée un nouveau fil de discussion.
                 * @param {string} clubId
                 * @param {string} title
                 * @returns {Promise<Object>}
                 */
                createDiscussion: function (clubId, title) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        supabase
                            .from('levr_discussions')
                            .insert({ club_id: clubId, created_by: session.id, title: title.trim() })
                            .select()
                            .single()
                            .then(function (resp) {
                                if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                                deferred.resolve(resp.data);
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Supprime un fil de discussion ainsi que tous ses messages et réactions.
                 * Requiert que l'appelant soit owner du bookclub (vérification côté serveur via RLS).
                 * @param {string} discussionId
                 * @returns {Promise<boolean>}
                 */
                deleteDiscussion: function (discussionId) {
                    var deferred = $q.defer();
                    // Étape 1 : récupérer les IDs des messages pour supprimer les réactions
                    supabase
                        .from('levr_messages')
                        .select('id')
                        .eq('discussion_id', discussionId)
                        .then(function (msgResp) {
                            if (msgResp.error) { deferred.reject(buildErrMsg(msgResp.error)); return $q.reject(); }
                            var msgIds = (msgResp.data || []).map(function (m) { return m.id; });
                            var reactP = msgIds.length
                                ? supabase.from('levr_message_reactions').delete().in('message_id', msgIds)
                                : $q.when(true);
                            return $q.when(reactP).then(function () {
                                // Étape 2 : supprimer les messages
                                return supabase.from('levr_messages').delete().eq('discussion_id', discussionId);
                            }).then(function (mResp) {
                                if (mResp && mResp.error) { return $q.reject(buildErrMsg(mResp.error)); }
                                // Étape 3 : supprimer la discussion (RLS vérifie que l'appelant est owner)
                                return supabase.from('levr_discussions').delete().eq('id', discussionId);
                            }).then(function (dResp) {
                                if (dResp && dResp.error) { deferred.reject(buildErrMsg(dResp.error)); return; }
                                deferred.resolve(true);
                            });
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                // ── MESSAGES ─────────────────────────────────────────────────

                /**
                 * Récupère les messages d'un fil, enrichis des profils ET des réactions.
                 * @param {string} discussionId
                 * @returns {Promise<Array>}
                 */
                getMessages: function (discussionId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_messages')
                        .select('id, content, sender_id, reply_to_message_id, reply_to_username, reply_to_excerpt, created_at')
                        .eq('discussion_id', discussionId)
                        .order('created_at', { ascending: true })
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            var messages = resp.data || [];
                            enrichWithUsers(messages, 'sender_id').then(function (enriched) {
                                if (!enriched.length) { deferred.resolve([]); return; }
                                var msgIds = enriched.map(function (m) { return m.id; });
                                supabase
                                    .from('levr_message_reactions')
                                    .select('message_id, user_id, emoji')
                                    .in('message_id', msgIds)
                                    .then(function (reactResp) {
                                        var reactMap = {};
                                        (reactResp.data || []).forEach(function (r) {
                                            if (!reactMap[r.message_id]) { reactMap[r.message_id] = {}; }
                                            if (!reactMap[r.message_id][r.emoji]) {
                                                reactMap[r.message_id][r.emoji] = { count: 0, users: [] };
                                            }
                                            reactMap[r.message_id][r.emoji].count++;
                                            reactMap[r.message_id][r.emoji].users.push(r.user_id);
                                        });
                                        enriched.forEach(function (m) {
                                            m._reactions  = reactMap[m.id] || {};
                                            m._showPicker = false;
                                        });
                                        deferred.resolve(enriched);
                                    })
                                    .catch(function () {
                                        enriched.forEach(function (m) {
                                            m._reactions  = {};
                                            m._showPicker = false;
                                        });
                                        deferred.resolve(enriched);
                                    });
                            });
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Envoie un message dans un fil de discussion.
                 * @param {string} discussionId
                 * @param {string} content
                 * @param {Object|null} replyTo  – { id, username, excerpt } ou null
                 * @returns {Promise<Object>}
                 */
                postMessage: function (discussionId, content, replyTo) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        var payload = {
                            discussion_id: discussionId,
                            sender_id:     session.id,
                            content:       content.trim()
                        };
                        if (replyTo && replyTo.id) {
                            payload.reply_to_message_id = replyTo.id;
                            payload.reply_to_username   = replyTo.username || null;
                            payload.reply_to_excerpt    = replyTo.excerpt  || null;
                        }
                        supabase
                            .from('levr_messages')
                            .insert(payload)
                            .select()
                            .single()
                            .then(function (resp) {
                                if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                                deferred.resolve(resp.data);
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Ajoute une réaction emoji (idempotent — 23505 ignoré).
                 * @param {string} messageId
                 * @param {string} emoji
                 */
                addReaction: function (messageId, emoji) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        supabase
                            .from('levr_message_reactions')
                            .insert({ message_id: messageId, user_id: session.id, emoji: emoji })
                            .then(function (resp) {
                                if (resp.error) {
                                    if (resp.error.code === '23505') { deferred.resolve(true); return; }
                                    deferred.reject(buildErrMsg(resp.error));
                                    return;
                                }
                                deferred.resolve(true);
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Retire la réaction emoji de l'utilisateur sur un message.
                 * @param {string} messageId
                 * @param {string} emoji
                 */
                removeReaction: function (messageId, emoji) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        supabase
                            .from('levr_message_reactions')
                            .delete()
                            .eq('message_id', messageId)
                            .eq('user_id',    session.id)
                            .eq('emoji',      emoji)
                            .then(function (resp) {
                                if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                                deferred.resolve(true);
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                // ── MUTATIONS ────────────────────────────────────────────────

                /**
                 * Crée un bookclub et inscrit le créateur comme owner.
                 * @param {string} name
                 * @param {string} description
                 * @param {boolean} isPublic
                 * @returns {Promise<Object>} le bookclub créé
                 */
                createBookclub: function (name, description, isPublic) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        var userId = session.id;
                        supabase
                            .from('levr_bookclubs')
                            .insert({
                                name:        name.trim(),
                                description: (description || '').trim(),
                                is_public:   !!isPublic,
                                created_by:  userId
                            })
                            .select()
                            .single()
                            .then(function (clubResp) {
                                if (clubResp.error) { deferred.reject(buildErrMsg(clubResp.error)); return; }
                                var club = clubResp.data;
                                if (!club || !club.id) {
                                    deferred.reject('Le bookclub a été créé mais les données retournées sont vides. Vérifiez la politique RLS sur levr_bookclubs (SELECT).');
                                    return;
                                }
                                supabase
                                    .from('levr_bookclub_members')
                                    .insert({ club_id: club.id, user_id: userId, role: 'owner' })
                                    .then(function (memResp) {
                                        if (memResp.error) { deferred.reject(buildErrMsg(memResp.error)); return; }
                                        deferred.resolve(club);
                                    })
                                    .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Met à jour les informations d'un bookclub.
                 * @param {string} clubId
                 * @param {Object} payload - champs à mettre à jour
                 * @returns {Promise<Object>}
                 */
                updateBookclub: function (clubId, payload) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_bookclubs')
                        .update(payload)
                        .eq('id', clubId)
                        .select()
                        .single()
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            deferred.resolve(resp.data);
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Supprime un bookclub (cascade : membres, discussions, messages).
                 * @param {string} clubId
                 * @returns {Promise<boolean>}
                 */
                deleteBookclub: function (clubId) {
                    var deferred = $q.defer();
                    supabase
                        .from('levr_bookclubs')
                        .delete()
                        .eq('id', clubId)
                        .then(function (resp) {
                            if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                            deferred.resolve(true);
                        })
                        .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Inscrit l'utilisateur connecté dans un bookclub comme membre.
                 * @param {string} clubId
                 * @returns {Promise<boolean>}
                 */
                joinBookclub: function (clubId) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        supabase
                            .from('levr_bookclub_members')
                            .insert({ club_id: clubId, user_id: session.id, role: 'member' })
                            .then(function (resp) {
                                if (resp.error) {
                                    // 23505 = unique_violation → déjà membre, on traite comme succès
                                    if (resp.error.code === '23505') { deferred.resolve(true); return; }
                                    deferred.reject(buildErrMsg(resp.error));
                                    return;
                                }
                                deferred.resolve(true);
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Retire l'utilisateur connecté d'un bookclub.
                 * @param {string} clubId
                 * @returns {Promise<boolean>}
                 */
                leaveBookclub: function (clubId) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        supabase
                            .from('levr_bookclub_members')
                            .delete()
                            .eq('club_id', clubId)
                            .eq('user_id', session.id)
                            .then(function (resp) {
                                if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                                deferred.resolve(true);
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                },

                /**
                 * Upload une image avatar pour un bookclub et met à jour logo_url en DB.
                 * Chemin dans le bucket levr-bookclubs : <userId>/<clubId>_<timestamp>.<ext>
                 * @param {string} clubId
                 * @param {File}   file
                 * @returns {Promise<string>} URL publique de la nouvelle image
                 */
                uploadAvatar: function (clubId, file) {
                    var deferred = $q.defer();
                    AuthService.getSession().then(function (session) {
                        if (!session) { deferred.reject('Non authentifié'); return; }
                        var ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
                        var path = session.id + '/' + clubId + '_' + Date.now() + '.' + ext;

                        supabase.storage
                            .from('levr-bookclubs')
                            .upload(path, file, { upsert: true })
                            .then(function (storageResp) {
                                if (storageResp.error) {
                                    deferred.reject(buildErrMsg(storageResp.error));
                                    return;
                                }
                                var urlData   = supabase.storage.from('levr-bookclubs').getPublicUrl(path);
                                var publicUrl = urlData.data && urlData.data.publicUrl;
                                if (!publicUrl) { deferred.reject('URL publique introuvable'); return; }

                                supabase
                                    .from('levr_bookclubs')
                                    .update({ logo_url: publicUrl })
                                    .eq('id', clubId)
                                    .select()
                                    .single()
                                    .then(function (resp) {
                                        if (resp.error) { deferred.reject(buildErrMsg(resp.error)); return; }
                                        deferred.resolve(publicUrl);
                                    })
                                    .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                            })
                            .catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    }).catch(function (e) { deferred.reject(buildErrMsg(e)); });
                    return deferred.promise;
                }

            };
        }
    ]);

}());
