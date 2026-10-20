'use strict';
// Curated, exact filename-to-skill pairs observed in public guide image indexes.
// Illustrations are game assets owned by their respective rights holders; served by Atelier Gaming.
// No arbitrary third-party URL can be provided by page data.
const FILES={
  "templier": {
    "Coup puissant au bouclier": "te-shield-smite.png",
    "Jugement": "te-judgment.png",
    "Frappe féroce": "te-vicious-strike.png",
    "Frappes successives": "te-pummel.png",
    "Châtiment": "te-punishment.png",
    "Frappe d’égide": "te-warding-strike.png",
    "Annihilation": "te-annihilate.png",
    "Coup féroce fragilisant": "te-debilitating-smash.png",
    "Provocation": "te-taunt.png",
    "Bouclier de protection": "te-shield-of-protection.png",
    "Bannière de champ de bataille": "te-battlefield-banner.png",
    "Bouclier de l’anéantissement": "te-doom-shield.png",
    "Charge au bouclier": "te-shield-rush.png"
  },
  "gladiateur": {
    "Coup féroce anéantissant": "gl-overhead-slam.png",
    "Explosion de fureur": "gl-rage-burst.png",
    "Coup féroce lacérant": "gl-rending-blow.png",
    "Onde broyeuse": "gl-crushing-wave.png",
    "Position de charge": "gl-lunge-stance.png",
    "Bénédiction de Zikel": "gl-zikel-s-blessing.png",
    "Lame vampirique": "gl-lifestealing-blade.png",
    "Frappe bondissante": "gl-leaping-slam.png"
  },
  "assassin": {
    "Coup au cœur": "as-heart-gore.png",
    "Explosion de glyphe": "as-insignia-explosion.png",
    "Entaille rapide": "as-quick-slice.png",
    "Clone illusoire": "as-illusive-clone.png",
    "Pacte de célérité": "as-swift-contract.png",
    "Dague de Triniel": "as-triniel-s-dagger.png",
    "Croc sauvage": "as-savage-fang.png"
  },
  "rodeur": {
    "Flèche à marque": "ra-marking-shot.png",
    "Flèche de tempête": "ra-tempest-shot.png",
    "Pouvoir de Vaizel": "ra-vaizel-s-authority.png",
    "Flèche du Griffon": "ra-griffon-arrow.png",
    "Arc de bénédiction": "ra-bow-of-blessing.png",
    "Tir de soutien": "ra-supporting-fire.png"
  },
  "sorcier": {
    "Feu de l’enfer": "so-hellfire.png",
    "Flamme explosive": "so-blaze.png",
    "Vœu de concentration": "so-wish-of-concentration.png",
    "Entrave d’hiver": "so-winter-s-shackles.png",
    "Amélioration des éléments": "so-element-enhancement.png",
    "Rideau de feu": "so-fire-wall.png",
    "Explosion à retardement": "so-delayed-explosion.png",
    "Tempête de givre": "so-cold-storm.png"
  },
  "spiritualiste": {
    "Combustion": "sm-combustion.png",
    "Fusion des éléments": "sm-elemental-fusion.png",
    "Esprit du feu": "sm-summon-fire-spirit.png",
    "Invocation : Esprit ancien": "sm-summon-ancient-spirit.png",
    "Corrosion": "sm-corrode.png",
    "Protection d’esprit améliorée": "sm-enhance-spirit-s-benediction.png",
    "Attaque conjointe : Corrosion": "sm-jointstrike-corrode.png",
    "Bénédiction des flammes": "sm-flame-blessing.png"
  },
  "clerc": {
    "Lumière de soin": "cl-healing-light.png",
    "Halo de récupération": "cl-radiant-recovery.png",
    "Lumière de restauration": "cl-light-of-regeneration.png",
    "Châtiment de la Terre": "cl-earth-punishment.png",
    "Condamnation": "cl-condemnation.png",
    "Lumière de protection": "cl-light-of-protection.png",
    "Aura noble": "cl-noble-aura.png",
    "Appel de résurrection": "cl-summon-resurrection.png"
  },
  "aede": {
    "Coup percutant": "ch-impactful-crush.png",
    "Coup ombreux": "ch-dark-crush.png",
    "Frappe tournoyante": "ch-spinning-strike.png",
    "Pouvoir de la tempête": "ch-power-of-the-storm.png",
    "Mantra de l’invincibilité": "ch-undefeated-mantra.png",
    "Mantra de sprint": "ch-sprint-mantra.png",
    "Rage de Marchutan": "ch-marchutan-s-wrath.png"
  }
};
const ROOT='https://www.ateliergaming.fr/wp-content/uploads/2026/09/';
function skillIconUrl(slug,skill){
 const filename=FILES[String(slug||'')]?.[String(skill||'')];
 if(!filename||!/^[a-z0-9-]+\.png$/.test(filename))return '';
 return ROOT+filename;
}
module.exports={FILES,skillIconUrl};
