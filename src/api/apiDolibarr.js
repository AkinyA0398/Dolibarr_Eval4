// src/api/apiDolibarr.js
import { apiClient } from './apiClient';

// Fonction utilitaire pour transformer "DD/MM/YYYY" en "YYYY-MM-DD" pour l'API Dolibarr
const formatToDolibarrDate = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  }
  return dateStr;
};

// Convertit un fichier d'image en chaîne Base64 (sans le préfixe data:image/...)
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const apiDolibarr = {
  // 1. Importer une fiche de salaire / enregistrer une rémunération
  createSalaire: async (salaireData) => {
    // Normalisation des dates pour Dolibarr
    const dDebut = salaireData.date_debut || salaireData.datep || salaireData.datesp;
    const dFin = salaireData.date_fin || salaireData.dateep;

    const payload = {
      fk_user: parseInt(salaireData.ref_employe || salaireData.fk_user),
      amount: parseFloat(salaireData.montant || salaireData.amount),
      datep: formatToDolibarrDate(dDebut), 
      datesp: formatToDolibarrDate(dDebut),
      dateep: formatToDolibarrDate(dFin),
      label: salaireData.label || `Salaire - Réf ${salaireData.ref_employe || salaireData.fk_user}`
    };
    
    const paiements = salaireData.paiements || salaireData.paiementsRaw || [];

    console.log('[createSalaire] Payload → POST /salaries :', payload);

    let dolibarrId = null;

    // --- ÉTAPE 1 : Création de la fiche salaire dans Dolibarr ---
    try {
      dolibarrId = await apiClient('/salaries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log('[createSalaire] Fiche salaire créée dans Dolibarr, ID :', dolibarrId);
    } catch (error) {
      console.warn('[createSalaire] Erreur lors de la création de la fiche salaire dans Dolibarr.', error);
      throw error;
    }

    // --- ÉTAPE 2 : Enregistrement des paiements ---
    if (paiements.length > 0) {
      try {
        for (const p of paiements) {
          const pDateStr = p.date || p[0];
          const pMontant = parseFloat(p.montant ?? p[1] ?? 0);
          
          if (pMontant > 0) {
            const paymentPayload = {
              paiementtype: 4, 
              datepaye: formatToDolibarrDate(pDateStr),
              amounts: { [dolibarrId]: pMontant },
              chid: 1,
              accountid: 1
            };
            await apiClient(`/salaries/${dolibarrId}/payments`, {
              method: 'POST',
              body: JSON.stringify(paymentPayload),
            });
          }
        }
        console.log('[createSalaire] Paiements enregistrés avec succès dans Dolibarr.');
      } catch (paymentError) {
        console.warn('[createSalaire] API paiements Dolibarr rejetée :', paymentError);
      }
    }
    
    return dolibarrId;
  },

  getSalaires: async () => {
    try {
      // 1. Récupération simultanée des salaires et de la liste des paiements de salaires
      const [dolibarrSalaries, tousLesPaiements] = await Promise.all([
        apiClient('/salaries?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []),
        apiClient('/salaries/payments?limit=1000&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []) 
      ]);

      // Filtrer les brouillons (status ou statut à 0)
      const validSalaries = (dolibarrSalaries || []).filter(sal => {
        return String(sal.status) !== '0' && String(sal.statut) !== '0';
      });

      const salariesWithPayments = validSalaries.map(sal => {
        const idSalaire = sal.id || sal.rowid;

        const paiementsBruts = (tousLesPaiements || []).filter(paiement => 
          Number(paiement.fk_salary || paiement.fk_salaire) === Number(idSalaire)
        );

        const paiementsFormates = paiementsBruts.map(p => ({
          id: p.id || p.rowid,
          idsalaire: idSalaire,
          montant: p.amount || p.amount_payment || p.montant, // S'adapte selon la clé reçue de Dolibarr
          datep: p.datep || p.date_payment || p.datec          // Idem pour la date du paiement
        }));

        return { 
          ...sal,
          ref_salaire: idSalaire,
          ref_employe: sal.fk_user,
          date_debut: sal.datep || sal.datesp,
          date_fin: sal.dateep,
          montant: sal.amount,
          paiements: paiementsFormates 
        };
      });
      
      return salariesWithPayments;
    } catch (error) {
      console.error("Erreur lors de la récupération des salaires :", error);
      return [];
    }
  },

  // Récupérer les comptes bancaires
  getBankAccounts: async () => {
    try {
      return await apiClient('/bankaccounts?limit=100&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []);
    } catch (error) {
      console.error("Erreur lors de la récupération des comptes bancaires:", error);
      return [];
    }
  },

  // Récupérer les factures clients
  getInvoices: async () => {
    try {
      const invoices = await apiClient('/invoices?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
      return (invoices || []).filter(inv => {
        return String(inv.status) !== '0' && String(inv.statut) !== '0';
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des factures:", error);
      return [];
    }
  },

  // Récupérer les taxes (TVA, etc.) - Endpoint non disponible (501)
  getTaxes: async () => {
    return [];
  },

  // Récupérer les dépenses spéciales - Endpoint non disponible (501)
  getSpecialExpenses: async () => {
    return [];
  },

  resetAllData: async () => {
    try {

      const [salaires, factures] = await Promise.all([
        apiClient('/salaries?limit=500').catch(() => []),
        apiClient('/invoices?limit=500').catch(() => [])
      ]);
      const taxes = [];
      const depenses = [];
      
      // Purge Salaires (Mise en brouillon car DELETE renvoie 404)
      if (salaires && salaires.length > 0) {
        const salaryPromises = [];
        for (const s of salaires) {
          const id = s.rowid || s.id;
          if (id) {
            salaryPromises.push(
              apiClient(`/salaries/${id}`, { method: 'PUT', body: JSON.stringify({ status: 0 }), silent: true }).catch(() => {})
            );
          }
        }
        await Promise.all(salaryPromises);
      }


      // Purge Factures (Mise en brouillon)
      if (factures && factures.length > 0) {
        const invoicePromises = [];
        for (const f of factures) {
          const id = f.rowid || f.id;
          if (id) {
            invoicePromises.push(
              apiClient(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ status: 0 }), silent: true }).catch(() => {})
            );
          }
        }
        await Promise.all(invoicePromises);
      }


      // Purge Taxes
      if (taxes && taxes.length > 0) {
        for (const t of taxes) {
          const id = t.rowid || t.id;
          if (id) {
            await apiClient(`/taxes/${id}`, { method: 'DELETE', silent: true }).catch(() => {});
          }
        }
      }

      // Purge Dépenses Spéciales
      if (depenses && depenses.length > 0) {
        for (const d of depenses) {
          const id = d.rowid || d.id;
          if (id) {
            await apiClient(`/specialexpenses/${id}`, { method: 'DELETE', silent: true }).catch(() => {});
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Erreur lors du nettoyage :", error);
      throw new Error(error.message || "Échec de la purge sécurisée.");
    }
  },
};