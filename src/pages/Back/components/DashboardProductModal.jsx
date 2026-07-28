import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function DashboardProductModal({ selectedProductModal, closeModal }) {
  if (!selectedProductModal) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem', background: '#ffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>📦 {selectedProductModal.label}</h3>
          <button className="btn btn-secondary" onClick={closeModal}>✕</button>
        </div>

        <p><strong>Référence :</strong> {selectedProductModal.ref}</p>
        <p><strong>Prix Unitaire :</strong> {formatMontant(selectedProductModal.unitPrice)}</p>
        <p><strong>Total Quantités Vendues :</strong> {selectedProductModal.totalQty}</p>
        <p><strong>CA Total Généré :</strong> {formatMontant(selectedProductModal.totalSalesTTC)} TTC</p>

        <h4 style={{ marginTop: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.25rem' }}>Factures associées</h4>
        <table style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
              <th>Réf Facture</th>
              <th>Client</th>
              <th>Qté</th>
              <th style={{ textAlign: 'right' }}>Total TTC</th>
            </tr>
          </thead>
          <tbody>
            {selectedProductModal.invoices.map((inv, idx) => (
              <tr key={idx}>
                <td style={{ color: 'var(--primary-color)' }}>{inv.invoiceRef}</td>
                <td>{inv.client}</td>
                <td>{inv.qty}</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(inv.lineTotalTTC)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
