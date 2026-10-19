# SWAPP Fair Discovery — tableau de bord administrateur

## Accès

Après déploiement de la version qui contient le correctif, ouvrir **https://swapp.tv/admin/fair-discovery**.

La page est aussi accessible depuis les liens réservés aux administrateurs du menu utilisateur SWAPP, du Studio rédaction et de la Boutique admin. Elle réutilise le contrôle du rôle administrateur existant (session SWAPP reconnue, `ORYON_ADMIN_LOGINS` et, en production, `ORYON_ADMIN_USER_IDS` valide). **Aucun mot de passe ni identifiant supplémentaire.**

Les deux routes sont privées :
- `GET /admin/fair-discovery` : interface adaptative ordinateur/iPhone/Android ;
- `GET /api/editor/fair-discovery?days=7` ou `days=14` : données agrégées uniquement, authentification administrateur, cache privé désactivé et noindex.

Le code réutilise l'instance Fair Discovery et **le pool MySQL Hostinger déjà en service**, sans nouvelle infrastructure ou base. Aucun workflow GitHub Actions ni service analytique externe.

## Indicateurs

- **Impressions volontaires** : cartes de lives de fiches de jeux ayant été visibles au moins 1,25 seconde avec au moins 50 % de surface à l'écran, après activation volontaire de la mesure sur la page ;
- **Clics vers les lives** : clics après activation volontaire ;
- **Créateurs distincts** : identités publiques de chaîne uniques sur la période ;
- **Taux clic / impression** : nombre de clics agrégés / impressions agrégées, pas des utilisateurs uniques, pas une conversion commerciale ;
- **Visibilité par taille de communauté** : petit (0–25 spectateurs), croissance (26–100), établi (101+), selon audience du live au moment de la recommandation ;
- **Évolution quotidienne** : impressions et part « petits créateurs » quand l'effectif est suffisant ;
- **Jeux représentés** : jusqu'à huit jeux ayant assez de cartes visibles et assez de créateurs distincts.

## Garde-fous statistiques

Le dashboard ne montre **aucun total analytique** avant 50 impressions et 5 créateurs distincts sur la période.
- Les groupes d'audience ayant moins de 10 impressions **ou** 3 créateurs distincts sont masqués.
- Les jours de moins de 10 impressions **ou** 3 créateurs distincts sont masqués.
- Pour un jour visible, la part « petits » est masquée si moins de 10 impressions petits créateurs.
- Les jeux ayant moins de 20 impressions **ou** 3 créateurs distincts ne figurent pas dans les classements.
- « Insuffisant » ne signifie **pas zéro**, ni panne.
- Les créateurs peuvent changer de catégorie avec leur audience ; leur identité est dédupliquée dans le seuil global.

Aucune identité visiteur, IP, cookie, session, historique, ou information individuelle de navigation n'est enregistrée par le nouveau tableau de bord. Les cartes de créateurs sont publiques et agrégées dans la table MySQL déjà créée par v2. La page ne renvoie aucun login individuel de créateur.

## Si les statistiques sont vides

L'API `https://swapp.tv/api/discovery/fair-summary` a déjà confirmé `enabled: true`, mais `sample: insufficient`. C'est un état possible **normal** : le tableau de bord ne fabrique pas de données pour remplir des graphiques.

Pour des résultats :
1. Vérifier que Hostinger sert le commit du tableau de bord via `/api/release`.
2. Consulter une fiche `/jeux/<jeu>` ayant de vrais lives vérifiés.
3. Activer manuellement « Contribuer à une découverte équitable » ; les visites sans ce clic **ne comptent pas**.
4. Vérifier depuis les DevTools la présence éventuelle d'événements POST `/api/discovery/fair-event` qui répondent 202 après visibilité ou clic.
5. Revenir à `/admin/fair-discovery`, choisir 7 ou 14 jours et actualiser.

**Important :** cet échantillon volontaire ne représente pas tout le trafic et ne prouve pas la parité des recommandations. Ne pas attribuer de rémunération ou de rang à un créateur à partir de ces seuls chiffres.

## Vérification et exploitation

Tests : `node --test test/swapp-fair-admin.test.js` puis `npm test` depuis une copie déployable du dépôt. Le contrôle de déploiement `npm run verify:production` nécessite la même version des fichiers sur Hostinger.

Si le site retourne 403 : vérifier le rôle administrateur SWAPP et l'ID épinglé ; ne pas élargir l'accès à tout compte connecté. Si le site retourne 503 : vérifier MySQL et la configuration existante sans publier ni transmettre de secrets. Ne pas désactiver les contrôles de confidentialité pour faire apparaître des données trop peu nombreuses.
