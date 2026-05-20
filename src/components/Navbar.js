import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import './Navbar.css';

function Navbar() {
  const { user } = useUser();
  const { user: authUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
      setMenuOpen(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleLoginClick = () => {
    navigate('/login');
    setMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <img src={logo} alt="STEM PathfindR" className="brand-icon" />
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
          {/* Show these links only after onboarding */}
          {user?.isOnboarded && (
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
            </>
          )}

          {/* Show XP bar and auth buttons based on login state */}
          {authUser ? (
            // User is logged in
            <>
              {user.isOnboarded && (
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
              )}
              <button
                className="nav-logout"
                onClick={handleLogout}
                title="Sign out"
              >
                Sign Out
              </button>
            </>
          ) : (
            // User is not logged in - show login button
            <button
              className="nav-login"
              onClick={handleLoginClick}
              title="Sign in or create account"
            >
              Log In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
