import React, { useState } from "react";
import { parseSalaires } from "../../services/ParserCsv.jsx";
import { apiDolibarr } from "../../api/apiDolibarr";

export default function Import() {
  const [fileSalaires, setFileSalaires] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileSalaires) {
      alert("Veuillez sélectionner le fichier CSV des salaires.");
      return;
    }

    setIsImporting(true);
    setStatusMessage("Lecture et analyse du fichier CSV...");

    try {
      const textSalaires = await readFileAsText(fileSalaires);
      const salaires = parseSalaires(textSalaires);

      setStatusMessage(`Injection des fiches de salaires (0/${salaires.length})...`);
      let countSal = 0;
      for (const sal of salaires) {
        // En l'absence des employés, on utilise directement le ref_employe du CSV comme fk_user
        // Cela suppose que le fk_user existe déjà dans Dolibarr
        const salaireAjuste = {
          ...sal,
          fk_user: sal.ref_employe,
          paiements: sal.paiements || []
        };

        await apiDolibarr.createSalaire(salaireAjuste);
        countSal++;
        setStatusMessage(`Injection des fiches de salaires (${countSal}/${salaires.length})...`);
      }

      setStatusMessage("✅ Importation globale réussie avec succès !");
      alert("Félicitations, les salaires ont été synchronisés !");
      
      window.location.reload();
      
    } catch (err) {
      console.error("❌ Erreur lors de l'importation :", err);
      setStatusMessage(`Erreur lors de l'importation : ${err.message || err}`);
      alert("Une erreur est survenue pendant l'injection des données.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="animate-fade-in container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--primary-color)' }}>
          Importation de Données Financières
        </h2>
        <p className="text-muted" style={{ fontSize: '1.1rem', marginBottom: '2.5rem' }}>
          Téléversez vos données de paie pour initialiser le système.
        </p>
        
        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ background: 'var(--surface-color)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '2px dashed var(--border-color)', transition: 'all 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '700', color: 'var(--primary-color)' }}>
               📁 Fichier CSV des Salaires
            </label>
            <input type="file" accept=".csv" disabled={isImporting} onChange={(e) => setFileSalaires(e.target.files[0])} style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', width: '100%', background: 'rgba(255,255,255,0.5)' }} />
          </div>

          <button 
            type="submit" 
            disabled={isImporting}
            className="btn btn-primary w-full"
            style={{ 
              padding: '1rem', 
              fontSize: '1.1rem',
              marginTop: '1rem',
              opacity: isImporting ? 0.7 : 1,
              cursor: isImporting ? 'wait' : 'pointer'
            }}
          >
            {isImporting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <span style={{ animation: 'spin 2s linear infinite' }}>⏳</span> Importation en cours...
              </span>
            ) : "Démarrer l'Importation"}
          </button>
        </form>

        {statusMessage && (
          <div className="animate-fade-in" style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--success-bg)', border: '1px solid #a7f3d0', color: 'var(--success-color)', fontWeight: '600', maxWidth: '600px', margin: '2rem auto 0 auto' }}>
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}