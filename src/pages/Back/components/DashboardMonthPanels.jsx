import React from 'react';
import { formatMontant } from './DashboardUtils.jsx';

export default function DashboardMonthPanels({ invoicesByMonth, selectedMonth, setSelectedMonth, setSelectedInvoiceModal, remboursementsMap = {}, onRembourser }) {
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
            <div key={monthKey} style={{ padding: '1.25rem', background: '#f5f1e8', borderRadius: '6px', border: '1px solid #e8dcc8' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', alignItems: 'center' }}
                onClick={() => setSelectedMonth(isSelected ? null : monthKey)}
              >
                <h4 style={{ margin: 0, color: '#2c2c2c' }}>{monthKey} ({data.factures.length} factures)</h4>
                <div>
                  <span style={{ marginRight: '1rem', color: '#556b2f', fontSize: '0.9rem' }}>
                    Encaissé: {formatMontant(data.payeTTC)}
                  </span>
                  <strong style={{ color: '#2c2c2c' }}>{formatMontant(data.totalTTC)} TTC</strong>
                </div>
              </div>

              {isSelected && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #d9cfc0', overflowX: 'auto' }}>
                  <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>💡 Cliquez sur une ligne pour voir le détail des règlements associés</p>
                  <table style={{ width: '100%', fontSize: '0.85rem', minWidth: '1200px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#e8dcc8', borderBottom: '2px solid #d9cfc0', color: '#2c2c2c' }}>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'left', fontWeight: '600' }}>Réf</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>TTC Total</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Payé</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Cashback</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Restant</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Dépassement</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: '600' }}>Remboursement</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'center', fontWeight: '600' }}>Action</th>
                        <th style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'center', fontWeight: '600' }}>Date de Remboursement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.factures.map((f, idx) => {
                        const isEvenRow = idx % 2 === 0;
                        const remb = remboursementsMap[f.ref];
                        const isRefunded = !!remb;

                        // Original values from extractInvoiceAmounts
                        const originalPaye = f._amounts.payeTTC;
                        const originalCashback = f._amounts.totalRemiseMontant || 0;
                        const totalTTC = f._amounts.totalTTC;
                        const originalSurplus = f._amounts.surplusTTC || 0;

                        // After refund logic:
                        // - payé becomes cashback_avant (cashback moves to payé)
                        // - cashback becomes cashback_apres_annulation si annulation précédente, sinon 0
                        // - restant = totalTTC - new payé
                        // - remboursement = old payé (montant_rembourse)
                        let displayPaye, displayCashback, displayRestant, displaySurplus, displayRemboursement;

                        if (isRefunded) {
                          displayPaye = remb.cashback_avant;         // cashback goes to payé
                          // Si une annulation a déjà eu lieu, afficher cashback recalculé
                          displayCashback = (remb.cashback_apres_annulation != null)
                            ? remb.cashback_apres_annulation
                            : 0;
                          displayRestant = totalTTC - displayPaye;    // restant recalculated
                          displaySurplus = 0;
                          displayRemboursement = remb.montant_rembourse; // old payé amount
                        } else {
                          displayPaye = originalPaye;
                          displayCashback = originalCashback;
                          displayRestant = f._amounts.restantTTC;
                          displaySurplus = originalSurplus;
                          displayRemboursement = 0;
                        }

                        return (
                          <tr
                            key={f.id}
                            onClick={() => setSelectedInvoiceModal(f)}
                            style={{
                              cursor: 'pointer',
                              background: isEvenRow ? '#faf8f4' : '#f5f1e8',
                              borderBottom: '1px solid #e8dcc8',
                              color: '#2c2c2c',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#ede5d8'}
                            onMouseLeave={(e) => e.currentTarget.style.background = isEvenRow ? '#faf8f4' : '#f5f1e8'}
                          >
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', color: '#2c5aa0' }}>{f.ref}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right' }}>{formatMontant(totalTTC)}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: isRefunded ? '#c47808' : '#2c5aa0' }}>
                              {formatMontant(displayPaye)}
                              {isRefunded && <div style={{ fontSize: '0.65rem', color: '#888', lineHeight: '1.1' }}>(ex-cashback)</div>}
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: displayCashback > 0 ? '#c47808' : '#888' }}>
                              {formatMontant(displayCashback)}
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: displayRestant > 0 ? '#d84c2f' : '#2c5aa0' }}>
                              {formatMontant(displayRestant)}
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: displaySurplus > 0 ? '#10b981' : '#888' }}>
                              {displaySurplus > 0 ? formatMontant(displaySurplus) : '-'}
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: '600', textAlign: 'right', color: displayRemboursement > 0 ? '#d84c2f' : '#888' }}>
                              {displayRemboursement > 0 ? formatMontant(displayRemboursement) : '-'}
                            </td>
                            <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                              <button
                                disabled={isRefunded}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isRefunded && onRembourser) {
                                    onRembourser(f, f._amounts);
                                  }
                                }}
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '4px',
                                  border: 'none',
                                  fontSize: '0.8rem',
                                  fontWeight: '600',
                                  cursor: isRefunded ? 'not-allowed' : 'pointer',
                                  background: isRefunded ? '#ccc' : '#d84c2f',
                                  color: isRefunded ? '#888' : '#fff',
                                  opacity: isRefunded ? 0.6 : 1,
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => { if (!isRefunded) e.currentTarget.style.background = '#b33a22'; }}
                                onMouseLeave={(e) => { if (!isRefunded) e.currentTarget.style.background = '#d84c2f'; }}
                              >
                                {isRefunded ? '✓ Remboursé' : 'Rembourser'}
                              </button>
                            </td>
                            {/* Date de Remboursement : affiche la date stockée en DB */}
                            <td style={{ padding: '0.6rem 0.8rem', fontSize: '0.8rem', color: isRefunded ? '#2c5aa0' : '#999', fontWeight: isRefunded ? '600' : '400' }}>
                              {isRefunded && remb.date_remboursement
                                ? remb.date_remboursement
                                : <span style={{ color: '#bbb', fontStyle: 'italic' }}>—</span>
                              }
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
