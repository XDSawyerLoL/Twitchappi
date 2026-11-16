# SWAPP — rejet AdSense « Contenu à faible valeur informative » (16 novembre 2026)

## Motif communiqué par Google
« Contenu à faible valeur informative ». Ce motif porte sur la valeur réelle du site : informations ou services authentiques, qualité éditoriale, maintenance, intérêt des utilisateurs. Il ne se résout pas avec un nombre artificiel de mots, une balise SEO ni en multipliant des pages similaires. **Aucune approbation AdSense n'est acquise.**

Source officielle : https://support.google.com/adsense/answer/10015918?hl=fr

## Constats vérifiés
- La version publique de /actus renvoyait principalement le catalogue SPA et du texte de présentation ; les cartes des articles publiés dépendaient de JavaScript et d'appels réseau.
- La version publique des mentions légales et de la confidentialité indiquait encore que des informations essentielles étaient incomplètes. Ne jamais inventer identité juridique, adresse professionnelle, e-mail ou politique RGPD.
- Dans le dépôt, la validation standard permettait la publication de textes courts. La présence d'une source officielle n'est pas une preuve de valeur éditoriale originale.
- Un refus AdSense est distinct d'un éventuel avertissement ou d'une action manuelle Search Console.

## Corrections de code en préparation de déploiement
1. /actus : sélection des **seules publications CMS à statut published**, avec titre, résumé, date et URL accessible dans le HTML initial. Pas de retour à Firestore, pas de brouillons, pas de contenu inventé. Source MySQL mise en cache cinq minutes.
2. Script de tri éditorial en lecture seule :
   `node tools/swapp-adsense-editorial-audit.js`
   `node tools/swapp-adsense-editorial-audit.js --json`
   Ce script examine les *releases* versionnées du dépôt ; **il ne consulte pas MySQL Hostinger**. Seuils de relecture internes, pas critères officiels de Google. Il ne dépublie rien.
3. Tests couvrant les brouillons, l'échappement HTML et les données présentes avant JavaScript.

## Ce qui ne peut pas être corrigé par un simple commit
- Renseigner, dans la configuration Hostinger, l'identité légale et les coordonnées authentiques prévues dans docs/SWAPP_ADSENSE_REVIEW_20261019.md, puis valider effectivement les pages légales.
- Vérifier la réception de contact@swapp.tv et la conformité réelle du traitement des données et cookies, y compris CMP Google si requise.
- Revoir manuellement les articles à risque : recopiages ou réécritures de communiqués, textes sans analyse originale, pages presque identiques, affirmations non sourcées, pages non abouties. Conserver les articles utiles ; compléter les autres avec observations, méthode, limites, conséquences pratiques et sources primaires.
- Vérifier que les rubriques publiques ne présentent pas de listes vides, d'actions factices, d'erreurs 403/503, de challenges anti-bot aux robots légitimes ou de liens cassés.
- Vérifier la réalité des visites et interactions : un référencement et une audience ne sont pas fabriqués par le code.
- Déployer le nouveau code sur Hostinger. Un commit master n'est **pas** une preuve de fonctionnement public.

## Contrôle après déploiement
- Inspecter la réponse **HTML initiale** de https://swapp.tv/actus : présence de `data-swapp-editorial-ssr="1"` et de vrais liens `/actus/...`, sans brouillons.
- Contrôler plusieurs articles dans un navigateur privé, sans compte, et la lisibilité sur mobile.
- Contrôler https://swapp.tv/mentions-legales, /confidentialite, /contact et /cookies avec leurs données exactes.
- Contrôler le serveur/CDN, /sitemap.xml et les pages indexables. Ne pas lancer de réexamen si l'accès automatisé fonctionne de façon intermittente.
- Refaire une vérification éditoriale de contenus **sur la vraie base MySQL**, pas seulement sur les releases du dépôt.

## Demande de réexamen
La demander via **AdSense → Sites** uniquement lorsque les problèmes constatés sont réellement résolus sur le site public. Aucun seuil chiffré de pages ni délai d'approbation ne peut être garanti.

## Actions éditoriales complémentaires — 16 novembre 2026

### Deux dossiers approfondis et vérifiés
- `xbox-25-jeux-originaux-pc-retrocompatibilite-novembre-2026` : dossier étendu (1 332 → 4 885 caractères), avec distinctions catalogue/Game Pass, nouveaux succès, choix selon les genres et précautions avant achat. Sources officielles Xbox Wire et page de compatibilité Xbox.
- `ps5-qssr-spider-man-2-arc-raiders-no-mans-sky-2026` : dossier étendu (1 278 → 4 163 caractères), statut des différentes mises à jour, distinction QSSR/PSSR et protocole de comparaison honnête. Sources PlayStation Blog et notes de version Insomniac.
- Les deux nouvelles versions sont enregistrées dans les releases versionnées, et non introduites comme de nouveaux articles dupliqués.
- Le module `editorial-release-sync.js` ne réécrit un article MySQL existant que si son contenu, son résumé et ses sources correspondent **exactement** à la version précédente. Les versions manuellement modifiées, retirées ou provenant d'une autre source sont conservées. Aucune édition MySQL n'est revendiquée sans déploiement et contrôle.

### Guide durable original, au-delà des communiqués
- Nouvelle page `/guides/choisir-communaute-gaming` : grille concrète de sélection, critères d'activité, modération, disponibilité effective des joueurs, distinction entre Discord, live et serveur de jeu, sécurité des nouveaux membres.
- Page native avec HTML complet sans JS, liens internes vers SERVEUR+ et Explorer, déclaration de sources et limites de la méthode, et inscription dans le sitemap.
- Aucun serveur, chiffre de membres, classement ou témoignage inventé.

### Prévention des contenus faibles à venir
- Barème éditorial interne dans `modules/swapp-news/editorial-quality.js` : un article substantiel, un résumé utile et une source HTTPS minimale. Ce barème est **interne** ; il ne représente **pas** les critères chiffrés de Google.
- À partir du 17 novembre 2026 (UTC), les nouvelles releases qui échouent au contrôle sont exclues des candidats publiables sans bloquer les anciennes publications.
- Les éditeurs peuvent consulter les éléments en attente via `/api/editor/actus/quality-queue` après authentification. Les nouvelles publications dans le Studio sont également contrôlées en production.
- **Important** : un contrôle automatique ne prouve ni l'originalité ni l'exactitude du fond. Tout article exige encore une relecture éditoriale avant publication.

### Vérifications indispensables avant réexamen
1. Déployer le code sur Hostinger ; contrôler le rendu réel de `/actus` et `/guides/choisir-communaute-gaming`, ainsi que les deux articles révisés.
2. Examiner le résultat des mises à jour MySQL : le contenu ne doit être enrichi que si la version d'origine était intacte.
3. Renseigner les pages légales avec **les informations authentiques**, en particulier l'éditeur réel, les coordonnées de contact et les mentions RGPD. Aucune adresse ou identité n'a été inventée.
4. Examiner les autres articles dans la vraie base MySQL. L'audit des releases ne suffit pas à lui seul.
5. Valider que les robots légitimes ne reçoivent pas d'erreur CDN, puis tester la navigation sur mobile et sans connexion.
6. Demander le réexamen Google uniquement lorsque le site public est durablement conforme.

Références : https://support.google.com/adsense/answer/10015918?hl=fr ; https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=fr .
