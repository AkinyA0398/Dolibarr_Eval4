/**
 * Effectue un appel HTTP vers le serveur backend local (Port 5000)
 * @param {string} endpoint - Le chemin de l'API (ex: '/api/reset-database')
 * @param {Object} options - Les options de configuration (method, body, etc.)
 * @returns {Promise<any>} Les données JSON renvoyées par le serveur
 */
export const apiLocal = async (endpoint, options = {}) => {
  const BASE_URL = 'http://localhost:5000';
  
  // Configuration par défaut (GET par défaut, headers JSON)
  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers, // Permet d'ajouter d'autres headers si besoin plus tard
    },
  };

  // Si un body est fourni et qu'il n'est pas déjà sérialisé en chaîne de caractères
  if (options.body) {
    config.body = typeof options.body === 'string' 
      ? options.body 
      : JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    // Si la réponse n'est pas dans la plage 200-299
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erreur API Locale: ${response.status}`);
    }

    // Si le serveur répond avec un statut 204 (No Content), on ne parse pas de JSON
    if (response.status === 204) return null;

    return await response.json();
  } catch (error) {
    console.error(`[apiLocal Error] sur ${endpoint}:`, error.message);
    throw error;
  }
};
