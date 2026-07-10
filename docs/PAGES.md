# Pages du panel

Captures impossibles dans ce dépôt : descriptions ci-dessous. Toutes les pages sont responsives (sidebar → tiroir, colonne « En ligne » → panneau coulissant sur mobile) et respectent `prefers-reduced-motion`.

| Route | Description |
| --- | --- |
| `/login` | Fond animé (particules canvas + halos flottants), logo, nom du projet, bouton « Se connecter avec Discord », gestion des erreurs OAuth (`?error=…`), liens légaux |
| `/dashboard` | Bienvenue + avatar, 6 cartes statistiques animées (amis, demandes, messages non lus, tickets, notifications, en ligne), état du serveur (joueurs, carte, uptime, latence, graphique 24 h, bandeau « données de démonstration »), annonces récentes, activité récente |
| `/profile` | Bannière + avatar Discord, édition bio/statut, langue, confidentialité, préférences de notifications (sauvegarde optimiste avec restauration en cas d'erreur) |
| `/users/[id]` | Profil public : présence, badges, bio, stats, amis en commun, actions contextuelles (ajouter, écrire, bloquer/débloquer, retirer) selon l'état de la relation |
| `/friends` | Trois onglets (amis, demandes reçues/envoyées, bloqués), recherche de membres, amis en ligne en premier |
| `/messages` & `/messages/[id]` | Messagerie complète : conversations à gauche, fil au centre, envoi temps réel, « écrit… », accusés de lecture, réponses, édition, suppression, réactions emoji, pièces jointes avec aperçu image, pagination vers le haut, recherche, sourdine, signalement |
| `/tickets`, `/tickets/new`, `/tickets/[id]` | Liste personnelle, formulaire validé (catégorie, priorité, pièces jointes), fil de discussion avec messages système, transcription téléchargeable, fermeture/réouverture |
| `/staff/tickets` | Vue staff : stats (non assignés, première réponse moyenne), filtres statut/catégorie/priorité/non-assignés/recherche, pagination |
| `/staff/news` | Éditeur d'annonces : brouillon/publication/programmation, épinglage, tags, image |
| `/news`, `/news/[slug]` | Grille d'annonces (épinglées d'abord), lecture avec contenu riche assaini |
| `/notifications` | Centre complet : filtre non lues, marquer lu / tout lire / supprimer |
| `/admin` | Vue d'ensemble + graphiques 30 jours (inscriptions, messages, tickets par statut) |
| `/admin/users` | Recherche, changement de rôle (motif requis), sanctions (avertir/suspendre/bannir temporaire/définitif/note), historique + levée de sanction, synchronisation Discord |
| `/admin/roles` | Matrice rôles ⇄ permissions avec effectifs |
| `/admin/reports` | Traitement des signalements (examiner / résoudre / rejeter) |
| `/admin/audit` | Table filtrable des journaux d'audit, pagination |
| `/admin/settings` | Nom du panel, mode maintenance, activation de la synchronisation des rôles |
| `/legal/terms`, `/legal/privacy` | Pages légales publiques |
| 404 / erreur | Pages personnalisées avec retour à l'accueil |
