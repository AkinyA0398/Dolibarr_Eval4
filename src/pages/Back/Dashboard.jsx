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

// Mappage des modes de paiement et destinations (Caisse vs Banque)
const PAYMENT_MODE_MAP = {
  LIQ: { label: "Espèces (Cash)", icon: "💵", target: "Caisse" },
  CASH: { label: "Espèces (Cash)", icon: "💵", target: "Caisse" },
  CHQ: { label: "Chèque", icon: "📝", target: "Banque" },
  CHEQUE: { label: "Chèque", icon: "📝", target: "Banque" },
  CB: { label: "Carte Bancaire", icon: "💳", target: "Banque" },
  CARD: { label: "Carte Bancaire", icon: "💳", target: "Banque" },
};

const getPaymentInfo = (code) => {
  const key = String(code || '').toUpperCase();
  return PAYMENT_MODE_MAP[key] || { label: code || "Non spécifié", icon: "💰", target: "Non défini" };
};

// ── 🛠️ HELPER : EXTRACTION DATES & INTERVALLES ──────────────────────────────
const parseInvoiceIntervals = (inv) => {
  const note = inv.note_public || inv.note || "";
  
  let invStart = inv.date ? new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000).toLocaleDateString('fr-FR') : "-";
  let invEnd = inv.date_fin ? new Date(isNaN(inv.date_fin) ? inv.date_fin : Number(inv.date_fin) * 1000).toLocaleDateString('fr-FR') : invStart;

  let dueEnd = inv.date_limite_reglement || inv.datelimite;
  dueEnd = dueEnd ? new Date(isNaN(dueEnd) ? dueEnd : Number(dueEnd) * 1000).toLocaleDateString('fr-FR') : "-";

  let customDueRange = null;
  const matchDue = note.match(/Échéance autorisée:\s*du\s*([\d\/-]+)\s*au\s*([\d\/-]+)/i);
  if (matchDue) {
    customDueRange = `Du ${matchDue[1]} au ${matchDue[2]}`;
  }

  let customPaymentRange = null;
  const matchPay = note.match(/exécuté sur la plage du\s*([\d\/-]+)\s*au\s*([\d\/-]+)/i);
  if (matchPay) {
    customPaymentRange = `Du ${matchPay[1]} au ${matchPay[2]}`;
  }

  return {
    invoicePeriod: `${invStart} au ${invEnd}`,
    dueDate: customDueRange || dueEnd,
    executionPeriod: customPaymentRange || "-"
  };
};

// ── 🛠️ HELPER : CALCULS FINANCIERS DOLIBARR ─────────────────────────────────
const extractInvoiceAmounts = (inv) => {
  const totalTTC = parseFloat(inv.total_ttc || inv.total || 0);
  const totalHT  = parseFloat(inv.total_ht || inv.total_net || inv.total_ht_amount || (totalTTC / 1.2));
  
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

  const modeCode = inv.mode_reglement_code || inv.mode_reglement || inv.payment_mode || "LIQ";
  const paymentInfo = getPaymentInfo(modeCode);
  const intervals = parseInvoiceIntervals(inv);

  return { 
    totalTTC, 
    totalHT, 
    payeTTC, 
    restantTTC, 
    totalRemiseMontant, 
    remisePercent: maxRemisePercent,
    isStatutPaid,
    paymentInfo,
    modeCode,
    intervals
  };
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);

  // ── 🎯 FILTRES & ÉTATS SÉLECTION ───────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState("");
  const [filterMonth, setFilterMonth]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMode, setFilterMode]     = useState("ALL");

  const [selectedMonth, setSelectedMonth]               = useState(null);
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState(null);
  const [selectedProductModal, setSelectedProductModal] = useState(null); // Modale de détail d'un produit

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

      const amounts = extractInvoiceAmounts(inv);

      if (filterStatus === "PAID" && amounts.restantTTC > 0.01) return false;
      if (filterStatus === "UNPAID" && amounts.restantTTC <= 0.01) return false;

      if (filterMode !== "ALL") {
        const targetMode = amounts.paymentInfo.target.toLowerCase();
        if (filterMode === "Caisse" && targetMode !== "caisse") return false;
        if (filterMode === "Banque" && targetMode !== "banque") return false;
      }

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const refMatch = inv.ref?.toLowerCase().includes(query);
        const clientMatch = (inv.socid_name || inv.nom_client || "").toLowerCase().includes(query);
        if (!refMatch && !clientMatch) return false;
      }

      return true;
    });
  }, [rawInvoices, filterMonth, filterStatus, filterMode, searchQuery]);

  // ── 📈 KPI GLOBAUX ────────────────────────────────────────────────────────
  const globalKpis = useMemo(() => {
    let totalTTC = 0, payeTTC = 0, restantTTC = 0;
    let totalCaisse = 0;
    let totalBanque = 0;
    let totalRemisesMontant = 0;

    filteredInvoices.forEach(inv => {
      const amounts = extractInvoiceAmounts(inv);
      totalTTC += amounts.totalTTC;
      payeTTC  += amounts.payeTTC;
      restantTTC += amounts.restantTTC;
      totalRemisesMontant += amounts.totalRemiseMontant;

      if (amounts.paymentInfo.target === "Caisse") {
        totalCaisse += amounts.payeTTC;
      } else if (amounts.paymentInfo.target === "Banque") {
        totalBanque += amounts.payeTTC;
      }
    });

    return {
      count: filteredInvoices.length,
      totalTTC,
      payeTTC,
      restantTTC,
      totalCaisse,
      totalBanque,
      totalRemisesMontant
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
        monthly[monthKey] = { totalTTC: 0, payeTTC: 0, restantTTC: 0, factures: [] };
      }

      const amounts = extractInvoiceAmounts(inv);
      monthly[monthKey].totalTTC += amounts.totalTTC;
      monthly[monthKey].payeTTC += amounts.payeTTC;
      monthly[monthKey].restantTTC += amounts.restantTTC;

      monthly[monthKey].factures.push({
        ...inv,
        _amounts: amounts,
        _date: d.toLocaleDateString('fr-FR')
      });
    });
    return monthly;
  }, [filteredInvoices]);

  // ── 🛍️ VENTES DÉTAILLÉES PAR PRODUIT ──────────────────────────────────────
  const salesByProduct = useMemo(() => {
    const productMap = {};

    // Initialisation depuis la liste des produits
    rawProducts.forEach(p => {
      productMap[p.id] = {
        id: p.id,
        label: p.label || p.libelle || "Sans nom",
        ref: p.ref || "N/A",
        unitPrice: parseFloat(p.price || p.price_ht || 0),
        totalQty: 0,
        totalSalesTTC: 0,
        totalSalesHT: 0,
        totalRemise: 0,
        invoices: [] // Historique des ventes pour ce produit
      };
    });

    // Agrégation basée sur les factures filtrées
    filteredInvoices.forEach(inv => {
      if (inv.lines && inv.lines.length > 0) {
        inv.lines.forEach(l => {
          const productId = l.fk_product || l.product_id;
          
          if (productId && productMap[productId]) {
            const qty = parseFloat(l.qty || 1);
            const lineTotalTTC = parseFloat(l.total_ttc || (l.subprice * qty * 1.2) || 0);
            const lineTotalHT = parseFloat(l.total_ht || (l.subprice * qty) || 0);
            const lineRemisePct = parseFloat(l.remise_percent || l.remise || 0);
            const remiseMontant = lineRemisePct > 0 ? (lineTotalHT * (lineRemisePct / 100)) : 0;

            productMap[productId].totalQty += qty;
            productMap[productId].totalSalesTTC += lineTotalTTC;
            productMap[productId].totalSalesHT += lineTotalHT;
            productMap[productId].totalRemise += remiseMontant;

            productMap[productId].invoices.push({
              invoiceRef: inv.ref,
              client: inv.socid_name || inv.nom_client || "Client Général",
              qty,
              lineTotalTTC,
              lineRemisePct
            });
          }
        });
      }
    });

    return Object.values(productMap).sort((a, b) => b.totalSalesTTC - a.totalSalesTTC);
  }, [rawProducts, filteredInvoices]);

  const resetFilters = () => {
    setSearchQuery("");
    setFilterMonth("ALL");
    setFilterStatus("ALL");
    setFilterMode("ALL");
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
            <span>📊</span> Tableau de Bord & Produits
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '1rem' }}>
            Analyse des encaissements, des plages de dates et ventilation par produit
          </p>
        </div>

        {(searchQuery || filterMonth !== "ALL" || filterStatus !== "ALL" || filterMode !== "ALL") && (
          <button onClick={resetFilters} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            🔄 Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* FILTRES */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>🔍 Recherche</label>
            <input
              type="text"
              placeholder="Réf. Facture, Client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#1c2533', color: '#f1f5f9' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>📅 Période</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#1c2533', color: '#f1f5f9' }}
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
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#1c2533', color: '#f1f5f9' }}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PAID">🟢 Payées uniquement</option>
              <option value="UNPAID">🔴 Non payées / En attente</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.4rem' }}>🏦 Destination Trésorerie</label>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #334155', background: '#1c2533', color: '#f1f5f9' }}
            >
              <option value="ALL">Toutes destinations</option>
              <option value="Caisse">💵 Caisse (Espèces / Cash)</option>
              <option value="Banque">💳 Banque (Chèque & CB)</option>
            </select>
          </div>
        </div>

        {/* SUMMARY KPIS */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #334155' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>Total Facturé ({globalKpis.count})</span>
              <strong>{formatMontant(globalKpis.totalTTC)} TTC</strong>
            </div>
            <div style={{ borderLeft: '2px solid #10b981', paddingLeft: '0.75rem' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>💵 Encaissé en CAISSE</span>
              <strong style={{ color: '#10b981' }}>{formatMontant(globalKpis.totalCaisse)}</strong>
            </div>
            <div style={{ borderLeft: '2px solid #3b82f6', paddingLeft: '0.75rem' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>💳 Encaissé en BANQUE</span>
              <strong style={{ color: '#3b82f6' }}>{formatMontant(globalKpis.totalBanque)}</strong>
            </div>
            <div style={{ borderLeft: '2px solid #f43f5e', paddingLeft: '0.75rem' }}>
              <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>Reste à Payer</span>
              <strong style={{ color: '#f43f5e' }}>{formatMontant(globalKpis.restantTTC)} TTC</strong>
            </div>
          </div>
        </div>
      </div>

      {/* DISPOSITION EN DEUX COLONNES: MOIS & PRODUITS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* COLONNE 1 : FACTURATION MENSUELLE ET DATES */}
        <div>
          <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Facturation & Intervalles par Mois</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {Object.keys(invoicesByMonth).sort().reverse().map(monthKey => {
              const data = invoicesByMonth[monthKey];
              const isSelected = selectedMonth === monthKey;
              return (
                <div key={monthKey} className="card" style={{ padding: '1.25rem' }}>
                  <div 
                    style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', alignItems: 'center' }}
                    onClick={() => setSelectedMonth(isSelected ? null : monthKey)}
                  >
                    <h4 style={{ margin: 0 }}>{monthKey} ({data.factures.length} factures)</h4>
                    <div>
                      <span style={{ marginRight: '1rem', color: '#10b981', fontSize: '0.9rem' }}>
                        Encaissé: {formatMontant(data.payeTTC)}
                      </span>
                      <strong>{formatMontant(data.totalTTC)} TTC</strong>
                    </div>
                  </div>

                  {isSelected && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>💡 Cliquez sur une ligne pour voir le détail de la facture</p>
                      <table className="compact-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                            <th style={{ padding: '0.5rem' }}>Réf</th>
                            <th style={{ padding: '0.5rem' }}>Facturation</th>
                            <th style={{ padding: '0.5rem' }}>Destination</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total TTC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.factures.map(f => (
                            <tr 
                              key={f.id} 
                              onClick={() => setSelectedInvoiceModal(f)}
                              style={{ cursor: 'pointer' }}
                              className="table-row-hover"
                            >
                              <td style={{ padding: '0.5rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>{f.ref}</td>
                              <td style={{ padding: '0.5rem' }}>{f._amounts.intervals.invoicePeriod}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <span>{f._amounts.paymentInfo.icon} {f._amounts.paymentInfo.target}</span>
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(f._amounts.totalTTC)}</td>
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

        {/* COLONNE 2 : VENTILATION DÉTAILLÉE DES PRODUITS */}
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
            maxWidth: '750px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative',
            background: 'var(--bg-secondary, #ffff)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Facture {selectedInvoiceModal.ref}</h2>
                <span className="text-muted">Émise le : {selectedInvoiceModal._date}</span>
              </div>
              <button onClick={() => setSelectedInvoiceModal(null)} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
                ✖ Fermer
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', background: '#ffff', padding: '1rem', borderRadius: '6px' }}>
              <div>
                <small className="text-muted" style={{ display: 'block' }}>💳 Mode de Règlement :</small>
                <strong>{selectedInvoiceModal._amounts.paymentInfo.icon} {selectedInvoiceModal._amounts.paymentInfo.label}</strong>
              </div>
              <div>
                <small className="text-muted" style={{ display: 'block' }}>🏦 Destination Fonds :</small>
                <strong style={{ color: selectedInvoiceModal._amounts.paymentInfo.target === "Caisse" ? "#10b981" : "#3b82f6" }}>
                  {selectedInvoiceModal._amounts.paymentInfo.target}
                </strong>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', background: '#ffffff', padding: '1rem', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>📅 Intervalles & Périodes</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div>
                  <span className="text-muted" style={{ display: 'block' }}>Période de Facturation :</span>
                  <strong>{selectedInvoiceModal._amounts.intervals.invoicePeriod}</strong>
                </div>
                <div>
                  <span className="text-muted" style={{ display: 'block' }}>Plage de Règlement Autorisée :</span>
                  <strong>{selectedInvoiceModal._amounts.intervals.dueDate}</strong>
                </div>
                <div>
                  <span className="text-muted" style={{ display: 'block' }}>Plage d'Exécution Paiement :</span>
                  <strong>{selectedInvoiceModal._amounts.intervals.executionPeriod}</strong>
                </div>
              </div>
            </div>

            <h3>Détail des Articles</h3>
            <table className="compact-table" style={{ width: '100%', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #334155', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Article</th>
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
                        <td style={{ padding: '0.5rem', textAlign: 'center', color: lineRemise > 0 ? '#3b82f6' : 'inherit' }}>
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
                <span>Montant Encaissé ({selectedInvoiceModal._amounts.paymentInfo.target}) :</span>
                <strong>{formatMontant(selectedInvoiceModal._amounts.payeTTC)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 🛍️ MODALE DETAIL PRODUIT COMPLÈTE ──────────────────────────────────── */}
      {selectedProductModal && (
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
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative',
            background: 'var(--bg-secondary, #ffff)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>📦 {selectedProductModal.label}</h2>
                <span className="text-muted">Référence : {selectedProductModal.ref}</span>
              </div>
              <button onClick={() => setSelectedProductModal(null)} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}>
                ✖ Fermer
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', background: '#ffff', padding: '1rem', borderRadius: '6px' }}>
              <div>
                <small className="text-muted" style={{ display: 'block' }}>Chiffre d'Affaires Produit :</small>
                <strong style={{ color: 'var(--primary-color)', fontSize: '1.1rem' }}>{formatMontant(selectedProductModal.totalSalesTTC)} TTC</strong>
              </div>
              <div>
                <small className="text-muted" style={{ display: 'block' }}>Quantité Totale Vendue :</small>
                <strong style={{ fontSize: '1.1rem' }}>{selectedProductModal.totalQty} unités</strong>
              </div>
            </div>

            <h3>Historique des Ventes</h3>
            <table className="compact-table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #334155', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Réf Facture</th>
                  <th style={{ padding: '0.5rem' }}>Client</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Qté</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {selectedProductModal.invoices.map((invLine, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{invLine.invoiceRef}</td>
                    <td style={{ padding: '0.5rem' }}>{invLine.client}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{invLine.qty}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(invLine.lineTotalTTC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}