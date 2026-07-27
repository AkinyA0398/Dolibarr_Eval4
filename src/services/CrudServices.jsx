// src/services/CrudService.js
import { apiClient } from "../api/apiClient";

// URL de ton backend Flask intermédiaire (si besoin de routes personnalisées comme /remises)
const FLASK_API_URL = "http://localhost:5000/api";

// =========================================================
// 👤 GESTION DES EMPLOYÉS / UTILISATEURS (Endpoints: /users)
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
      login: employeData.identifiant || employeData.login,
      lastname: employeData.nom,
      firstname: employeData.prenom || '',
      gender: employeData.genre === 'homme' ? 'man' : 'woman',
      password: employeData.mdp || '123456',
      job: employeData.poste || '', 
      statut: 1, 
      note_private: `Ref externe: ${employeData.ref_employe || ''}, Heures/semaine: ${employeData.heure_travail_semaine || 35}`
    };

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
// 💰 GESTION DES SALAIRES / REMUNERATIONS (Endpoints: /salaries)
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
 * Créer une fiche de salaire ou enregistrer une rémunération
 */
export const createSalaire = async (salaireData) => {
  try {
    const payload = {
      fk_user: salaireData.fk_user || salaireData.ref_employe,
      datesp: salaireData.date_debut, // Date début de période dans Dolibarr
      dateep: salaireData.date_fin,   // Date fin de période dans Dolibarr
      datep: salaireData.date_paiement || new Date().toISOString().split('T')[0], // Date du paiement
      amount: parseFloat(salaireData.montant),
      label: salaireData.libelle || `Paiement Salaire - ${salaireData.date_debut}`
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
// 📁 DOCUMENT UPLOAD / IMAGES (Endpoints: /documents)
// =========================================================

/**
 * Envoyer un fichier (image/document) rattaché à un employé spécifique
 */
export const uploadEmployeDocument = async (fileBlob, fileName, employeRef) => {
  try {
    const formData = new FormData();
    formData.append('file', fileBlob, fileName);
    formData.append('filename', fileName);
    formData.append('modulepart', 'user');
    formData.append('ref', employeRef);

    // Ne PAS définir 'Content-Type', le navigateur doit s'en charger avec la clef boundary
    return await apiClient('/documents/upload', {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    console.error(`Erreur lors de l'upload du document ${fileName} :`, error);
    throw error;
  }
};


// =========================================================
// 🏷️ CONFIGURATION DES REMISES (Flask Backend / SQLite)
// =========================================================

export const getRemisesConfig = async () => {
  try {
    const res = await fetch(`${FLASK_API_URL}/remises`);
    if (!res.ok) throw new Error("Erreur de récupération des remises");
    return await res.json();
  } catch (error) {
    console.error("Erreur lors du chargement de la grille de remises :", error);
    return [
      { max_days: 0, discount_percentage: 30 },
      { max_days: 7, discount_percentage: 15 },
      { max_days: 30, discount_percentage: 10 },
      { max_days: 9999, discount_percentage: 0 }
    ];
  }
};


// =========================================================
// 🧹 PURGE ET NETTOYAGE GLOBAL
// =========================================================

/**
 * Purge complète des fiches de salaires
 */
export const purgeAllSalaires = async (onProgressLog) => {
  try {
    const salaires = await getSalaires();
    let totalPurged = 0;

    if (!salaires || salaires.length === 0) return { success: true, count: 0 };

    if (onProgressLog) onProgressLog(`Purge de ${salaires.length} fiches de salaires...`);

    for (const sal of salaires) {
      const id = sal.id || sal.rowid;
      if (!id) continue;
      
      await apiClient(`/salaries/${id}`, { method: 'DELETE' });
      totalPurged++;
    }

    return { success: true, count: totalPurged };
  } catch (error) {
    console.error("Erreur lors de la purge globale des salaires :", error);
    throw error;
  }
};