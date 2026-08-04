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

        <h4 style={{ marginTop: '1rem', borderBottom: '1px solid #e8dcc8', paddingBottom: '0.5rem', color: '#2c2c2c' }}>Factures associées</h4>
        <table style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.5rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#e8dcc8', textAlign: 'left', borderBottom: '2px solid #d9cfc0', color: '#2c2c2c' }}>
              <th style={{ padding: '0.6rem 0.8rem', fontWeight: '600' }}>Réf Facture</th>
              <th style={{ padding: '0.6rem 0.8rem', fontWeight: '600' }}>Client</th>
              <th style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'center' }}>Qté</th>
              <th style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right' }}>Total TTC</th>
            </tr>
          </thead>
          <tbody>
            {selectedProductModal.invoices.map((inv, idx) => {
              const isEvenRow = idx % 2 === 0;
              return (
                <tr key={idx} style={{ background: isEvenRow ? '#faf8f4' : '#f5f1e8', borderBottom: '1px solid #e8dcc8', color: '#2c2c2c' }}>
                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', color: '#2c5aa0' }}>{inv.invoiceRef}</td>
                  <td style={{ padding: '0.6rem 0.8rem' }}>{inv.client}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>{inv.qty}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: '600' }}>{formatMontant(inv.lineTotalTTC)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
