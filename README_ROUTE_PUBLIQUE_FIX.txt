Correctif Swapp route publique /pseudo

Ce paquet corrige le cas où https://swapp.tv/sansahd revient automatiquement vers https://swapp.tv/.

À faire dans Hostinger :
1. Remplacer les fichiers du projet par ceux du zip.
2. Garder Application startup file = app.js.
3. Redémarrer l'application Node.
4. Tester en navigation privée : https://swapp.tv/sansahd

Résultat attendu :
- L'URL reste /sansahd.
- La page publique s'affiche même sans connexion.
- Le compte reste requis seulement pour gérer la chaîne, pas pour voir la page.
