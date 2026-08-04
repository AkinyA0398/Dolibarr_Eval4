import React, { useState, useEffect } from "react";
import { apiDolibarr } from "../../api/apiDolibarr";
import Checkout from "./Checkout.jsx";
import Payment from "./Payment.jsx";
import { formatMontant, getProductPriceVariants } from "./components/FrontOfficeUtils.jsx";
import FrontProductCard from "./components/FrontProductCard.jsx";
import FrontAddToCartModal from "./components/FrontAddToCartModal.jsx";
import GenererPayment from "./GenererPayment.jsx";

const API_BASE = "http://localhost:5000/api";

export default function FrontOffice() {
  const [clientName, setClientName] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [payment, setPayment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generation, setGeneration] = useState(false);

  // ── 🏷️ ÉTATS POUR LES REMISES PAR JOURS & MODE DE PAIEMENT ────────────────
  const [paymentMode, setPaymentMode] = useState("cash"); // 'cash', 'cheque', 'cb'
  const [delayDays, setDelayDays] = useState(0);          // Nombre de jours de délai
  const [remiseRules, setRemiseRules] = useState([]);     // Paliers chargés depuis le backend Flask

  // ── 🛍️ ÉTAT POP-UP MODALE ────────────────────────────────────────────────
  const [selectedProductForCart, setSelectedProductForCart] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [modalQty, setModalQty] = useState(1);
  const [modalDiscount, setModalDiscount] = useState(0);

  // Charger les produits et les règles de remises au login
  useEffect(() => {
    if (isLogged) {
      loadProducts();
    }
  }, [isLogged]);

  // Charger les règles de remise à chaque changement de mode de paiement
  useEffect(() => {
    const fetchRemiseRules = async () => {
      try {
        const res = await fetch(`${API_BASE}/remises?mode=${paymentMode}`);
        if (res.ok) {
          const data = await res.json();
          data.sort((a, b) => a.max_days - b.max_days);
          setRemiseRules(data);
        }
      } catch (err) {
        console.error("Erreur chargement règles de remise", err);
      }
    };
    fetchRemiseRules();
  }, [paymentMode]);

  // Recalculer automatiquement la remise du panier dès que le délai ou le mode change
  useEffect(() => {
    if (remiseRules.length === 0) return;

    const matchingRule = remiseRules.find((rule) => delayDays <= rule.max_days) || remiseRules[remiseRules.length - 1];
    const applicableDiscount = matchingRule ? matchingRule.discount_percentage : 0;

    setCart((prevCart) =>
      prevCart.map((item) => ({
        ...item,
        discount: applicableDiscount,
      }))
    );
  }, [delayDays, remiseRules]);

  // Fermeture modale avec la touche Échap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedProductForCart) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProductForCart]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const prods = await apiDolibarr.getProducts();
      
      // 🔍 INSPECTION DES DONNÉES BRUTES DE L'API DOLIBARR
      console.log("PRODUITS BRUTS DOLIBARR :", prods);
      
      // 📊 INSPECTION DES CHAMPS TVA
      if (prods && prods.length > 0) {
        console.log("🧐 ANALYSE TVA PRODUITS :");
        prods.forEach(p => {
          const variants = getProductPriceVariants(p);
          const mainVariant = variants[0];
          console.log(
            `  ${p.ref || p.id} (${p.label || p.libelle}) :`,
            {
              tva_tx: p.tva_tx,
              default_vat_code: p.default_vat_code,
              tva: p.tva,
              taux: p.taux,
              _tva_from_invoices: p._tva_from_invoices,
              calculatedTaxRate: mainVariant?.taxRate || 0,
              calculatedPriceTTC: mainVariant?.priceTTC || 0
            }
          );
        });
      }

      setProducts(prods || []);
    } catch (err) {
      console.error("Erreur de chargement des produits", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    setLoading(true);
    try {
      const clients = await apiDolibarr.getThirdparties();
      let found = (clients || []).find(
        (c) => c.name?.toLowerCase() === clientName.trim().toLowerCase()
      );

      if (!found) {
        const newClientId = await apiDolibarr.createThirdparty({
          name: clientName.trim(),
          code_client: "C" + Math.floor(Math.random() * 10000),
        });
        found = { id: newClientId, name: clientName.trim() };
      }

      setCurrentUser(found);
      setIsLogged(true);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la connexion");
    } finally {
      setLoading(false);
    }
  };

  // ── 🛒 OUVERTURE MODALE ─────────────────────────────────────────────────
  const openAddToCartModal = (product) => {
    const variants = getProductPriceVariants(product);
    
    const existingInCart = cart.find((item) => 
      variants.some((v) => item.cartItemId === `${product.id || product.ref}_${v.variantId}`)
    );

    const initialVariant = existingInCart 
      ? variants.find((v) => `${product.id || product.ref}_${v.variantId}` === existingInCart.cartItemId) || variants[0]
      : variants[0];

    const matchingRule = remiseRules.find((rule) => delayDays <= rule.max_days) || remiseRules[remiseRules.length - 1];
    const defaultDiscount = matchingRule ? matchingRule.discount_percentage : 0;

    setSelectedProductForCart(product);
    setSelectedVariant(initialVariant);
    setModalQty(existingInCart ? existingInCart.qty : 1);
    setModalDiscount(existingInCart ? existingInCart.discount || defaultDiscount : defaultDiscount);
  };

  const closeModal = () => {
    setSelectedProductForCart(null);
    setSelectedVariant(null);
  };

  const confirmAddToCart = () => {
    if (!selectedProductForCart || !selectedVariant) return;

    const cartItemId = `${selectedProductForCart.id || selectedProductForCart.ref}_${selectedVariant.variantId}`;
    const finalQty = Number(modalQty) || 1;

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.cartItemId === cartItemId);

      if (finalQty <= 0) {
        return prev.filter((item) => item.cartItemId !== cartItemId);
      }

      const itemData = {
        ...selectedProductForCart,
        cartItemId,
        variantId: selectedVariant.variantId,
        priceHT: selectedVariant.priceHT,
        taxRate: selectedVariant.taxRate,
        unitPriceTTC: selectedVariant.priceTTC,
        qty: finalQty,
        discount: Number(modalDiscount) || 0,
      };

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = itemData;
        return updated;
      }
      return [...prev, itemData];
    });

    closeModal();
  };

  const removeFromCart = (cartItemId) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const cartTotal = cart.reduce((acc, item) => {
    const priceWithDiscount = item.unitPriceTTC * (1 - item.discount / 100);
    return acc + priceWithDiscount * item.qty;
  }, 0);

  const selectedProductVariants = selectedProductForCart ? getProductPriceVariants(selectedProductForCart) : [];

  if (isCheckingOut) {
    return (
      <Checkout
        cart={cart}
        total={cartTotal}
        user={currentUser}
        paymentMode={paymentMode}
        delayDays={delayDays}
        onBack={() => setIsCheckingOut(false)}
        onComplete={() => {
          setCart([]);
          setIsCheckingOut(false);
        }}
      />
    );
  }

  if (payment) {
    return (
      <Payment
        cart={cart}
        total={cartTotal}
        user={currentUser}
        paymentMode={paymentMode}
        delayDays={delayDays}
        onBack={() => setPayment(false)}
        onComplete={() => {
          setCart([]);
          setPayment(false);
        }}
      />
    );
  }

  if (generation) {
    return (
      <GenererPayment
        cart={cart}
        total={cartTotal}
        user={currentUser}
        paymentMode={paymentMode}
        delayDays={delayDays}
        onBack={() => setGeneration(false)}
        onComplete={() => {
          setCart([]);
          setGeneration(false);
        }}
      />
    );
  }

  if (!isLogged) {
    return (
      <div className="container animate-fade-in" style={{ maxWidth: "400px", marginTop: "100px" }}>
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Espace Client</h2>
          <form onSubmit={handleLogin} style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <input
              type="text"
              placeholder="Votre nom (ex: rakoto)"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid #ccc" }}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in" style={{ padding: "2rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h2>
          Bienvenue, <span style={{ color: "var(--primary-color, #3b82f6)" }}>{currentUser.name}</span> 👋
        </h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "bold" }}>
            🛒 Panier : {cart.reduce((a, c) => a + c.qty, 0)} articles ({formatMontant(cartTotal)})
          </span>
          <button className="btn btn-primary" onClick={() => setIsCheckingOut(true)} disabled={cart.length === 0}>
            Valider le Panier
          </button>
          <button className="btn btn-primary" onClick={() => setPayment(true)}>
            Paiement
          </button>
          <button className="btn btn-primary" onClick={() => setGeneration(true)}>
            Génerer Paiement
          </button>
          <button className="btn btn-secondary" onClick={() => setIsLogged(false)}>
            Déconnexion
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "1rem 1.5rem", marginBottom: "2rem", background: "#1e293b", border: "1px solid #334155" }}>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.3rem" }}>
              Mode de paiement :
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              style={{ padding: "0.5rem", borderRadius: "6px", background: "#0f172a", color: "#fff", border: "1px solid #475569" }}
            >
              <option value="cash">💵 Espèces (Cash)</option>
              <option value="cheque">📝 Chèque</option>
              <option value="cb">💳 Carte Bancaire</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.3rem" }}>
              Délai de règlement (Jours) :
            </label>
            <input
              type="number"
              min="0"
              value={delayDays}
              onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
              style={{ width: "100px", padding: "0.5rem", borderRadius: "6px", background: "#0f172a", color: "#fff", border: "1px solid #475569" }}
            />
          </div>

          <div style={{ marginLeft: "auto", fontSize: "0.9rem", color: "#38bdf8" }}>
            ⚡ Remise appliquée : <strong>
              {(() => {
                const activeRule = remiseRules.find((r) => delayDays <= r.max_days) || remiseRules[remiseRules.length - 1];
                return activeRule ? `${activeRule.discount_percentage}% (${activeRule.label})` : "0%";
              })()}
            </strong>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>⏳ Chargement du catalogue...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
          {products.map((prod) => (
            <FrontProductCard key={prod.id || prod.ref} prod={prod} cart={cart} openAddToCartModal={openAddToCartModal} />
          ))}
          {products.length === 0 && <p>Aucun produit disponible dans le catalogue.</p>}
        </div>
      )}

      {selectedProductForCart && selectedVariant && (
        <FrontAddToCartModal
          selectedProductForCart={selectedProductForCart}
          selectedVariant={selectedVariant}
          variants={selectedProductVariants}
          modalQty={modalQty}
          modalDiscount={modalDiscount}
          delayDays={delayDays}
          cart={cart}
          setSelectedVariant={setSelectedVariant}
          setModalQty={setModalQty}
          setModalDiscount={setModalDiscount}
          removeFromCart={removeFromCart}
          closeModal={closeModal}
          confirmAddToCart={confirmAddToCart}
        />
      )}
    </div>
  );
}