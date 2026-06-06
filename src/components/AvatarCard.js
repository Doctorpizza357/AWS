import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, MessageCircle, ArrowRight } from 'lucide-react';
import './AvatarCard.css';

/**
 * Placeholder SVG displayed when the avatar image fails to load.
 */
function PlaceholderAvatar({ name }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <svg
      className="avatar-card-placeholder"
      width="64"
      height="64"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="32" fill="#4f46e5" />
      <text
        x="32"
        y="32"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontSize="28"
        fontFamily="sans-serif"
        fontWeight="600"
      >
        {initial}
      </text>
    </svg>
  );
}

/**
 * Typing dots shown while the AI generates a response.
 */
function TypingIndicator() {
  return (
    <div className="avatar-card-typing" aria-label="Loading AI tip">
      <span className="avatar-card-dot" />
      <span className="avatar-card-dot" />
      <span className="avatar-card-dot" />
    </div>
  );
}

/**
 * AvatarCard — Floating card UI for the multicultural avatar system.
 *
 * AI-powered, context-aware, and interactive:
 * - Shows dynamically generated tips from the backend
 * - Displays loading state while AI responds
 * - Supports deep-link CTAs (e.g., "Practice interviews →")
 * - "Tell me more" button opens AI Assistant panel
 *
 * Props:
 *  - avatar: AvatarCharacter object
 *  - message: string message to display (null while loading)
 *  - actionLink: { text, path } for deep-link CTA (optional)
 *  - isLoading: whether the AI tip is being fetched
 *  - onDismiss: callback when user closes the card
 *  - onContinue: callback when user wants to continue the conversation
 *  - onActionClick: callback when user clicks the deep-link CTA
 *  - isVisible: controls mount/unmount for animation
 */
function AvatarCard({ avatar, message, actionLink, isLoading, onDismiss, onContinue, onActionClick, isVisible }) {
  const [imgError, setImgError] = useState(false);
  const [announced, setAnnounced] = useState(false);
  const cardRef = useRef(null);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  // Capture the element that had focus before the card opened
  useEffect(() => {
    if (isVisible) {
      triggerRef.current = document.activeElement;
    }
  }, [isVisible]);

  // Move focus to close button (first interactive element) when card opens
  useEffect(() => {
    if (isVisible && closeButtonRef.current) {
      const timer = setTimeout(() => {
        if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Set up live region announcement when card becomes visible
  useEffect(() => {
    if (isVisible && avatar && message) {
      setAnnounced(true);
    } else {
      setAnnounced(false);
    }
  }, [isVisible, avatar, message]);

  // Handle Escape key to dismiss and return focus
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        if (triggerRef.current && triggerRef.current.focus) {
          triggerRef.current.focus();
        }
      }
    },
    [onDismiss]
  );

  if (!avatar) {
    return null;
  }

  const avatarAltText =
    avatar.altText || `${avatar.displayName}, AI Assistant avatar`;

  return (
    <>
      {/* ARIA live region for screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {announced && isVisible && message
          ? `${avatar.displayName} says: ${message}`
          : ''}
        {isLoading ? `${avatar.displayName} is thinking...` : ''}
      </div>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={cardRef}
            className="avatar-card"
            role="dialog"
            aria-label={`${avatar.displayName} AI assistant`}
            onKeyDown={handleKeyDown}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              duration: 0.4,
            }}
          >
            <div className="avatar-card-header">
              <div className="avatar-card-avatar">
                {imgError ? (
                  <PlaceholderAvatar name={avatar.displayName} />
                ) : (
                  <img
                    className="avatar-card-image"
                    src={avatar.visualAsset}
                    alt={avatarAltText}
                    onError={() => setImgError(true)}
                  />
                )}
              </div>
              <span className="avatar-card-name">{avatar.displayName}</span>
              <button
                ref={closeButtonRef}
                type="button"
                className="avatar-card-close"
                role="button"
                aria-label="Close AI assistant"
                onClick={onDismiss}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="avatar-card-body" role="log">
              {isLoading ? (
                <TypingIndicator />
              ) : (
                <p className="avatar-card-message">{message}</p>
              )}
            </div>

            {!isLoading && message && (
              <div className="avatar-card-footer">
                {actionLink && onActionClick && (
                  <button
                    type="button"
                    className="avatar-card-action"
                    onClick={() => onActionClick(actionLink.path)}
                    aria-label={actionLink.text}
                  >
                    <ArrowRight size={14} aria-hidden="true" />
                    <span>{actionLink.text}</span>
                  </button>
                )}
                {onContinue && (
                  <button
                    type="button"
                    className="avatar-card-continue"
                    onClick={onContinue}
                    aria-label="Continue conversation with AI assistant"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    <span>Tell me more</span>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default AvatarCard;
