// src/services/ParserCsv.jsx

export const parseSalaires = (csvText) => {
  // Filtrer les lignes vides et nettoyer les \r
  const lines = csvText.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
  
  return lines.slice(1).map((line, lineIndex) => {
    // 🛠️ ÉTAPE 1 : Nettoyage préalable des doublons de guillemets propres au CSV pour ne pas perturber la Regex
    // On transforme les "" en simples ' pour que le split s'y retrouve
    const sanitizedLine = line.replace(/""/g, "'");
    
    // Séparation sécurisée par virgule uniquement en dehors des guillemets
    const colonnes = sanitizedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (colonnes.length < 5) {
      console.warn(`[Parser CSV] Ligne ${lineIndex + 2} ignorée (colonnes insuffisantes) : "${line}"`);
      return null;
    }

    const ref_salaire = colonnes[0];
    const ref_employe = colonnes[1];
    const date_debut = colonnes[2];
    const date_fin = colonnes[3];
    
    // Extraction et nettoyage du montant
    let montantBrut = colonnes[4] ? colonnes[4].replace(/"/g, '').replace(',', '.').trim() : '0';
    const montant = parseFloat(montantBrut);

    if (isNaN(montant)) {
      console.warn(`[Parser CSV] Ligne ${lineIndex + 2} ignorée (montant invalide) : "${line}"`);
      return null;
    }

    // Récupération de la colonne de paiements brute
    const paiementRaw = colonnes[5] || '';
    let paiements = [];
    const cleanPaiementRaw = paiementRaw.trim().replace(/^"|Status"$|"/g, ''); // Enlever les guillemets englobants restants

    // 🛠️ ÉTAPE 3 : Parsing robuste des blocs {['date', montant]}
    if (cleanPaiementRaw.startsWith('{')) {
      // Expression régulière qui match tout ce qu'il y a entre crochets [ ... ]
      const bracketMatches = cleanPaiementRaw.match(/\[([^\]]+)\]/g);
      
      if (bracketMatches) {
        paiements = bracketMatches.map(b => {
          // On nettoie les crochets et les apostrophes (anciennement guillemets doublés)
          const cleanB = b.replace(/[\[\]']/g, ''); // Ex: "08/03/26,890"
          const parts = cleanB.split(',');
          
          let dateStr = (parts[0] || '').trim();
          const pMontantBrut = (parts[1] || '0').replace(',', '.').trim();
          const val = parseFloat(pMontantBrut);
          
          // Normalisation de l'année (ex: "26" -> "2026")
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
      // Cas de repli si le paiement est juste un nombre brut sans crochets
      const simplePaiementBrut = cleanPaiementRaw.replace(',', '.').trim();
      const valSimple = parseFloat(simplePaiementBrut);
      if (!isNaN(valSimple) && valSimple > 0) {
        paiements = [{ date: date_fin.trim(), montant: valSimple }];
      }
    }
    
    console.log(`[Parser CSV] Ligne ${lineIndex + 2} → ref_sal=${ref_salaire}, ref_emp=${ref_employe}, montant=${montant}€, paiements calculés:`, paiements);

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