# SWAPP AI & Robotique — veille native (phase 1)

Branche de développement : `feat/swapp-ai-robotics-watch-20261110`.

## Objectif
Ajouter les rubriques **IA**, **Robotique** puis **Future** à SWAPP, avec un flux transversal **Live News**. Conserver Gaming, lives, guides, Social et la base MySQL Hostinger. Aucun appel à ChatGPT ni API payante pour la collecte.

## Livré dans cette branche
`tools/swapp-tech-watch.js` récupère plusieurs flux publics en HTTPS, avec délai d'attente, limite de taille, dates des sources, déduplication SHA-256 par source + URL, et stockage JSON atomique. Les échecs d'un flux ne bloquent pas les autres. Les anciens candidats sont préservés. Exécution manuelle : `node tools/swapp-tech-watch.js`.

Le fichier `data/swapp-tech-watch-candidates.json` est un **registre de candidats non vérifiés**, pas un manifeste de publication. Aucun de ces éléments n'est publié automatiquement. Les flux peuvent changer ou être indisponibles : contrôler les URL et le fonctionnement avant activation.

## Phase 2 — à réaliser avant mise en production
1. Ajouter un déclenchement persistant **dans le processus Node Hostinger existant**, avec verrou mono-instance et rythme 6 h, sans nouvelle tâche facturable.
2. Stocker les candidats et états de vérification en MySQL pour éviter la perte au redéploiement et les conflits entre instances. Ne pas confondre flux tiers et communiqué primaire.
3. Vérifier source primaire, date, zone, doublons, vidéo officielle intégrable, miniature du bon sujet, puis créer une release conforme au protocole existant. Sans ces preuves, rester en brouillon.
4. Ajouter les filtres IA/Robotique/Tech, la page Live News et les liens de navigation dans l'interface existante ; ne pas déployer une page vide.
5. Tester le déploiement Hostinger et vérifier les pages publiques, API, vidéos et sources avant de déclarer la fonctionnalité active.

## Sécurité éditoriale
Aucune nouvelle publication automatique à partir d'un titre RSS seul. Pas de reprise d'anciens articles retirés, pas de modification de secrets, pas de Firebase. Ne jamais confondre une démonstration robotique avec un produit autonome commercialisé.
