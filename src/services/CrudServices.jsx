// src/services/CrudService.jsx
import { apiClient } from "../api/apiClient";
// Ajustez le chemin selon votre structure
const FLASK_API_URL = "http://localhost:5000/api";

// =========================================================
// GESTION DES EMPLOYÉS / UTILISATEURS (Endpoints: /users)
// =========================================================

/**
 * Récupérer la liste des employés/utilisateurs Dolibarr
 */
export const getEmployes = async () => {
  try {
    const response = await apiClient('/users?limit=100');
    return response || [];
  } catch (error) {
    console.error("Erreur lors de la récupération des employés Dolibarr :", error);
    throw error;
  }
};

/**
 * Créer un nouvel employé dans Dolibarr
 */
export const createEmploye = async (employeData) => {
  try {
    const payload = {
      login: employeData.identifiant,
      lastname: employeData.nom,
      firstname: employeData.prenom || '',
      gender: employeData.genre === 'homme' ? 'man' : 'woman',
      password: employeData.mdp,
      job: employeData.poste, 
      statut: 1, 
      note_private: `Ref externe: ${employeData.ref_employe}, Poste: ${employeData.poste}, Heures/semaine: ${employeData.heure_travail_semaine}`
    };

    console.log("Envoi du payload employé à Dolibarr :", payload);

    return await apiClient('/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("Erreur lors de la création de l'employé Dolibarr :", error);
    throw error;
  }
};

/**
 * Désactiver ou supprimer un employé
 */
export const deleteEmploye = async (userId) => {
  try {
    return await apiClient(`/users/${userId}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error(`Erreur lors de la suppression de l'employé ID ${userId} :`, error);
    throw error;
  }
};


// =========================================================
// GESTION DES SALAIRES / REMUNERATIONS (Endpoints: /salaries)
// =========================================================

/**
 * Récupérer toutes les fiches de salaires
 */
export const getSalaires = async () => {
  try {
    const response = await apiClient('/salaries?limit=100');
    return response || [];
  } catch (error) {
    console.error("Erreur lors de la récupération des salaires :", error);
    throw error;
  }
};

/**
 * Créer une fiche de salaire liée à un utilisateur avec ses paiements fractionnés
 */
export const createSalaire = async (salaireData) => {
  try {
    const payload = {
      fk_user: salaireData.ref_employe,
      date_start: salaireData.date_debut,
      date_end: salaireData.date_fin,
      amount: parseFloat(salaireData.montant),
      payments: salaireData.paiements || [] 
    };

    return await apiClient('/salaries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la rémunération :", error);
    throw error;
  }
};


// =========================================================
// DOCUMENT UPLOAD / IMAGES ZIP (Endpoints: /documents)
// =========================================================

/**
 * Envoyer un fichier (image extraite du ZIP) lié à un employé spécifique dans Dolibarr
 */
export const uploadEmployeDocument = async (fileBlob, fileName, employeId) => {
  try {
    const formData = new FormData();
    formData.append('file', fileBlob, fileName);
    formData.append('filename', fileName);
    formData.append('modulepart', 'user');
    formData.append('ref', employeId);

    return await apiClient('/documents/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': null 
      }
    });
  } catch (error) {
    console.error(`Erreur lors de l'upload de l'image ${fileName} pour l'employé #${employeId} :`, error);
    throw error;
  }
};


// =========================================================
// PURGE ET NETTOYAGE GLOBAL (Bouton Réinitialiser)
// =========================================================

/**
 * Purge complète des salaires insérés (Simulé ou via requêtes DELETE itératives)
 */
export const purgeAllSalaires = async (onProgressLog) => {
  try {
    const salaires = await getSalaires();
    let totalPurged = 0;

    if (!salaires || salaires.length === 0) return { success: true, count: 0 };

    if (onProgressLog) onProgressLog(`Purge de ${salaires.length} fiches de salaires en cours...`);

    for (const sal of salaires) {
      const id = sal.id || sal.rowid;
      if (!id) continue;
      
      await apiClient(`/salaries/${id}`, { method: 'DELETE' });
      totalPurged++;
    }

    return { success: true, count: totalPurged };
  } catch (error) {
    console.error("Erreur lors du nettoyage global des salaires :", error);
    throw error;
  }
};