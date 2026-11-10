// Point d'entrée Hostinger/cPanel.
// Configure dans Hostinger : Application startup file = app.js
require('./server');

// Veille technologique autonome, activable après validation du stockage persistant.
require('./modules/swapp-tech-watch-scheduler').startTechWatch();
