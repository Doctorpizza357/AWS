import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './Navbar.css';

function Navbar() {
  const { user } = useUser();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🧭</span>
          <span className="brand-text">STEM PathfindR</span>
        </Link>

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${menuOpen ? 'open' : ''}`}></span>
        </button>

        <div className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          {user.isOnboarded && (
            <>
              <Link
                to="/dashboard"
                className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/market-intelligence"
                className={`nav-link mi-link ${isActive('/market-intelligence') ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="mi-nav-dot"></span>
                Market Intel
              </Link>
              <Link
                to="/profile"
                className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                Profile
              </Link>
              <div className="nav-xp">
                <span className="xp-level">Lv.{user.progress.level}</span>
                <div className="xp-bar">
                  <div
                    className="xp-fill"
                    style={{ width: `${(user.progress.xp / user.progress.xpToNext) * 100}%` }}
                  ></div>
                </div>
                <span className="xp-text">{user.progress.xp}/{user.progress.xpToNext} XP</span>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
