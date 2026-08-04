import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiDolibarr } from '../../api/apiDolibarr';
import { apiLocal } from '../../api/apiLocal';
import DashboardFilters from './components/DashboardFilters.jsx';
import DashboardMonthRecap from './components/DashboardMonthRecap.jsx';
import DashboardMonthPanels from './components/DashboardMonthPanels.jsx';
import DashboardProductPanels from './components/DashboardProductPanels.jsx';
import DashboardInvoiceModal from './components/DashboardInvoiceModal.jsx';
import DashboardProductModal from './components/DashboardProductModal.jsx';
import { formatMontant, extractInvoiceAmounts } from './components/DashboardUtils.jsx';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [paymentsMap, setPaymentsMap] = useState({});
  const [remboursementsMap, setRemboursementsMap] = useState({});

  // Filtres
  const [searchQuery, setSearchQuery]   = useState("");
  const [filterMonth, setFilterMonth]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMode, setFilterMode]     = useState("ALL");

  const [selectedMonth, setSelectedMonth]               = useState(null);
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState(null);
  const [selectedProductModal, setSelectedProductModal] = useState(null);

  // Popup remboursement : stocke la facture en attente + la date saisie
  const [rembPopup, setRembPopup] = useState(null); // { facture, amounts }
  const [rembDate, setRembDate]   = useState(() => new Date().toISOString().slice(0, 10));

  const loadRemboursements = useCallback(async () => {
    try {
      const data = await apiLocal('/api/remboursements');
      const map = {};
      (data || []).forEach(r => {
        map[r.invoice_ref] = r;
      });
      setRemboursementsMap(map);
    } catch (e) {
      console.warn("Impossible de charger les remboursements:", e);
    }
  }, []);

  // Ouvre le popup pour saisir la date de remboursement
  const handleRembourser = useCallback((facture, amounts) => {
    setRembDate(new Date().toISOString().slice(0, 10));
    setRembPopup({ facture, amounts });
  }, []);

  // Confirme le remboursement avec la date saisie dans le popup
  const handleConfirmRembourser = useCallback(async () => {
    if (!rembPopup) return;
    const { facture, amounts } = rembPopup;
    const ref          = facture.ref;
    const payeAvant    = amounts.payeTTC;
    const cashbackAvant = amounts.totalRemiseMontant || 0;
    const modeCode     = (amounts.modeCode || 'LIQ').toLowerCase();
    // Normaliser le mode de paiement vers cash/cheque/cb
    const paymentMode =
      modeCode.includes('chq') || modeCode.includes('cheque') ? 'cheque' :
      modeCode.includes('cb')  || modeCode.includes('card')   ? 'cb' :
      'cash';

    try {
      await apiLocal('/api/remboursements', {
        method: 'POST',
        body: {
          invoice_ref:        ref,
          invoice_id:         facture.id || '',
          montant_rembourse:  payeAvant,
          paye_avant:         payeAvant,
          cashback_avant:     cashbackAvant,
          date_remboursement: rembDate,
          payment_mode:       paymentMode,
        }
      });
      setRembPopup(null);
      await loadRemboursements();
    } catch (e) {
      console.error("Erreur lors du remboursement:", e);
      alert("Erreur: " + (e.message || "Impossible de rembourser cette facture"));
    }
  }, [rembPopup, rembDate, loadRemboursements]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const facturesRaw = await apiDolibarr.getInvoices() || [];
        // Nettoyer les brouillons (statut/status == 0) avant d'alimenter le dashboard
        const factures = (facturesRaw || []).filter(inv => String(inv.statut) !== '0' && String(inv.status) !== '0');
        const products = await apiDolibarr.getProducts() || [];

        let pMap = {};
        try {
          if (apiDolibarr.getPayments) {
            const paiementsList = await apiDolibarr.getPayments() || [];
            
            paiementsList.forEach(p => {
              const keys = [
                p.fk_facture, 
                p.fk_facture_id, 
                p.invoice_id, 
                p.num_facture, 
                p.facnumber, 
                p.ref_facture, 
                p.ref
              ];

              if (Array.isArray(p.lines)) {
                p.lines.forEach(l => {
                  if (l.fk_facture) keys.push(l.fk_facture);
                  if (l.facnumber) keys.push(l.facnumber);
                  if (l.ref) keys.push(l.ref);
                });
              }

              keys.filter(Boolean).forEach(k => {
                const facKey = String(k).trim().toUpperCase();
                if (!pMap[facKey]) pMap[facKey] = [];
                if (!pMap[facKey].some(existing => existing.id === p.id && p.id !== undefined)) {
                  pMap[facKey].push(p);
                }
              });
            });
          }
        } catch (e) {
          console.warn("Impossible de charger l'API règlements globale :", e);
        }

        setRawInvoices(factures);
        setRawProducts(products);
        setPaymentsMap(pMap);

        // Load remboursements
        await loadRemboursements();
      } catch (err) {
        console.error("Erreur de chargement des données du dashboard", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, [loadRemboursements]);

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

  const filteredInvoices = useMemo(() => {
    return rawInvoices.filter(inv => {
      let d;
      if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
      else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
      const monthKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : "";

      if (filterMonth !== "ALL" && monthKey !== filterMonth) return false;

      const amounts = extractInvoiceAmounts(inv, paymentsMap);

      if (filterStatus === "PAID" && amounts.restantTTC > 0.01) return false;
      if (filterStatus === "UNPAID" && amounts.restantTTC <= 0.01) return false;

      if (filterMode !== "ALL") {
        if (filterMode === "Caisse" && amounts.caissePaid <= 0) return false;
        if (filterMode === "Banque" && amounts.banquePaid <= 0) return false;
      }

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const refMatch = inv.ref?.toLowerCase().includes(query);
        const clientMatch = (inv.socid_name || inv.nom_client || "").toLowerCase().includes(query);
        if (!refMatch && !clientMatch) return false;
      }

      return true;
    });
  }, [rawInvoices, filterMonth, filterStatus, filterMode, searchQuery, paymentsMap]);

  const globalKpis = useMemo(() => {
    let totalTTC = 0, payeTTC = 0, restantTTC = 0, surplusTTC = 0;
    let totalCaisse = 0;
    let totalBanque = 0;
    let totalRemisesMontant = 0;

    filteredInvoices.forEach(inv => {
      const amounts = extractInvoiceAmounts(inv, paymentsMap);
      totalTTC += amounts.totalTTC;
      payeTTC  += amounts.payeTTC;
      restantTTC += amounts.restantTTC;
      surplusTTC += amounts.surplusTTC || 0;
      totalRemisesMontant += amounts.totalRemiseMontant;
      totalCaisse += amounts.caissePaid;
      totalBanque += amounts.banquePaid;
    });

    return {
      count: filteredInvoices.length,
      totalTTC,
      payeTTC,
      restantTTC,
      surplusTTC,
      totalCaisse,
      totalBanque,
      totalRemisesMontant
    };
  }, [filteredInvoices, paymentsMap]);

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

      const amounts = extractInvoiceAmounts(inv, paymentsMap);
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
  }, [filteredInvoices, paymentsMap]);

  const salesByProduct = useMemo(() => {
    const productMap = {};

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
        invoices: []
      };
    });

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

      {/* ── POPUP DATE DE REMBOURSEMENT ───────────────────────────────── */}
      {rembPopup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: '10px', padding: '2rem',
            minWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <h3 style={{ margin: 0, color: '#2c2c2c', fontSize: '1.2rem' }}>
              💸 Confirmer le remboursement
            </h3>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#444' }}>
              Facture : <strong>{rembPopup.facture.ref}</strong>
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#555', marginBottom: '0.4rem', fontWeight: '600' }}>
                📅 Date de remboursement :
              </label>
              <input
                type="date"
                value={rembDate}
                onChange={e => setRembDate(e.target.value)}
                style={{
                  width: '100%', padding: '0.55rem 0.75rem',
                  borderRadius: '6px', border: '1.5px solid #d1d5db',
                  fontSize: '0.95rem', color: '#2c2c2c', background: '#f9fafb'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRembPopup(null)}
                style={{
                  padding: '0.5rem 1.1rem', borderRadius: '6px',
                  border: '1px solid #d1d5db', background: '#f3f4f6',
                  color: '#555', cursor: 'pointer', fontWeight: '600'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmRembourser}
                disabled={!rembDate}
                style={{
                  padding: '0.5rem 1.25rem', borderRadius: '6px',
                  border: 'none', background: '#d84c2f',
                  color: '#fff', cursor: rembDate ? 'pointer' : 'not-allowed',
                  fontWeight: '700', opacity: rembDate ? 1 : 0.5
                }}
              >
                ✅ Confirmer le remboursement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <span>📊</span> Tableau de Bord & Encaissements
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '1rem' }}>
            Analyse des encaissements CSV (Caisse / Banque), de la facturation et répartition produit
          </p>
        </div>
      </div>

      <DashboardFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterMonth={filterMonth}
        setFilterMonth={setFilterMonth}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        availableMonths={availableMonths}
        resetFilters={resetFilters}
        globalKpis={globalKpis}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <DashboardMonthRecap
          invoicesByMonth={invoicesByMonth}
        />
        <DashboardMonthPanels
          invoicesByMonth={invoicesByMonth}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          setSelectedInvoiceModal={setSelectedInvoiceModal}
          remboursementsMap={remboursementsMap}
          onRembourser={handleRembourser}
        />
        <DashboardProductPanels
          salesByProduct={salesByProduct}
          setSelectedProductModal={setSelectedProductModal}
        />
      </div>

      <DashboardInvoiceModal selectedInvoiceModal={selectedInvoiceModal} closeModal={() => setSelectedInvoiceModal(null)} />

      <DashboardProductModal selectedProductModal={selectedProductModal} closeModal={() => setSelectedProductModal(null)} />

    </div>
  );
}
