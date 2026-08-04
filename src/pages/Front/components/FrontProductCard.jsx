import React from 'react';
import { formatMontant, getProductPriceVariants } from './FrontOfficeUtils.jsx';

export default function FrontProductCard({ prod, cart, openAddToCartModal }) {
  const variants = getProductPriceVariants(prod);
  const defaultVariant = variants[0] || { priceHT: 0, taxRate: 0, priceTTC: 0 };

  const totalQtyInCart = cart
    .filter((item) => item.id === prod.id || item.ref === prod.ref)
    .reduce((sum, i) => sum + i.qty, 0);

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0' }}>{prod.label || prod.libelle || prod.produit}</h3>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          Réf: <strong>{prod.ref || prod.ref_produit}</strong>
        </p>

        <div style={{ background: '#1e293b', padding: '0.8rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>Prix à partir de :</span>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.2rem' }}>
            {formatMontant(defaultVariant.priceHT)} <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>HT</span>
          </div>
          
          {/* Affichage du taux TVA et prix TTC */}
          <div style={{ fontSize: '0.8rem', marginTop: '0.6rem', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>
              TVA: <strong style={{ color: '#f59e0b' }}>{defaultVariant.taxRate}%</strong>
            </span>
            <span>
              TTC: <strong style={{ color: '#10b981' }}>{formatMontant(defaultVariant.priceTTC)}</strong>
            </span>
          </div>

          {variants.length > 1 && (
            <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.3rem', display: 'block' }}>
              ⚡ {variants.length} déclinaisons de prix disponibles
            </span>
          )}
        </div>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 'bold' }}
        onClick={() => openAddToCartModal(prod)}
      >
        {totalQtyInCart > 0 ? `✏️ Dans le panier (${totalQtyInCart}) — Modifier` : "🛒 Choisir l'article"}
      </button>
    </div>
  );
}

