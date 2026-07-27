import React, { useState, useEffect } from "react";
import { apiDolibarr } from "../../api/apiDolibarr";
import Checkout from "./Checkout.jsx";

const formatMontant = (val) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);
};

export default function FrontOffice() {
  const [clientName, setClientName] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLogged) {
      loadProducts();
    }
  }, [isLogged]);

  const loadProducts = async () => {
    setLoading(true);
    const prods = await apiDolibarr.getProducts();
    setProducts(prods);
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    setLoading(true);
    try {
      // Rechercher le client
      const clients = await apiDolibarr.getThirdparties();
      let found = clients.find(c => c.name.toLowerCase() === clientName.trim().toLowerCase());
      
      if (!found) {
        // Auto-inscription
        const newClientId = await apiDolibarr.createThirdparty({ 
            name: clientName.trim(), 
            code_client: 'C' + Math.floor(Math.random() * 10000) 
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

  // ➕ Ajouter ou augmenter la quantité d'un produit
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  // ➖ Retirer ou diminuer la quantité d'un produit
  const removeFromCart = (productId) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === productId);
      if (!existing) return prev;

      if (existing.qty === 1) {
        // Retire complètement le produit s'il reste 1 unité
        return prev.filter(item => item.id !== productId);
      } else {
        // Décrémente la quantité
        return prev.map(item => item.id === productId ? { ...item, qty: item.qty - 1 } : item);
      }
    });
  };

  // Helper pour récupérer la quantité d'un produit dans le panier
  const getProductQtyInCart = (productId) => {
    const item = cart.find(i => i.id === productId);
    return item ? item.qty : 0;
  };

  const cartTotal = cart.reduce((acc, item) => acc + (parseFloat(item.price) * item.qty), 0);

  if (isCheckingOut) {
    return <Checkout cart={cart} total={cartTotal} user={currentUser} onBack={() => setIsCheckingOut(false)} onComplete={() => { setCart([]); setIsCheckingOut(false); }} />;
  }

  if (!isLogged) {
    return (
      <div className="container animate-fade-in" style={{ maxWidth: '400px', marginTop: '100px' }}>
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Espace Client</h2>
          <form onSubmit={handleLogin} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="text" 
              placeholder="Votre nom (ex: rakoto)" 
              value={clientName} 
              onChange={e => setClientName(e.target.value)} 
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc' }}
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
    <div className="container animate-fade-in" style={{ padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2>Bienvenue, <span style={{ color: 'var(--primary-color)' }}>{currentUser.name}</span> 👋</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold' }}>🛒 Panier : {cart.reduce((a,c) => a + c.qty, 0)} articles ({formatMontant(cartTotal)})</span>
          <button className="btn btn-primary" onClick={() => setIsCheckingOut(true)} disabled={cart.length === 0}>Valider le Panier</button>
          <button className="btn btn-secondary" onClick={() => setIsLogged(false)}>Déconnexion</button>
        </div>
      </div>

      {loading ? (
         <div style={{ textAlign: 'center', padding: '3rem' }}>⏳ Chargement des produits...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
          {products.map(prod => {
            const qtyInCart = getProductQtyInCart(prod.id);

            return (
              <div key={prod.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>{prod.label}</h3>
                  <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Réf: {prod.ref}</p>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)', marginBottom: '1rem' }}>
                    {formatMontant(prod.price)}
                  </div>
                </div>

                {/* CONTROLES D'AJOUT ET DE RETRAIT DE PANIER */}
                {qtyInCart > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--primary-color)', borderRadius: '6px', padding: '0.25rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontWeight: 'bold' }} 
                      onClick={() => removeFromCart(prod.id)}
                    >
                      ➖
                    </button>
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{qtyInCart}</span>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '0.4rem 0.8rem', fontWeight: 'bold' }} 
                      onClick={() => addToCart(prod)}
                    >
                      ➕
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => addToCart(prod)}>
                    🛒 Ajouter au Panier
                  </button>
                )}
              </div>
            );
          })}
          {products.length === 0 && <p>Aucun produit disponible.</p>}
        </div>
      )}
    </div>
  );
}