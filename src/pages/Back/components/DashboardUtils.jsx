export const formatMontant = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const mapTargetTreasury = (p) => {
  if (!p) return 'Caisse';

  const bankAccountId = typeof p === 'object'
    ? (p.fk_account || p.fk_bank || p.bank_account || p.account_id)
    : null;

  if (bankAccountId && [2, 3, '2', '3'].includes(bankAccountId)) {
    return 'Banque';
  }

  let searchStr = '';
  if (typeof p === 'string' || typeof p === 'number') {
    searchStr = String(p).toLowerCase().trim();
  } else if (typeof p === 'object') {
    searchStr = [
      p.caisse, p.banque, p.label, p.payment_code, p.mode, p.mode_reglement_code,
      p.account_label, p.bank_account_ref, p.account_ref,
      p.note, p.mode_reglement, p.type_code, p.bank,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  const isBanque =
    searchStr.includes('banque') ||
    searchStr.includes('bank') ||
    searchStr.includes('chq') ||
    searchStr.includes('cheque') ||
    searchStr.includes('cb') ||
    searchStr.includes('card') ||
    searchStr.includes('vir') ||
    searchStr.includes('virement') ||
    searchStr.includes('prlv');

  return isBanque ? 'Banque' : 'Caisse';
};

export const getPaymentInfo = (code) => {
  const PAYMENT_MODE_MAP = {
    LIQ: { label: 'Espèces (Cash)', icon: '💵', target: 'Caisse' },
    CASH: { label: 'Espèces (Cash)', icon: '💵', target: 'Caisse' },
    CHQ: { label: 'Chèque', icon: '📝', target: 'Banque' },
    CHEQUE: { label: 'Chèque', icon: '📝', target: 'Banque' },
    CB: { label: 'Carte Bancaire', icon: '💳', target: 'Banque' },
    CARD: { label: 'Carte Bancaire', icon: '💳', target: 'Banque' },
    VIR: { label: 'Virement', icon: '🏦', target: 'Banque' },
  };

  const key = String(code || '').toUpperCase().trim();
  return PAYMENT_MODE_MAP[key] || {
    label: code || 'Non spécifié',
    icon: mapTargetTreasury(code) === 'Caisse' ? '💵' : '💳',
    target: mapTargetTreasury(code),
  };
};

export const parseInvoiceSurplus = (inv) => {
  const note = String(inv.note_public || inv.note || '');
  const match = note.match(/\[SURPLUS_APP:([0-9]+(?:[.,][0-9]+)?)\]/i);
  return match ? parseFloat(match[1].replace(',', '.')) || 0 : 0;
};

export const parseInvoiceIntervals = (inv) => {
  const note = inv.note_public || inv.note || '';

  let invStart = inv.date ? new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000).toLocaleDateString('fr-FR') : '-';
  let invEnd = inv.date_fin ? new Date(isNaN(inv.date_fin) ? inv.date_fin : Number(inv.date_fin) * 1000).toLocaleDateString('fr-FR') : invStart;

  let dueEnd = inv.date_limite_reglement || inv.datelimite;
  dueEnd = dueEnd ? new Date(isNaN(dueEnd) ? dueEnd : Number(dueEnd) * 1000).toLocaleDateString('fr-FR') : '-';

  let customDueRange = null;
  const matchDue = note.match(/Échéance autorisée:\s*du\s*([\d\/\-]+)\s*au\s*([\d\/\-]+)/i);
  if (matchDue) {
    customDueRange = `Du ${matchDue[1]} au ${matchDue[2]}`;
  }

  let customPaymentRange = null;
  const matchPay = note.match(/exécuté sur la plage du\s*([\d\/\-]+)\s*au\s*([\d\/\-]+)/i);
  if (matchPay) {
    customPaymentRange = `Du ${matchPay[1]} au ${matchPay[2]}`;
  }

  return {
    invoicePeriod: `${invStart} au ${invEnd}`,
    dueDate: customDueRange || dueEnd,
    executionPeriod: customPaymentRange || '-',
  };
};

export const extractInvoiceAmounts = (inv, paymentsMap = {}) => {
  const totalTTC = parseFloat(inv.total_ttc || inv.total || 0);
  const totalHT = parseFloat(inv.total_ht || inv.total_net || inv.total_ht_amount || (totalTTC / 1.2));

  let totalRemiseMontant = 0;
  let maxRemisePercent = 0;

  if (inv.lines && inv.lines.length > 0) {
    inv.lines.forEach(l => {
      const lineRemisePct = parseFloat(l.remise_percent || l.remise || 0);
      if (lineRemisePct > maxRemisePercent) maxRemisePercent = lineRemisePct;

      const lineQty = parseFloat(l.qty || 1);
      const linePu = parseFloat(l.subprice || l.pu_ht || 0);

      if (lineRemisePct > 0) {
        totalRemiseMontant += (linePu * lineQty * (lineRemisePct / 100));
      }
    });
  } else {
    maxRemisePercent = parseFloat(inv.remise_percent || inv.remise || 0);
  }

  const isStatutPaid =
    String(inv.statut) === '2' ||
    String(inv.status) === '2' ||
    inv.paye === '1' ||
    inv.paye === 1;

  const invId = String(inv.id || '').trim().toUpperCase();
  const invRef = String(inv.ref || '').trim().toUpperCase();
  const invNum = String(inv.num_facture || inv.facnumber || '').trim().toUpperCase();

  const linePayments = paymentsMap[invId] || paymentsMap[invRef] || paymentsMap[invNum] || [];

  const calculatedPaidFromPayments = linePayments.reduce((sum, p) => {
    const rawVal = p.montant ?? p.amount ?? p.amount_paid ?? 0;
    return sum + parseFloat(String(rawVal).replace(',', '.'));
  }, 0);

  const payeRaw = parseFloat(inv.paid || inv.totalpaid || inv.total_paid || inv.amount_paid || inv.paye_montant || 0);

  let payeTTC = Math.max(calculatedPaidFromPayments, payeRaw);
  if (isStatutPaid && payeTTC === 0) {
    payeTTC = totalTTC;
  }

  const noteSurplusTTC = parseInvoiceSurplus(inv);
  
  // Prise en compte du Cashback (totalRemiseMontant) et du Payé (payeTTC) :
  // - Effective Settled = Payé + Cashback
  // - Restant = max(0, totalTTC - Effective Settled)
  // - Surplus / Dépassement = max(noteSurplusTTC, (Payé + Cashback) - totalTTC, Payé - totalTTC, 0)
  const effectiveSettled = payeTTC + totalRemiseMontant;
  const restantTTC = Math.max(0, totalTTC - effectiveSettled);
  const calculatedSurplus = Math.max(
    effectiveSettled > totalTTC ? (effectiveSettled - totalTTC) : 0,
    payeTTC > totalTTC ? (payeTTC - totalTTC) : 0
  );
  const surplusTTC = Math.max(noteSurplusTTC, calculatedSurplus);

  let caissePaid = 0;
  let banquePaid = 0;

  if (linePayments.length > 0) {
    linePayments.forEach(p => {
      const target = mapTargetTreasury(p);
      const rawAmount = p.montant ?? p.amount ?? p.amount_paid ?? 0;
      const amount = parseFloat(String(rawAmount).replace(',', '.'));
      if (target === 'Banque') {
        banquePaid += amount;
      } else {
        caissePaid += amount;
      }
    });
  } else {
    const textToAnalyze = `${inv.mode_reglement_code || ''} ${inv.mode_reglement || ''} ${inv.payment_mode || ''} ${inv.note_public || ''}`;
    const target = mapTargetTreasury(textToAnalyze);
    if (target === 'Banque') {
      banquePaid = payeTTC;
    } else {
      caissePaid = payeTTC;
    }
  }

  const modeCode = inv.mode_reglement_code || inv.mode_reglement || inv.payment_mode || 'LIQ';
  const paymentInfo = getPaymentInfo(modeCode);
  const intervals = parseInvoiceIntervals(inv);

  return {
    totalTTC,
    totalHT,
    payeTTC,
    restantTTC,
    surplusTTC,
    caissePaid,
    banquePaid,
    totalRemiseMontant,
    remisePercent: maxRemisePercent,
    isStatutPaid,
    paymentInfo,
    modeCode,
    intervals,
    linePayments,
    paymentsCount: linePayments.length,
  };
};
