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
