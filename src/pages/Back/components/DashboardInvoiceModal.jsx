import React from 'react';
import { formatMontant, mapTargetTreasury } from './DashboardUtils.jsx';

export default function DashboardInvoiceModal({ selectedInvoiceModal, closeModal }) {
  if (!selectedInvoiceModal) return null;

  const remiseAmount = selectedInvoiceModal._amounts.totalTTC - selectedInvoiceModal._amounts.payeTTC;
  const remisePercent = remiseAmount > 0 && selectedInvoiceModal._amounts.totalTTC > 0
    ? ((remiseAmount / selectedInvoiceModal._amounts.totalTTC) * 100).toFixed(2)
    : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '90%', maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem', background: '#1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Facture {selectedInvoiceModal.ref}</h3>
          <button className="btn btn-secondary" onClick={closeModal}>✕</button>
        </div>

        <p><strong>Client :</strong> {selectedInvoiceModal.socid_name || selectedInvoiceModal.nom_client || 'Client Général'}</p>
        <p><strong>Période :</strong> {selectedInvoiceModal._amounts.intervals.invoicePeriod}</p>

        <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #334155' }}>
          <table style={{ width: '100%', fontSize: '0.9rem', textAlign: 'right' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', color: '#94a3b8' }}>Montant Original TTC :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', color: '#cbd5e1' }}>{formatMontant(selectedInvoiceModal._amounts.totalTTC)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', color: '#94a3b8' }}>Montant Payé TTC :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', color: '#10b981' }}>{formatMontant(selectedInvoiceModal._amounts.payeTTC)}</td>
              </tr>
              <tr style={{ background: '#1e293b' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold', color: '#f59e0b' }}>Remise Réglement :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', color: '#f59e0b', fontSize: '1.1rem' }}>
                  {formatMontant(remiseAmount)} ({remisePercent}%)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 style={{ marginTop: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.25rem' }}>Règlements enregistrés</h4>
        {selectedInvoiceModal._amounts.linePayments.length > 0 ? (
          <ul style={{ paddingLeft: '1.2rem' }}>
            {selectedInvoiceModal._amounts.linePayments.map((p, idx) => (
              <li key={idx} style={{ marginBottom: '0.4rem' }}>
                {mapTargetTreasury(p) === 'Caisse' ? '💵' : '💳'} <strong>{formatMontant(p.montant || p.amount)}</strong> sur <em>{p.caisse || p.banque || p.bank_account_ref || p.account_label || p.label || 'Compte Trésorerie'}</em> ({p.date_reglement || p.date || '-'})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Aucun enregistrement individuel de règlement (Montant déduit de la facture globalement).</p>
        )}
      </div>
    </div>
  );
}
