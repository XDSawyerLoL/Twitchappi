# SWAPP Snaps → salon Discord dédié

Salon fourni : **1563559744612999239**. Il est réservé aux annonces de **nouveaux Snaps publics réellement publiés** sur SWAPP, et jamais aux articles, lives, brouillons, Snaps privés ou simples corrections.

## État réel

Le dépôt SWAPP au 26 octobre 2026 possède déjà un outbox Discord pour les **articles** (`SWAPP_DISCORD_WEBHOOK_URL`). Ce webhook reste inchangé.
Il expose aussi un mode `Short` local de 15 secondes, qui **télécharge un clip dans le navigateur** : ce téléchargement **n'est pas** une publication de Snap sur le serveur et ne doit pas envoyer de notification.

Le notifier distinct `modules/swapp-snaps/discord-notifier.js` est prêt, mais **ne fonctionne pas automatiquement sans les deux prérequis ci-dessous** :
1. Le propriétaire du serveur Discord crée un webhook **sur le salon 1563559744612999239**, ou un administrateur possédant les droits appropriés le fait. L'identifiant seul n'autorise pas l'envoi.
2. Le backend de publication de Snaps doit appeler `notifyPublished()` après l'enregistrement réussi d'un Snap public. Aucun événement backend `snap.published` n'existe encore dans ce dépôt ; ne pas brancher cela sur les posts SOCIAL ni sur les clips simplement téléchargés.

## Paramétrage secret sur Hostinger

Dans les variables d'environnement Node du serveur (jamais dans GitHub ou dans le navigateur) :

- `SWAPP_SNAPS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN`
- `SWAPP_SNAPS_DISCORD_ENABLED=true` (facultatif : vrai par défaut si le webhook est valide et `NODE_ENV=production`)

**Ne pas réutiliser** `SWAPP_DISCORD_WEBHOOK_URL`, qui appartient aux actualités. Le nouveau module contrôle via l'API Discord que le webhook est réellement lié au salon **1563559744612999239** et refuse d'envoyer s'il ne correspond pas.

## Branchement au vrai événement de publication

À intégrer **dans la future route serveur Snaps**, et non dans un handler public déclenchable sans authentification :

```js
const {createSnapsDiscordNotifier} =
  require('./modules/swapp-snaps/discord-notifier');
const snapsDiscord = createSnapsDiscordNotifier();

// Uniquement APRES validation de l'auteur, stockage média, modération
// et commit de la publication publique :
await snapsDiscord.notifyPublished({
  id: publishedSnap.id,
  type: 'snap',
  status: 'published',
  visibility: 'public',
  publicUrl: publishedSnap.canonicalUrl, // URL réellement accessible sur swapp.tv
  creatorName: publishedSnap.creatorName,
  caption: publishedSnap.caption,
  thumbnailUrl: publishedSnap.thumbnailUrl,
  publishedAt: publishedSnap.publishedAt
});
```

Le producteur devra enregistrer l'événement dans son **outbox persistant** et réessayer uniquement les envois non confirmés par Discord. `notifyPublished()` renvoie `{sent:true,messageId}` après acquittement réel (paramètre `wait=true`), ou échoue sans affirmer une livraison. Ne pas publier automatiquement tous les anciens Snaps au premier démarrage.

## Vérification

```bash
node --test test/swapp-snaps-discord.test.js
```

Vérifier ensuite le résultat d'une **nouvelle publication réelle** dans le salon. Ne pas déclarer l'intégration opérationnelle avant ce test. Aucune API payante, aucune modification des autres notifications.
