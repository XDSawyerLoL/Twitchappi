'use strict';

// A configured Firebase SDK is not proof that SWAPP accounts were read or
// durably written. Fail closed if startup fell back to a local JSON file.
function accountPersistenceStatus({firestoreOk=false,persistence='',userCount=0}={}){
 const source=String(persistence||'');
 const durable=!!firestoreOk&&/^firestore:(?:oryon_users|oryon_state|write-ok):/.test(source);
 const populated=Number.isInteger(userCount)&&userCount>0;
 const safe=durable&&populated;
 return {
  safe,
  warning:safe?null:!firestoreOk?
   'Stockage Firestore non configuré ou indisponible. Sauvegarde des comptes requise avant déploiement.':
   !durable?
    'Comptes non confirmés dans Firestore : lecture/écriture locale ou échec détecté. Aucun redéploiement sans sauvegarde.':
    'Aucun compte chargé : vérifier le nombre attendu et la sauvegarde avant déploiement.'
 };
}
module.exports={accountPersistenceStatus};
