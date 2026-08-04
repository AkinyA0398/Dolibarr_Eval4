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

  // Valeurs en cours d'édition (label, max_days, discount_percentage) indexées par id
  const [draftValues, setDraftValues] = useState({});
  // État par ligne : 'saving' | 'saved' | 'error' | undefined
  const [rowStatus, setRowStatus] = useState({});

  // État pour la création d'un nouveau palier
  const [newLabel, setNewLabel] = useState("");
  const [newMaxDays, setNewMaxDays] = useState(0);
  const [newDiscount, setNewDiscount] = useState(0);
  const [isAdding, setIsAdding] = useState(false);

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
        initialDrafts[r.id] = {
          label: r.label,
          max_days: r.max_days,
          discount_percentage: r.discount_percentage
        }; 
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

  const handleChange = (id, field, value) => {
    setDraftValues((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const hasChanged = (id) => {
    const original = remises.find((r) => r.id === id);
    const draft = draftValues[id];
    if (!original || !draft) return false;

    return (
      String(draft.label) !== String(original.label) ||
      String(draft.max_days) !== String(original.max_days) ||
      String(draft.discount_percentage) !== String(original.discount_percentage)
    );
  };

  const handleSave = async (id) => {
    const draft = draftValues[id];
    const numDiscount = parseFloat(draft.discount_percentage);
    const numDays = parseFloat(draft.max_days);

    if (
      Number.isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100 ||
      Number.isNaN(numDays) || numDays < 0
    ) {
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
      return;
    }

    setRowStatus((prev) => ({ ...prev, [id]: "saving" }));

    try {
      const res = await fetch(`${API_BASE}/remises/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          label: draft.label,
          max_days: numDays,
          discount_percentage: numDiscount,
          payment_mode: selectedMode 
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setRemises((prev) =>
        prev.map((r) => (r.id === id ? { 
          ...r, 
          label: draft.label,
          max_days: numDays,
          discount_percentage: numDiscount 
        } : r))
      );
      setRowStatus((prev) => ({ ...prev, [id]: "saved" }));
      setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [id]: undefined }));
      }, 2000);
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette condition de remise ?")) return;

    try {
      const res = await fetch(`${API_BASE}/remises/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setRemises((prev) => prev.filter((r) => r.id !== id));
      setDraftValues((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      alert(`Erreur lors de la suppression : ${err.message}`);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    const numDiscount = parseFloat(newDiscount);
    const numDays = parseFloat(newMaxDays);

    if (
      Number.isNaN(numDiscount) || numDiscount < 0 || numDiscount > 100 ||
      Number.isNaN(numDays) || numDays < 0
    ) {
      alert("Saisie invalide : vérifiez le nombre de jours (≥ 0) et le pourcentage (0 à 100).");
      return;
    }

    setIsAdding(true);

    try {
      const res = await fetch(`${API_BASE}/remises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          max_days: numDays,
          discount_percentage: numDiscount,
          payment_mode: selectedMode
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();

      setRemises((prev) => [...prev, created]);
      setDraftValues((prev) => ({
        ...prev,
        [created.id]: {
          label: created.label,
          max_days: created.max_days,
          discount_percentage: created.discount_percentage
        }
      }));

      // Réinitialisation du formulaire d'ajout
      setNewLabel("");
      setNewMaxDays(0);
      setNewDiscount(0);
    } catch (err) {
      alert(`Erreur de création : ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="animate-fade-in container" style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ fontSize: "2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span>⚙️</span> Réglages — Remises par mode de paiement
      </h2>
      <p className="text-muted" style={{ marginBottom: "1.5rem", fontSize: "1rem", fontWeight: "500" }}>
        Définit le pourcentage de remise appliqué selon le mode de règlement et le délai écoulé en jours.
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
          {/* LISTE DES PALIERS EXISTANTS */}
          {remises.map((r) => {
            const status = rowStatus[r.id];
            const changed = hasChanged(r.id);
            const draft = draftValues[r.id] || {};

            return (
              <div
                key={r.id}
                className="card"
                style={{
                  padding: "1.25rem 1.5rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1.25rem",
                  flexWrap: "wrap",
                  borderLeft: changed ? "4px solid var(--primary-color, #3b82f6)" : "4px solid transparent",
                }}
              >
                {/* LIBELLÉ DE LA CONDITION */}
                <div style={{ flex: "1 1 200px" }}>
                  <input
                    type="text"
                    value={draft.label ?? ""}
                    onChange={(e) => handleChange(r.id, "label", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "var(--radius-md, 6px)",
                      border: "1px solid var(--border-color, #334155)",
                      background: "#1e293b",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "0.95rem"
                    }}
                  />
                </div>

                {/* CONDITION EN JOURS */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem" }} className="text-muted">Limite :</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.max_days ?? 0}
                    onChange={(e) => handleChange(r.id, "max_days", e.target.value)}
                    style={{
                      width: "75px",
                      padding: "0.45rem 0.5rem",
                      borderRadius: "var(--radius-md, 6px)",
                      border: "1px solid var(--border-color, #334155)",
                      background: "#1e293b",
                      color: "#ffffff",
                      textAlign: "center",
                      fontWeight: "bold"
                    }}
                  />
                  <span style={{ fontSize: "0.85rem" }} className="text-muted">jour(s)</span>
                </div>

                {/* POURCENTAGE DE REMISE */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draft.discount_percentage ?? 0}
                    onChange={(e) => handleChange(r.id, "discount_percentage", e.target.value)}
                    style={{
                      width: "70px",
                      padding: "0.45rem 0.5rem",
                      borderRadius: "var(--radius-md, 6px)",
                      border: `1px solid ${status === "error" ? "#f87171" : "var(--border-color, #334155)"}`,
                      background: "#1e293b",
                      color: "#ffffff",
                      textAlign: "right",
                      fontWeight: "bold"
                    }}
                  />
                  <span style={{ color: "#ffffff", fontWeight: "bold" }}>%</span>
                </div>

                {/* ACTIONS */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    className="btn btn-primary"
                    disabled={!changed || status === "saving"}
                    onClick={() => handleSave(r.id)}
                    style={{
                      padding: "0.45rem 0.9rem",
                      opacity: !changed || status === "saving" ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {status === "saving" ? "⏳" : "Enregistrer"}
                  </button>

                  <button
                    onClick={() => handleDelete(r.id)}
                    title="Supprimer la condition"
                    style={{
                      padding: "0.45rem 0.75rem",
                      background: "rgba(248, 113, 113, 0.15)",
                      border: "1px solid #f87171",
                      color: "#f87171",
                      borderRadius: "var(--radius-md, 6px)",
                      cursor: "pointer"
                    }}
                  >
                    🗑️
                  </button>
                </div>

                {/* STATUT APPRÊTÉ */}
                {status && (
                  <div style={{ width: "100%", fontSize: "0.85rem", marginTop: "-0.25rem", textAlign: "right" }}>
                    {status === "saved" && <span style={{ color: "#4ade80" }}>✓ Modifié avec succès</span>}
                    {status === "error" && <span style={{ color: "#f87171" }}>⚠️ Valeurs invalides (0 à 100% / Jours ≥ 0)</span>}
                  </div>
                )}
              </div>
            );
          })}

          {remises.length === 0 && (
            <p className="text-muted" style={{ padding: "1rem", textAlign: "center" }}>
              Aucun palier de remise configuré pour ce mode de paiement.
            </p>
          )}

          {/* ── ➕ FORMULAIRE POUR AJOUTER UNE CONDITION ───────────────────── */}
          <form
            onSubmit={handleCreate}
            className="card"
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem 1.5rem",
              border: "1px dashed var(--primary-color, #3b82f6)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem"
            }}
          >
            <h4 style={{ margin: 0, fontSize: "1.1rem", color: "var(--primary-color, #3b82f6)" }}>
              ➕ Ajouter une nouvelle condition de remise
            </h4>

            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "2 1 200px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                  Libellé :
                </label>
                <input
                  type="text"
                  placeholder="ex: Moins de 7 jours"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "var(--radius-md, 6px)",
                    border: "1px solid #334155",
                    background: "#1e293b",
                    color: "#ffffff"
                  }}
                />
              </div>

              <div style={{ flex: "1 1 120px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                  Limite (Jours) :
                </label>
                <input
                  type="number"
                  min="0"
                  value={newMaxDays}
                  onChange={(e) => setNewMaxDays(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "var(--radius-md, 6px)",
                    border: "1px solid #334155",
                    background: "#1e293b",
                    color: "#ffffff"
                  }}
                />
              </div>

              <div style={{ flex: "1 1 120px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                  Remise (%) :
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newDiscount}
                  onChange={(e) => setNewDiscount(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "var(--radius-md, 6px)",
                    border: "1px solid #334155",
                    background: "#1e293b",
                    color: "#ffffff"
                  }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isAdding}
                style={{ padding: "0.55rem 1.25rem" }}
              >
                {isAdding ? "⏳ Ajout..." : "Ajouter la condition"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}