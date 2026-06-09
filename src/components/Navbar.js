import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo_orange.png';
import './Navbar.css';

function Navbar() {
  const { user } = useUser();
  const { user: authUser } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const navbarLinksRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const isActive = (path) => location.pathname === path;

  const handleLoginClick = () => {
    navigate('/login');
    setMenuOpen(false);
  };

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const container = navbarLinksRef.current;
      if (!container) return setIndicatorStyle({ left: 0, width: 0, opacity: 0 });

      const active = container.querySelector('.nav-link.active');
      if (!active) return setIndicatorStyle({ left: 0, width: 0, opacity: 0 });

      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const left = activeRect.left - containerRect.left + container.scrollLeft;
      const width = activeRect.width;
      setIndicatorStyle({ left, width, opacity: 1 });
    };

    const frame = window.requestAnimationFrame(updateIndicator);
    window.addEventListener('resize', updateIndicator);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateIndicator);
    };
  }, [location.pathname, menuOpen, user?.isOnboarded, authUser?.uid]);

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

        <div className={`navbar-links ${menuOpen ? 'open' : ''}`} ref={navbarLinksRef}>
          <div
            className="nav-indicator"
            style={{ left: indicatorStyle.left, width: indicatorStyle.width, opacity: indicatorStyle.opacity }}
          />
          {/* Show these links only after onboarding */}
          {user?.isOnboarded && (
            <>
              <Link
                to="/campus"
                className={`nav-link ${isActive('/campus') ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                🏫 Campus
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
              <Link
                to="/profile"
                className="nav-profile-avatar"
                onClick={() => setMenuOpen(false)}
                title={t('common.profile')}
              >
                {authUser.photoURL ? (
                  <img src={authUser.photoURL} alt="Profile" className="nav-avatar-img" />
                ) : (
                  <span className="nav-avatar-placeholder">
                    {(authUser.displayName || authUser.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>
            </>
          ) : (
            // User is not logged in - show login button
            <button
              className="nav-login"
              onClick={handleLoginClick}
              title={t('common.logIn')}
            >
              {t('common.logIn')}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
