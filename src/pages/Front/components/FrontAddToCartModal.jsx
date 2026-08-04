import React from 'react';
import { formatMontant } from './FrontOfficeUtils.jsx';

export default function FrontAddToCartModal({
  selectedProductForCart,
  selectedVariant,
  variants,
  modalQty,
  modalDiscount,
  delayDays,
  cart,
  setSelectedVariant,
  setModalQty,
  setModalDiscount,
  removeFromCart,
  closeModal,
  confirmAddToCart,
}) {
  const currentCartItemId = `${selectedProductForCart.id || selectedProductForCart.ref}_${selectedVariant.variantId}`;
  const isAlreadyInCart = cart.some((item) => item.cartItemId === currentCartItemId);
  const currentQty = Number(modalQty) || 0;
  const currentDiscount = Number(modalDiscount) || 0;
  const subtotalTTC = selectedVariant.priceTTC * (1 - currentDiscount / 100) * currentQty;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem'
      }}
      onClick={closeModal}
    >
      <div
        className="card"
        style={{ maxWidth: '460px', width: '100%', padding: '1.75rem', background: '#ffff', borderRadius: '10px', border: '1px solid #334155' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>🛒 Sélection du produit</h3>
        <h4 style={{ color: '#38bdf8', margin: '0 0 1.25rem 0' }}>
          {selectedProductForCart.label || selectedProductForCart.libelle || selectedProductForCart.produit}
        </h4>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '0.4rem' }}>
            📋 Choisir le prix / taux de TVA :
          </label>
          <select
            value={selectedVariant.variantId}
            onChange={(e) => {
              const newV = variants.find((v) => v.variantId === e.target.value);
              if (newV) {
                setSelectedVariant(newV);
                const cId = `${selectedProductForCart.id || selectedProductForCart.ref}_${newV.variantId}`;
                const match = cart.find((i) => i.cartItemId === cId);
                setModalQty(match ? match.qty : 1);
              }
            }}
            style={{
              width: '100%', padding: '0.65rem', borderRadius: '6px', background: '#1e293b',
              color: '#fff', border: '1px solid #334155', fontSize: '0.9rem', cursor: 'pointer'
            }}
          >
            {variants.map((v) => (
              <option key={v.variantId} value={v.variantId}>
                {formatMontant(v.priceHT)} HT — TVA {v.taxRate}% (TTC: {formatMontant(v.priceTTC)})
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '0.85rem', background: '#ffff', padding: '0.85rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span className="text-muted">Prix Unitaire HT :</span>
            <strong>{formatMontant(selectedVariant.priceHT)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span className="text-muted">Taux TVA (%) :</span>
            <strong style={{ color: '#38bdf8' }}>{selectedVariant.taxRate}%</strong>
          </div>
          <div style={{ borderTop: '1px solid #334155', marginTop: '0.4rem', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', color: '#10b981', fontWeight: 'bold' }}>
            <span>Prix Unitaire TTC :</span>
            <span>{formatMontant(selectedVariant.priceTTC)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>
              Quantité :
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '1.2rem', fontWeight: 'bold' }}
                onClick={() => setModalQty((q) => Math.max(1, (Number(q) || 1) - 1))}
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={modalQty}
                onChange={(e) => setModalQty(e.target.value)}
                style={{
                  textAlign: 'center', width: '100%', padding: '0.6rem', borderRadius: '6px',
                  border: '1px solid #334155', background: '#1c2533', color: '#fff', fontWeight: 'bold', fontSize: '1.1rem'
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '1.2rem', fontWeight: 'bold' }}
                onClick={() => setModalQty((q) => (Number(q) || 0) + 1)}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>
              Remise (%) : <span style={{ color: '#38bdf8' }}>(Basée sur les règles du délai de {delayDays}j)</span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={modalDiscount}
              onChange={(e) => setModalDiscount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155', background: '#1c2533', color: '#fff' }}
            />
          </div>

          <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem', textAlign: 'right' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem', display: 'block' }}>Sous-total TTC pour cette ligne :</span>
            <strong style={{ fontSize: '1.3rem', color: '#10b981' }}>
              {formatMontant(subtotalTTC)}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          {isAlreadyInCart && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: '#f43f5e', borderColor: '#f43f5e' }}
              onClick={() => {
                removeFromCart(currentCartItemId);
                closeModal();
              }}
            >
              🗑️ Retirer
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={closeModal}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmAddToCart}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
