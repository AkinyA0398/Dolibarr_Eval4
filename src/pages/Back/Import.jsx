import React, { useState, useRef, useEffect } from "react";
import { parseFactures, parseDetailFactures, parsePaiements } from "../../services/ParserCsv.jsx";
import { apiDolibarr } from "../../api/apiDolibarr";

// ── 🔧 HELPERS ─────────────────────────────────────────────────────────────
const formatToStandardDate = (dateStr) => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();

  // Format DD/MM/YYYY
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) {
        year = `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }
  }
  return str;
};

const isDateSuspecte = (dateStr) => {
  if (!dateStr) return false;
  const match = String(dateStr).match(/(\d{4})$/);
  if (!match) return false;
  const annee = parseInt(match[1], 10);
  const anneeActuelle = new Date().getFullYear();
  return !(annee === 2006 || (annee >= anneeActuelle - 2 && annee <= anneeActuelle + 1));
};

const parseTaxRate = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace('%', '').replace(',', '.').trim();
  return parseFloat(cleaned) || 0;
};

// Nettoyage strict des références
const cleanRef = (val) => String(val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

export default function Import() {
  const [fileFactures, setFileFactures]   = useState(null);
  const [fileDetails, setFileDetails]     = useState(null);
  const [filePaiements, setFilePaiements] = useState(null);

  const [isImporting, setIsImporting]     = useState(false);
  const [logs, setLogs]                   = useState([]);
  const [statusMessage, setStatusMessage] = useState("");

  const consoleEndRef = useRef(null);

  const addLog = (msg) => {
    console.log(msg);
    setLogs((prev) => [...prev, msg]);
    setStatusMessage(msg);
  };

  // Auto-scroll automatique de la console
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

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
        const refProd = d.ref_produit || d.ref || d.code_produit;
        if (refProd && !uniqueProducts.find((p) => (p.ref_produit || p.ref || p.code_produit) === refProd)) {
          uniqueProducts.push(d);
        }
      });

      for (const prod of uniqueProducts) {
        const refProd = prod.ref_produit || prod.ref || prod.code_produit;
        try {
          const pId = await apiDolibarr.createProduct(prod);
          productMap[refProd] = pId;
          addLog(`  ✓ Produit "${refProd}" (${prod.produit || prod.label || ''}) créé → ID ${pId}`);
        } catch (e) {
          addLog(`  ⚠️ Produit "${refProd}" déjà existant ou erreur : ${e.message}`);
        }
      }

      // ── 2. Tiers / Clients ────────────────────────────────────────────────
      addLog("👤 Création des clients...");
      const uniqueClients = [];
      const clientMap = {};

      factures.forEach((f) => {
        const codeCli = f.code_client || f.code;
        if (codeCli && !uniqueClients.find((c) => (c.code_client || c.code) === codeCli)) {
          uniqueClients.push(f);
        }
      });

      for (const cli of uniqueClients) {
        const codeCli = cli.code_client || cli.code;
        try {
          const sId = await apiDolibarr.createThirdparty(cli);
          clientMap[codeCli] = sId;
          addLog(`  ✓ Client "${cli.nom_client || cli.name}" (${codeCli}) créé → socid ${sId}`);
        } catch (e) {
          addLog(`  ⚠️ Client "${codeCli}" déjà existant ou erreur : ${e.message}`);
        }
      }

      // ── 3. Factures + Lignes + Validation + Paiements ─────────────────────
      let count = 0;
      for (const fac of factures) {
        count++;
        const numFac = String(fac.num_facture || fac.ref || fac.num || '').trim();
        const codeCli = fac.code_client || fac.code;

        addLog(`🧾 Facture ${count}/${factures.length} : ${numFac} (${fac.nom_client || fac.name})...`);

        const socid = clientMap[codeCli];
        if (!socid) {
          addLog(`  ❌ Client introuvable (${codeCli}) pour la facture ${numFac}, ignorée.`);
          continue;
        }

        fac.socid = socid;
        try {
          const resInvoice = await apiDolibarr.createInvoice(fac);
          const invId = typeof resInvoice === 'object' ? (resInvoice.id || resInvoice.rowid) : parseInt(resInvoice, 10);

          addLog(`  ✓ Facture créée → ID ${invId}`);

          // Lignes de détail de la facture
          const lignes = details.filter((d) => {
            const dFac = String(d.num_facture || d.ref_facture || d.facnumber || '').trim();
            return dFac.toUpperCase() === numFac.toUpperCase();
          });

          const refDetailsFacture = lignes.map((l) => String(l.ref_detail || l.ref || l.id).trim().toUpperCase());

          for (const ligne of lignes) {
            const refProd = ligne.ref_produit || ligne.ref || ligne.code_produit;
            ligne.fk_product = productMap[refProd];

            const tvaTx = parseTaxRate(ligne.taxe || ligne.tva_tx || ligne.tva);
            const remisePct = parseTaxRate(ligne.remise || ligne.remise_percent || 0);

            const ligneNormalisee = {
              ...ligne,
              tva_tx: tvaTx,
              subprice: parseFloat(String(ligne.pu_hors_Taxe || ligne.pu_ht || ligne.subprice || 0).replace(',', '.')),
              qty: Number(ligne.quantite || ligne.qty || 1),
              remise_percent: remisePct
            };

            await apiDolibarr.addInvoiceLine(invId, ligneNormalisee);
            addLog(`    + Ligne : ${ligne.produit || ligne.label || 'Produit'} × ${ligneNormalisee.qty} @ ${ligneNormalisee.subprice} € HT (TVA ${tvaTx}%, Remise ${remisePct}%)`);
          }

          // Validation
          await apiDolibarr.validateInvoice(invId);
          addLog(`  ✓ Facture ${numFac} validée.`);

          // RECHERCHE STRUCTURÉE ET SÉCURISÉE DES PAIEMENTS
          const paiementsLies = paiements.filter((p) => {
            const rawNumP = p.num_facture || p.ref_facture || p.num_fac || p.facnumber || p.facture || p.ref_detail || '';
            const refP    = String(p.ref_detail || p.ref || p.id_detail || '').trim().toUpperCase();

            const numFacClean = cleanRef(numFac);
            const numPClean   = cleanRef(rawNumP);

            // Match direct ou suffixe sur la référence de facture
            if (numPClean && (numPClean === numFacClean || numPClean.endsWith(numFacClean) || numFacClean.endsWith(numPClean))) {
              return true;
            }

            // Match sur la référence de ligne
            if (refP && refDetailsFacture.includes(refP)) {
              return true;
            }

            return false;
          });

          if (paiementsLies.length === 0) {
            addLog(`  ⚠️ Aucun paiement correspondant trouvé dans le CSV pour ${numFac}`);
          } else {
            addLog(`  💳 Application de ${paiementsLies.length} règlement(s)...`);
          }

          // Application des règlements
          for (let idx = 0; idx < paiementsLies.length; idx++) {
            const p = paiementsLies[idx];
            const rawDate = p.date_reglement || p.date || p.date_paiement;
            const formattedDate = formatToStandardDate(rawDate);
            const rawMontant = p.montant || p.amount || p.valeur || 0;
            const caisseNom = (p.caisse || p.banque || p.mode || 'Caisse1').trim();

            const isCash = caisseNom.toLowerCase().includes('caisse') ||
                           caisseNom.toLowerCase().includes('cash') ||
                           caisseNom.toLowerCase().includes('liq');

            const paiementFormatted = {
              invoice_id: invId,
              montant: parseFloat(String(rawMontant).replace(',', '.')),
              date_reglement: formattedDate,
              caisse: caisseNom,
              payment_mode_id: isCash ? 1 : 4, // 1 = LIQ (Espèces), 4 = VIR (Virement)
              is_last_payment: idx === paiementsLies.length - 1
            };

            if (isDateSuspecte(rawDate)) {
              addLog(`    ⚠️ Date historique détectée (${rawDate} → ${formattedDate}) — Enregistrement...`);
            }

            try {
              await apiDolibarr.createPayment(paiementFormatted);
              addLog(`    💳 Paiement appliqué à ${numFac} : ${paiementFormatted.montant} € via ${paiementFormatted.caisse} (${formattedDate})`);
            } catch (errPay) {
              addLog(`    ❌ Échec du paiement pour ${numFac} (${paiementFormatted.montant} €) : ${errPay.message || errPay}`);
            }
          }
        } catch (e) {
          addLog(`  ❌ Erreur sur la facture ${numFac} : ${e.message || e}`);
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
          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem' }}>
              📄 Fichier CSV — Factures
            </label>
            <input
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={(e) => setFileFactures(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', background: '#fff', cursor: 'pointer' }}
            />
          </div>

          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem' }}>
              📄 Fichier CSV — Détails Factures
            </label>
            <input
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={(e) => setFileDetails(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', background: '#fff', cursor: 'pointer' }}
            />
          </div>

          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.4rem' }}>
              📄 Fichier CSV — Paiements
            </label>
            <input
              type="file"
              accept=".csv"
              disabled={isImporting}
              onChange={(e) => setFilePaiements(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', background: '#fff', cursor: 'pointer' }}
            />
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

        {(isImporting || logs.length > 0) && (
          <div style={{ textAlign: 'left', marginTop: '2rem' }}>
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
                border: '1px solid #334155',
              }}
            >
              {logs.map((line, i) => (
                <div
                  key={i}
                  style={{
                    paddingBottom: '0.25rem',
                    color:
                      line.includes('💳 Paiement appliqué') || line.startsWith('  ✓') || line.startsWith('🎉') || line.startsWith('✅')
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
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}

        {!isImporting && statusMessage && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              backgroundColor: isError ? '#fee2e2' : isSuccess ? '#d1fae5' : '#f1f5f9',
              color: isError ? '#991b1b' : isSuccess ? '#065f46' : '#1e293b',
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}