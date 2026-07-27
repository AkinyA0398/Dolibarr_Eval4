import { apiClient } from './apiClient';

// --- HELPERS INTERNES ---

/**
 * Convertit une date (JJ/MM/AAAA, ISO, Unix timestamp) en Timestamp Unix (secondes) valide UTC.
 */
const dateToUnixTimestamp = (dateStr) => {
  if (!dateStr) return Math.floor(Date.now() / 1000);
  if (typeof dateStr === 'number') return dateStr;

  let normalized = String(dateStr).trim();

  // Traitement du format français "JJ/MM/AAAA"
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      normalized = `${year}-${month}-${day}T12:00:00Z`;
    }
  }

  const dateObj = new Date(normalized);
  const ts = Math.floor(dateObj.getTime() / 1000);
  return isNaN(ts) ? Math.floor(Date.now() / 1000) : ts;
};

const normalizeAmount = (value) => {
  if (value == null) return null;
  const sanitized = String(value).replace(',', '.').trim();
  const amount = parseFloat(sanitized);
  return Number.isNaN(amount) ? null : amount;
};

/**
 * Exécute une requête DELETE sécurisée sans faire planter l'application en cas d'erreur 404/FK.
 */
const safeDelete = async (endpoint, log) => {
  try {
    return await apiClient(endpoint, { method: 'DELETE', silent: true });
  } catch (error) {
    if (typeof log === 'function') {
      log(`    ⚠️ ${endpoint} non supprimé : ${error.message || 'erreur inconnue'}`);
    }
    return null;
  }
};

/**
 * Libère et supprime une facture REST Dolibarr.
 */
const unlockAndDeleteInvoice = async (invoiceId, log) => {
  const safeLog = (msg) => { if (typeof log === 'function') log(msg); };

  // 1. Déclasser le paiement (statut "Payée" -> "Validée impayée")
  try {
    await apiClient(`/invoices/${invoiceId}/settounpaid`, { method: 'POST', silent: true });
    safeLog(`    ↳ Facture #${invoiceId} déclassée (settounpaid)`);
  } catch (e) {
    // Échec ignoré
  }

  // 2. Remettre en brouillon (settodraft)
  let isDraft = false;
  try {
    await apiClient(`/invoices/${invoiceId}/settodraft`, {
      method: 'POST',
      body: JSON.stringify({ idwarehouse: 0 }),
      silent: true,
    });
    isDraft = true;
    safeLog(`    ↳ Facture #${invoiceId} remise en brouillon`);
  } catch (e) {
    safeLog(`    ⚠️ Échec remise en brouillon Facture #${invoiceId} : ${e.message || e}`);
  }

  // 3. Purger les paiements rattachés
  try {
    const payments = await apiClient(`/invoices/${invoiceId}/payments`, { silent: true }).catch(() => []);
    if (Array.isArray(payments) && payments.length > 0) {
      await Promise.all(
        payments.map((pay) => {
          const payId = pay.id || pay.rowid;
          return payId ? safeDelete(`/paiements/${payId}`, (msg) => safeLog(`    ├─ Paiement #${payId} : ${msg}`)) : null;
        })
      );
    }
  } catch (err) {
    safeLog(`    ⚠️ Erreur suppression paiements #${invoiceId} : ${err.message || err}`);
  }

  // 4. Supprimer les lignes si brouillon
  if (isDraft) {
    try {
      const invoiceDetails = await apiClient(`/invoices/${invoiceId}`, { silent: true }).catch(() => null);
      if (invoiceDetails && Array.isArray(invoiceDetails.lines)) {
        await Promise.all(
          invoiceDetails.lines.map((line) => {
            const lineId = line.id || line.rowid;
            return lineId ? safeDelete(`/invoices/${invoiceId}/lines/${lineId}`, (msg) => safeLog(`    ├─ Ligne #${lineId} : ${msg}`)) : null;
          })
        );
      }
    } catch (err) {
      safeLog(`    ⚠️ Erreur suppression lignes #${invoiceId} : ${err.message || err}`);
    }
  }

  // 5. Suppression finale
  const result = await safeDelete(`/invoices/${invoiceId}`, (msg) => safeLog(`    ⚠️ Facture #${invoiceId} : ${msg}`));
  if (result !== null) {
    safeLog(`    ✓ Facture #${invoiceId} supprimée`);
  }

  return result !== null;
};

// --- MODULE API DOLIBARR ---

export const apiDolibarr = {
  // --- THIRDPARTIES ---
  getThirdparties: async () => {
    try {
      return await apiClient('/thirdparties?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
    } catch (error) {
      console.error("Erreur récupération tiers :", error);
      return [];
    }
  },

  createThirdparty: async (data) => {
    try {
      const payload = {
        name: data.nom_client || data.name,
        client: 1,
        code_client: "-1"
      };
      return await apiClient('/thirdparties', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Erreur création tiers :", error);
      throw error;
    }
  },

  // --- PRODUCTS ---
  getProducts: async () => {
    try {
      return await apiClient('/products?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
    } catch (error) {
      console.error("Erreur récupération produits :", error);
      return [];
    }
  },

  createProduct: async (data) => {
    try {
      const ref = data.ref_produit || data.ref;

      if (ref) {
        const existing = await apiClient(`/products?sqlfilters=(t.ref:=:'${ref}')`, { silent: true }).catch(() => []);
        if (Array.isArray(existing) && existing.length > 0) {
          return existing[0].id || existing[0].rowid;
        }
      }

      const payload = {
        ref: ref,
        label: data.produit || data.label || '',
        type: 0,
        price: parseFloat(data.pu_hors_Taxe || data.price || 0),
        status: 1,
        status_buy: 1
      };

      return await apiClient('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Erreur création produit :", error);
      throw error;
    }
  },

  // --- INVOICES ---
  getInvoices: async () => {
    try {
      const invoices = await apiClient('/invoices?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
      return (invoices || []).filter(inv => String(inv.status) !== '0' && String(inv.statut) !== '0');
    } catch (error) {
      console.error("Erreur récupération factures :", error);
      return [];
    }
  },

  createInvoice: async (data) => {
    try {
      const payload = {
        socid: data.socid,
        date: dateToUnixTimestamp(data.date_facture || data.date),
        type: 0,
        ref_client: data.num_facture || data.ref_client,
        cond_reglement_id: 1,
        mode_reglement_id: 4
      };

      const echeance = dateToUnixTimestamp(data.date_limite_reglement);
      if (echeance) payload.date_lim_reglement = echeance;

      return await apiClient('/invoices', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Erreur création facture :", error);
      throw error;
    }
  },

  addInvoiceLine: async (invoiceId, data) => {
    try {
      const remiseStr = String(data.remise || "0").replace('%', '').replace(',', '.').trim();
      const labelValue = data.produit || data.desc || data.label || "Ligne de facture";
      const subpriceVal = parseFloat(data.pu_hors_Taxe || data.subprice || 0);

      const payload = {
        fk_product: data.fk_product || null,
        desc: labelValue,
        label: labelValue,
        product_type: 0,
        subprice: subpriceVal,
        price: subpriceVal,
        qty: parseInt(data.quantite || data.qty || 1, 10),
        remise_percent: parseFloat(remiseStr) || 0,
        tva_tx: 0,
        localtax1_tx: 0,
        localtax2_tx: 0,
        pa_ht: 0,
        fk_fournprice: null,
        date_start: null,
        date_end: null,
        fk_code_ventilation: 0,
        info_bits: 0,
        fk_remise_except: null,
        price_base_type: 'HT',
        rang: 0,
        special_code: 0,
        origin: null,
        origin_id: null,
        array_options: [],
        situation_percent: 100,
        fk_prev_id: null,
        fk_unit: null,
        ref_ext: null
      };

      const taxeStr = String(data.taxe || "0").replace('%', '').replace(',', '.').trim();
      if (taxeStr && parseFloat(taxeStr) > 0) {
        payload.tva_tx = parseFloat(taxeStr);
      }

      return await apiClient(`/invoices/${invoiceId}/lines`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Erreur ajout ligne facture :", error);
      throw error;
    }
  },

  validateInvoice: async (invoiceId) => {
    try {
      return await apiClient(`/invoices/${invoiceId}/validate`, {
        method: 'POST',
        body: JSON.stringify({ idwarehouse: 0, notrigger: 0 }),
      });
    } catch (error) {
      console.error("Erreur validation facture :", error);
      throw error;
    }
  },

 // --- PAYMENTS ---
  createPayment: async (data) => {
    try {
      const caisseName = (data.caisse || 'Caisse').trim();

      // 1. Récupération ou création de la banque / caisse
      const bankAccounts = await apiClient('/bankaccounts?limit=100&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []);

      let matchedAccount = Array.isArray(bankAccounts) ? bankAccounts.find(acc =>
        (acc.ref && acc.ref.toLowerCase() === caisseName.toLowerCase()) ||
        (acc.label && acc.label.toLowerCase() === caisseName.toLowerCase())
      ) : null;

      let accountid;
      if (matchedAccount) {
        accountid = matchedAccount.id || matchedAccount.rowid;
      } else {
        const isCash = caisseName.toLowerCase().includes('caisse') || caisseName.toLowerCase().includes('cash');
        const newBank = {
          ref: caisseName.toUpperCase().replace(/\s+/g, '_').substring(0, 12),
          label: caisseName,
          bank: caisseName,
          country_id: 1,
          courant: 1,
          clos: 0,
          type: isCash ? 2 : 1,
          currency_code: 'EUR',
          status: 1
        };
        accountid = await apiClient('/bankaccounts', {
          method: 'POST',
          body: JSON.stringify(newBank),
        });
      }

      const amountValue = normalizeAmount(data.montant || data.amount);
      if (!amountValue || amountValue <= 0) {
        throw new Error('Montant de paiement invalide.');
      }

      const targetInvoiceId = parseInt(data.invoice_id, 10);
      const paymentTimestamp = dateToUnixTimestamp(data.date_reglement || data.date);
      const numAmount = Number(amountValue.toFixed(2));

      // --- Format strict Dolibarr v23 : Objet avec propriété amount uniquement ---
      const payloadDistributed = {
        arrayofamounts: {
          [targetInvoiceId]: {
            amount: numAmount
          }
        },
        datepaye: paymentTimestamp,
        paymentid: 4, // 4 = Chèque/Virement/CB
        closepaidinvoices: 'yes',
        accountid: Number(accountid),
        num_payment: caisseName,
        comment: `Règlement - ${caisseName}`
      };

      return await apiClient('/invoices/paymentsdistributed', {
        method: 'POST',
        body: JSON.stringify(payloadDistributed),
      });

    } catch (error) {
      console.error("❌ Erreur création paiement :", error);
      throw error;
    }
  },

  getBankAccounts: async () => {
    try {
      return await apiClient('/bankaccounts?limit=100&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []);
    } catch (error) {
      return [];
    }
  },

  // --- PURGE COMPLÈTE ---
  resetAllData: async (onStep) => {
    const log = (msg) => {
      console.log(msg);
      if (typeof onStep === 'function') onStep(msg);
    };

    const getId = (record) => record?.rowid || record?.id || null;
    const getInvoiceRef = (invoice) => invoice?.ref_client || invoice?.ref || invoice?.facnumber || '';

    const isTargetInvoice = (invoice) => {
      const ref = String(getInvoiceRef(invoice) || '').trim();
      const facnumber = String(invoice?.facnumber || '').trim();
      return /^F\d+/i.test(ref) || /^IN/i.test(facnumber) || /^IN/i.test(ref);
    };

    const isTargetProduct = (product) => {
      const ref = String(product?.ref || '').trim();
      return /^P\d+/i.test(ref) || ref !== '';
    };

    const blockedPayments = new Set();
    const blockedInvoices = new Set();
    const blockedProducts = new Set();
    const blockedThirdparties = new Set();

    try {
      log('🚀 Lancement de la purge globale...');

      for (let pass = 1; pass <= 2; pass++) {
        const isSecondPass = pass === 2;
        log(`\n--- Passe N°${pass} ${isSecondPass ? '(Consolidation)' : ': Nettoyage initial'} ---`);

        const [factures, products, thirdparties] = await Promise.all([
          apiClient('/invoices?limit=500&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []),
          apiClient('/products?limit=500&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []),
          apiClient('/thirdparties?limit=500&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []),
        ]);

        const targetInvoices = (factures || []).filter(isTargetInvoice);
        const targetProducts = (products || []).filter(isTargetProduct);
        const thirdpartyIds = new Set((thirdparties || []).map(getId).filter(Boolean));

        if (targetInvoices.length > 0) {
          log(`🔎 Traitement de ${targetInvoices.length} facture(s)...`);
          for (const f of targetInvoices) {
            const id = getId(f);
            if (!id || (isSecondPass && blockedInvoices.has(id))) continue;

            log(`  ├─ Nettoyage Facture ${getInvoiceRef(f)} (#${id})`);
            const success = await unlockAndDeleteInvoice(id, log);
            if (!success) blockedInvoices.add(id);
          }
        }

        const orphanPayments = await apiClient('/paiements?limit=500', { silent: true }).catch(() => []);
        if (Array.isArray(orphanPayments) && orphanPayments.length > 0) {
          log(`🔎 Nettoyage de ${orphanPayments.length} paiement(s)...`);
          await Promise.all(
            orphanPayments.map(async (pay) => {
              const payId = getId(pay);
              if (!payId || (isSecondPass && blockedPayments.has(payId))) return;

              const res = await safeDelete(`/paiements/${payId}`, (msg) => log(`    ├─ ${msg}`));
              if (res === null) blockedPayments.add(payId);
            })
          );
        }

        if (targetProducts.length > 0) {
          log(`🔎 Traitement de ${targetProducts.length} produit(s)...`);
          await Promise.all(
            targetProducts.map(async (p) => {
              const id = getId(p);
              if (!id || (isSecondPass && blockedProducts.has(id))) return;

              const res = await safeDelete(`/products/${id}`, (msg) => log(`    ├─ Produit ${p?.ref || id} : ${msg}`));
              if (res === null) blockedProducts.add(id);
            })
          );
        }

        if (thirdpartyIds.size > 0) {
          log(`🔎 Traitement de ${thirdpartyIds.size} client(s)...`);
          await Promise.all(
            Array.from(thirdpartyIds).map(async (socid) => {
              if (isSecondPass && blockedThirdparties.has(socid)) return;

              const res = await safeDelete(`/thirdparties/${socid}`, (msg) => log(`    ├─ Client #${socid} : ${msg}`));
              if (res === null) blockedThirdparties.add(socid);
            })
          );
        }

        if (pass === 1 && blockedPayments.size === 0 && blockedInvoices.size === 0 && blockedProducts.size === 0) {
          break;
        }
      }

      let generatedSqlScript = null;

      return {
        success: blockedPayments.size === 0 && blockedInvoices.size === 0 && blockedProducts.size === 0,
        sqlScript: generatedSqlScript
      };
    } catch (error) {
      console.error('Erreur pendant la réinitialisation :', error);
      throw new Error(error.message || 'Échec de réinitialisation.');
    }
  }
};

export default apiDolibarr;