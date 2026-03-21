# Correctifs 21-03-2026

- Admin sansahd reconnu côté serveur et côté interface.
- /twitch_user_status et /api/billing/me enrichis avec login, id, role, is_admin.
- Le marché ne doit plus bloquer l’admin ni s’appuyer sur un état front faux.
- Le lecteur principal a maintenant un vrai fallback si aucun live par défaut n’est trouvé.
- Le carousel des chaînes a un fallback sur les top streams si les follows Twitch échouent.
- Le chat Twitch n’essaie plus de charger un canal invalide.
- Les outils de droite sont remis en cartes séparées pour éviter l’effet superposé.
