# SWAPP ACTUS — Fusion JustPlayer (lot 1)

## État exact
Module développé, intégré dans le code de la branche `feature/swapp-actus-20261014`.
**Non déployé en production ; aucun article JustPlayer importé.** Le catalogue complet et les médias doivent être exportés depuis Fourthwall par le propriétaire et contrôlés avant migration.

Ce module ajoute :
- `/actus` : accueil éditorial HTML indexable ; `/actus/:slug` : article HTML, canonical, Open Graph, NewsArticle JSON-LD.
- `/api/actus` et `/api/actus/:slug` : API publique lecture seule.
- `/actus/studio` : interface de rédaction sous authentification admin.
- `POST /api/editor/actus` : créer un brouillon ; `PATCH /api/editor/actus/:slug` : le modifier.
- `POST /api/editor/actus/:slug/publish` : publier et écrire un événement en outbox **sans envoyer de posts sociaux**.
- `POST /api/editor/actus/import` : importer par lots de 1 à 20 articles JustPlayer, en simulation par défaut.

Stockage Firestore distinct, collections : `swapp_news_articles`, `swapp_news_outbox`, `swapp_news_import_keys`.
Aucun accès aux comptes `oryon_users` et aucune nouvelle dépendance.

## Activation (après validation du staging et sauvegarde Firestore)

```text
SWAPP_NEWS_ENABLED=true
ORYON_ADMIN_LOGINS=<pseudo_admin_existant>
# Ou une clé SWAPP_ADMIN_KEY d'au moins 24 caractères, uniquement en en-tête HTTP.
```

Ne pas transmettre de clés dans l'URL ni dans GitHub. En cas d'indisponibilité Firestore, le module renvoie 503 et ne stocke **rien** en mémoire.

L'administration est interdite à un visiteur. Pour toutes les mutations, un compte admin ou une clé valide doit aussi fournir `X-SWAPP-Editor: 1`, avec une origine de confiance si un Origin est présent. Dans le navigateur, se connecter d'abord avec le compte admin SWAPP puis ouvrir `/actus/studio`.

## Format de migration JustPlayer

Le point d'entrée `/api/editor/actus/import` attend un objet JSON :
```json
{
  "dryRun": true,
  "publish": false,
  "articles": [
    {
      "title": "Titre original depuis JustPlayer",
      "summary": "Chapô d'origine",
      "body": "Texte complet exporté depuis Fourthwall...",
      "category": "Actualités JV",
      "author": "JustPlayer",
      "legacyUrl": "https://justplayer.fr/supporters/posts/266628",
      "originalPublishedAt": "2026-09-05T10:00:00Z",
      "sources": [{"url": "https://justplayer.fr/supporters/posts/266628", "label": "Publication d'origine"}],
      "image": {
        "url": "https://example.com/image-avec-droits.jpg",
        "credit": "Titulaire des droits",
        "rights": "Autorisation documentée"
      }
    }
  ]
}
```
Enregistrer d'abord `dryRun:true`. Le CMS refuse les doublons par slug et URL historique. Pour créer des **brouillons sans les publier**, utiliser `dryRun:false, publish:false`. La publication sera effectuée après revue. Le champ image peut être omis ; toute image publiée doit avoir des droits renseignés.

Import des dates originales conservé, mention et lien vers le contenu d'origine. Le contenu est pour l'instant présenté comme texte et paragraphes ; les tableaux, galeries et embeds nécessitent une conversion éditoriale supplémentaire. **Ne pas désactiver JustPlayer, ni mettre en place de redirection, tant que toutes les pages n'ont pas été vérifiées une par une.**

## Réseaux sociaux et IA

À chaque publication, un événement `article.published` est créé dans `swapp_news_outbox` avec `status: paused`. Aucun appel externe n'est déclenché. Un worker ultérieur devra obtenir les autorisations OAuth des réseaux, les quotas, les visuels et la validation éditoriale avant de pouvoir envoyer un post.

La génération d'articles IA n'est **pas encore installée**. Sa future chaîne sera : sources officielles/RSS → contrôle des doublons → extraction des faits vérifiables → brouillon IA → validation → publication → événements sociaux.

## Tests

```sh
node --test test/news*.test.js
npm run check
```
18 tests locaux réussis le 14 octobre 2026 sur Node 22 : modèles, protection HTML, routes, import, révisions, outbox, contrôle d'accès, protection CSRF.
Le test complet de démarrage sur Hostinger, la migration de contenus et la validation en production restent à réaliser.

## Précautions d'exploitation

- Hostinger déploie automatiquement `master` ; cette branche reste isolée.
- La production utilise actuellement un ancien build dont le déploiement plus récent a échoué : résoudre d'abord le diagnostic de compilation.
- Vérifier la sauvegarde externe Firestore et les rôles administrateur avant une migration réelle.
- Ne pas écrire de code de génération IA ni de publication sociale directement dans `server.js` : garder ces modules indépendants.
