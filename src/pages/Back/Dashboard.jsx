import React, { useState, useEffect, useMemo } from 'react';
import { apiDolibarr } from '../../api/apiDolibarr';
import DashboardFilters from './components/DashboardFilters.jsx';
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

  // Filtres
  const [searchQuery, setSearchQuery]   = useState("");
  const [filterMonth, setFilterMonth]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMode, setFilterMode]     = useState("ALL");

  const [selectedMonth, setSelectedMonth]               = useState(null);
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState(null);
  const [selectedProductModal, setSelectedProductModal] = useState(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const factures = await apiDolibarr.getInvoices() || [];
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
    let totalTTC = 0, payeTTC = 0, restantTTC = 0;
    let totalCaisse = 0;
    let totalBanque = 0;
    let totalRemisesMontant = 0;

    filteredInvoices.forEach(inv => {
      const amounts = extractInvoiceAmounts(inv, paymentsMap);
      totalTTC += amounts.totalTTC;
      payeTTC  += amounts.payeTTC;
      restantTTC += amounts.restantTTC;
      totalRemisesMontant += amounts.totalRemiseMontant;
      totalCaisse += amounts.caissePaid;
      totalBanque += amounts.banquePaid;
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        <DashboardMonthPanels
          invoicesByMonth={invoicesByMonth}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          setSelectedInvoiceModal={setSelectedInvoiceModal}
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
