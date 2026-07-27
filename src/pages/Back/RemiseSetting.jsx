import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:5000/api";

const PAYMENT_MODES = [
  { id: "cash", label: "Espèces (Cash)", icon: "💵" },
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "cb", label: "Carte Bancaire", icon: "💳" },
];

export default function RemiseSettings() {
  const [selectedMode, setSelectedMode] = useState("cash");
  const [remises, setRemises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Valeurs en cours d'édition, indexées par id
  const [draftValues, setDraftValues] = useState({});
  // État par ligne : 'saving' | 'saved' | 'error' | undefined
  const [rowStatus, setRowStatus] = useState({});

  const fetchRemises = async (mode) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE}/remises?mode=${mode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setRemises(data);
      const initialDrafts = {};
      data.forEach((r) => { 
        initialDrafts[r.id] = r.discount_percentage; 
      });
      setDraftValues(initialDrafts);
      setRowStatus({});
    } catch (err) {
      setLoadError(err.message || "Impossible de charger les paliers de remise.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRemises(selectedMode);
  }, [selectedMode]);

  const handleChange = (id, value) => {
    setDraftValues((prev) => ({ ...prev, [id]: value }));
  };

  const hasChanged = (id) => {
    const original = remises.find((r) => r.id === id)?.discount_percentage;
    return String(draftValues[id]) !== String(original);
  };

  const handleSave = async (id) => {
    const rawValue = draftValues[id];
    const numValue = parseInt(rawValue, 10);

    if (Number.isNaN(numValue) || numValue < 0 || numValue > 100) {
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
      return;
    }

    setRowStatus((prev) => ({ ...prev, [id]: "saving" }));

    try {
      const res = await fetch(`${API_BASE}/remises/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          discount_percentage: numValue,
          payment_mode: selectedMode 
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setRemises((prev) =>
        prev.map((r) => (r.id === id ? { ...r, discount_percentage: numValue } : r))
      );
      setRowStatus((prev) => ({ ...prev, [id]: "saved" }));
      setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [id]: undefined }));
      }, 2000);
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
    }
  };

  return (
    <div className="animate-fade-in container" style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ fontSize: "2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>⚙️</span> Réglages — Remises par mode de paiement
      </h2>
      <p className="text-muted" style={{ marginBottom: "1.5rem", fontSize: "1rem", fontWeight: "500" }}>
        Définit le pourcentage de remise appliqué selon le mode de règlement et le délai écoulé.
      </p>

      {/* ── 💳 SÉLECTEUR DU MODE DE PAIEMENT ──────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        {PAYMENT_MODES.map((mode) => {
          const isActive = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 1.25rem",
                borderRadius: "var(--radius-md, 8px)",
                border: isActive ? "2px solid var(--primary-color, #3b82f6)" : "1px solid var(--border-color, #334155)",
                background: isActive ? "var(--primary-color, #3b82f6)" : "var(--bg-secondary, #1e293b)",
                color: "#ffffff",
                fontWeight: isActive ? "700" : "500",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              <span>{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="container flex items-center justify-center" style={{ minHeight: "30vh" }}>
          <div className="text-muted" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem", animation: "spin 2s linear infinite" }}>⏳</div>
            <p style={{ fontWeight: "600", fontSize: "1.1rem" }}>Chargement des paliers...</p>
          </div>
        </div>
      )}

      {loadError && !loading && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--danger-bg, #451a1a)",
            border: "1px solid #fecdd3",
            color: "var(--danger-color, #f87171)",
            marginBottom: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>❌ {loadError}</span>
          <button className="btn btn-primary" onClick={() => fetchRemises(selectedMode)} style={{ padding: "0.4rem 1rem" }}>
            Réessayer
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {remises.map((r) => {
            const status = rowStatus[r.id];
            const changed = hasChanged(r.id);
            return (
              <div
                key={r.id}
                className="card"
                style={{
                  padding: "1.25rem 1.5rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1.5rem",
                  flexWrap: "wrap",
                  borderLeft: changed ? "4px solid var(--primary-color, #3b82f6)" : "4px solid transparent",
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: "1.05rem" }}>{r.label}</h4>
                  <small className="text-muted">
                    {r.max_days >= 9999 ? "Au-delà du palier précédent" : `Jusqu'à ${r.max_days} jour(s)`}
                  </small>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={draftValues[r.id] ?? ""}
                      onChange={(e) => handleChange(r.id, e.target.value)}
                      style={{
                        width: "70px",
                        padding: "0.5rem",
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${status === "error" ? "#f87171" : "var(--border-color, #334155)"}`,
                        background: "var(--bg-secondary, #ffff)",
                        color: "var(--text-primary, #f1f5f9)",
                        textAlign: "right",
                      }}
                    />
                    <span style={{ color: "var(--text-primary)" }}>%</span>
                  </div>

                  <button
                    className="btn btn-primary"
                    disabled={!changed || status === "saving"}
                    onClick={() => handleSave(r.id)}
                    style={{
                      padding: "0.5rem 1.1rem",
                      opacity: !changed || status === "saving" ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {status === "saving" ? "⏳" : "Enregistrer"}
                  </button>

                  <span style={{ minWidth: "90px", fontSize: "0.85rem" }}>
                    {status === "saved" && <span style={{ color: "#4ade80" }}>✓ Enregistré</span>}
                    {status === "error" && <span style={{ color: "#f87171" }}>⚠️ Invalide (0–100)</span>}
                  </span>
                </div>
              </div>
            );
          })}
          {remises.length === 0 && <p className="text-muted">Aucun palier de remise configuré pour ce mode de paiement.</p>}
        </div>
      )}
    </div>
  );
}