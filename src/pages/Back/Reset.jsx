import React, { useState } from 'react';
import { apiDolibarr } from '../../api/apiDolibarr'; // Ajuste le chemin selon ton projet

export default function Reset() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showConfirmStep, setShowConfirmStep] = useState(false);

  const handleResetExecute = async () => {
    setLoading(true);
    setMessage('Purge complète des données en cours...');
    setShowConfirmStep(false); 

    try {
    //   // 1. ✨ ÉTAPE BACKEND LOCAL : Purge de la table SQLite jours_feries
    //   console.log("⏳ Purge de la base locale SQLite (jours fériés)...");
    //   const resLocal = await fetch('http://localhost:5000/api/reset-database', { 
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' }
    //   });
      
    //   if (!resLocal.ok) {
    //     throw new Error("Erreur lors de la réinitialisation de la base SQLite locale.");
    //   }
    //   console.log("✅ Base SQLite locale purgée.");

      // 2. ÉTAPE API DOLIBARR : Appel de ton service de nettoyage
      console.log("⏳ Lancement de la purge sur l'API Dolibarr...");
      if (apiDolibarr && typeof apiDolibarr.resetAllData === 'function') {
        await apiDolibarr.resetAllData();
      }
      


      console.log("✅ Purge globale réussie ! All data cleared.");
      setMessage('Succès : Toutes les données financières réelles ont été effacées.');
      
    } catch (error) {
      console.error("❌ Erreur pendant le reset général :", error);
      setMessage(`Erreur : ${error.message || 'Impossible de réinitialiser l\'intégralité des données.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ padding: '3rem', borderTop: '4px solid var(--danger-color)', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--danger-color)' }}>
          Reset Data
        </h2>
        <p className="text-muted" style={{ fontSize: '1.1rem', marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem auto' }}>
          Cette action supprime définitivement toutes les fiches de salaires de l'application.
        </p>
        
        {/* ÉTAPE 1 : Affichage du bouton initial */}
        {!showConfirmStep && !loading && (
          <button 
            onClick={() => {
              console.log("🔘 Le bouton Réinitialiser initial a été cliqué !");
              setMessage(''); // On efface un ancien message de succès/erreur précédent
              setShowConfirmStep(true);
            }} 
            className="btn btn-danger"
            style={{ padding: '1rem 2rem', fontSize: '1.1rem', borderRadius: 'var(--radius-xl)' }}
          >
            Purger l'Application
          </button>
        )}

        {/* ÉTAPE 2 : Interface de confirmation intégrée à la page */}
        {showConfirmStep && (
          <div className="animate-fade-in" style={{ 
            border: '2px dashed var(--danger-color)', 
            padding: '2rem', 
            borderRadius: 'var(--radius-md)', 
            backgroundColor: 'var(--danger-bg)',
            maxWidth: '500px',
            margin: '0 auto'
          }}>
            <p style={{ color: '#9f1239', fontWeight: '800', marginTop: 0, fontSize: '1.1rem', marginBottom: '1.5rem' }}>
              Action Irréversible ! Confirmez-vous la suppression globale ?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                onClick={handleResetExecute}
                className="btn btn-danger"
              >
                Oui, tout supprimer
              </button>
              <button 
                onClick={() => setShowConfirmStep(false)}
                className="btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* État de chargement ou message de retour */}
        {loading && (
          <div style={{ marginTop: '2rem', color: 'var(--primary-color)', fontWeight: '600', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ animation: 'spin 2s linear infinite' }}>⏳</span> {message}
          </div>
        )}
        {!loading && message && (
          <div className="animate-fade-in" style={{ 
            marginTop: '2rem', padding: '1.25rem', borderRadius: 'var(--radius-md)', fontWeight: '600', maxWidth: '500px', margin: '2rem auto 0 auto',
            backgroundColor: message.startsWith('Erreur') ? 'var(--danger-bg)' : 'var(--success-bg)', 
            border: `1px solid ${message.startsWith('Erreur') ? '#fecdd3' : '#a7f3d0'}`,
            color: message.startsWith('Erreur') ? 'var(--danger-color)' : 'var(--success-color)' 
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}