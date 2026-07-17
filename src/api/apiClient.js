// src/api/apiClient.js
import { API_CONFIG } from './configApi';

export const apiClient = async (endpoint, options = {}) => {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'DOLAPIKEY': API_CONFIG.API_KEY,
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erreur API: ${response.status}`);
    }
    
    // Si la réponse est vide (204), on ne parse pas du JSON
    if (response.status === 204) return true;
    
    return await response.json();
  } catch (error) {
    if (!options.silent) {
      console.error(`Erreur lors de l'appel à ${endpoint}:`, error);
    }
    throw error;
  }
};