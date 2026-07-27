import React from 'react';
import { formatMontant, mapTargetTreasury } from './DashboardUtils.jsx';

export default function DashboardMonthPanels({ invoicesByMonth, selectedMonth, setSelectedMonth, setSelectedInvoiceModal }) {
  const monthKeys = Object.keys(invoicesByMonth).sort().reverse();

  if (monthKeys.length === 0) {
    return <p>Aucune facture à afficher pour le moment.</p>;
  }

  return (
    <div>
      <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Facturation & Encaissements par Mois</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        {monthKeys.map(monthKey => {
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
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #334155', overflowX: 'auto' }}>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>💡 Cliquez sur une ligne pour voir le détail des règlements associés</p>
                  <table className="compact-table" style={{ width: '100%', fontSize: '0.8rem', minWidth: '1000px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
                        <th style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>Réf</th>
                        <th style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>Période</th>
                        <th style={{ padding: '0.4rem', whiteSpace: 'nowrap', textAlign: 'right' }}>Montant Orig.</th>
                        <th style={{ padding: '0.4rem', whiteSpace: 'nowrap', textAlign: 'right' }}>Payé</th>
                        <th style={{ padding: '0.4rem', whiteSpace: 'nowrap', textAlign: 'right' }}>Remise</th>
                        <th style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>Trésorerie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.factures.map(f => {
                        const remiseAmount = f._amounts.totalTTC - f._amounts.payeTTC;
                        return (
                          <tr
                            key={f.id}
                            onClick={() => setSelectedInvoiceModal(f)}
                            style={{ cursor: 'pointer' }}
                            className="table-row-hover"
                          >
                            <td style={{ padding: '0.4rem', color: 'var(--primary-color)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{f.ref}</td>
                            <td style={{ padding: '0.4rem', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{f._amounts.intervals.invoicePeriod}</td>
                            <td style={{ padding: '0.4rem', fontWeight: 'bold', color: '#cbd5e1', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMontant(f._amounts.totalTTC)}</td>
                            <td style={{ padding: '0.4rem', fontWeight: 'bold', color: '#10b981', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMontant(f._amounts.payeTTC)}</td>
                            <td style={{ padding: '0.4rem', fontWeight: 'bold', color: '#f59e0b', textAlign: 'right' }}>
                              <div style={{ whiteSpace: 'nowrap' }}>
                                {formatMontant(remiseAmount)}
                                {f._amounts.remisePercent > 0 && <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: '1' }}>({f._amounts.remisePercent}%)</div>}
                              </div>
                            </td>
                            <td style={{ padding: '0.4rem', fontSize: '0.75rem' }}>
                              {f._amounts.linePayments.length > 0 ? (
                                f._amounts.linePayments.map((p, idx) => (
                                  <div key={idx} style={{ marginBottom: '0.1rem', whiteSpace: 'nowrap' }}>
                                    {mapTargetTreasury(p) === 'Caisse' ? '💵' : '💳'} {formatMontant(p.montant || p.amount)}
                                  </div>
                                ))
                              ) : (
                                <span style={{ whiteSpace: 'nowrap' }}>{f._amounts.caissePaid > 0 ? '💵 Caisse' : '💳 Banque'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
