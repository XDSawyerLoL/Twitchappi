# SWAPP — retrait de l'ancienne identité éditoriale

## État actuel

SWAPP est l'unique marque éditoriale publique pour les articles et la rubrique Actualité. L'ancienne marque JustPlayer ne doit plus être affichée comme rubrique, catégorie ou signature collective sur le site. Les URLs historiques, les crédits, les dates et l'auteur original lorsqu'il s'agit d'une personne sont conservés en provenance interne.

**Ne pas confondre une copie consultable avec un article autonome dans la base SWAPP.** Les articles récupérés en lecture seule depuis Fourthwall restent dépendants du site historique tant qu'ils ne sont pas repris et publiés dans Firestore.

Le fichier `data/justplayer-public-catalog.json` est explicitement partiel : il contient 15 entrées connues (13 articles et 2 vidéos), **pas un export exhaustif du compte**. Le compteur d'articles effectivement publiés dans Firestore n'a pas été vérifié en production.

## Finaliser dans le studio

1. Se connecter au compte administrateur SWAPP et ouvrir `https://swapp.tv/actus/studio`.
2. Choisir **Finaliser la reprise**. L'outil affiche les textes vérifiés récupérés, les copies natives et ceux restant à enregistrer.
3. Pour chaque article encore dépendant de Fourthwall, cliquer **Rendre modifiable**. Cela crée une copie Firestore en **brouillon** : aucun doublon public, aucune publication automatique. Cliquer sur l'article dans *Toutes les publications* pour éditer titre, corps, image, source, catégorie, signature, SEO et date.
4. Contrôler les sources, la **licence/droits des images** et le contenu, puis publier le brouillon. L'article SWAPP prend la priorité sur l'ancienne récupération et conserve la date historique.
5. Contrôler après publication les URL directes, le sommaire, les médias, les images, les vidéos et les liens entrants. Les anciennes URL SWAPP `/actus/justplayer-...` redirigent vers le contenu natif lorsqu'il est publié.
6. Comparer l'inventaire **complet** de Fourthwall (publications visibles, privées, brouillons et vidéos) au contenu natif SWAPP. Résoudre les manques avant toute suppression/désactivation.

Les articles publiés peuvent être **modifiés** depuis *Toutes les publications*. Si un article hérité publié est retiré, l'ancienne version récupérée ne doit pas réapparaître dans le flux public.

## Après vérification exhaustive

- Configurer, quand la plateforme et les domaines le permettent, des **redirections permanentes** `justplayer.fr` → les pages correspondantes `swapp.tv/actus/...`.
- Exporter une **sauvegarde durable** des originaux, images, crédits et données de boutique avant fermeture Fourthwall.
- Vérifier séparément les **deux vidéos** référencées au catalogue : une publication Fourthwall non intégrable ne devient pas automatiquement une vidéo hébergée par SWAPP.
- Une fois la sauvegarde, les redirections et les tests confirmés, désactiver le site / compte JustPlayer dans la console propriétaire si souhaité.

La fusion sur GitHub ne déploie pas systématiquement Hostinger. Et GitHub ne permet **pas** de fermer le compte Fourthwall : cette action dépend du compte concerné.

## Sécurité

Les opérations d'adoption et l'inventaire restent derrière `requireEditor`. Une copie adopte uniquement un texte intégral vérifié d'une entrée connue du catalogue serveur. Le slug, la source et les données de l'article ne viennent pas d'un corps arbitraire envoyé par le navigateur. Les brouillons ne sont pas publiés automatiquement. Les images dont les droits sont encore « à vérifier » bloquent la publication.
