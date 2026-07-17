// src/App.jsx 
import React, { useState } from 'react';
import Login from './pages/Back/Login.jsx';
import Dashboard from './pages/Back/Dashboard.jsx';
import Import from './pages/Back/Import.jsx';
import Reset from './pages/Back/Reset.jsx';

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedEmploye, setSelectedEmploye] = useState(null);

  const handleLogin = (code) => {
    setAuthToken(code);
    setCurrentView('dashboard');
  };

  return (
    <div className="app-layout">
      {/* Navbar Structure */}
      <header className="navbar">
        <div className="navbar-container">
          <div className="navbar-brand" onClick={() => { setCurrentView('front_liste'); setSelectedEmploye(null); }}>
            <span className="logo-icon">🚀</span>
            <span>Evaluation Dolibarr2</span>
          </div>
          
          <nav className="navbar-links">
            {/* <button 
              className={`nav-btn ${currentView.startsWith('front') ? 'active' : ''}`}
              onClick={() => { setCurrentView('front_liste'); setSelectedEmploye(null); }}
            >
              Annuaire
            </button> */}

            <span className="nav-divider"></span>

            {!authToken ? (
              <button className="btn btn-primary btn-sm nav-login" onClick={() => setCurrentView('login')}>
                Accès Sécurisé
              </button>
            ) : (
              <div className="admin-actions">
                <span className="badge-admin">Admin</span>
                <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>Dashboard</button>
                <button className={`nav-btn ${currentView === 'import' ? 'active' : ''}`} onClick={() => setCurrentView('import')}>Import</button>
                <button className="btn btn-danger btn-sm" onClick={() => setCurrentView('reset')}>Reset</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setAuthToken(null); }}>Quitter</button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container">
        {currentView === 'login' && <Login onLogin={handleLogin} />}
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'import' && <Import />}
        {currentView === 'reset' && <Reset />}
      </main>
    </div>
  );
}