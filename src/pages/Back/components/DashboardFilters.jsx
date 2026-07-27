import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function DashboardFilters({
  searchQuery,
  setSearchQuery,
  filterMonth,
  setFilterMonth,
  filterStatus,
  setFilterStatus,
  filterMode,
  setFilterMode,
  availableMonths,
  resetFilters,
  globalKpis,
}) {
  return (
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
            <option value="Caisse">💵 Caisse (Espèces / Caisse1)</option>
            <option value="Banque">💳 Banque (Chèque & CB / Banque1)</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #334155' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', fontSize: '0.9rem' }}>
          <div>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>💰 Total Facturé ({globalKpis.count})</span>
            <strong style={{ color: '#cbd5e1', fontSize: '1.1rem' }}>{formatMontant(globalKpis.totalTTC)} TTC</strong>
          </div>
          <div style={{ borderLeft: '2px solid #10b981', paddingLeft: '0.75rem' }}>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>💵 Encaissé CAISSE</span>
            <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>{formatMontant(globalKpis.totalCaisse)}</strong>
          </div>
          <div style={{ borderLeft: '2px solid #3b82f6', paddingLeft: '0.75rem' }}>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>💳 Encaissé BANQUE</span>
            <strong style={{ color: '#3b82f6', fontSize: '1.1rem' }}>{formatMontant(globalKpis.totalBanque)}</strong>
          </div>
          <div style={{ borderLeft: '2px solid #f59e0b', paddingLeft: '0.75rem' }}>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>🎁 Remise Réglement</span>
            <strong style={{ color: '#f59e0b', fontSize: '1.1rem' }}>{formatMontant(globalKpis.totalTTC - (globalKpis.totalCaisse + globalKpis.totalBanque))}</strong>
          </div>
          <div style={{ borderLeft: '2px solid #f43f5e', paddingLeft: '0.75rem' }}>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>Reste à Payer</span>
            <strong style={{ color: '#f43f5e', fontSize: '1.1rem' }}>{formatMontant(globalKpis.restantTTC)}</strong>
          </div>
        </div>
      </div>

      {(searchQuery || filterMonth !== 'ALL' || filterStatus !== 'ALL' || filterMode !== 'ALL') && (
        <button onClick={resetFilters} className="btn btn-secondary" style={{ marginTop: '1.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
          🔄 Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}
