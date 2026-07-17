// Login.jsx
import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [code, setCode] = useState('MON_CODE_UNIQUE_123'); // Pré-rempli par défaut

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code === 'MON_CODE_UNIQUE_123') { // À remplacer par ta logique/variable d'env
      onLogin(code);
    } else {
      alert('Code unique incorrect');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Accès Backoffice</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Code Unique de Connexion :</label>
          <input 
            type="password" 
            value={code} 
            onChange={(e) => setCode(e.target.value)} 
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '10px', background: '#007BFF', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Se connecter
        </button>
      </form>
    </div>
  );
}