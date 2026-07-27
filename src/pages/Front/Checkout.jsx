import React, { useState, useEffect } from "react";
import { apiDolibarr } from "../../api/apiDolibarr";

const formatMontant = (val) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);
};

const getTodayStr = () => new Date().toISOString().split('T')[0];

const PAYMENT_MODES = [
  { id: "cash", label: "Espèces (Cash)", icon: "💵", codeDolibarr: "LIQ", targetAccount: "Caisse" },
  { id: "cheque", label: "Chèque", icon: "📝", codeDolibarr: "CHQ", targetAccount: "Banque" },
  { id: "cb", label: "Carte Bancaire", icon: "💳", codeDolibarr: "CB", targetAccount: "Banque" },
];

export default function Checkout({ cart, total, user, onBack, onComplete, taxe }) {
  const [remisesConfig, setRemisesConfig] = useState([]);

  // ── 💳 MODE DE PAIEMENT SÉLECTIONNÉ ───────────────────────────────────────
  const [paymentMode, setPaymentMode] = useState("cash");

  // ── 📅 INTERVALLES DE DATES CONFIGURABLES ─────────────────────────────────
  const [invoicePeriod, setInvoicePeriod] = useState({
    start: getTodayStr(),
    end: getTodayStr()
  });

  const [paymentDateChoice, setPaymentDateChoice] = useState("maintenant");
  
  const [customDaysRange, setCustomDaysRange] = useState({
    min: 0,
    max: 7
  });
  
  const [duePeriod, setDuePeriod] = useState({
    start: getTodayStr(),
    end: getTodayStr()
  });

  const [paymentPeriod, setPaymentPeriod] = useState({
    start: getTodayStr(),
    end: getTodayStr()
  });

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Choix mode & dates, 2: Exécution
  const [invoiceId, setInvoiceId] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);

  // ── 🔄 RECUPERATION DES REMISES SELON LE MODE ─────────────────────────────
  useEffect(() => {
    fetch(`http://localhost:5000/api/remises?mode=${paymentMode}`)
      .then(res => res.json())
      .then(data => setRemisesConfig(data))
      .catch(err => {
        console.error("Erreur fetching remises", err);
        setRemisesConfig([
          { max_days: 0, discount_percentage: 0 },
          { max_days: 7, discount_percentage: 0 },
          { max_days: 30, discount_percentage: 0 },
          { max_days: 9999, discount_percentage: 0 }
        ]);
      });
  }, [paymentMode]);

  const calculateDueRange = () => {
    const startD = new Date(invoicePeriod.start);
    if (isNaN(startD.getTime())) return { start: invoicePeriod.start, end: invoicePeriod.end };

    if (paymentDateChoice === "maintenant") {
      return { start: invoicePeriod.start, end: invoicePeriod.end };
    } else if (paymentDateChoice === "custom_days_range") {
      const minDays = parseInt(customDaysRange.min) || 0;
      const maxDays = parseInt(customDaysRange.max) || 0;

      const dueStart = new Date(startD);
      dueStart.setDate(dueStart.getDate() + minDays);

      const dueEnd = new Date(startD);
      dueEnd.setDate(dueEnd.getDate() + maxDays);

      return {
        start: dueStart.toISOString().split('T')[0],
        end: dueEnd.toISOString().split('T')[0]
      };
    } else if (paymentDateChoice === "custom_range") {
      return duePeriod;
    }
    return { start: invoicePeriod.start, end: invoicePeriod.end };
  };

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
    } else {
      daysDiff = 0;
    }

    setDiscountPercent(calculateDiscount(daysDiff));
  }, [paymentDateChoice, customDaysRange, duePeriod, invoicePeriod, remisesConfig]);

  const discountAmount = total * (discountPercent / 100);
  const finalTotal = total - discountAmount;

  // ── 🧾 CRÉATION FACTURE ──────────────────────────────────────────────────
  const handleValidateInvoice = async () => {
    setLoading(true);
    try {
      const computedDueRange = calculateDueRange();
      const activeMode = PAYMENT_MODES.find(m => m.id === paymentMode);

      const invData = {
        socid: user.id,
        date: invoicePeriod.start,
        date_fin: invoicePeriod.end,
        date_limite_reglement: computedDueRange.end,
        mode_reglement: activeMode?.codeDolibarr || "LIQ",
        note_public: `Mode de règlement: ${activeMode?.label} (${activeMode?.targetAccount}). Période: du ${invoicePeriod.start} au ${invoicePeriod.end}. Échéance autorisée: du ${computedDueRange.start} au ${computedDueRange.end}`
      };

      const createdInvoiceId = await apiDolibarr.createInvoice(invData);
      setInvoiceId(createdInvoiceId);

      for (const item of cart) {
        const lineData = {
          fk_product: item.id,
          desc: item.label,
          pu_hors_Taxe: item.price,
          // pu_Taxe: item.price*taxe,
          taxe: item.taxe,
          qty: item.qty,
          remise: discountPercent
        };
        await apiDolibarr.addInvoiceLine(createdInvoiceId, lineData);
      }

      await apiDolibarr.validateInvoice(createdInvoiceId);

      setPaymentPeriod(computedDueRange);
      setStep(2);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création de la facture");
    } finally {
      setLoading(false);
    }
  };

  // ── 💳 ENREGISTREMENT DU PAIEMENT (CAISSE VS BANQUE) ─────────────────────
  const handlePayment = async () => {
    setLoading(true);
    try {
      const activeMode = PAYMENT_MODES.find(m => m.id === paymentMode);
      
      // Affectation dynamique du compte de destination selon le mode
      const targetCaisseOrBank = activeMode?.id === "cash" 
        ? "Caisse Principale" 
        : "Compte BDR / Banque";

      const paymentData = {
        date: paymentPeriod.start,
        date_fin: paymentPeriod.end,
        mode_reglement: activeMode?.codeDolibarr || "LIQ",
        caisse: targetCaisseOrBank,
        montant: finalTotal,
        invoice_id: invoiceId,
        note: `Paiement ${activeMode?.label} versé sur [${targetCaisseOrBank}] sur la plage du ${paymentPeriod.start} au ${paymentPeriod.end}`
      };

      await apiDolibarr.createPayment(paymentData);
      alert(`Paiement enregistré avec succès vers : ${targetCaisseOrBank}`);
      onComplete();
    } catch (err) {
      console.error(err);
      alert("Erreur lors du paiement");
    } finally {
      setLoading(false);
    }
  };

  const currentDueRange = calculateDueRange();
  const selectedPaymentInfo = PAYMENT_MODES.find(m => m.id === paymentMode);

  return (
    <div className="container animate-fade-in" style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '1rem' }} disabled={loading || step === 2}>
        ← Retour
      </button>

      <div className="card" style={{ padding: '2rem' }}>
        <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          {step === 1 ? "Validation, Mode de Paiement & Intervalles" : "Saisie Règlement par Intervalle"}
        </h2>

        {/* Récapitulatif */}
        <div style={{ background: 'var(--surface-color, #0f172a)', padding: '1.5rem', borderRadius: 'var(--radius-sm, 6px)', marginBottom: '2rem' }}>
          <h3>Récapitulatif</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {cart.map((item, idx) => (
              <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color, #334155)' }}>
                <span>{item.qty}x {item.label}</span>
                <span>{formatMontant(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontWeight: 'bold' }}>
            <span>Total Brut :</span>
            <span>{formatMontant(total)}</span>
          </div>
          {discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', fontWeight: 'bold' }}>
              <span>Remise appliquée ({discountPercent}%) :</span>
              <span>- {formatMontant(discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', marginTop: '0.5rem', borderTop: '2px solid var(--border-color, #334155)', paddingTop: '0.5rem' }}>
            <span>Total à Payer :</span>
            <span style={{ color: 'var(--primary-color, #3b82f6)', fontWeight: '900' }}>{formatMontant(finalTotal)}</span>
          </div>
        </div>

        {/* Étape 1 : Choix Mode de Paiement & Intervalles */}
        {step === 1 && (
          <div>
            {/* 💳 Sélecteur de Mode de Paiement */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.75rem' }}>
                💳 Mode de règlement :
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {PAYMENT_MODES.map((mode) => {
                  const isActive = paymentMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMode(mode.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '6px',
                        border: isActive ? '2px solid var(--primary-color, #3b82f6)' : '1px solid var(--border-color, #334155)',
                        background: isActive ? 'var(--primary-color, #3b82f6)' : 'var(--bg-secondary, #1e293b)',
                        color: '#ffffff',
                        fontWeight: isActive ? 'bold' : 'normal',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span>{mode.icon}</span>
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
              <small className="text-muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                Destination du règlement : <strong>{selectedPaymentInfo?.targetAccount}</strong>
              </small>
            </div>

            <h3>Configuration des Intervalles</h3>

            {/* 1. Intervalle de Facturation */}
            <div style={{ marginBottom: '1.5rem', marginTop: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                📅 Intervalle de Facturation (Du ... Au ...) :
              </label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <small style={{ display: 'block' }}>Date Début :</small>
                  <input
                    type="date"
                    value={invoicePeriod.start}
                    onChange={(e) => setInvoicePeriod({ ...invoicePeriod, start: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
                <span>au</span>
                <div>
                  <small style={{ display: 'block' }}>Date Fin :</small>
                  <input
                    type="date"
                    min={invoicePeriod.start}
                    value={invoicePeriod.end}
                    onChange={(e) => setInvoicePeriod({ ...invoicePeriod, end: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
              </div>
            </div>

            {/* 2. Choix de la Période de Règlement */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                ⏳ Intervalle de Règlement Autorisé :
              </label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="radio" name="paymentDate" value="maintenant" checked={paymentDateChoice === "maintenant"} onChange={() => setPaymentDateChoice("maintenant")} />
                  Même période (Comptant)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="radio" name="paymentDate" value="custom_days_range" checked={paymentDateChoice === "custom_days_range"} onChange={() => setPaymentDateChoice("custom_days_range")} />
                  Intervalle de jours accordés
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="radio" name="paymentDate" value="custom_range" checked={paymentDateChoice === "custom_range"} onChange={() => setPaymentDateChoice("custom_range")} />
                  Intervalle de dates fixes
                </label>
              </div>
            </div>

            {paymentDateChoice === "custom_days_range" && (
              <div style={{ marginBottom: '1.5rem', paddingLeft: '1rem', borderLeft: '3px solid var(--primary-color, #3b82f6)' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Plage de jours accordés :</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <small style={{ display: 'block' }}>Min (Jours) :</small>
                    <input
                      type="number"
                      min="0"
                      value={customDaysRange.min}
                      onChange={(e) => setCustomDaysRange({ ...customDaysRange, min: e.target.value })}
                      style={{ padding: '0.5rem', width: '100px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                  </div>
                  <span>à</span>
                  <div>
                    <small style={{ display: 'block' }}>Max (Jours) :</small>
                    <input
                      type="number"
                      min={customDaysRange.min}
                      value={customDaysRange.max}
                      onChange={(e) => setCustomDaysRange({ ...customDaysRange, max: e.target.value })}
                      style={{ padding: '0.5rem', width: '100px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {paymentDateChoice === "custom_range" && (
              <div style={{ marginBottom: '1.5rem', paddingLeft: '1rem', borderLeft: '3px solid var(--primary-color, #3b82f6)' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Plage exacte de règlement :</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={duePeriod.start}
                    onChange={(e) => setDuePeriod({ ...duePeriod, start: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  <span>au</span>
                  <input
                    type="date"
                    min={duePeriod.start}
                    value={duePeriod.end}
                    onChange={(e) => setDuePeriod({ ...duePeriod, end: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
              </div>
            )}

            <div style={{ padding: '0.75rem', background: '#f1f5f9', color: '#334155', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              📌 Mode : <strong>{selectedPaymentInfo?.label}</strong> (vers {selectedPaymentInfo?.targetAccount}) | Intervalle de règlement : Du <strong>{currentDueRange.start}</strong> au <strong>{currentDueRange.end}</strong>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={handleValidateInvoice} disabled={loading}>
              {loading ? "Génération de la facture..." : "Valider et Générer la Facture"}
            </button>
          </div>
        )}

        {/* Étape 2 : Exécution de la transaction */}
        {step === 2 && (
          <div>
            <div style={{ padding: '1.5rem', background: '#ecfdf5', border: '1px solid #10b981', color: '#047857', borderRadius: 'var(--radius-md, 6px)', marginBottom: '2rem', textAlign: 'center' }}>
              Facture créée et validée avec succès ! (Réf interne: {invoiceId})
            </div>

            <h3>Procéder au Paiement</h3>
            <p style={{ marginBottom: '0.5rem' }}>Montant dû : <strong>{formatMontant(finalTotal)}</strong></p>
            <p style={{ marginBottom: '1.5rem', color: '#64748b' }}>
              Destination du règlement : <strong>{selectedPaymentInfo?.targetAccount}</strong> ({selectedPaymentInfo?.label})
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                📆 Intervalle d'exécution du règlement :
              </label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <small style={{ display: 'block' }}>Début :</small>
                  <input
                    type="date"
                    value={paymentPeriod.start}
                    onChange={(e) => setPaymentPeriod({ ...paymentPeriod, start: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
                <span>au</span>
                <div>
                  <small style={{ display: 'block' }}>Fin :</small>
                  <input
                    type="date"
                    min={paymentPeriod.start}
                    value={paymentPeriod.end}
                    onChange={(e) => setPaymentPeriod({ ...paymentPeriod, end: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', background: '#10b981' }} onClick={handlePayment} disabled={loading}>
              {loading ? "Paiement en cours..." : `Payer (${selectedPaymentInfo?.targetAccount})`}
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '1rem' }} onClick={() => onComplete()} disabled={loading}>
              Payer plus tard (Fermer)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}