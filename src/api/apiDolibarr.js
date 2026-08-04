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
 * Fonction utilitaire centralisée pour nettoyer et parser proprement la taxe du CSV.
 */
const parseTaxRate = (val) => {
  if (typeof val === 'number') {
    const parsed = parseFloat(val);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }
  if (!val || String(val).trim() === '') return 0;

  let rawVal = val;
  if (typeof rawVal === 'object' && rawVal !== null) {
    rawVal = 
      rawVal.taux ?? 
      rawVal.rate ?? 
      rawVal.tva_tx ?? 
      rawVal.taxe ?? 
      rawVal.vat_rate ?? 
      rawVal.tva ?? 
      rawVal.default_vat_code ?? 
      rawVal.tx ?? 
      rawVal.taux_tva ?? 
      0;
  }

  const cleaned = String(rawVal).replace('%', '').replace(',', '.').trim();
  const parsed = parseFloat(cleaned);
  
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
};

const updateProduct = async (productId, data) => {
  try {
    return await apiClient(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Erreur mise à jour produit :', error);
    throw error;
  }
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

  try {
    await apiClient(`/invoices/${invoiceId}/settounpaid`, { method: 'POST', silent: true });
    safeLog(`    ↳ Facture #${invoiceId} déclassée (settounpaid)`);
  } catch (e) {
    // Échec ignoré
  }

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

  const result = await safeDelete(`/invoices/${invoiceId}`, (msg) => safeLog(`    ⚠️ Facture #${invoiceId} : ${msg}`));
  if (result !== null) {
    safeLog(`    ✓ Facture #${invoiceId} supprimée`);
  }

  return result !== null;
};

const resetAllData = async (addLog = () => {}) => {
  addLog('🔄 Début de la réinitialisation des données Eval4...');

  const invoices = await apiClient('/invoices?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
  if (Array.isArray(invoices) && invoices.length > 0) {
    addLog(`🧾 Suppression de ${invoices.length} facture(s) en cours...`);
    for (const inv of invoices) {
      const invoiceId = inv.id || inv.rowid;
      if (invoiceId) {
        addLog(`  → Suppression facture #${invoiceId}...`);
        await unlockAndDeleteInvoice(invoiceId, addLog);
      }
    }
  } else {
    addLog('🧾 Aucune facture trouvée à supprimer.');
  }

  const thirdparties = await apiClient('/thirdparties?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
  const clientsToDelete = Array.isArray(thirdparties)
    ? thirdparties.filter(tp => String(tp.code_client || tp.client_code || '').trim() === '-1')
    : [];

  if (clientsToDelete.length > 0) {
    addLog(`👤 Suppression de ${clientsToDelete.length} client(s) importés...`);
    for (const client of clientsToDelete) {
      const clientId = client.id || client.rowid;
      if (clientId) {
        addLog(`  → Suppression client #${clientId}...`);
        await safeDelete(`/thirdparties/${clientId}`, (msg) => addLog(`    ${msg}`));
      }
    }
  } else {
    addLog('👤 Aucun client importé trouvé à supprimer.');
  }

  const products = await apiClient('/products?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
  if (Array.isArray(products) && products.length > 0) {
    addLog(`📦 Suppression de ${products.length} produit(s) en cours...`);
    for (const product of products) {
      const productId = product.id || product.rowid;
      if (productId) {
        addLog(`  → Suppression produit #${productId}...`);
        await safeDelete(`/products/${productId}`, (msg) => addLog(`    ${msg}`));
      }
    }
  } else {
    addLog('📦 Aucun produit trouvé à supprimer.');
  }

  addLog('✅ Réinitialisation des données Eval4 terminée.');
  return true;
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
      const products = await apiClient('/products?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
      
      if (!Array.isArray(products) || products.length === 0) {
        return products;
      }

      try {
        const invoices = await apiClient('/invoices?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
        
        if (Array.isArray(invoices) && invoices.length > 0) {
          const taxRateByProductRef = {};
          const taxRateByProductId = {};

          for (const invoice of invoices) {
            const invId = invoice.id || invoice.rowid;
            try {
              const invoiceDetail = await apiClient(`/invoices/${invId}`, { silent: true }).catch(() => null);
              
              if (invoiceDetail && Array.isArray(invoiceDetail.lines)) {
                invoiceDetail.lines.forEach(line => {
                  const lineTax = parseTaxRate(
                    line.tva_tx ?? line.taux ?? line.taxe ?? line.vat_rate ?? line.tva ?? line.default_vat_code ?? 0
                  );

                  if (line.fk_product) {
                    const prodId = line.fk_product;
                    if (!taxRateByProductId[prodId] || lineTax > 0) {
                      taxRateByProductId[prodId] = lineTax;
                    }
                  }

                  if (line.product_ref) {
                    if (!taxRateByProductRef[line.product_ref] || lineTax > 0) {
                      taxRateByProductRef[line.product_ref] = lineTax;
                    }
                  }
                });
              }
            } catch (err) {
              continue;
            }
          }

          return products.map(prod => {
            const prodId = prod.id || prod.rowid;
            const prodRef = prod.ref;

            let enrichedTax = taxRateByProductId[prodId] || taxRateByProductRef[prodRef] || 0;

            if (enrichedTax === 0) {
              enrichedTax = parseTaxRate(
                prod.tva_tx ?? prod.default_vat_code ?? prod.taux ?? prod.taxe ?? prod.vat_rate ?? prod.tva ?? 0
              );
            }

            return {
              ...prod,
              tva_tx: enrichedTax,
              _tva_from_invoices: enrichedTax > 0 ? true : false
            };
          });
        }
      } catch (err) {
        console.warn("⚠️ Enrichissement TVA depuis factures échoué, retour des produits bruts :", err);
      }

      return products;
    } catch (error) {
      console.error("Erreur récupération produits :", error);
      return [];
    }
  },

  createProduct: async (data) => {
    try {
      const ref = data.ref_produit || data.ref;
      const resolvedTax = parseTaxRate(data.taxe || data.tva_tx || data.tva || data.taxRate);

      if (ref) {
        const existing = await apiClient(`/products?sqlfilters=(t.ref:=:'${ref}')`, { silent: true }).catch(() => []);
        if (Array.isArray(existing) && existing.length > 0) {
          const existingProduct = existing[0];
          const existingTax = parseTaxRate(
            existingProduct.tva_tx || existingProduct.default_vat_code || existingProduct.tva || existingProduct.taxe
          );
          if (resolvedTax > 0 && existingTax !== resolvedTax) {
            await updateProduct(existingProduct.id || existingProduct.rowid, {
              tva_tx: resolvedTax,
              default_vat_code: `${resolvedTax}`,
            });
          }
          return existingProduct.id || existingProduct.rowid;
        }
      }

      const payload = {
        ref: ref,
        label: data.produit || data.label || '',
        type: 0,
        price: parseFloat(data.pu_hors_Taxe || data.price || 0),
        tva_tx: resolvedTax,
        default_vat_code: resolvedTax > 0 ? `${resolvedTax}` : '',
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
      // Certaines factures importées peuvent rester au statut 0 (brouillon) dans Dolibarr,
      // donc on ne les exclut plus ici pour qu'elles apparaissent dans l'interface.
      return invoices || [];
    } catch (error) {
      console.error("Erreur récupération factures :", error);
      return [];
    }
  },

  getInvoice: async (invoiceId) => {
    try {
      return await apiClient(`/invoices/${invoiceId}`, { silent: true });
    } catch (error) {
      console.error(`Erreur récupération facture #${invoiceId} :`, error);
      throw error;
    }
  },

  updateInvoice: async (invoiceId, data) => {
    try {
      return await apiClient(`/invoices/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error(`Erreur mise à jour facture #${invoiceId} :`, error);
      throw error;
    }
  },

  setInvoicePaid: async (invoiceId) => {
    try {
      return await apiClient(`/invoices/${invoiceId}/classifypaid`, {
        method: 'POST',
        body: JSON.stringify({ close_code: 'paid', close_note: 'Soldé automatiquement par application' }),
      });
    } catch (error) {
      console.error(`Erreur passage facture #${invoiceId} à payée :`, error);
      throw error;
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
      const resolvedTax = parseTaxRate(data.taxe || data.tva_tx || data.tva || data.taxRate);

      const payload = {
        fk_product: data.fk_product || null,
        desc: labelValue,
        label: labelValue,
        product_type: 0,
        subprice: subpriceVal,
        price: subpriceVal,
        qty: parseInt(data.quantite || data.qty || 1, 10),
        remise_percent: parseFloat(remiseStr) || 0,
        tva_tx: resolvedTax,
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

  // --- PAYMENTS & TREASURY ---
  
  getPayments: async () => {
    try {
      const payments = await apiClient('/paiements?limit=500&sortfield=t.rowid&sortorder=DESC', { silent: true }).catch(() => []);
      
      if (Array.isArray(payments) && payments.length > 0) {
        return payments;
      }

      const invoices = await apiClient('/invoices?limit=500', { silent: true }).catch(() => []);
      let allPayments = [];

      if (Array.isArray(invoices)) {
        await Promise.all(
          invoices.map(async (inv) => {
            const invId = inv.id || inv.rowid;
            if (invId) {
              const invPayments = await apiClient(`/invoices/${invId}/payments`, { silent: true }).catch(() => []);
              if (Array.isArray(invPayments) && invPayments.length > 0) {
                invPayments.forEach(p => {
                  allPayments.push({
                    ...p,
                    fk_facture: invId,
                    num_facture: inv.ref_client || inv.ref
                  });
                });
              }
            }
          })
        );
      }
      return allPayments;
    } catch (error) {
      console.error("Erreur récupération paiements :", error);
      return [];
    }
  },

  resetAllData: async (addLog = () => {}) => {
    return resetAllData(addLog);
  },

  createPayment: async (data) => {
    try {
      const caisseName = (data.caisse || 'Caisse1').trim();
      const isCash = caisseName.toLowerCase().includes('caisse') || 
                     caisseName.toLowerCase().includes('cash') || 
                     caisseName.toLowerCase().includes('liq');

      const bankAccounts = await apiClient('/bankaccounts?limit=100&sortfield=t.rowid&sortorder=ASC', { silent: true }).catch(() => []);

      const normalizeKey = (value) => String(value || '').trim().toLowerCase();
      const targetKey = normalizeKey(caisseName);

      const isCashAccount = (acc) => {
        const bankField = normalizeKey(acc.bank);
        const label = normalizeKey(acc.label);
        const type = normalizeKey(acc.type);
        const courant = String(acc.courant || '').trim();
        return bankField.includes('caisse') || bankField.includes('cash') || label.includes('caisse') || label.includes('cash') || courant === '2' || type === '2' || type === 'cash' || type === 'caisse';
      };

      const isBankAccount = (acc) => {
        const bankField = normalizeKey(acc.bank);
        const label = normalizeKey(acc.label);
        const type = normalizeKey(acc.type);
        const courant = String(acc.courant || '').trim();
        return bankField.includes('banque') || bankField.includes('bank') || label.includes('banque') || label.includes('bank') || courant === '1' || type === '1' || type === 'banque' || type === 'bank';
      };

      let matchedAccount = Array.isArray(bankAccounts) ? bankAccounts.find(acc => {
        const ref = normalizeKey(acc.ref);
        const label = normalizeKey(acc.label);
        const wantCash = isCash;
        const matchByName = ref === targetKey || label === targetKey;
        const matchByType = wantCash ? isCashAccount(acc) : isBankAccount(acc);
        return matchByName && matchByType;
      }) : null;

      if (!matchedAccount && Array.isArray(bankAccounts)) {
        matchedAccount = bankAccounts.find(acc => (isCash ? isCashAccount(acc) : isBankAccount(acc)));
      }

      let accountid = null;
      if (matchedAccount) {
        accountid = matchedAccount.id ?? matchedAccount.rowid ?? matchedAccount.rowid_ref ?? null;
      } else {
        const newBank = {
          ref: caisseName.toUpperCase().replace(/\s+/g, '_').substring(0, 12),
          label: caisseName,
          bank: isCash ? 'Caisse' : 'Banque',
          country_id: 1,
          courant: isCash ? 2 : 1,
          clos: 0,
          type: isCash ? 2 : 1,
          currency_code: 'EUR',
          status: 1
        };
        const createdBank = await apiClient('/bankaccounts', {
          method: 'POST',
          body: JSON.stringify(newBank),
        });
        accountid = (createdBank && (createdBank.id ?? createdBank.rowid ?? createdBank)) || null;
      }

      accountid = Number(accountid);
      if (!accountid || Number.isNaN(accountid)) {
        throw new Error('Impossible de déterminer le compte bancaire / caisse pour le règlement.');
      }

      const amountValue = normalizeAmount(data.montant || data.amount);
      if (!amountValue || amountValue <= 0) {
        throw new Error(`Montant de paiement invalide : ${data.montant}`);
      }

      const targetInvoiceId = parseInt(data.invoice_id, 10);
      const paymentTimestamp = dateToUnixTimestamp(data.date_reglement || data.date);
      const numAmount = Number(amountValue.toFixed(2));

      const shouldClose = data.is_last_payment === false ? 'no' : 'yes';
      const defaultPaymentCode = isCash ? 'LIQ' : 'VIR';
      const rawPaymentId = data.payment_mode_id ?? data.mode_reglement ?? defaultPaymentCode;
      const normalizedPaymentId = typeof rawPaymentId === 'string'
        ? rawPaymentId.trim().toUpperCase()
        : rawPaymentId;
      const paymentid = (typeof normalizedPaymentId === 'number' || (typeof normalizedPaymentId === 'string' && /^\d+$/.test(normalizedPaymentId)))
        ? Number(normalizedPaymentId)
        : normalizedPaymentId;

      // 🛡️ Structure finale avec multicurrency_amount défini à 0 pour éviter le warning PHP
      const payloadDistributed = {
        amount: numAmount,
        arrayofamounts: {
          [targetInvoiceId]: {
            amount: numAmount,
            multicurrency_amount: 0
          }
        },
        datepaye: paymentTimestamp,
        paymentid: paymentid,
        closepaidinvoices: shouldClose,
        accountid: Number(accountid),
        num_payment: caisseName,
        comment: data.note || `Règlement - ${caisseName}`
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
};