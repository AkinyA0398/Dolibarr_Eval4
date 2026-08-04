// src/services/ParserCsv.jsx

// Helper interne pour découper proprement une ligne CSV respectant les guillemets et virgules
const splitCsvLine = (line) => {
  const sanitized = String(line || '').replace(/""/g, "'");
  // Regex découpant par virgule seulement si elle n'est pas entre deux guillemets
  return sanitized
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((c) => c.replace(/(^"|"$)/g, '').trim());
};

export const parseSalaires = (csvText) => {
  if (!csvText) return [];
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter((l) => l.trim());

  return lines.slice(1).map((line) => {
    const colonnes = splitCsvLine(line);
    if (colonnes.length < 5) return null;

    const ref_salaire = colonnes[0];
    const ref_employe = colonnes[1];
    const date_debut = colonnes[2];
    const date_fin = colonnes[3];
    const montantBrut = colonnes[4] ? colonnes[4].replace(',', '.').trim() : '0';
    const montant = parseFloat(montantBrut);

    if (isNaN(montant)) return null;

    const paiementRaw = colonnes[5] || '';
    let paiements = [];
    const cleanPaiementRaw = paiementRaw.trim().replace(/^"|Status"$|"/g, '');

    if (cleanPaiementRaw.startsWith('{')) {
      const bracketMatches = cleanPaiementRaw.match(/\[([^\]]+)\]/g);
      if (bracketMatches) {
        paiements = bracketMatches
          .map((b) => {
            const cleanB = b.replace(/[\[\]']/g, '');
            const parts = cleanB.split(',');
            let dateStr = (parts[0] || '').trim();
            const pMontantBrut = (parts[1] || '0').replace(',', '.').trim();
            const val = parseFloat(pMontantBrut);

            if (dateStr) {
              const dateParts = dateStr.split('/');
              if (dateParts.length === 3 && dateParts[2].length === 2) {
                dateParts[2] = `20${dateParts[2]}`;
                dateStr = dateParts.join('/');
              }
            }
            return { date: dateStr, montant: isNaN(val) ? 0 : val };
          })
          .filter((p) => p.montant > 0);
      }
    } else if (cleanPaiementRaw) {
      const simplePaiementBrut = cleanPaiementRaw.replace(',', '.').trim();
      const valSimple = parseFloat(simplePaiementBrut);
      if (!isNaN(valSimple) && valSimple > 0) {
        paiements = [{ date: date_fin.trim(), montant: valSimple }];
      }
    }

    return {
      ref_salaire: parseInt(ref_salaire, 10),
      ref_employe: parseInt(ref_employe, 10),
      date_debut: date_debut.trim(),
      date_fin: date_fin.trim(),
      montant: montant,
      paiements: paiements,
    };
  }).filter(Boolean);
};

// --- Parsers Sécurisés pour la Série 4 ---

export const parseFactures = (csvText) => {
  if (!csvText) return [];
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter((l) => l.trim());

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    return {
      num_facture: cols[0] || '',
      date_facture: cols[1] || '',
      date_limite_reglement: cols[2] || '',
      code_client: cols[3] || '',
      nom_client: cols[4] || '',
    };
  }).filter((f) => f.num_facture);
};

export const parseDetailFactures = (csvText) => {
  if (!csvText) return [];
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter((l) => l.trim());

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);

    const rawPU = (cols[5] || '0').replace(',', '.');
    const cleanPU = parseFloat(rawPU) || 0;

    return {
      ref_detail: cols[0] || '',
      num_facture: cols[1] || '',
      ref_produit: cols[2] || '',
      produit: cols[3] || '',
      quantite: parseInt(cols[4] || 1, 10),
      pu_hors_Taxe: cleanPU,
      taxe: cols[6] || '',
      remise: cols[7] || ''
    };
  }).filter((d) => d.num_facture && d.ref_produit);
};

export const parsePaiements = (csvText) => {
  if (!csvText) return [];
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter((l) => l.trim());

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const rawMontant = (cols[3] || '0').replace(',', '.');

    return {
      ref_detail: cols[0] || '', // ID/Numéro de facture de référence
      date_reglement: cols[1] || '',
      caisse: cols[2] || '',
      montant: parseFloat(rawMontant) || 0
    };
  }).filter((p) => p.ref_detail);
};