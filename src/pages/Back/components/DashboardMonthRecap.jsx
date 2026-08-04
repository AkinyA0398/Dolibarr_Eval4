import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function DashboardMonthRecap({ invoicesByMonth }) {
  const monthKeys = Object.keys(invoicesByMonth).sort().reverse();

  if (monthKeys.length === 0) {
    return null;
  }

  // Construire le tableau récapitulatif
  const monthData = monthKeys.map(monthKey => {
    const data = invoicesByMonth[monthKey];
    const [year, monthNum] = monthKey.split('-');
    const monthNames = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthLabel = monthNames[parseInt(monthNum, 10)];

    // Calculer le surplus total et remise totale du mois
    let totalSurplus = 0;
    let totalRemise = 0;

    data.factures.forEach(f => {
      totalSurplus += f._amounts.surplusTTC || 0;
      totalRemise += f._amounts.totalRemiseMontant || 0;
    });

    const encaisseeTotal = data.payeTTC;
    const encaisseeAndCashback = encaisseeTotal + totalRemise;

    return {
      monthLabel,
      year,
      totalTTC: data.totalTTC,
      encaissee: encaisseeTotal,
      surplus: totalSurplus,
      remise: totalRemise,
      encaisseeAndCashback,
      restant: data.restantTTC
    };
  });

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ borderBottom: '2px solid #e8dcc8', paddingBottom: '0.5rem', color: '#2c2c2c' }}>
        Tableau de Bord Mensuel
      </h3>
      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: '1150px', borderCollapse: 'collapse', background: '#f5f1e8', border: '1px solid #e8dcc8', borderRadius: '6px' }}>
          <thead>
            <tr style={{ background: '#e8dcc8', color: '#2c2c2c', textAlign: 'left' }}>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0' }}>Mois</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0' }}>Année</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Facture TTC</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Encaissée</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Montant Dépassement</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Cashback</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Encaissée + Cashback</th>
              <th style={{ padding: '0.7rem 0.9rem', fontWeight: '600', borderBottom: '2px solid #d9cfc0', textAlign: 'right' }}>Total Restant</th>
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
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: '#2c5aa0' }}>{formatMontant(row.encaissee)}</td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: row.surplus > 0 ? '#7c3aed' : '#888' }}>
                    {formatMontant(row.surplus)}
                  </td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: '#c47808' }}>
                    {formatMontant(row.remise)}
                  </td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: '#556b2f' }}>
                    {formatMontant(row.encaisseeAndCashback)}
                  </td>
                  <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right', fontWeight: '600', color: row.restant > 0 ? '#d84c2f' : '#2c5aa0' }}>
                    {formatMontant(row.restant)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
