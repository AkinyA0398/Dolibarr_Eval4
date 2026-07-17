import React, { useState, useEffect } from 'react';
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

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  if (!isNaN(dateStr)) {
    return new Date(Number(dateStr) * 1000).toLocaleDateString('fr-FR');
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR');
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    ca: 0,
    salaires: 0,
    taxes: 0,
    depenses: 0,
    solde: 0
  });
  const [recentData, setRecentData] = useState([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [salaires, banques, factures, taxes, depenses] = await Promise.all([
          apiDolibarr.getSalaires(),
          apiDolibarr.getBankAccounts(),
          apiDolibarr.getInvoices(),
          apiDolibarr.getTaxes(),
          apiDolibarr.getSpecialExpenses()
        ]);

        // Calculs des KPIs
        let totalSalaires = 0;
        (salaires || []).forEach(sal => totalSalaires += Number(sal.amount || 0));

        let totalCA = 0;
        (factures || []).forEach(inv => totalCA += Number(inv.total_ttc || inv.total || 0));

        let totalTaxes = 0;
        (taxes || []).forEach(tax => totalTaxes += Number(tax.amount || 0));

        let totalDepenses = 0;
        (depenses || []).forEach(dep => totalDepenses += Number(dep.amount || 0));

        let totalSolde = 0;
        // Dans Dolibarr, le solde peut être dans une sous-propriété selon l'API, on tente "balance" ou "solde"
        (banques || []).forEach(acc => totalSolde += Number(acc.balance || acc.solde || 0));

        setMetrics({
          ca: totalCA,
          salaires: totalSalaires,
          taxes: totalTaxes,
          depenses: totalDepenses,
          solde: totalSolde
        });

        // Combine quelques données pour la table "Transactions récentes"
        const combined = [
          ...(factures || []).map(f => ({ type: 'Facture', ref: f.ref, date: f.date || f.datef, montant: f.total_ttc || f.total, status: f.statut === '2' ? 'Payée' : 'En attente' })),
          ...(salaires || []).map(s => ({ type: 'Salaire', ref: `Réf: ${s.ref_salaire}`, date: s.date_debut, montant: s.amount, status: 'Fiche' })),
          ...(taxes || []).map(t => ({ type: 'Taxe', ref: `Taxe ${t.id}`, date: t.date_creation || t.datec, montant: t.amount, status: 'Enregistrée' }))
        ];

        // Tri par date (approximatif si les formats diffèrent)
        combined.sort((a, b) => {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          return tB - tA; // Décroissant
        });

        setRecentData(combined.slice(0, 15)); // 15 derniers éléments

      } catch (err) {
        console.error("Erreur de chargement des données financières", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  if (loading) return (
    <div className="container flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div className="text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>⏳</div>
        <p style={{ fontWeight: '600', fontSize: '1.25rem' }}>Chargement des données financières...</p>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ padding: '20px', color: 'var(--text-primary)' }}>
      <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><span>📈</span> Tableau de Bord Financier</h2>
      <p className="text-muted" style={{ marginBottom: '2rem', fontSize: '1rem', fontWeight: '500' }}>Vue globale de la comptabilité, facturation et trésorerie</p>

      {/* Widgets Financiers */}
      <div style={{ display: 'flex', gap: '25px', marginTop: '20px', marginBottom: '40px', flexWrap: 'wrap' }}>
        
        {/* Widget CA */}
        <div className="card" style={{ flex: '1 1 200px', padding: '1.75rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #10b981' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.1 }}>💰</div>
          <h3 style={{ color: 'var(--text-secondary)', marginTop: 0, textTransform: 'uppercase', fontSize: '0.85rem' }}>Chiffre d'Affaires</h3>
          <strong style={{ fontSize: '2rem', color: '#10b981', display: 'block', marginTop: '1rem' }}>{formatMontant(metrics.ca)}</strong>
        </div>

        {/* Widget Salaires */}
        <div className="card" style={{ flex: '1 1 200px', padding: '1.75rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #f43f5e' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.1 }}>👥</div>
          <h3 style={{ color: 'var(--text-secondary)', marginTop: 0, textTransform: 'uppercase', fontSize: '0.85rem' }}>Masse Salariale</h3>
          <strong style={{ fontSize: '2rem', color: '#f43f5e', display: 'block', marginTop: '1rem' }}>{formatMontant(metrics.salaires)}</strong>
        </div>

        {/* Widget Taxes & Dépenses */}
        <div className="card" style={{ flex: '1 1 200px', padding: '1.75rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.1 }}>🧾</div>
          <h3 style={{ color: 'var(--text-secondary)', marginTop: 0, textTransform: 'uppercase', fontSize: '0.85rem' }}>Taxes & Dépenses</h3>
          <strong style={{ fontSize: '2rem', color: '#f59e0b', display: 'block', marginTop: '1rem' }}>{formatMontant(metrics.taxes + metrics.depenses)}</strong>
        </div>

        {/* Widget Solde Bancaire */}
        <div className="card" style={{ flex: '1 1 200px', padding: '1.75rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.1 }}>🏦</div>
          <h3 style={{ color: 'var(--text-secondary)', marginTop: 0, textTransform: 'uppercase', fontSize: '0.85rem' }}>Solde Bancaire</h3>
          <strong style={{ fontSize: '2rem', color: '#3b82f6', display: 'block', marginTop: '1rem' }}>{formatMontant(metrics.solde)}</strong>
        </div>

      </div>

      {/* Tableau des Flux Récents */}
      <h3 style={{ fontSize: '1.5rem', color: 'var(--primary-color)', marginTop: '40px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>📋</span> Flux Financiers Récents
      </h3>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="compact-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ paddingLeft: '1.5rem' }}>Type</th>
              <th>Référence</th>
              <th style={{ textAlign: 'center' }}>Date</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th style={{ textAlign: 'center' }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {recentData.map((item, index) => (
              <tr key={index}>
                <td style={{ paddingLeft: '1.5rem', fontWeight: '600', color: item.type === 'Facture' ? '#10b981' : (item.type === 'Salaire' ? '#f43f5e' : '#f59e0b') }}>
                  {item.type}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{item.ref || '—'}</td>
                <td style={{ textAlign: 'center', fontWeight: '500' }}>{formatDate(item.date)}</td>
                <td style={{ textAlign: 'right', fontWeight: '800' }}>{formatMontant(item.montant)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge" style={{ 
                    background: '#f1f5f9', 
                    color: 'var(--text-secondary)',
                    border: '1px solid #e2e8f0'
                  }}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
            {recentData.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>📭</div>
                  Aucun flux financier récent trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}