// src/App.jsx 
import React, { useState } from 'react';
import Login from './pages/Back/Login.jsx';
import Dashboard from './pages/Back/Dashboard.jsx';
import Import from './pages/Back/Import.jsx';
import Reset from './pages/Back/Reset.jsx';
import FrontOffice from './pages/Front/FrontOffice.jsx';
import RemiseSettings from './pages/Back/RemiseSetting.jsx';
import ListeRemboursement from './pages/Back/ListeRemboursement.jsx';

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [currentView, setCurrentView] = useState('front_liste');
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
          <div className="navbar-brand" onClick={() => { setCurrentView('front_liste'); setSelectedEmploye(null); }} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">🚀</span>
            <span>Évaluation Dolibarr - Boutique</span>
          </div>
          
          <nav className="navbar-links">
            <button 
              className={`nav-btn ${currentView === 'front_liste' ? 'active' : ''}`}
              onClick={() => { setCurrentView('front_liste'); setSelectedEmploye(null); }}
            >
              Boutique (Front)
            </button>

            <span className="nav-divider"></span>

            {!authToken ? (
              <button className="btn btn-primary btn-sm nav-login" onClick={() => setCurrentView('login')}>
                Accès Backoffice
              </button>
            ) : (
              <div className="admin-actions">
                <span className="badge-admin">Admin</span>
                <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>Dashboard</button>
                <button className={`nav-btn ${currentView === 'remboursement' ? 'active' : ''}`} onClick={() => setCurrentView('remboursement')}>Remboursement</button>
                <button className={`nav-btn ${currentView === 'remiseSettings' ? 'active' : ''}`} onClick={() => setCurrentView('remiseSettings')}>Remise</button>
                <button className={`nav-btn ${currentView === 'import' ? 'active' : ''}`} onClick={() => setCurrentView('import')}>Import</button>
                <button className="btn btn-danger btn-sm" onClick={() => setCurrentView('reset')}>Reset</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setAuthToken(null); setCurrentView('front_liste'); }}>Quitter</button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container">
        {currentView === 'front_liste' && <FrontOffice />}
        {currentView === 'login' && <Login onLogin={handleLogin} />}
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'remiseSettings' && <RemiseSettings />}
        {currentView === 'import' && <Import />}
        {currentView === 'reset' && <Reset />}
        {currentView === 'remboursement' && <ListeRemboursement />}
      </main>
    </div>
  );
}