import React, { useState, useEffect } from "react";
import { apiDolibarr } from "../../api/apiDolibarr";

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatInvoiceDate(dateVal) {
  if (!dateVal) return "-";
  const parsed = new Date(isNaN(dateVal) ? dateVal : Number(dateVal) * 1000);
  return isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("fr-FR");
}

function getInvoiceTimestamp(inv) {
  return Number(inv.date || inv.datef || inv.date_creation || inv.date_validation || inv.date_modification || 0) || 0;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export default function GenererPaymentNew({ user, paymentMode = 'cash', onComplete = () => {} }) {
  const [startDate, setStartDate] = useState(() => formatDate(new Date()));
  const [total, setTotal] = useState(1000);
  const [totalTouched, setTotalTouched] = useState(false);
  const [count, setCount] = useState(5);
  const [intervalDays, setIntervalDays] = useState(7);
  const [schedule, setSchedule] = useState([]);

  const [invoices, setInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyLogs, setApplyLogs] = useState([]);

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const allInvoices = await apiDolibarr.getInvoices();
        const unpaidInvoices = (allInvoices || []).filter(inv => {
          const amount = parseFloat(inv.total_ttc || inv.total || 0) || 0;
          const isPaid = String(inv.statut) === '2' || String(inv.paye) === '1' || inv.paye === 1;
          const isDraft = String(inv.statut) === '0' || String(inv.status) === '0';
          return !isPaid && amount > 0 && !isDraft;
        });
        unpaidInvoices.sort((a, b) => getInvoiceTimestamp(b) - getInvoiceTimestamp(a));
        setInvoices(unpaidInvoices);
        if (unpaidInvoices.length > 0) {
          setSelectedInvoiceId(unpaidInvoices[0].id);
        }
      } catch (err) {
        console.error("Erreur récupération factures :", err);
      } finally {
        setLoadingInvoices(false);
      }
    };
    fetchInvoices();
  }, [user]);

  const pushLog = (msg) => setApplyLogs((p) => [...p, String(msg)]);

  async function applyScheduleToDolibarr() {
    if (!selectedInvoiceId || schedule.length === 0) return alert('Sélectionne une facture et génère un planning avant d\'appliquer.');
    if (!confirm(`Appliquer ${schedule.length} paiement(s) à la facture ${selectedInvoiceId} ?`)) return;

    setApplying(true);
    setApplyLogs([]);

    const isCash = paymentMode === 'cash';
    const targetCaisse = isCash ? 'Caisse1' : 'Banque1';

    let currentInvoice = null;
    let initialRemainToPay = 0;
    try {
      currentInvoice = await apiDolibarr.getInvoice(selectedInvoiceId);
      initialRemainToPay = currentInvoice && currentInvoice.remaintopay !== undefined
        ? parseFloat(currentInvoice.remaintopay || 0)
        : (parseFloat(currentInvoice?.total_ttc || currentInvoice?.total || 0) - parseFloat(currentInvoice?.alreadypaid || 0) || 0);
    } catch (err) {
      pushLog(`⚠️ Impossible de récupérer la facture ${selectedInvoiceId} : ${err.message || err}`);
    }

    let totalApplied = 0;
    for (let i = 0; i < schedule.length; i++) {
      const row = schedule[i];
      const amountToSend = parseFloat(row.amount) || 0;
      if (amountToSend <= 0) {
        pushLog(`⚠️ Montant nul pour la ligne ${i + 1}, saut.`);
        continue;
      }

      const payload = {
        invoice_id: selectedInvoiceId,
        montant: amountToSend,
        date_reglement: row.date,
        caisse: targetCaisse,
        payment_mode_id: isCash ? 4 : 2,
        is_last_payment: i === schedule.length - 1
      };

      pushLog(`➡️ Envoi paiement ${i + 1}/${schedule.length} : ${payload.montant} € → ${payload.date}`);
      try {
        await apiDolibarr.createPayment(payload);
        totalApplied += amountToSend;
        pushLog(`✅ OK paiement ${i + 1} (${payload.montant} €)`);
      } catch (err) {
        pushLog(`❌ Erreur paiement ${i + 1} : ${err.message || err}`);
      }
    }

    // Gestion du surplus / dépassement si le total appliqué dépasse le reste à payer initial
    if (totalApplied > initialRemainToPay && currentInvoice) {
      const surplusAmount = totalApplied - initialRemainToPay;
      pushLog(`💡 Dépassement détecté de ${surplusAmount.toFixed(2)} € enregistré pour le Dashboard.`);
      try {
        const existingNote = String(currentInvoice.note_public || currentInvoice.note || '').trim();
        const match = existingNote.match(/\[SURPLUS_APP:([0-9]+(?:[.,][0-9]+)?)\]/i);
        const previousSurplus = match ? parseFloat(match[1].replace(',', '.')) || 0 : 0;
        const totalSurplus = previousSurplus + surplusAmount;
        const cleanedNote = existingNote.replace(/\[SURPLUS_APP:[^\]]+\]/gi, '').trim();
        const noteSuffix = `${cleanedNote ? cleanedNote + ' ' : ''}Surplus enregistré: ${totalSurplus.toFixed(2)} € [SURPLUS_APP:${totalSurplus.toFixed(2)}]`;
        await apiDolibarr.updateInvoice(selectedInvoiceId, { note_public: noteSuffix });
        pushLog(`✅ Note de dépassement mise à jour sur la facture (${totalSurplus.toFixed(2)} €).`);
      } catch (errNote) {
        pushLog(`⚠️ Impossible de mettre à jour la note de surplus : ${errNote.message || errNote}`);
      }
    }

    setApplying(false);
    pushLog('🎉 Opération terminée avec succès.');
    if (typeof onComplete === 'function') onComplete();
  }

  const selectedInvoice = invoices.find(inv => String(inv.id) === String(selectedInvoiceId));
  const selectedInvoiceDebt = selectedInvoice
    ? (selectedInvoice.remaintopay !== undefined
      ? parseFloat(selectedInvoice.remaintopay)
      : parseFloat(selectedInvoice.total_ttc || selectedInvoice.total || 0))
    : 0;

  useEffect(() => {
    if (selectedInvoice && !totalTouched) {
      setTotal(Number(selectedInvoiceDebt || 0).toFixed(2));
    }
  }, [selectedInvoice, selectedInvoiceDebt, totalTouched]);

  function generate() {
    const t = parseFloat(total);
    const n = parseInt(count, 10);
    const d = parseInt(intervalDays, 10);
    if (!startDate || Number.isNaN(t) || Number.isNaN(n) || n <= 0 || Number.isNaN(d) || d < 0) {
      setSchedule([]);
      return;
    }

    const totalCents = Math.round(t * 100);
    const baseCents = Math.floor(totalCents / n);
    const arr = [];
    for (let i = 0; i < n; i++) {
      const date = addDays(startDate, i * d);
      const amountCents = i < n - 1 ? baseCents : totalCents - baseCents * (n - 1);
      arr.push({ date, amount: (amountCents / 100).toFixed(2) });
    }
    setSchedule(arr);
  }

  function downloadCSV() {
    if (!schedule.length) return;
    const rows = ["date,amount", ...schedule.map((s) => `${s.date},${s.amount}`)];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <h2>Générer Paiements</h2>

      <div style={{ marginBottom: 16, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8 }}>
          Choisir la facture à payer
        </label>
        {loadingInvoices ? (
          <div>Chargement des factures...</div>
        ) : invoices.length > 0 ? (
          <select
            value={selectedInvoiceId}
            onChange={(e) => {
              setSelectedInvoiceId(e.target.value);
              setTotalTouched(false);
            }}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff' }}
          >
            {invoices.map((inv) => {
              const invDate = formatInvoiceDate(inv.date || inv.datef || inv.date_creation || inv.date_delivery || inv.date_reglement);
              const invRemain = inv.remaintopay !== undefined
                ? parseFloat(inv.remaintopay)
                : parseFloat(inv.total_ttc || inv.total || 0);
              return (
                <option key={inv.id} value={inv.id}>
                  {inv.ref || `FAC-${inv.id}`} • {invDate} • Reste à payer : {invRemain.toFixed(2)} €
                </option>
              );
            })}
          </select>
        ) : (
          <div style={{ color: '#b45309' }}>Aucune facture impayée trouvée.</div>
        )}
        {selectedInvoice && (
          <div style={{ marginTop: 12, padding: 12, background: '#ffffff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <strong>Montant dû :</strong> {selectedInvoiceDebt.toFixed(2)} €
            <div style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>
              Facture {selectedInvoice.ref || selectedInvoice.id} — date {formatInvoiceDate(selectedInvoice.date || selectedInvoice.datef)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 12 }}>
        <label>
          Date début
          <input style={{ width: '100%' }} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Montant total
          <input
            style={{ width: '100%' }}
            type="number"
            step="0.01"
            min="0"
            value={total}
            onChange={(e) => {
              setTotal(e.target.value);
              setTotalTouched(true);
            }}
          />
        </label>
        <label>
          Nombre de paiements
          <input style={{ width: '100%' }} type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label>
          Tous les (jours)
          <input style={{ width: '100%' }} type="number" min="0" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={generate}>Générer</button>
        <button onClick={() => { setSchedule([]); }}>Réinitialiser</button>
        <button onClick={downloadCSV} disabled={!schedule.length}>Télécharger CSV</button>
      </div>

      {schedule.length > 0 && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>#</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 6 }}>Date</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 6 }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s, i) => (
                <tr key={i}>
                  <td style={{ padding: 6 }}>{i + 1}</td>
                  <td style={{ padding: 6 }}>{s.date}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{s.amount} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>Total</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{schedule.reduce((acc, s) => acc + parseFloat(s.amount), 0).toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>
          <p style={{ marginTop: 8 }}>
            Remarque : les montants sont répartis en parts égales arrondies aux centimes; le dernier paiement prend le dépassement éventuel.
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={generate} disabled={applying}>Recalculer</button>
            <button onClick={() => { setSchedule([]); }} disabled={applying}>Réinitialiser</button>
            <button onClick={downloadCSV} disabled={!schedule.length || applying}>Télécharger CSV</button>
            <button onClick={applyScheduleToDolibarr} disabled={!schedule.length || !selectedInvoiceId || applying} style={{ background: '#10b981', color: '#fff' }}>
              {applying ? 'Application...' : 'Appliquer le paiement'}
            </button>
          </div>

          {applyLogs.length > 0 && (
            <div style={{ marginTop: 12, background: '#0f172a', color: '#fff', padding: 12, borderRadius: 6 }}>
              <strong>Logs:</strong>
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{applyLogs.join('\n')}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
