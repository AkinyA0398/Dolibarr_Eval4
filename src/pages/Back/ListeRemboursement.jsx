import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiDolibarr } from '../../api/apiDolibarr';
import { apiLocal } from '../../api/apiLocal';
import RemboursementPanelList from './components/RemboursementPanelList';
import RemboursementRecapList from './components/RemboursementRecapList';
import { formatMontant, extractInvoiceAmounts } from './components/DashboardUtils';

export default function ListeRemboursement(){
      const [loading, setLoading] = useState(true);
      const [rawInvoices, setRawInvoices] = useState([]);
      const [rawProducts, setRawProducts] = useState([]);
      const [paymentsMap, setPaymentsMap] = useState({});
      const [remboursementsMap, setRemboursementsMap] = useState({});
      const [remboursementsList, setRemboursementsList] = useState([]);
    
      // Filtres
      const [searchQuery, setSearchQuery]   = useState("");
      const [filterMonth, setFilterMonth]   = useState("ALL");
      const [filterStatus, setFilterStatus] = useState("ALL");
      const [filterMode, setFilterMode]     = useState("ALL");
    
      const [selectedMonth, setSelectedMonth]               = useState(null);
      const [selectedInvoiceModal, setSelectedInvoiceModal] = useState(null);

      // Map : remb.id -> date d'annulation saisie par l'utilisateur
      const [dateAnnulationMap, setDateAnnulationMap] = useState({});

      const loadRemboursements = useCallback(async () => {
        try {
          const data = await apiLocal('/api/remboursements');
          const list = data || [];
          const map = {};
          list.forEach(r => {
            map[r.invoice_ref] = r;
          });
          setRemboursementsMap(map);
          setRemboursementsList(list);
        } catch (e) {
          console.warn("Impossible de charger les remboursements:", e);
        }
      }, []);

      const handleAnnulerRemboursement = useCallback(async (remb, dateAnnulation) => {
        if (!dateAnnulation) {
          alert("Veuillez saisir une date d'annulation avant de confirmer.");
          return;
        }

        // Normaliser le mode de paiement
        const rawMode = (remb.payment_mode || 'cash').toLowerCase();
        const paymentMode =
          rawMode.includes('chq') || rawMode.includes('cheque') ? 'cheque' :
          rawMode.includes('cb')  || rawMode.includes('card')   ? 'cb' :
          'cash';

        try {
          // Appel endpoint d'annulation : calcule cashback selon intervalle
          const result = await apiLocal(`/api/remboursements/${remb.id}/annuler`, {
            method: 'POST',
            body: {
              date_annulation: dateAnnulation,
              payment_mode:    paymentMode,
            }
          });

          console.log(
            `✅ Annulation remboursement ${remb.invoice_ref}:\n` +
            `  Intervalle : ${result.nb_jours} jours\n` +
            `  Remise appliquée : ${result.remise_appliquee}%\n` +
            `  Cashback avant : ${result.cashback_avant}€\n` +
            `  Cashback après : ${result.cashback_apres_annulation}€`
          );

          // Nettoyer la date saisie pour ce remboursement
          setDateAnnulationMap(prev => {
            const copy = { ...prev };
            delete copy[remb.id];
            return copy;
          });

          await loadRemboursements();
        } catch (e) {
          console.error("Erreur lors de l'annulation:", e);
          alert("Erreur: " + (e.message || "Impossible d'annuler ce remboursement"));
        }
      }, [loadRemboursements]);

     useEffect(() => {
         const loadDashboardData = async () => {
           try {
             const facturesRaw = await apiDolibarr.getInvoices() || [];
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

             await loadRemboursements();
           } catch (err) {
             console.error("Erreur de chargement des données du dashboard", err);
           } finally {
             setLoading(false);
           }
         };
         loadDashboardData();
       }, [loadRemboursements]);
     
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

       // Only show invoices that have been refunded
       const refundedInvoicesByMonth = useMemo(() => {
         const monthly = {};
         filteredInvoices.forEach(inv => {
           const ref = inv.ref;
           if (!remboursementsMap[ref]) return; // Only refunded invoices

           let d;
           if (inv.date) d = new Date(isNaN(inv.date) ? inv.date : Number(inv.date) * 1000);
           else if (inv.datef) d = new Date(isNaN(inv.datef) ? inv.datef : Number(inv.datef) * 1000);
           if (!d) return;
     
           const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
           if (!monthly[monthKey]) {
             monthly[monthKey] = { totalTTC: 0, totalRembourse: 0, factures: [] };
           }
     
           const amounts = extractInvoiceAmounts(inv, paymentsMap);
           const remb = remboursementsMap[ref];
           
           monthly[monthKey].totalTTC += amounts.totalTTC;
           monthly[monthKey].totalRembourse += remb.montant_rembourse;
     
           monthly[monthKey].factures.push({
             ...inv,
             _amounts: amounts,
             _remb: remb,
             _date: d.toLocaleDateString('fr-FR')
           });
         });
         return monthly;
       }, [filteredInvoices, paymentsMap, remboursementsMap]);

       if (loading) return (
        <div className="container flex items-center justify-center" style={{minHeight: '60vh'}}>
            <p style={{ fontWeight: '600', fontSize: '1.25rem'}}>Chargement de la Liste de Remboursement...</p>
        </div>
       );

       const hasRefunds = Object.keys(refundedInvoicesByMonth).length > 0;

       return (
        <div className="animate-fade-in" style={{ padding: '20px', color: 'var(--text-primary)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
               <div>
                 <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                   <span>💸</span> Liste des Remboursements
                 </h2>
                 <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '1rem' }}>
                   Gestion des remboursements et annulation des remboursements effectués
                 </p>
               </div>
             </div>

             {!hasRefunds ? (
               <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                 <p style={{ fontSize: '1.2rem', color: '#888' }}>📋 Aucun remboursement effectué pour le moment.</p>
                 <p style={{ fontSize: '0.9rem', color: '#666' }}>Les remboursements effectués depuis le Dashboard apparaîtront ici.</p>
               </div>
             ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                 <RemboursementRecapList
                   invoicesByMonth={refundedInvoicesByMonth}
                 />
                 <RemboursementPanelList
                   invoicesByMonth={refundedInvoicesByMonth}
                   selectedMonth={selectedMonth}
                   setSelectedMonth={setSelectedMonth}
                   setSelectedInvoiceModal={setSelectedInvoiceModal}
                   remboursementsMap={remboursementsMap}
                   onAnnulerRemboursement={handleAnnulerRemboursement}
                 />
               </div>
             )}
        </div>
       );
}