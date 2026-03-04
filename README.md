LEVR - Application de Communauté de Lecteurs
Application web mobile-first pour connecter des lecteurs passionnés, construite avec AngularJS 1.8.2 et Supabase.

📋 Prérequis
Python 3.x (pour le serveur local)
Un compte Supabase avec :
Auth configuré
Tables créées (voir section SQL ci-dessous)
Bucket storage configuré
🗄️ Configuration de la base de données Supabase
1. Exécuter le script SQL complet
Allez dans SQL Editor de Supabase et exécutez le fichier LEVR - SQL Setup (Profils & Followers) fourni.

Ce script va créer :

✅ Mise à jour de la table levr_users avec colonnes profil (bio, avatar, visibilité, etc.)
✅ Table levr_followers pour les relations de suivi
✅ Tables levr_books, levr_user_books, levr_reading_progress pour la bibliothèque
✅ Toutes les policies RLS (Row Level Security)
✅ Triggers automatiques pour les compteurs de followers
✅ Index pour optimiser les performances
2. Créer le bucket Storage pour les avatars
Allez dans Storage → Create a new bucket
Nom du bucket : levr-avatars
Public bucket : ✅ Activé (pour permettre l'accès aux images)
Cliquez sur Create bucket
Configurer les politiques du bucket
Dans les Policies du bucket levr-avatars, ajoutez :

Policy pour l'upload (INSERT) :

sql
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'levr-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
Policy pour la lecture (SELECT) :

sql
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'levr-avatars');
Policy pour la suppression (DELETE) :

sql
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'levr-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
3. Configurer les clés Supabase
Dans js/app.js, remplacez :

javascript
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
Où trouver ces clés ?

Allez sur supabase.com
Sélectionnez votre projet
Cliquez sur ⚙️ Settings → API
Copiez l'URL du projet et la clé anon/public
📁 Structure du projet
/levr/
  ├── index.html                          # Page principale
  ├── css/
  │   └── styles.css                     # Styles de l'application
  ├── js/
  │   ├── app.js                         # Configuration AngularJS
  │   ├── services/
  │   │   ├── auth.service.js            # Authentification
  │   │   ├── user.service.js            # Gestion utilisateurs
  │   │   ├── profile.service.js         # Gestion profils (NOUVEAU)
  │   │   └── follow.service.js          # Gestion followers (NOUVEAU)
  │   └── controllers/
  │       ├── sidebar.controller.js      # Navigation
  │       ├── auth.controller.js         # Inscription/Connexion
  │       ├── agora.controller.js        # Liste utilisateurs
  │       ├── settings.controller.js     # Paramètres
  │       ├── profile.controller.js      # Mon profil (NOUVEAU)
  │       └── profile-public.controller.js # Profil public (NOUVEAU)
  └── partials/
      ├── signup.html                    # Page d'inscription
      ├── login.html                     # Page de connexion
      ├── agora.html                     # Page Agora
      ├── settings.html                  # Page Paramètres
      ├── profile_me.html                # Mon profil (NOUVEAU)
      └── profile_public.html            # Profil public (NOUVEAU)
🚀 Installation et lancement
1. Télécharger le projet
Créez la structure de dossiers et copiez tous les fichiers fournis.

2. Configurer Supabase
Exécutez le script SQL complet
Créez le bucket levr-avatars
Ajoutez vos clés dans js/app.js
3. Lancer le serveur local
Ouvrez un terminal dans le dossier levr/ et exécutez :

bash
python -m http.server 8000
4. Ouvrir l'application
Ouvrez votre navigateur et allez sur :

http://localhost:8000
🎯 Fonctionnalités
✅ Authentification
Inscription avec nom d'utilisateur, email, mot de passe
Sélection de 3 genres littéraires préférés (max)
Connexion sécurisée
Routes protégées
👤 Profil Personnel (Mon profil)
Affichage : username, email, bio, genres préférés, visibilité
Édition : modifier bio (max 280 caractères), username (3-20 caractères), genres (max 5)
Avatar : upload d'image de profil (PNG/JPG, max 2MB)
Toggle : profil public/privé
Statistiques : livres lus/en cours/à lire, total pages, genre favori
Compteurs : abonnés / abonnements
🌍 Profil Public
Voir le profil d'autres utilisateurs
Bouton Suivre / Se désabonner
Respect de la confidentialité (profils privés masqués)
Statistiques de lecture si profil public
Lien depuis l'Agora
👥 Système de Followers
Suivre d'autres lecteurs
Compteurs automatiques (followers_count, following_count)
Protection : impossible de se suivre soi-même
Mise à jour temps réel via triggers SQL
👥 Agora
Liste de tous les membres inscrits
Affichage nom + genres préférés
Nouveau : Lien "Voir le profil" sur chaque carte
⚙️ Paramètres
Modification des genres littéraires préférés
🚪 Navigation
Barre latérale avec : Agora, Mon profil, Paramètres, Quitter
Déconnexion sécurisée
🎨 Charte graphique
Fond : 
#0a0a0a (noir profond)
Texte : 
#f5f5f5 (blanc cassé)
Accent : 
#002FA7 (bleu Klein)
Design moderne avec ombres douces et coins arrondis
Mobile-first et entièrement responsive
🔧 Technologies utilisées
AngularJS 1.8.2 : Framework JavaScript
angular-route : Gestion des routes
Supabase : Backend-as-a-Service
Auth : Authentification utilisateurs
Database : PostgreSQL avec RLS
Storage : Hébergement des avatars
CSS3 : Styles modernes avec variables CSS
📝 Schéma de la base de données
Table levr_users
id (UUID) - Lié à auth.users
username (TEXT, UNIQUE) - 3-20 caractères
email (TEXT, UNIQUE)
bio (TEXT) - Max 280 caractères
favorite_genres (TEXT[]) - Max 5 genres
profile_picture (TEXT) - URL Storage
is_public (BOOLEAN) - Visibilité du profil
followers_count (INT) - Nb d'abonnés
following_count (INT) - Nb d'abonnements
Table levr_followers
follower_id (UUID) - Qui suit
followed_id (UUID) - Qui est suivi
Contrainte : pas d'auto-follow
Tables bibliothèque (pour stats futures)
levr_books : Catalogue de livres
levr_user_books : Livres par utilisateur avec statut (LU/EN_COURS/A_LIRE)
levr_reading_progress : Progression de lecture
🔐 Sécurité (RLS)
Toutes les tables ont Row Level Security activé avec policies :

levr_users : Lecture si public OU soi-même, modification seulement par soi
levr_followers : Chacun gère ses propres relations
levr_user_books : Accès uniquement à ses propres livres
Storage : Upload limité à son propre dossier, lecture publique
🐛 Dépannage
L'avatar ne s'uploade pas
Vérifiez que le bucket levr-avatars existe
Vérifiez les policies du bucket
Vérifiez que le fichier est PNG/JPG et < 2MB
Regardez la console (F12) pour les erreurs
Erreur "Could not find the table"
Vérifiez que toutes les tables sont créées (SQL exécuté)
Vérifiez les noms de tables (sensibles à la casse)
Le bouton "Suivre" ne fonctionne pas
Vérifiez les policies sur levr_followers
Vérifiez que les triggers sont créés
Regardez la console pour les erreurs
Les stats ne s'affichent pas
Les stats nécessitent des données dans levr_user_books
Pour le MVP, ajoutez manuellement des livres de test
Message de bienvenue
Quand le client Supabase est initialisé, vous devriez voir :

🚀 LEVR Application initialisée
✅ Client Supabase connecté: https://YOUR-PROJECT.supabase.co
🚀 Prochaines étapes (hors MVP)
📚 Module bibliothèque complet (ajout/suivi de livres)
🏆 Système de badges et défis
💬 Fil d'actualité avec posts des utilisateurs suivis
🔍 Recherche d'utilisateurs et de livres
📊 Statistiques avancées et graphiques
🌐 Intégration API externe (OpenLibrary, Google Books)
📄 Licence
Ce projet est un exemple éducatif. Libre d'utilisation et de modification.

Bonne lecture ! 📚✨ vos propres clés :

javascript
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
Où trouver ces clés ?

Allez sur supabase.com
Sélectionnez votre projet
Cliquez sur ⚙️ Settings → API
Copiez l'URL du projet et la clé anon/public
📁 Structure du projet
/levr/
  ├── index.html                    # Page principale
  ├── css/
  │   └── styles.css               # Styles de l'application
  ├── js/
  │   ├── app.js                   # Configuration AngularJS et Supabase
  │   ├── controllers/
  │   │   ├── sidebar.controller.js    # Navigation latérale
  │   │   ├── auth.controller.js       # Inscription/Connexion
  │   │   ├── agora.controller.js      # Liste des utilisateurs
  │   │   └── settings.controller.js   # Paramètres utilisateur
  │   └── services/
  │       ├── auth.service.js          # Service d'authentification
  │       └── user.service.js          # Service de gestion des utilisateurs
  └── partials/
      ├── signup.html              # Page d'inscription
      ├── login.html               # Page de connexion
      ├── agora.html               # Page Agora
      └── settings.html            # Page Paramètres
🚀 Installation et lancement
1. Télécharger le projet
Clonez ou téléchargez tous les fichiers dans un dossier levr/.

2. Configurer Supabase
Suivez les instructions de la section "Configuration de la base de données Supabase" ci-dessus.

3. Lancer le serveur local
Ouvrez un terminal dans le dossier levr/ et exécutez :

bash
python -m http.server 8000
4. Ouvrir l'application
Ouvrez votre navigateur et allez sur :

http://localhost:8000
🎯 Fonctionnalités
✅ Inscription
Nom d'utilisateur, email et mot de passe
Sélection de 3 genres littéraires préférés maximum
Validation des données côté client
Enregistrement dans Supabase Auth + table LEVR_users
🔐 Connexion
Email et mot de passe
Redirection automatique vers Agora après connexion
Routes protégées (seuls les utilisateurs connectés peuvent accéder)
👥 Agora
Liste de tous les membres inscrits
Affichage du nom d'utilisateur et des genres préférés
Design en grille responsive
⚙️ Paramètres
Modification des genres littéraires préférés
Sauvegarde en temps réel dans Supabase
🚪 Navigation
Barre latérale avec liens Agora, Paramètres, Quitter
Déconnexion avec redirection vers la page de connexion
🎨 Charte graphique
Fond : 
#0a0a0a (noir profond)
Texte : 
#f5f5f5 (blanc cassé)
Accent : 
#002FA7 (bleu Klein)
Design moderne avec ombres douces et coins arrondis
Mobile-first et entièrement responsive
🔧 Technologies utilisées
AngularJS 1.8.2 : Framework JavaScript
angular-route : Gestion des routes
Supabase : Backend-as-a-Service (Auth + Database)
CSS3 : Styles modernes avec variables CSS
📝 Notes importantes
Pas de build : L'application fonctionne directement sans compilation
Chemins relatifs : Tous les liens utilisent des chemins relatifs pour fonctionner sur n'importe quel serveur
UMD Supabase : Chargement via CDN (jsdelivr) pour utiliser window.supabase
Pas de localStorage : Toute la gestion d'état passe par Supabase
🐛 Dépannage
L'application ne se charge pas
Vérifiez que vous avez bien lancé le serveur Python
Vérifiez que vous êtes sur http://localhost:8000 (pas file://)
Ouvrez la console du navigateur (F12) pour voir les erreurs
Erreur "Invalid API key"
Vérifiez que vous avez bien remplacé les clés dans js/app.js
Assurez-vous que la clé anon/public est correcte (pas la clé service_role)
Les utilisateurs ne s'affichent pas
Vérifiez que la table LEVR_users existe dans Supabase
Vérifiez que les politiques RLS sont bien configurées
Ouvrez l'onglet Network dans les DevTools pour voir les requêtes
Message de bienvenue
Quand le client Supabase est initialisé, vous devriez voir ce message dans la console :

🚀 LEVR Application initialisée
✅ Client Supabase connecté: https://YOUR-PROJECT.supabase.co
📄 Licence
Ce projet est un exemple éducatif. Libre d'utilisation et de modification.

Bon développement ! 📚✨

#   l e v r  
 #   l e v r  
 