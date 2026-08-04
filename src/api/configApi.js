// src/api/configApi.js

export const API_CONFIG = {
  // URL de base de ton Dolibarr local sous XAMPP
  // Passe par le proxy Vite /dolibarr-api → http://localhost:1280
  // Le proxy supprime content-encoding (gzip) → résout ERR_CONTENT_DECODING_FAILED
  BASE_URL: '/dolibarr-api/dolibarr-23.0.3/htdocs/api/index.php',
  
  // Clé API à récupérer dans Dolibarr (Configuration -> Modules -> API/Webservices -> Clé de l'utilisateur)
  API_KEY: '9d3231ff083a4d433d26766f6aa643d2a3bab300', 
  
  // Code unique pour l'accès au Backoffice de la NewAPP
  BACKOFFICE_CODE: 'Nykia39800'
};    