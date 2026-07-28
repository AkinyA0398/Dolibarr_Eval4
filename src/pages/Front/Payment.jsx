import React, { useState, useEffect } from "react";
import { apiDolibarr } from "../../api/apiDolibarr";
import { apiClient } from "../../api/apiClient"; // 👈 Import nommé correct avec accolades

const formatMontant = (val) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);
};

const formatDateStr = (dateVal) => {
  if (!dateVal) return '-';
  const parsed = new Date(isNaN(dateVal) ? dateVal : Number(dateVal) * 1000);
  return isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('fr-FR');
};

const getTodayStr = () => new Date().toISOString().split('T')[0];

const PAYMENT_MODES = [
  { id: "cash", label: "Espèces (Cash)", icon: "💵", codeDolibarr: "LIQ", targetAccount: "Caisse", paymentModeId: 4 },
  { id: "cheque", label: "Chèque", icon: "📝", codeDolibarr: "CHQ", targetAccount: "Banque", paymentModeId: 7 },
  { id: "cb", label: "Carte Bancaire", icon: "💳", codeDolibarr: "CB", targetAccount: "Banque", paymentModeId: 6 },
];

export default function Payment({ user, onBack, onComplete }) {
  const [remisesConfig, setRemisesConfig] = useState([]);
  const [paymentMode, setPaymentMode] = useState("cash");

  // ── 📄 LISTE & SÉLECTION DES FACTURES ─────────────────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  // ── 📅 DATES & CONFIGURATION ──────────────────────────────────────────────
  const [invoicePeriod, setInvoicePeriod] = useState({ start: getTodayStr(), end: getTodayStr() });
  const [paymentDateChoice, setPaymentDateChoice] = useState("maintenant");
  const [customDaysRange, setCustomDaysRange] = useState({ min: 0, max: 7 });
  const [duePeriod, setDuePeriod] = useState({ start: getTodayStr(), end: getTodayStr() });
  const [paymentPeriod, setPaymentPeriod] = useState({ start: getTodayStr(), end: getTodayStr() });

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Option de paiement partiel
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [customPayAmount, setCustomPayAmount] = useState(0);

  // 1. Charger toutes les factures non réglées
  useEffect(() => {
    const fetchInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const allInvoices = await apiDolibarr.getInvoices();
        
        const unpaidInvoices = (allInvoices || []).filter(inv => {
          const isPaid = String(inv.statut) === '2' || inv.paye === '1' || inv.paye === 1;
          const matchesUser = user?.id ? String(inv.socid || inv.fk_soc) === String(user.id) : true;
          return !isPaid && matchesUser;
        });

        setInvoices(unpaidInvoices);
        if (unpaidInvoices.length > 0) {
          setSelectedInvoiceId(unpaidInvoices[0].id);
        }
      } catch (err) {
        console.error("Erreur lors de la récupération des factures :", err);
      } finally {
        setLoadingInvoices(false);
      }
    };

    fetchInvoices();
  }, [user]);

  // 2. Récupérer les règles de remises selon le mode de paiement
  useEffect(() => {
    fetch(`http://localhost:5000/api/remises?mode=${paymentMode}`)
      .then(res => res.json())
      .then(data => setRemisesConfig(data))
      .catch(() => {
        setRemisesConfig([
          { max_days: 0, discount_percentage: 0 },
          { max_days: 7, discount_percentage: 0 },
          { max_days: 30, discount_percentage: 30 },
          { max_days: 9999, discount_percentage: 0 }
        ]);
      });
  }, [paymentMode]);

  const selectedInvoice = invoices.find(inv => String(inv.id) === String(selectedInvoiceId));
  const rawInvoiceTotal = selectedInvoice ? parseFloat(selectedInvoice.total_ttc || selectedInvoice.total || 0) : 0;
  
  // 🛡️ Extraction directe et sécurisée du reste à payer depuis l'objet de la liste Dolibarr
  const remainToPay = selectedInvoice 
    ? (selectedInvoice.remaintopay !== undefined 
        ? parseFloat(selectedInvoice.remaintopay) 
        : (selectedInvoice.total_ttc !== undefined 
            ? parseFloat(selectedInvoice.total_ttc) - parseFloat(selectedInvoice.alreadypaid || 0) 
            : rawInvoiceTotal))
    : 0;

  // Calcul du taux de remise selon l'intervalle de date
  const calculateDiscount = (days) => {
    const sorted = [...remisesConfig].sort((a, b) => a.max_days - b.max_days);
    for (const conf of sorted) {
      if (days <= conf.max_days || conf.max_days === 9999) {
        return conf.discount_percentage;
      }
    }
    return 0;
  };

  useEffect(() => {
    let daysDiff = 0;
    const invStart = new Date(invoicePeriod.start);

    if (paymentDateChoice === "custom_days_range") {
      daysDiff = parseInt(customDaysRange.max) || 0;
    } else if (paymentDateChoice === "custom_range") {
      const dueEnd = new Date(duePeriod.end);
      const diffTime = dueEnd.getTime() - invStart.getTime();
      daysDiff = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    setDiscountPercent(calculateDiscount(daysDiff));
  }, [paymentDateChoice, customDaysRange, duePeriod, invoicePeriod, remisesConfig]);

  // 🛡️ Application de la remise sur le RESTE À PAYER (et non sur le total brut)
  const discountAmount = remainToPay * (discountPercent / 100);
  const calculatedPayable = Math.max(0, remainToPay - discountAmount);
  
  const effectivePayAmount = isPartialPayment
    ? Math.max(0, Math.min(customPayAmount, calculatedPayable))
    : calculatedPayable;

  useEffect(() => {
    if (!isPartialPayment) {
      setCustomPayAmount(calculatedPayable);
    } else if (customPayAmount > calculatedPayable) {
      setCustomPayAmount(calculatedPayable);
    }
  }, [isPartialPayment, calculatedPayable]);

  const selectedPaymentInfo = PAYMENT_MODES.find(m => m.id === paymentMode);

  // Soumission et enregistrement du règlement
  const handlePayment = async () => {
    if (!selectedInvoiceId) {
      alert("Veuillez sélectionner une facture.");
      return;
    }

    // 🛡️ Plafonnement strict par rapport au reste à payer réel pour éviter l'erreur 400
    const finalAmount = Math.min(effectivePayAmount, remainToPay);
    if (!finalAmount || finalAmount <= 0) {
      alert("Veuillez entrer un montant de paiement valide.");
      return;
    }

    setLoading(true);
    try {
      const activeMode = PAYMENT_MODES.find(m => m.id === paymentMode);
      const targetCaisseOrBank = activeMode?.id === "cash" ? "Caisse Principale" : "Banque1";

      const paymentData = {
        date: paymentPeriod.start,
        date_fin: paymentPeriod.end,
        mode_reglement: activeMode?.codeDolibarr || "LIQ",
        payment_mode_id: activeMode?.paymentModeId,
        caisse: targetCaisseOrBank,
        montant: finalAmount,
        invoice_id: selectedInvoiceId,
        is_last_payment: !isPartialPayment || finalAmount >= remainToPay,
        note: `Paiement ${activeMode?.label}. Reste dû: ${remainToPay}€ - Remise: ${discountAmount}€ (${discountPercent}%) - Encaissement Réel: ${finalAmount}€`
      };

      // Enregistrement du paiement via l'API distribuée Dolibarr
      await apiDolibarr.createPayment(paymentData);

      // Si le paiement solde totalement la facture, on met à jour son statut
      if (!isPartialPayment || finalAmount >= remainToPay) {
        await apiDolibarr.setInvoicePaid(selectedInvoiceId).catch(() => {});
      }

      alert(`Paiement de ${formatMontant(finalAmount)} enregistré avec succès pour la facture ${selectedInvoice?.ref || selectedInvoiceId} !`);
      onComplete();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'enregistrement du règlement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container animate-fade-in" style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '1rem' }} disabled={loading || step === 2}>
        ← Retour
      </button>

      <div className="card" style={{ padding: '2rem' }}>
        <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          {step === 1 ? "Saisie & Sélection du Règlement" : "Confirmation de la Transaction"}
        </h2>

        {/* 1. SECTEUR CHOIX DE LA FACTURE */}
        <div style={{ marginBottom: '1.5rem', background: '#1e293b', padding: '1.25rem', borderRadius: '8px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
            📄 Choisir la Facture à Régler :
          </label>
          
          {loadingInvoices ? (
            <div>⏳ Chargement des factures impayées...</div>
          ) : invoices.length > 0 ? (
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', background: '#0f172a', color: '#fff', border: '1px solid #334155', fontSize: '1rem' }}
            >
              {invoices.map(inv => {
                const invoiceDate = formatDateStr(inv.date || inv.datef || inv.date_creation || inv.date_delivery || inv.date_reglement);
                const invRemain = inv.remaintopay !== undefined ? parseFloat(inv.remaintopay) : parseFloat(inv.total_ttc || inv.total || 0);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.ref || `FAC-${inv.id}`} — Date : {invoiceDate} — Reste à payer : {formatMontant(invRemain)}
                  </option>
                );
              })}
            </select>
          ) : (
            <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>Aucune facture impayée trouvée pour ce client.</div>
          )}
        </div>

        {selectedInvoice && (
          <div style={{ marginBottom: '1.5rem', background: '#1e293b', padding: '1.25rem', borderRadius: '8px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.75rem' }}>🔁 Type de paiement :</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsPartialPayment(false)}
                style={{
                  flex: '1 1 160px',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  border: isPartialPayment ? '1px solid #334155' : '2px solid #10b981',
                  background: isPartialPayment ? '#1e293b' : '#10b981',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Paiement Total
              </button>
              <button
                type="button"
                onClick={() => setIsPartialPayment(true)}
                style={{
                  flex: '1 1 160px',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  border: isPartialPayment ? '2px solid #f59e0b' : '1px solid #334155',
                  background: isPartialPayment ? '#f59e0b' : '#1e293b',
                  color: '#000',
                  cursor: 'pointer'
                }}
              >
                Paiement Partiel
              </button>
            </div>

            {isPartialPayment && (
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Montant à encaisser</label>
                <input
                  type="number"
                  min="0"
                  max={calculatedPayable}
                  step="0.01"
                  value={customPayAmount}
                  onChange={(e) => setCustomPayAmount(Number(e.target.value) || 0)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: '1rem' }}
                />
                <p style={{ marginTop: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                  Montant maximum possible après remise : {formatMontant(calculatedPayable)}.
                </p>
              </div>
            )}
          </div>
        )}

        {/* RECAPITULATIF FINANCIER */}
        {selectedInvoice && (
          <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #334155' }}>
            <h3 style={{ marginTop: 0 }}>Détail du Règlement : {selectedInvoice.ref}</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
              <span>Montant Brut Initial (TTC) :</span>
              <span>{formatMontant(rawInvoiceTotal)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
              <span>Reste à Payer Actuel :</span>
              <strong style={{ fontSize: '1.1rem' }}>{formatMontant(remainToPay)}</strong>
            </div>

            {discountPercent > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', color: '#10b981', borderBottom: '1px solid #334155' }}>
                <span>Remise Accordée au Règlement ({discountPercent}%) :</span>
                <strong>- {formatMontant(discountAmount)}</strong>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', marginTop: '0.75rem' }}>
              <span>Montant Réel à Encaisser :</span>
              <strong style={{ color: '#3b82f6' }}>{formatMontant(effectivePayAmount)}</strong>
            </div>
          </div>
        )}

        {/* CHOIX DU MODE DE PAIEMENT & CONFIRMATION */}
        {step === 1 && selectedInvoice && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.75rem' }}>💳 Mode de règlement :</label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {PAYMENT_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPaymentMode(mode.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem',
                      borderRadius: '6px',
                      border: paymentMode === mode.id ? '2px solid #3b82f6' : '1px solid #334155',
                      background: paymentMode === mode.id ? '#3b82f6' : '#1e293b',
                      color: '#fff', cursor: 'pointer'
                    }}
                  >
                    <span>{mode.icon}</span>
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} 
              onClick={() => setStep(2)} 
              disabled={loading || !selectedInvoiceId}
            >
              Étape Suivante : Valider le Règlement
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3>Confirmation du Règlement</h3>
            <p>Facture concernée : <strong>{selectedInvoice?.ref}</strong></p>
            <p>Destination des fonds : <strong>{selectedPaymentInfo?.targetAccount}</strong> ({selectedPaymentInfo?.label})</p>
            <p style={{ fontSize: '1.2rem', color: '#10b981', fontWeight: 'bold' }}>
              Montant Encaissé : {formatMontant(effectivePayAmount)}
            </p>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '1rem', background: '#10b981', marginTop: '1.5rem' }} 
              onClick={handlePayment} 
              disabled={loading}
            >
              {loading ? "Enregistrement en cours..." : "Confirmer et Enregistrer le Paiement"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}