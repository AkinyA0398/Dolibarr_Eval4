// src/services/ParserCsv.jsx

export const parseSalaires = (csvText) => {
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
  return lines.slice(1).map((line, lineIndex) => {
    const sanitizedLine = line.replace(/""/g, "'");
    const colonnes = sanitizedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (colonnes.length < 5) return null;
    const ref_salaire = colonnes[0];
    const ref_employe = colonnes[1];
    const date_debut = colonnes[2];
    const date_fin = colonnes[3];
    let montantBrut = colonnes[4] ? colonnes[4].replace(/"/g, '').replace(',', '.').trim() : '0';
    const montant = parseFloat(montantBrut);
    if (isNaN(montant)) return null;

    const paiementRaw = colonnes[5] || '';
    let paiements = [];
    const cleanPaiementRaw = paiementRaw.trim().replace(/^"|Status"$|"/g, '');

    if (cleanPaiementRaw.startsWith('{')) {
      const bracketMatches = cleanPaiementRaw.match(/\[([^\]]+)\]/g);
      if (bracketMatches) {
        paiements = bracketMatches.map(b => {
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
        }).filter(p => p.montant > 0);
      }
    } else if (cleanPaiementRaw) {
      const simplePaiementBrut = cleanPaiementRaw.replace(',', '.').trim();
      const valSimple = parseFloat(simplePaiementBrut);
      if (!isNaN(valSimple) && valSimple > 0) {
        paiements = [{ date: date_fin.trim(), montant: valSimple }];
      }
    }
    return {
      ref_salaire: parseInt(ref_salaire),
      ref_employe: parseInt(ref_employe),
      date_debut: date_debut.trim(),
      date_fin: date_fin.trim(),
      montant: montant,
      paiements: paiements
    };
  }).filter(Boolean);
};

// --- Nouveaux Parsers pour la Série 4 ---

export const parseFactures = (csvText) => {
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      num_facture: cols[0]?.trim(),
      date_facture: cols[1]?.trim(),
      date_limite_reglement: cols[2]?.trim() || '',
      code_client: cols[3]?.trim(),
      nom_client: cols[4]?.trim(),
    };
  }).filter(f => f.num_facture);
};

export const parseDetailFactures = (csvText) => {
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
  return lines.slice(1).map((line) => {
    // Handling possible quotes for numbers with commas like "14,50%"
    const sanitizedLine = line.replace(/""/g, "'");
    const cols = sanitizedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/(^"|"$)/g, '').trim());
    return {
      ref_detail: cols[0],
      num_facture: cols[1],
      ref_produit: cols[2],
      produit: cols[3],
      quantite: parseInt(cols[4] || 1),
      pu_hors_Taxe: parseFloat(cols[5] || 0),
      taxe: cols[6] || '',
      remise: cols[7] || ''
    };
  }).filter(d => d.num_facture && d.ref_produit);
};

export const parsePaiements = (csvText) => {
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      ref_detail: cols[0]?.trim(), // Peut être l'ID de la facture
      date_reglement: cols[1]?.trim(),
      caisse: cols[2]?.trim(),
      montant: parseFloat(cols[3] || 0)
    };
  }).filter(p => p.ref_detail);
};