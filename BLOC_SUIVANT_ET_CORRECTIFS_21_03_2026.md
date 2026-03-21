# Correctifs appliqués sur la base v6 blindée

## 1) Boost réellement opérationnel
- durée de boost fixée à 10 minutes
- promotion automatique de la première demande en file d'attente quand le boost actif se termine
- `/get_default_stream` résout maintenant le boost actif puis la file d'attente
- le lecteur se resynchronise côté interface pour charger la chaîne boostée sans rechargement manuel

## 2) Marché à nouveau protégé pour les comptes non admin
- avoir des crédits ne suffit plus à ouvrir le Marché
- accès autorisé seulement si :
  - admin
  - plan illimité/premium/pro
  - entitlement `market` actif
  - ou portefeuille déjà existant avec positions
- si accès refusé, retour vers `/pricing`

## 3) Bloc suivant exécuté sur la même base
- consolidation des états UI du lecteur en mode BOOST
- nettoyage de la logique d'ouverture du Marché pour qu'elle suive la décision serveur
- conservation de la base visuelle v6 validée
