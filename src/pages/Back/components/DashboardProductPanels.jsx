import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function DashboardProductPanels({ salesByProduct, setSelectedProductModal }) {
  if (salesByProduct.length === 0) {
    return <p>Aucun produit vendu pour la période sélectionnée.</p>;
  }

  return (
    <div>
      <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Ventes & Détails par Produit</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        {salesByProduct.map(prod => (
          <div
            key={prod.id}
            className="card"
            style={{ padding: '1.25rem', cursor: prod.invoices.length > 0 ? 'pointer' : 'default' }}
            onClick={() => prod.invoices.length > 0 && setSelectedProductModal(prod)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem' }}>📦 {prod.label}</h4>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Réf: <strong>{prod.ref}</strong> | PU de base: {formatMontant(prod.unitPrice)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ color: 'var(--primary-color)', fontSize: '1.1rem', display: 'block' }}>{formatMontant(prod.totalSalesTTC)} TTC</strong>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Qté vendue: <strong>{prod.totalQty}</strong></span>
              </div>
            </div>

            {prod.totalRemise > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#3b82f6' }}>
                🏷️ Total remises accordées sur ce produit : -{formatMontant(prod.totalRemise)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
