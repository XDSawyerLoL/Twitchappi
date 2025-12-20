// ✅ CODE MODERNE ET OPTIMISÉ

// 1. Structure de données immuable (const)
const USERS_DATA =;

// Sélection du conteneur une seule fois
const listContainer = document.querySelector('#user-list-container');

// 2. Séparation des préoccupations (Logique vs Rendu)
const filterUsers = (users, query) => {
    if (!query) return users;
    const lowerQuery = query.toLowerCase();
    return users.filter(user => user.name.toLowerCase().includes(lowerQuery));
};

const createUserElement = (user) => {
    // 3. Sémantique : Utilisation de <article> ou <li> au lieu de div générique
    // Note : On garde les classes CSS identiques pour ne pas casser le visuel
    const card = document.createElement('li'); 
    card.className = 'user-card';
    card.setAttribute('role', 'button'); // 4. Accessibilité : Indique que c'est cliquable
    card.setAttribute('tabindex', '0');  // Rend l'élément navigable au clavier
    card.dataset.id = user.id;

    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.textContent = user.name; // 5. Sécurité : textContent neutralise automatiquement les attaques XSS

    const roleEl = document.createElement('span');
    roleEl.className = 'role';
    roleEl.textContent = user.role;

    card.append(nameEl, roleEl);
    return card;
};

const renderList = (filterText = '') => {
    const filteredUsers = filterUsers(USERS_DATA, filterText);
    
    // 6. Performance : Utilisation de DocumentFragment
    // Permet de préparer tout le DOM en mémoire avant de l'insérer en une seule fois
    const fragment = document.createDocumentFragment();

    filteredUsers.forEach(user => {
        fragment.appendChild(createUserElement(user));
    });

    // Nettoyage efficace
    listContainer.replaceChildren(fragment); // Plus rapide et sûr que innerHTML = ''
};

// 7. Performance : Event Delegation
// Un seul écouteur sur le parent au lieu d'un par élément
listContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.user-card');
    if (card) {
        console.log(`User selected: ${card.dataset.id}`);
    }
});

// Gestion clavier (Accessibilité pour simuler le click via Entrée)
listContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const card = e.target.closest('.user-card');
        if (card) card.click();
    }
});

// Initialisation
renderList();
