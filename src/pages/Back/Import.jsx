import React, { useState } from "react";
import { parseFactures, parseDetailFactures, parsePaiements } from "../../services/ParserCsv.jsx";
import { apiDolibarr } from "../../api/apiDolibarr";

const isDateSuspecte = (dateStr) => {
  if (!dateStr) return false;
  const match = String(dateStr).match(/(\d{4})$/);
  if (!match) return false;
  const annee = parseInt(match[1], 10);
  const anneeActuelle = new Date().getFullYear();

  const estAnneeHistorique = annee === 2006;
  const estAnneeRecente = annee >= anneeActuelle - 2 && annee <= anneeActuelle + 1;

  return !(estAnneeHistorique || estAnneeRecente);
};

export default function Import() {
  const [fileFactures, setFileFactures]   = useState(null);
  const [fileDetails, setFileDetails]     = useState(null);
  const [filePaiements, setFilePaiements] = useState(null);

  const [isImporting, setIsImporting]     = useState(false);
  const [logs, setLogs]                   = useState([]);
  const [statusMessage, setStatusMessage] = useState("");

  const addLog = (msg) => {
    console.log(msg);
    setLogs((prev) => [...prev, msg]);
    setStatusMessage(msg);
  };

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });

  const handleImport = async (e) => {
    e.preventDefault();
    if (!fileFactures || !fileDetails || !filePaiements) {
      alert("Veuillez sélectionner les 3 fichiers CSV (Factures, Détails, Paiements).");
      return;
    }

    setIsImporting(true);
    setLogs([]);
    setStatusMessage("Lecture des fichiers CSV...");

    try {
      // ── 0. Lecture des fichiers ───────────────────────────────────────────
      addLog("📂 Lecture des fichiers CSV sélectionnés...");
      const [textFactures, textDetails, textPaiements] = await Promise.all([
        readFileAsText(fileFactures),
        readFileAsText(fileDetails),
        readFileAsText(filePaiements),
      ]);

      const factures  = parseFactures(textFactures);
      const details   = parseDetailFactures(textDetails);
      const paiements = parsePaiements(textPaiements);

      addLog(`✅ CSV analysés : ${factures.length} facture(s), ${details.length} ligne(s) détail, ${paiements.length} paiement(s).`);

      // ── 1. Produits uniques ───────────────────────────────────────────────
      addLog("📦 Création des produits...");
      const uniqueProducts = [];
      const productMap = {};
      details.forEach((d) => {
        if (!uniqueProducts.find((p) => p.ref_produit === d.ref_produit)) {
          uniqueProducts.push(d);
        }
      });

      for (const prod of uniqueProducts) {
        try {
          const pId = await apiDolibarr.createProduct(prod);
          productMap[prod.ref_produit] = pId;
          addLog(`  ✓ Produit "${prod.ref_produit}" (${prod.produit}) créé → ID ${pId}`);
        } catch (e) {
          addLog(`  ⚠️ Produit "${prod.ref_produit}" déjà existant ou erreur : ${e.message}`);
        }
      }

      // ── 2. Tiers / Clients ────────────────────────────────────────────────
      addLog("👤 Création des clients...");
      const uniqueClients = [];
      const clientMap = {};
      factures.forEach((f) => {
        if (!uniqueClients.find((c) => c.code_client === f.code_client)) {
          uniqueClients.push(f);
        }
      });

      for (const cli of uniqueClients) {
        try {
          const sId = await apiDolibarr.createThirdparty(cli);
          clientMap[cli.code_client] = sId;
          addLog(`  ✓ Client "${cli.nom_client}" (${cli.code_client}) créé → socid ${sId}`);
        } catch (e) {
          addLog(`  ⚠️ Client "${cli.code_client}" déjà existant ou erreur : ${e.message}`);
        }
      }

      // ── 3. Factures + Lignes + Validation + Paiements ─────────────────────
      let count = 0;
      for (const fac of factures) {
        count++;
        addLog(`🧾 Facture ${count}/${factures.length} : ${fac.num_facture} (${fac.nom_client})...`);

        const socid = clientMap[fac.code_client];
        if (!socid) {
          addLog(`  ❌ Client introuvable pour la facture ${fac.num_facture}, ignorée.`);
          continue;
        }

        fac.socid = socid;
        try {
          const invId = await apiDolibarr.createInvoice(fac);
          addLog(`  ✓ Facture créée → ID ${invId}`);

          // Récupère les détails spécifiques à CETTE facture
          const lignes = details.filter((d) => String(d.num_facture).trim() === String(fac.num_facture).trim());
          const refDetailsFacture = lignes.map((l) => String(l.ref_detail).trim());

          for (const ligne of lignes) {
            ligne.fk_product = productMap[ligne.ref_produit];
            await apiDolibarr.addInvoiceLine(invId, ligne);
            addLog(`    + Ligne : ${ligne.produit} × ${ligne.quantite} @ ${ligne.pu_hors_Taxe} HT (TVA ${ligne.taxe})`);
          }

          // Validation de la facture dans Dolibarr
          await apiDolibarr.validateInvoice(invId);
          addLog(`  ✓ Facture ${fac.num_facture} validée.`);

          // Association stricte des paiements
          const paiementsLies = paiements.filter((p) => {
            const numFacP = String(p.num_facture || '').trim().toUpperCase();
            const refP    = String(p.ref_detail || '').trim();

            // 1. Si le CSV contient explicitement num_facture (ex: "F001")
            if (numFacP) {
              return numFacP === String(fac.num_facture).trim().toUpperCase();
            }

            // 2. Sinon, association via ref_detail lié aux détails de la facture
            return refDetailsFacture.includes(refP);
          });

          for (const p of paiementsLies) {
            p.invoice_id = invId;

            if (isDateSuspecte(p.date_reglement)) {
              addLog(`    ⚠️ Date historique détectée (${p.date_reglement}) — Enregistrement...`);
            }

            await apiDolibarr.createPayment(p);
            addLog(`    💳 Paiement appliqué à ${fac.num_facture} : ${p.montant} € via ${p.caisse} (${p.date_reglement})`);
          }
        } catch (e) {
          addLog(`  ❌ Erreur sur la facture ${fac.num_facture} : ${e.message}`);
        }
      }

      addLog("🎉 Importation Série 4 terminée avec succès !");
      setStatusMessage("✅ Importation globale réussie avec succès !");
    } catch (err) {
      console.error("❌ Erreur lors de l'importation :", err);
      addLog(`❌ Erreur critique : ${err.message || err}`);
      setStatusMessage(`Erreur lors de l'importation : ${err.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  const isSuccess = statusMessage.startsWith("✅");
  const isError   = statusMessage.startsWith("Erreur") || statusMessage.startsWith("❌");

  return (
    <div className="animate-fade-in container" style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: 'var(--primary-color)' }}>
          📥 Importation — Série 4
        </h2>
        <p className="text-muted" style={{ fontSize: '1.1rem', marginBottom: '2.5rem' }}>
          Sélectionnez les 3 fichiers CSV de la Série 4 pour injecter factures, détails et paiements dans Dolibarr.
        </p>

        <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          {/* Factures */}
          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem', color: 'var(--text-primary, #f1f5f9)' }}>
              📄 Fichier CSV — Factures
            </label>
            <input
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={(e) => setFileFactures(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color, #334155)', background: 'var(--bg-secondary, #1e293b)', color: 'var(--text-primary, #f1f5f9)', cursor: 'pointer' }}
            />
            {fileFactures && (
              <span style={{ fontSize: '0.8rem', color: '#4ade80', marginTop: '0.25rem', display: 'block' }}>
                ✓ {fileFactures.name}
              </span>
            )}
          </div>

          {/* Détails */}
          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem', color: 'var(--text-primary, #f1f5f9)' }}>
              📄 Fichier CSV — Détails Factures
            </label>
            <input
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={(e) => setFileDetails(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color, #334155)', background: 'var(--bg-secondary, #1e293b)', color: 'var(--text-primary, #f1f5f9)', cursor: 'pointer' }}
            />
            {fileDetails && (
              <span style={{ fontSize: '0.8rem', color: '#4ade80', marginTop: '0.25rem', display: 'block' }}>
                ✓ {fileDetails.name}
              </span>
            )}
          </div>

          {/* Paiements */}
          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem', color: 'var(--text-primary, #f1f5f9)' }}>
              📄 Fichier CSV — Paiements
            </label>
            <input
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={(e) => setFilePaiements(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color, #334155)', background: 'var(--bg-secondary, #1e293b)', color: 'var(--text-primary, #f1f5f9)', cursor: 'pointer' }}
            />
            {filePaiements && (
              <span style={{ fontSize: '0.8rem', color: '#4ade80', marginTop: '0.25rem', display: 'block' }}>
                ✓ {filePaiements.name}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isImporting || !fileFactures || !fileDetails || !filePaiements}
            className="btn btn-primary"
            style={{ padding: '1rem', fontSize: '1.1rem', marginTop: '0.5rem', opacity: (!fileFactures || !fileDetails || !filePaiements) ? 0.5 : 1 }}
          >
            {isImporting ? "⏳ Importation en cours..." : "🚀 Démarrer l'Importation"}
          </button>
        </form>

        {/* Console de logs */}
        {(isImporting || logs.length > 0) && (
          <div style={{ textAlign: 'left', marginTop: '2rem' }}>
            {isImporting && (
              <div style={{ color: 'var(--primary-color)', fontWeight: '600', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-block', animation: 'spin 2s linear infinite' }}>⏳</span>
                Importation en cours...
              </div>
            )}
            <div
              id="import-log-console"
              style={{
                background: '#0f172a',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                color: '#94a3b8',
                maxHeight: '320px',
                overflowY: 'auto',
                border: '1px solid #1e293b',
              }}
            >
              {logs.map((line, i) => (
                <div
                  key={i}
                  style={{
                    paddingBottom: '0.25rem',
                    color:
                      line.startsWith('  ✓') || line.startsWith('🎉') || line.startsWith('✅')
                        ? '#4ade80'
                        : line.startsWith('  ❌') || line.startsWith('❌')
                        ? '#f87171'
                        : line.startsWith('  ⚠️') || line.startsWith('    ⚠️')
                        ? '#fbbf24'
                        : '#94a3b8',
                  }}
                >
                  {line}
                </div>
              ))}
              {isImporting && <span>▌</span>}
            </div>
          </div>
        )}

        {/* Message final */}
        {!isImporting && statusMessage && (
          <div
            className="animate-fade-in"
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              backgroundColor: isError ? 'var(--danger-bg)' : isSuccess ? 'var(--success-bg)' : 'var(--bg-secondary)',
              border: `1px solid ${isError ? '#fecdd3' : isSuccess ? '#a7f3d0' : '#334155'}`,
              color: isError ? 'var(--danger-color)' : isSuccess ? 'var(--success-color)' : 'var(--text-primary)',
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}