import React from 'react';
import { formatMontant, mapTargetTreasury } from './DashboardUtils.jsx';

export default function DashboardInvoiceModal({ selectedInvoiceModal, closeModal }) {
  if (!selectedInvoiceModal) return null;

  const remiseAmount = selectedInvoiceModal._amounts.totalRemiseMontant || 0;
  const surplusAmount = selectedInvoiceModal._amounts.surplusTTC || 0;
  const restantAmount = selectedInvoiceModal._amounts.restantTTC || 0;
  const remisePercent = remiseAmount > 0 && selectedInvoiceModal._amounts.totalTTC > 0
    ? ((remiseAmount / selectedInvoiceModal._amounts.totalTTC) * 100).toFixed(2)
    : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '90%', maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem', background: '#ffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Facture {selectedInvoiceModal.ref}</h3>
          <button className="btn btn-secondary" onClick={closeModal}>✕</button>
        </div>

        <p><strong>Client :</strong> {selectedInvoiceModal.socid_name || selectedInvoiceModal.nom_client || 'Client Général'}</p>
        <p><strong>Période :</strong> {selectedInvoiceModal._amounts.intervals.invoicePeriod}</p>

        <div style={{ background: '#f5f1e8', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #e8dcc8' }}>
          <table style={{ width: '100%', fontSize: '0.9rem', color: '#2c2c2c' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e8dcc8' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', color: '#555' }}>Montant Original TTC :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', textAlign: 'right' }}>{formatMontant(selectedInvoiceModal._amounts.totalTTC)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e8dcc8', background: '#faf8f4' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', color: '#555' }}>Montant Payé TTC :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', textAlign: 'right', color: '#2c5aa0' }}>{formatMontant(selectedInvoiceModal._amounts.payeTTC)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e8dcc8' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', color: '#555' }}>Reste à payer :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', textAlign: 'right', color: '#d84c2f' }}>{formatMontant(restantAmount)}</td>
              </tr>
              {surplusAmount > 0 && (
                <tr style={{ borderBottom: '1px solid #e8dcc8', background: '#faf8f4' }}>
                  <td style={{ textAlign: 'left', padding: '0.5rem', color: '#555' }}>Excédent / Surplus :</td>
                  <td style={{ padding: '0.5rem', fontWeight: 'bold', textAlign: 'right', color: '#7c3aed' }}>{formatMontant(surplusAmount)}</td>
                </tr>
              )}
              <tr style={{ background: '#e8dcc8', borderRadius: '0 0 4px 4px' }}>
                <td style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 'bold', color: '#c47808' }}>Remise Réglement :</td>
                <td style={{ padding: '0.5rem', fontWeight: 'bold', textAlign: 'right', color: '#c47808', fontSize: '1.1rem' }}>
                  {formatMontant(remiseAmount)} ({remisePercent}%)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 style={{ marginTop: '1rem', borderBottom: '1px solid #e8dcc8', paddingBottom: '0.5rem', color: '#2c2c2c' }}>Règlements enregistrés</h4>
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
