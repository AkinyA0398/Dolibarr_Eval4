// URL de base pointant vers l'API REST de votre Dolibarr sous XAMPP
const BASE_URL = 'http://localhost/dolibarr-23.0/htdocs/api/index.php';

const DOLAPIKEY = '9d3231ff083a4d433d26766f6aa643d2a3bab300'; 

export const apiLocalStatus = async (endpoint, options = {}) => {
  
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = `${BASE_URL}/${cleanEndpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'accept': 'application/json',
    'DOLAPIKEY': DOLAPIKEY,
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`Erreur API Dolibarr: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Erreur lors de l'appel à ${url}:`, error);
    throw error;
  }
};

