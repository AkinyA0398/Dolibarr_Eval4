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

const formatPourcent = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(num / 100);
};

// ── 🛠️ HELPER : EXTRACTION ET CALCULS FINANCIERS DOLIBARR ─────────────────────
const extractInvoiceAmounts = (inv) => {
  const totalTTC = parseFloat(inv.total_ttc || inv.total || 0);
  const totalHT  = parseFloat(inv.total_ht || inv.total_net || inv.total_ht_amount || (totalTTC / 1.2));
  
  // 🏷️ CALCUL DES REMISES (Lignes & Globale)
  let totalRemiseMontant = 0;
  let maxRemisePercent = 0;

  if (inv.lines && inv.lines.length > 0) {
    inv.lines.forEach(l => {
      const lineRemisePct = parseFloat(l.remise_percent || l.remise || 0);
      if (lineRemisePct > maxRemisePercent) maxRemisePercent = lineRemisePct;

      const lineQty = parseFloat(l.qty || 1);
      const linePu = parseFloat(l.subprice || l.pu_ht || 0);
      
      if (lineRemisePct > 0) {
        totalRemiseMontant += (linePu * lineQty * (lineRemisePct / 100));
      }
    });
  } else {
    maxRemisePercent = parseFloat(inv.remise_percent || inv.remise || 0);
  }

  // Statut "Payée"
  const isStatutPaid = 
    String(inv.statut) === '2' || 
    String(inv.status) === '2' || 
    inv.paye === '1' || 
    inv.paye === 1;

  const payeRaw = parseFloat(
    inv.paid || inv.totalpaid || inv.total_paid || inv.amount_paid || inv.paye || 0
  );

  const payeTTC = (isStatutPaid && payeRaw === 0) ? totalTTC : payeRaw;
  const restantTTC = Math.max(0, totalTTC - payeTTC);

  const ratioHT = totalTTC > 0 ? (totalHT / totalTTC) : 1;
  const payeHT = payeTTC * ratioHT;
  const restantHT = restantTTC * ratioHT;

  return { 
    totalTTC, 
    totalHT, 
    payeTTC, 
    payeHT, 
    restantTTC, 
    restantHT, 
    totalRemiseMontant, 
    remisePercent: maxRemisePercent,
    isStatutPaid
  };
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);

  // ── 🎯 ÉTATS DES FILTRES & MODALE ─────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState("");
  const [filterMonth, setFilterMonth]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [selectedMonth, setSelectedMonth]         = useState(null);
  const [selectedProduct, setSelectedProduct]     = useState(null);
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState(null); // Facture affichée en détail

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

  // ── 🗓️ MOIS DISPONIBLES ───────────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set();
    rawInvoices.forEach(inv => {
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      if (d && !isNaN(d.getTime())) {
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [rawInvoices]);

  // ── ⚡ FILTRAGE FACTURES ──────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return rawInvoices.filter(inv => {
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      const monthKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : "";

      if (filterMonth !== "ALL" && monthKey !== filterMonth) return false;

      const { restantTTC } = extractInvoiceAmounts(inv);

      if (filterStatus === "PAID" && restantTTC > 0.01) return false;
      if (filterStatus === "UNPAID" && restantTTC <= 0.01) return false;

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const refMatch = inv.ref?.toLowerCase().includes(query);
        const clientMatch = (inv.socid_name || inv.nom_client || "").toLowerCase().includes(query);
        if (!refMatch && !clientMatch) return false;
      }

      return true;
    });
  }, [rawInvoices, filterMonth, filterStatus, searchQuery]);

  // ── 📈 KPI GLOBAUX DÉTAILLÉS ──────────────────────────────────────────────
  const globalKpis = useMemo(() => {
    let totalTTC = 0, totalHT = 0, payeTTC = 0, payeHT = 0, restantTTC = 0, restantHT = 0;
    let totalRemisesMontant = 0;
    let sumRemisePercent = 0;
    let invoicesWithDiscount = 0;

    filteredInvoices.forEach(inv => {
      const amounts = extractInvoiceAmounts(inv);
      totalTTC += amounts.totalTTC;
      totalHT  += amounts.totalHT;
      payeTTC  += amounts.payeTTC;
      payeHT   += amounts.payeHT;
      restantTTC += amounts.restantTTC;
      restantHT  += amounts.restantHT;

      totalRemisesMontant += amounts.totalRemiseMontant;
      if (amounts.remisePercent > 0) {
        sumRemisePercent += amounts.remisePercent;
        invoicesWithDiscount++;
      }
    });

    const pctPaye = totalTTC > 0 ? (payeTTC / totalTTC) * 100 : 0;
    const pctRestant = totalTTC > 0 ? (restantTTC / totalTTC) * 100 : 0;
    const avgDiscountPct = invoicesWithDiscount > 0 ? (sumRemisePercent / invoicesWithDiscount) : 0;

    return {
      count: filteredInvoices.length,
      totalTTC, totalHT,
      payeTTC, payeHT, pctPaye,
      restantTTC, restantHT, pctRestant,
      totalRemisesMontant,
      avgDiscountPct,
      invoicesWithDiscount
    };
  }, [filteredInvoices]);

  // ── 📊 AGRÉGATION MENSUELLE ───────────────────────────────────────────────
  const invoicesByMonth = useMemo(() => {
    const monthly = {};
    filteredInvoices.forEach(inv => {
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      if (!d) return;

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[monthKey]) {
        monthly[monthKey] = { totalTTC: 0, payeTTC: 0, restantTTC: 0, totalRemise: 0, factures: [] };
      }

      const amounts = extractInvoiceAmounts(inv);

      monthly[monthKey].totalTTC += amounts.totalTTC;
      monthly[monthKey].payeTTC += amounts.payeTTC;
      monthly[monthKey].restantTTC += amounts.restantTTC;
      monthly[monthKey].totalRemise += amounts.totalRemiseMontant;

      monthly[monthKey].factures.push({
        ...inv,
        _amounts: amounts,
        _date: d.toLocaleDateString('fr-FR')
      });
    });
    return monthly;
  }, [filteredInvoices]);

  // ── 🛍️ VENTES PAR PRODUIT ─────────────────────────────────────────────────
  const salesByProduct = useMemo(() => {
    const productSales = {};
    rawProducts.forEach(p => {
      productSales[p.id] = { label: p.label, ref: p.ref, total_sales: 0, price: p.price, total_remise: 0 };
    });

    filteredInvoices.forEach(inv => {
      if (inv.lines) {
        inv.lines.forEach(l => {
          if (l.fk_product && productSales[l.fk_product]) {
            const lineTotal = parseFloat(l.total_ttc || (l.subprice * l.qty) || 0);
            const lineRemisePct = parseFloat(l.remise_percent || l.remise || 0);
            
            productSales[l.fk_product].total_sales += lineTotal;
            if (lineRemisePct > 0) {
              productSales[l.fk_product].total_remise += (lineTotal * (lineRemisePct / 100));
            }
          }
        });
      }
    });

    return productSales;
  }, [rawProducts, filteredInvoices]);

  const resetFilters = () => {
    setSearchQuery("");
    setFilterMonth("ALL");
    setFilterStatus("ALL");
  };

  if (loading) return (
    <div className="container flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <p style={{ fontWeight: '600', fontSize: '1.25rem' }}>Chargement du Dashboard...</p>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ padding: '20px', color: 'var(--text-primary)' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <span>📊</span> Tableau de Bord
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '1rem' }}>
            Cliquez sur une facture dans un mois pour consulter son détail complet
          </p>
        </div>

        {(searchQuery || filterMonth !== "ALL" || filterStatus !== "ALL") && (
          <button onClick={resetFilters} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            🔄 Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* FILTRES */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>🔍 Recherche</label>
            <input
              type="text"
              placeholder="Réf. Facture, Client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>📅 Période</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            >
              <option value="ALL">Toutes les périodes</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>💳 Statut</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PAID">🟢 Payées uniquement</option>
              <option value="UNPAID">🔴 Non payées / En attente</option>
            </select>
          </div>
        </div>

        {/* SUMMARY KPIS */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #334155' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>Total Facturé ({globalKpis.count} factures)</span>
              <strong>{formatMontant(globalKpis.totalTTC)} TTC</strong>
            </div>
            <div style={{ borderLeft: '2px solid #3b82f6', paddingLeft: '0.75rem' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>🏷️ Total Remises</span>
              <strong style={{ color: '#3b82f6' }}>{formatMontant(globalKpis.totalRemisesMontant)}</strong>
            </div>
            <div style={{ borderLeft: '2px solid #10b981', paddingLeft: '0.75rem' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>Encaissé</span>
              <strong style={{ color: '#10b981' }}>{formatMontant(globalKpis.payeTTC)} TTC</strong>
            </div>
            <div style={{ borderLeft: '2px solid #f43f5e', paddingLeft: '0.75rem' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>Reste à Payer</span>
              <strong style={{ color: '#f43f5e' }}>{formatMontant(globalKpis.restantTTC)} TTC</strong>
            </div>
          </div>
        </div>
      </div>

      {/* VUE MENSUELLE ET MODALE */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* PAR MOIS */}
        <div style={{ flex: '1 1 50%' }}>
          <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Facturation par Mois</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {Object.keys(invoicesByMonth).sort().reverse().map(monthKey => {
              const data = invoicesByMonth[monthKey];
              const isSelected = selectedMonth === monthKey;
              return (
                <div key={monthKey} className="card" style={{ padding: '1.25rem' }}>
                  <div 
                    style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                    onClick={() => setSelectedMonth(isSelected ? null : monthKey)}
                  >
                    <h4 style={{ margin: 0 }}>{monthKey} ({data.factures.length})</h4>
                    <strong>{formatMontant(data.totalTTC)} TTC</strong>
                  </div>

                  {isSelected && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>💡 Cliquez sur une ligne pour voir le détail de la facture</p>
                      <table className="compact-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                            <th style={{ padding: '0.5rem' }}>Réf</th>
                            <th style={{ padding: '0.5rem' }}>Date</th>
                            <th style={{ padding: '0.5rem', textAlign: 'center' }}>Remise %</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total TTC</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Restant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.factures.map(f => (
                            <tr 
                              key={f.id} 
                              onClick={() => setSelectedInvoiceModal(f)}
                              style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                              className="table-row-hover"
                            >
                              <td style={{ padding: '0.5rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>{f.ref}</td>
                              <td style={{ padding: '0.5rem' }}>{f._date}</td>
                              <td style={{ padding: '0.5rem', textAlign: 'center', color: f._amounts.remisePercent > 0 ? '#3b82f6' : 'inherit' }}>
                                {f._amounts.remisePercent > 0 ? `${f._amounts.remisePercent}%` : '-'}
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(f._amounts.totalTTC)}</td>
                              <td style={{ padding: '0.5rem', textAlign: 'right', color: f._amounts.restantTTC > 0 ? '#f43f5e' : '#10b981' }}>
                                {formatMontant(f._amounts.restantTTC)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PAR PRODUIT */}
        <div style={{ flex: '1 1 40%' }}>
          <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Ventes par Produit</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {Object.values(salesByProduct).map(prod => (
              <div key={prod.ref} className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{prod.label}</h4>
                    <small className="text-muted">Réf: {prod.ref}</small>
                  </div>
                  <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{formatMontant(prod.total_sales)} TTC</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── 🔍 MODALE DETAIL FACTURE ────────────────────────────────────────────── */}
      {selectedInvoiceModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justify: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="card" style={{
            maxWidth: '700px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative',
            background: 'var(--bg-secondary, #ffff)'
          }}>
            {/* Header Modale */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', pb: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Facture {selectedInvoiceModal.ref}</h2>
                <span className="text-muted">Date : {selectedInvoiceModal._date}</span>
              </div>
              <button 
                onClick={() => setSelectedInvoiceModal(null)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
              >
                ✖ Fermer
              </button>
            </div>

            {/* Statut & Client */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', background: '#ffff', padding: '1rem', borderRadius: '6px' }}>
              <div>
                <small className="text-muted" style={{ display: 'block' }}>Client / Thirdparty :</small>
                <strong>{selectedInvoiceModal.socid_name || selectedInvoiceModal.nom_client || "Client Général"}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <small className="text-muted" style={{ display: 'block' }}>Statut Règlement :</small>
                {selectedInvoiceModal._amounts.restantTTC <= 0.01 ? (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>🟢 Payée intégralement</span>
                ) : (
                  <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>🔴 Reste à payer : {formatMontant(selectedInvoiceModal._amounts.restantTTC)}</span>
                )}
              </div>
            </div>

            {/* Tableau des lignes */}
            <h3>Détail des Articles</h3>
            <table className="compact-table" style={{ width: '100%', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ffff', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Désignation / Article</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>PU HT</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Qté</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Remise %</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total HT</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoiceModal.lines && selectedInvoiceModal.lines.length > 0 ? (
                  selectedInvoiceModal.lines.map((l, idx) => {
                    const linePu = parseFloat(l.subprice || l.pu_ht || 0);
                    const lineQty = parseFloat(l.qty || 1);
                    const lineRemise = parseFloat(l.remise_percent || l.remise || 0);
                    const lineTotalHT = parseFloat(l.total_ht || (linePu * lineQty * (1 - lineRemise / 100)));

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '0.5rem' }}>{l.desc || l.product_label || l.libelle || "Article sans titre"}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatMontant(linePu)}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{lineQty}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', color: lineRemise > 0 ? '#3b82f6' : 'inherit', fontWeight: lineRemise > 0 ? 'bold' : 'normal' }}>
                          {lineRemise > 0 ? `${lineRemise}%` : '-'}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(lineTotalHT)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>Aucune ligne d'article trouvée.</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totalisations */}
            <div style={{ background: '#ffff', padding: '1rem', borderRadius: '6px', fontSize: '0.95rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                <span>Total HT :</span>
                <strong>{formatMontant(selectedInvoiceModal._amounts.totalHT)}</strong>
              </div>
              {selectedInvoiceModal._amounts.totalRemiseMontant > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', color: '#3b82f6' }}>
                  <span>Dont Remise calculée :</span>
                  <strong>- {formatMontant(selectedInvoiceModal._amounts.totalRemiseMontant)}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '1.1rem', borderTop: '1px solid #334155', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                <span>Total TTC :</span>
                <strong style={{ color: 'var(--primary-color)' }}>{formatMontant(selectedInvoiceModal._amounts.totalTTC)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', color: '#10b981' }}>
                <span>Montant Encaissé :</span>
                <strong>{formatMontant(selectedInvoiceModal._amounts.payeTTC)}</strong>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}