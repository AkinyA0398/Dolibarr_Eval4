import React, { useState, useEffect } from "react";
import { apiDolibarr } from "../../api/apiDolibarr";

const formatMontant = (val) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);
};

export default function Checkout({ cart, total, user, onBack, onComplete }) {
  const [remisesConfig, setRemisesConfig] = useState([]);
  const [paymentDateChoice, setPaymentDateChoice] = useState("maintenant");
  const [customDays, setCustomDays] = useState(7);
  
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Choix délai, 2: Paiement
  const [invoiceId, setInvoiceId] = useState(null);
  
  const [discountPercent, setDiscountPercent] = useState(0);

  useEffect(() => {
    // Fetch discount configuration from SQLite Python Backend
    fetch('http://localhost:5000/api/remises')
      .then(res => res.json())
      .then(data => setRemisesConfig(data))
      .catch(err => {
        console.error("Erreur fetching remises", err);
        // Fallback default
        setRemisesConfig([
          { max_days: 0, discount_percentage: 30 },
          { max_days: 7, discount_percentage: 15 },
          { max_days: 30, discount_percentage: 10 },
          { max_days: 9999, discount_percentage: 0 }
        ]);
      });
  }, []);

  const calculateDiscount = (days) => {
    const sorted = [...remisesConfig].sort((a,b) => a.max_days - b.max_days);
    for (const conf of sorted) {
      if (days <= conf.max_days || conf.max_days === 9999) {
        return conf.discount_percentage;
      }
    }
    return 0;
  };

  useEffect(() => {
    let days = 0;
    if (paymentDateChoice === "custom") {
      days = parseInt(customDays) || 0;
    }
    setDiscountPercent(calculateDiscount(days));
  }, [paymentDateChoice, customDays, remisesConfig]);

  const discountAmount = total * (discountPercent / 100);
  const finalTotal = total - discountAmount;

  const handleValidateInvoice = async () => {
    setLoading(true);
    try {
      // 1. Create Invoice
      const invData = {
        socid: user.id,
        date: new Date().toISOString().split('T')[0],
        date_limite_reglement: paymentDateChoice === "maintenant" ? new Date().toISOString().split('T')[0] : null,
      };
      
      const createdInvoiceId = await apiDolibarr.createInvoice(invData);
      setInvoiceId(createdInvoiceId);

      // 2. Add Lines
      for (const item of cart) {
        const lineData = {
          fk_product: item.id,
          desc: item.label,
          pu_hors_Taxe: item.price,
          qty: item.qty,
          remise: discountPercent // Apply calculated discount to the line
        };
        await apiDolibarr.addInvoiceLine(createdInvoiceId, lineData);
      }

      // 3. Validate Invoice
      await apiDolibarr.validateInvoice(createdInvoiceId);
      
      setStep(2); // Move to payment screen
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création de la facture");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    try {
      const paymentData = {
        date: new Date().toISOString().split('T')[0],
        caisse: "Saisie Front",
        montant: finalTotal,
        invoice_id: invoiceId
      };
      await apiDolibarr.createPayment(paymentData);
      alert("Paiement enregistré avec succès !");
      onComplete();
    } catch (err) {
      console.error(err);
      alert("Erreur lors du paiement");
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
          {step === 1 ? "Validation de la Commande" : "Saisie Règlement"}
        </h2>

        {/* Recap */}
        <div style={{ background: 'var(--surface-color)', padding: '1.5rem', borderRadius: 'var(--radius-sm)', marginBottom: '2rem' }}>
          <h3>Récapitulatif</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {cart.map((item, idx) => (
              <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
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
              <span>Remise ({discountPercent}%) :</span>
              <span>- {formatMontant(discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', marginTop: '0.5rem', borderTop: '2px solid var(--border-color)', paddingTop: '0.5rem' }}>
            <span>Total à Payer :</span>
            <span style={{ color: 'var(--primary-color)', fontWeight: '900' }}>{formatMontant(finalTotal)}</span>
          </div>
        </div>

        {step === 1 && (
          <div>
            <h3>Délai de Règlement</h3>
            <p className="text-muted">Choisissez votre délai pour bénéficier d'une remise selon nos conditions.</p>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="radio" name="paymentDate" value="maintenant" checked={paymentDateChoice === "maintenant"} onChange={() => setPaymentDateChoice("maintenant")} />
                Maintenant
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="radio" name="paymentDate" value="custom" checked={paymentDateChoice === "custom"} onChange={() => setPaymentDateChoice("custom")} />
                Dans X jours
              </label>
            </div>

            {paymentDateChoice === "custom" && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nombre de jours :</label>
                <input type="number" min="1" value={customDays} onChange={(e) => setCustomDays(e.target.value)} style={{ padding: '0.5rem', width: '100px' }} />
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={handleValidateInvoice} disabled={loading}>
              {loading ? "Génération de la facture..." : "Valider et Générer la Facture"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ padding: '1.5rem', background: '#ecfdf5', border: '1px solid #10b981', color: '#047857', borderRadius: 'var(--radius-md)', marginBottom: '2rem', textAlign: 'center' }}>
              Facture créée et validée avec succès ! (Réf interne: {invoiceId})
            </div>
            
            <h3>Procéder au Paiement</h3>
            <p>Montant dû : <strong>{formatMontant(finalTotal)}</strong></p>
            
            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', background: '#10b981' }} onClick={handlePayment} disabled={loading}>
              {loading ? "Paiement en cours..." : "Payer Maintenant"}
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
