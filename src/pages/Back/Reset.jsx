import React, { useState } from 'react';
import { apiDolibarr } from '../../api/apiDolibarr';

export default function Reset() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [showConfirmStep, setShowConfirmStep] = useState(false);

  const addLog = (msg) => {
    setLogs((prev) => [...prev, msg]);
    setMessage(msg);
  };

  const handleResetExecute = async () => {
    setLoading(true);
    setLogs([]);
    setMessage('Purge Eval4 en cours...');
    setShowConfirmStep(false);

    try {
      await apiDolibarr.resetAllData(addLog);
      setMessage('✅ Succès : Toutes les données Eval4 ont été supprimées (factures, produits, clients).');
    } catch (error) {
      console.error('❌ Erreur pendant le reset :', error);
      setMessage(`Erreur : ${error.message || 'Impossible de réinitialiser les données.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ padding: '3rem', borderTop: '4px solid var(--danger-color)', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: 'var(--danger-color)' }}>
          Reset — Série 4
        </h2>
        <p className="text-muted" style={{ fontSize: '1.1rem', marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem auto' }}>
          Cette action supprime définitivement <strong>toutes les factures, produits et clients</strong> importés dans Dolibarr pour la Série 4.
        </p>

        {/* ÉTAPE 1 : Bouton initial */}
        {!showConfirmStep && !loading && (
          <button
            onClick={() => {
              setMessage('');
              setLogs([]);
              setShowConfirmStep(true);
            }}
            className="btn btn-danger"
            style={{ padding: '1rem 2rem', fontSize: '1.1rem', borderRadius: 'var(--radius-xl)' }}
          >
            Purger les données Eval4
          </button>
        )}

        {/* ÉTAPE 2 : Confirmation */}
        {showConfirmStep && (
          <div
            className="animate-fade-in"
            style={{
              border: '2px dashed var(--danger-color)',
              padding: '2rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--danger-bg)',
              maxWidth: '500px',
              margin: '0 auto',
            }}
          >
            <p style={{ color: '#9f1239', fontWeight: '800', marginTop: 0, fontSize: '1.1rem', marginBottom: '1.5rem' }}>
              ⚠️ Action Irréversible !<br />
              Confirmez-vous la suppression de toutes les factures, produits et clients ?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={handleResetExecute} className="btn btn-danger">
                Oui, tout supprimer
              </button>
              <button onClick={() => setShowConfirmStep(false)} className="btn btn-secondary">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Chargement + Logs */}
        {loading && (
          <div style={{ marginTop: '2rem', textAlign: 'left', maxWidth: '500px', margin: '2rem auto 0 auto' }}>
            <div style={{ color: 'var(--primary-color)', fontWeight: '600', fontSize: '1.1rem', marginBottom: '1rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span style={{ display: 'inline-block', animation: 'spin 2s linear infinite' }}>⏳</span> Purge en cours...
            </div>
            <div style={{ background: '#0f172a', borderRadius: 'var(--radius-md)', padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#94a3b8', maxHeight: '200px', overflowY: 'auto' }}>
              {logs.map((l, i) => (
                <div key={i} style={{ paddingBottom: '0.3rem' }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {/* Message final */}
        {!loading && message && (
          <div
            className="animate-fade-in"
            style={{
              marginTop: '2rem',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              maxWidth: '500px',
              margin: '2rem auto 0 auto',
              backgroundColor: message.startsWith('Erreur') ? 'var(--danger-bg)' : 'var(--success-bg)',
              border: `1px solid ${message.startsWith('Erreur') ? '#fecdd3' : '#a7f3d0'}`,
              color: message.startsWith('Erreur') ? 'var(--danger-color)' : 'var(--success-color)',
            }}
          >
            {message}

            {/* Afficher les logs même après fin */}
            {logs.length > 1 && (
              <div style={{ background: '#0f172a', borderRadius: 'var(--radius-md)', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#94a3b8', marginTop: '1rem', maxHeight: '150px', overflowY: 'auto', textAlign: 'left' }}>
                {logs.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}