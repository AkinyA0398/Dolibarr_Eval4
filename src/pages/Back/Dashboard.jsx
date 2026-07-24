import React, { useState, useEffect, useMemo } from 'react';
import { apiDolibarr } from '../../api/apiDolibarr';

const formatMontant = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

const extractInvoiceAmounts = (inv) => {
  const total = parseFloat(inv.total_ttc || inv.total || 0);
  
  // Statut "Payée" dans Dolibarr (statut = 2 / status = 2 / paye = 1)
  const isStatutPaid = 
    String(inv.statut) === '2' || 
    String(inv.status) === '2' || 
    inv.paye === '1' || 
    inv.paye === 1;

  // Récupération souple des champs de paiement
  const payeRaw = parseFloat(
    inv.paid || inv.totalpaid || inv.total_paid || inv.amount_paid || inv.paye || 0
  );

  // Si la facture est au statut "Payée" mais que la propriété 'paid' est à 0, on retient le total
  const paye = (isStatutPaid && payeRaw === 0) ? total : payeRaw;
  const restant = Math.max(0, total - paye);

  return { total, paye, restant };
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);

  // ── 🎯 ÉTATS DES FILTRES ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState("");
  const [filterMonth, setFilterMonth]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL"); // ALL | PAID | UNPAID

  const [selectedMonth, setSelectedMonth]     = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const factures = await apiDolibarr.getInvoices();
        const products = await apiDolibarr.getProducts();

        setRawInvoices(factures || []);
        setRawProducts(products || []);
      } catch (err) {
        console.error("Erreur de chargement des données du dashboard", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  // ── 🗓️ LISTE DE TOUS LES MOIS DISPONIBLES DANS LES DONNÉES ─────────────
  const availableMonths = useMemo(() => {
    const months = new Set();

    // 1. Mois issus des factures
    rawInvoices.forEach(inv => {
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      if (d && !isNaN(d.getTime())) {
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      // 2. Mois issus des paiements rattachés à ces factures
      if (inv.payments || inv.paiements) {
        const payList = inv.payments || inv.paiements;
        payList.forEach(p => {
          const rawDate = p.datep || p.datepaye || p.date_payment || p.date;
          let dp = new Date(isNaN(rawDate) ? rawDate : Number(rawDate) * 1000);
          if (dp && !isNaN(dp.getTime())) {
            months.add(`${dp.getFullYear()}-${String(dp.getMonth() + 1).padStart(2, '0')}`);
          }
        });
      }
    });

    return Array.from(months).sort().reverse();
  }, [rawInvoices]);

  // ── ⚡ FILTRAGE EN TEMPS RÉEL DE TOUTES LES FACTURES ─────────────────────
  const filteredInvoices = useMemo(() => {
    return rawInvoices.filter(inv => {
      // 1. Calcul de la date & du mois
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      const monthKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : "";

      // Filtre par Mois
      if (filterMonth !== "ALL" && monthKey !== filterMonth) return false;

      // Calcul montant et reste via le helper
      const { restant } = extractInvoiceAmounts(inv);

      // Filtre par Statut (Payé / Non payé)
      if (filterStatus === "PAID" && restant > 0.01) return false;
      if (filterStatus === "UNPAID" && restant <= 0.01) return false;

      // Filtre par Recherche Textuelle (Ref facture ou Nom client)
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const refMatch = inv.ref?.toLowerCase().includes(query);
        const clientMatch = (inv.socid_name || inv.nom_client || "").toLowerCase().includes(query);
        if (!refMatch && !clientMatch) return false;
      }

      return true;
    });
  }, [rawInvoices, filterMonth, filterStatus, searchQuery]);

  // ── 📊 AGRÉGATION PAR MOIS À PARTIR DES FACTURES FILTRÉES ──────────────
  const invoicesByMonth = useMemo(() => {
    const monthly = {};
    filteredInvoices.forEach(inv => {
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      if (!d) return;

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[monthKey]) {
        monthly[monthKey] = { total: 0, paye: 0, restant: 0, factures: [] };
      }

      const { total, paye, restant } = extractInvoiceAmounts(inv);

      monthly[monthKey].total += total;
      monthly[monthKey].paye += paye;
      monthly[monthKey].restant += restant;
      monthly[monthKey].factures.push({
        ...inv,
        _total: total,
        _paye: paye,
        _restant: restant,
        _date: d.toLocaleDateString('fr-FR')
      });
    });
    return monthly;
  }, [filteredInvoices]);

  // ── 🛍️ VENTES PAR PRODUIT À PARTIR DES FACTURES FILTRÉES ───────────────
  const salesByProduct = useMemo(() => {
    const productSales = {};
    rawProducts.forEach(p => {
      productSales[p.id] = {
        label: p.label,
        ref: p.ref,
        total_sales: 0,
        price: p.price
      };
    });

    filteredInvoices.forEach(inv => {
      if (inv.lines) {
        inv.lines.forEach(l => {
          if (l.fk_product && productSales[l.fk_product]) {
            productSales[l.fk_product].total_sales += parseFloat(l.total_ttc || (l.subprice * l.qty) || 0);
          }
        });
      }
    });

    // Si recherche par texte produit
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      Object.keys(productSales).forEach(id => {
        const prod = productSales[id];
        if (!prod.label.toLowerCase().includes(q) && !prod.ref.toLowerCase().includes(q)) {
          delete productSales[id];
        }
      });
    }

    return productSales;
  }, [rawProducts, filteredInvoices, searchQuery]);

  // ── 📈 KPI GLOBAUX RÉSUMÉS ───────────────────────────────────────────────
  const globalKpis = useMemo(() => {
    let total = 0, paye = 0, restant = 0;
    filteredInvoices.forEach(inv => {
      const amounts = extractInvoiceAmounts(inv);
      total += amounts.total;
      paye += amounts.paye;
      restant += amounts.restant;
    });
    return { total, paye, restant, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const resetFilters = () => {
    setSearchQuery("");
    setFilterMonth("ALL");
    setFilterStatus("ALL");
  };

  if (loading) return (
    <div className="container flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div className="text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>⏳</div>
        <p style={{ fontWeight: '600', fontSize: '1.25rem' }}>Chargement des KPI...</p>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ padding: '20px', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <span>📊</span> Tableau de Bord — Série 4
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', fontWeight: '500' }}>
            Analyse des factures et des ventes de produits
          </p>
        </div>

        {(searchQuery || filterMonth !== "ALL" || filterStatus !== "ALL") && (
          <button 
            onClick={resetFilters}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            🔄 Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* ── 🎛️ BARRE DE FILTRES COMPLÈTE ───────────────────────────────────── */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem', background: 'var(--bg-secondary, #1e293b)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center' }}>
          
          {/* Recherche texte */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>
              🔍 Recherche
            </label>
            <input
              type="text"
              placeholder="Réf. Facture, Client, Produit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md, 6px)',
                border: '1px solid var(--border-color, #334155)',
                background: '#0f172a',
                color: '#f1f5f9'
              }}
            />
          </div>

          {/* Filtre Mois */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>
              📅 Période (Mois)
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md, 6px)',
                border: '1px solid var(--border-color, #334155)',
                background: '#0f172a',
                color: '#f1f5f9'
              }}
            >
              <option value="ALL">Toutes les périodes</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Filtre Statut de Paiement */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>
              💳 Statut du paiement
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md, 6px)',
                border: '1px solid var(--border-color, #334155)',
                background: '#0f172a',
                color: '#f1f5f9'
              }}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PAID">🟢 Payées uniquement</option>
              <option value="UNPAID">🔴 Non payées / En attente</option>
            </select>
          </div>

        </div>

        {/* Résumé des KPIs filtrés */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #334155)', flexWrap: 'wrap', fontSize: '0.9rem' }}>
          <div>Factures : <strong>{globalKpis.count}</strong></div>
          <div>Total : <strong>{formatMontant(globalKpis.total)}</strong></div>
          <div style={{ color: '#10b981' }}>Encaissé : <strong>{formatMontant(globalKpis.paye)}</strong></div>
          <div style={{ color: '#f43f5e' }}>Reste à payer : <strong>{formatMontant(globalKpis.restant)}</strong></div>
        </div>
      </div>

      {/* ── 📊 CONTENU PRINCIPAL EN 2 COLONNES ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* Colonne Gauche : Factures par Mois */}
        <div style={{ flex: '1 1 45%' }}>
          <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Facturation par Mois</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {Object.keys(invoicesByMonth).sort().reverse().map(monthKey => {
              const data = invoicesByMonth[monthKey];
              const isSelected = selectedMonth === monthKey;
              return (
                <div 
                  key={monthKey} 
                  className="card" 
                  style={{ padding: '1.5rem', cursor: 'pointer', borderLeft: isSelected ? '4px solid var(--primary-color)' : '4px solid transparent' }} 
                  onClick={() => setSelectedMonth(isSelected ? null : monthKey)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '1.2rem' }}>{monthKey}</h4>
                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{formatMontant(data.total)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    <span style={{ color: '#10b981' }}>Payé: {formatMontant(data.paye)}</span>
                    <span style={{ color: '#f43f5e' }}>Restant: {formatMontant(data.restant)}</span>
                  </div>

                  {isSelected && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                      <table className="compact-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                        <thead>
                          <tr>
                            <th>Réf</th>
                            <th>Date</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                            <th style={{ textAlign: 'right' }}>Restant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.factures.map(f => (
                            <tr key={f.id}>
                              <td>{f.ref}</td>
                              <td>{f._date}</td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(f._total)}</td>
                              <td style={{ textAlign: 'right', color: f._restant > 0 ? '#f43f5e' : '#10b981' }}>{formatMontant(f._restant)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {Object.keys(invoicesByMonth).length === 0 && (
              <p className="text-muted" style={{ fontStyle: 'italic' }}>Aucune facture ne correspond à ces critères.</p>
            )}
          </div>
        </div>

        {/* Colonne Droite : Ventes par Produit */}
        <div style={{ flex: '1 1 45%' }}>
          <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Ventes par Produit</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {Object.values(salesByProduct).map(prod => {
              const isSelected = selectedProduct === prod.ref;
              return (
                <div 
                  key={prod.ref} 
                  className="card" 
                  style={{ padding: '1.5rem', cursor: 'pointer', borderLeft: isSelected ? '4px solid var(--accent-color)' : '4px solid transparent' }} 
                  onClick={() => setSelectedProduct(isSelected ? null : prod.ref)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{prod.label}</h4>
                      <small className="text-muted">Réf: {prod.ref}</small>
                    </div>
                    <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{formatMontant(prod.total_sales)}</span>
                  </div>

                  {isSelected && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                      <p><strong>Prix unitaire (catalogue) :</strong> {formatMontant(prod.price)}</p>
                      <p className="text-muted"><em>Le total des ventes reflète les factures sélectionnées par le filtre.</em></p>
                    </div>
                  )}
                </div>
              );
            })}
            {Object.keys(salesByProduct).length === 0 && (
              <p className="text-muted" style={{ fontStyle: 'italic' }}>Aucun produit correspondant.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}