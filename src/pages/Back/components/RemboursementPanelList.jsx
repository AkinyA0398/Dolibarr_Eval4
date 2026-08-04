import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function RemboursementPanelList({ invoicesByMonth, selectedMonth, setSelectedMonth, setSelectedInvoiceModal, remboursementsMap = {}, onAnnulerRemboursement }) {
  const monthKeys = Object.keys(invoicesByMonth).sort().reverse();

  if (monthKeys.length === 0) {
    return <p>Aucun remboursement à afficher pour le moment.</p>;
  }

  return (
    <div>
      <h3 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>Remboursements par Mois</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        {monthKeys.map(monthKey => {
          const data = invoicesByMonth[monthKey];
          const isSelected = selectedMonth === monthKey;

          return (
            <div key={monthKey} style={{ padding: '1.25rem', background: '#f5f1e8', borderRadius: '6px', border: '1px solid #e8dcc8' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', alignItems: 'center' }}
                onClick={() => setSelectedMonth(isSelected ? null : monthKey)}
              >
                <h4 style={{ margin: 0, color: '#2c2c2c' }}>{monthKey} ({data.factures.length} remboursement{data.factures.length > 1 ? 's' : ''})</h4>
                <div>
                  <span style={{ marginRight: '1rem', color: '#d84c2f', fontSize: '0.9rem' }}>
                    Total Remboursé: {formatMontant(data.totalRembourse || 0)}
                  </span>
                  <strong style={{ color: '#2c2c2c' }}>{formatMontant(data.totalTTC)} TTC</strong>
                </div>
              </div>

              {isSelected && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #d9cfc0', overflowX: 'auto' }}>
                  <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>💡 Annuler un remboursement restaurera les valeurs originales de la facture dans le Dashboard</p>
                  <table style={{ width: '100%', fontSize: '0.85rem', minWidth: '1100px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#e8dcc8', borderBottom: '2px solid #d9cfc0', color: '#2c2c2c' }}>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'left', fontWeight: '600' }}>Réf</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>TTC Total</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Payé avant remb.</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Cashback avant remb.</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Montant Remboursé</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'left', fontWeight: '600' }}>Date Remboursement</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'left', fontWeight: '600' }}>Définition Date Annulation</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'center', fontWeight: '600' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.factures.map((f, idx) => {
                        const remb = f._remb || remboursementsMap[f.ref];
                        const isEvenRow = idx % 2 === 0;

                        if (!remb) return null;

                        return (
                          <tr
                            key={f.id}
                            style={{
                              background: isEvenRow ? '#faf8f4' : '#f5f1e8',
                              borderBottom: '1px solid #e8dcc8',
                              color: '#2c2c2c',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#ede5d8'}
                            onMouseLeave={(e) => e.currentTarget.style.background = isEvenRow ? '#faf8f4' : '#f5f1e8'}
                          >
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', color: '#2c5aa0' }}>{f.ref}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right' }}>{formatMontant(f._amounts.totalTTC)}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: '#2c5aa0' }}>{formatMontant(remb.paye_avant)}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: '#c47808' }}>{formatMontant(remb.cashback_avant)}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: '#d84c2f' }}>{formatMontant(remb.montant_rembourse)}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontSize: '0.8rem' }}>{remb.created_at || '-'}</td>
                            <td>
                              <input type="date" />
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onAnnulerRemboursement) {
                                    onAnnulerRemboursement(remb);
                                  }
                                }}
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '4px',
                                  border: 'none',
                                  fontSize: '0.8rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  background: '#f59e0b',
                                  color: '#fff',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#d97706'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#f59e0b'}
                              >
                                ↩ Annuler Remboursement
                              </button>
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
