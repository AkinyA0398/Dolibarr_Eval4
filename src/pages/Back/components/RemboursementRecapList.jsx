import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function RemboursementRecapList({ invoicesByMonth }) {
  const monthKeys = Object.keys(invoicesByMonth).sort().reverse();

  if (monthKeys.length === 0) {
    return null;
  }

  const monthData = monthKeys.map(monthKey => {
    const data = invoicesByMonth[monthKey];
    const [year, monthNum] = monthKey.split('-');
    const monthNames = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthLabel = monthNames[parseInt(monthNum, 10)];

    let totalRembourse = 0;
    let nbRemboursements = 0;

    data.factures.forEach(f => {
      const remb = f._remb;
      if (remb) {
        totalRembourse += remb.montant_rembourse || 0;
        nbRemboursements++;
      }
    });

    return {
      monthLabel,
      year,
      totalTTC: data.totalTTC,
      totalRembourse,
      nbRemboursements
    };
  });

  // Grand total
  const grandTotalRembourse = monthData.reduce((s, r) => s + r.totalRembourse, 0);
  const grandTotalNb = monthData.reduce((s, r) => s + r.nbRemboursements, 0);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ borderBottom: '2px solid #e8dcc8', paddingBottom: '0.5rem', color: '#2c2c2c' }}>
        Récapitulatif des Remboursements
      </h3>

      {/* KPI Banner */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.9rem' }}>
          <div style={{ borderLeft: '3px solid #d84c2f', paddingLeft: '0.75rem' }}>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>💸 Total Remboursé</span>
            <strong style={{ color: '#d84c2f', fontSize: '1.2rem' }}>{formatMontant(grandTotalRembourse)}</strong>
          </div>
          <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '0.75rem' }}>
            <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>📋 Nombre de remboursements</span>
            <strong style={{ color: '#3b82f6', fontSize: '1.2rem' }}>{grandTotalNb}</strong>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: '600px', borderCollapse: 'collapse', background: '#f5f1e8', border: '1px solid #e8dcc8', borderRadius: '6px' }}>
          <thead>
            <tr style={{ background: '#e8dcc8', color: '#2c2c2c', textAlign: 'left' }}>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0' }}>Mois</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0' }}>Année</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Factures TTC</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Nb Remboursements</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Remboursé</th>
            </tr>
          </thead>
          <tbody>
            {monthData.map((row, idx) => {
              const isEvenRow = idx % 2 === 0;
              return (
                <tr
                  key={row.monthLabel + row.year}
                  style={{
                    background: isEvenRow ? '#faf8f4' : '#f5f1e8',
                    borderBottom: '1px solid #e8dcc8',
                    color: '#2c2c2c'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#ede5d8'}
                  onMouseLeave={(e) => e.currentTarget.style.background = isEvenRow ? '#faf8f4' : '#f5f1e8'}
                >
                  <td style={{ padding: '0.7rem 0.9rem', fontWeight: '600' }}>{row.monthLabel}</td>
                  <td style={{ padding: '0.7rem 0.9rem', fontWeight: '600' }}>{row.year}</td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600' }}>{formatMontant(row.totalTTC)}</td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: '#3b82f6' }}>{row.nbRemboursements}</td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: '#d84c2f' }}>{formatMontant(row.totalRembourse)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
