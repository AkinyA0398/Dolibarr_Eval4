// src/api/apiClient.js
import { API_CONFIG } from './configApi';

export const apiClient = async (endpoint, options = {}) => {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    'DOLAPIKEY': API_CONFIG.API_KEY,
    ...options.headers,
    // Note: Accept-Encoding est géré au niveau du proxy Vite (vite.config.js)
    ...options.headers,
  };

  const config = { ...options, headers };

  try {
    const response = await fetch(url, config);

    // 204 No Content ou 304 Not Modified → succès sans body
    if (response.status === 204 || response.status === 304) return true;

    // Lire le body une seule fois
    const text = await response.text();

    // ── Détecter une réponse PHP (HTML) ──────────────────────────────────
    if (text.trim().startsWith('<')) {
      const phpMsg = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 400);

      // Cas 1 : Dolibarr insère un warning PHP AVANT un JSON objet/tableau
      const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])$/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          console.warn(`[apiClient] Warning PHP sur ${endpoint}:`, phpMsg);
          if (!response.ok || (data && data.error)) {
            const errorMsg = data?.error?.message || data?.message || phpMsg;
            throw new Error(errorMsg);
          }
          return data;
        } catch(e) {
          if (e.message && !e.message.startsWith('Unexpected token')) {
            throw e;
          }
        }
      }

      // Cas 2 : ID entier simple après le warning PHP (ex: "...line 1286\n5")
      // trim() pour retirer les newlines, puis on prend le dernier token numérique
      const lastToken = text.trim().split(/\s+/).pop();
      if (lastToken && /^\d+$/.test(lastToken)) {
        const id = parseInt(lastToken, 10);
        console.warn(`[apiClient] Warning PHP sur ${endpoint} (ID=${id}):`, phpMsg);
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status} avec ID ${id}: ${phpMsg}`);
        }
        return id;
      }

      throw new Error(`Erreur PHP Dolibarr sur ${endpoint}: ${phpMsg}`);
    }

    // ── Réponse non-2xx ───────────────────────────────────────────────────
    if (!response.ok) {
      let errorData = {};
      try { errorData = JSON.parse(text); } catch(e) {}

      // Dolibarr retourne 404 + "No X found" pour une liste vide → retourner []
      if (response.status === 404) {
        const msg = (errorData?.error?.message || errorData?.message || '').toLowerCase();
        if (msg.includes('not found') || msg.includes('no ')) return [];
      }

      if (!options.silent) {
        console.error(`[apiClient] Erreur ${response.status} sur ${endpoint}:`, text);
      }
      throw new Error(
        errorData?.error?.message || errorData?.message ||
        `Erreur API: ${response.status} - ${text.substring(0, 100)}`
      );
    }

    // ── Réponse OK → parser JSON ──────────────────────────────────────────
    if (!text) return true; // body vide avec 200
    try {
      return JSON.parse(text);
    } catch(e) {
      throw new Error(`Réponse non-JSON sur ${endpoint}: ${text.substring(0, 150)}`);
    }

  } catch (error) {
    if (!options.silent) {
      console.error(`Erreur lors de l'appel à ${endpoint}:`, error);
    }
    throw error;
  }
};