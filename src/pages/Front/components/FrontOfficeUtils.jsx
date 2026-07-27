export const formatMontant = (val) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);
};

export const parseTaxRate = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;

  let rawVal = val;
  
  // Si c'est un objet, chercher dans tous les champs possibles de TVA
  if (typeof val === 'object' && val !== null) {
    rawVal = val.taux ?? 
             val.rate ?? 
             val.tva_tx ?? 
             val.taxe ?? 
             val.vat_rate ?? 
             val.tva ?? 
             val.default_vat_code ?? 
             val.tx ?? 
             val.taux_tva ??
             0;
  }

  // Convertir en chaîne et nettoyer
  const strVal = String(rawVal || '').trim();
  if (!strVal) return 0;

  // Supprimer le % et remplacer , par .
  const cleaned = strVal.replace('%', '').replace(',', '.').trim();
  const parsed = parseFloat(cleaned);
  
  return (Number.isNaN(parsed) || parsed < 0) ? 0 : parsed;
};


export const getProductPriceVariants = (prod) => {
  if (!prod) return [];

  const lines = prod.lines || prod.details || prod.factures_details || prod.lines_detail || prod.variants || [];
  const multiprices = Array.isArray(prod.multiprices) ? prod.multiprices : [];
  const multipricesTax = Array.isArray(prod.multiprices_tva_tx) ? prod.multiprices_tva_tx : [];
  const multipricesDefaultVat = Array.isArray(prod.multiprices_default_vat_code) ? prod.multiprices_default_vat_code : [];

  // Fallback global de TVA du produit (tous les champs possibles)
  const prodGlobalTax = parseTaxRate(
    prod.tva_tx ?? 
    prod.taux ?? 
    prod.taxe ?? 
    prod.vat_rate ?? 
    prod.tva ?? 
    prod.default_vat_code ??
    prod.tx ??
    prod.taux_tva ??
    0
  );

  // Cas 1 : Produit avec prix multiples (multiprices)
  if (multiprices.length > 0) {
    return multiprices.map((priceHT, idx) => {
      const taxRate = parseTaxRate(
        multipricesTax[idx] ?? 
        multipricesDefaultVat[idx] ?? 
        prodGlobalTax
      );
      const priceTTC = parseFloat(priceHT) * (1 + taxRate / 100);

      return {
        variantId: `${prod.id || prod.ref}_multiprice_${idx}`,
        priceHT: parseFloat(priceHT) || 0,
        taxRate,
        priceTTC,
        rawLine: prod,
      };
    });
  }

  // Cas 2 : Produit avec lignes détail (factures_details ou variants)
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((line, idx) => {
      const priceHT = parseFloat(
        line.pu_hors_Taxe ?? 
        line.subprice ?? 
        line.price ?? 
        line.price_ht ?? 
        line.pu_ht ??
        0
      );
      const taxRate = parseTaxRate(
        line.tva_tx ?? 
        line.taux ?? 
        line.taxe ?? 
        line.vat_rate ?? 
        line.tva ?? 
        line.default_vat_code ??
        prodGlobalTax
      );
      const priceTTC = priceHT * (1 + taxRate / 100);

      return {
        variantId: `${prod.id || prod.ref}_var_${idx}`,
        priceHT,
        taxRate,
        priceTTC,
        rawLine: line,
      };
    });
  }

  // Cas 3 : Produit simple (pas de lignes ni multiprices)
  const priceHT = parseFloat(
    prod.pu_hors_Taxe ?? 
    prod.price ?? 
    prod.price_ht ?? 
    prod.subprice ?? 
    prod.pu_ht ??
    0
  );
  
  const computedTTC = priceHT * (1 + prodGlobalTax / 100);
  const rawTTC = parseFloat(prod.price_ttc || prod.total_ttc || 0);

  return [{
    variantId: `${prod.id || prod.ref}_default`,
    priceHT,
    taxRate: prodGlobalTax,
    priceTTC: Math.max(computedTTC, rawTTC) || computedTTC,
    rawLine: null,
  }];
};

