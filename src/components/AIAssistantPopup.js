import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Sparkles, X } from 'lucide-react';
import { sendAssistantMessage } from '../services/aiService';
import './AIAssistantPopup.css';

function AIAssistantPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi, I am your assistant. Ask a question, share a goal, or choose one of the prompts below.',
    },
  ]);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const responseTimerRef = useRef(null);
  const lastMessageRef = useRef(null);
  const justSentByUserRef = useRef(false);
  const closeTimerRef = useRef(null);

  // Auto-scroll behavior:
  // - If the user is near the bottom (within 100px), scroll the newest message into view
  //   and align it to the top so the start of a long assistant response is visible.
  // - If the user has scrolled up (reading earlier messages), do not force-scroll.
  useEffect(() => {
    if (!scrollRef.current || !lastMessageRef.current) return;

    const container = scrollRef.current;

    // If the user just sent a message, ensure their message is visible at the bottom
    if (justSentByUserRef.current) {
      try {
        lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) {
        container.scrollTop = container.scrollHeight;
      } finally {
        justSentByUserRef.current = false;
      }
      return;
    }

    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);

    // threshold in pixels to consider the user 'at the bottom'
    const THRESHOLD = 100;
    if (distanceFromBottom > THRESHOLD) {
      // user scrolled up; don't force scrolling for assistant messages
      return;
    }

    // bring the newest message into view, aligning its start near the top
    try {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      // fallback: jump to bottom
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setIsPanelVisible(true);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return;
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsPanelVisible(false);
    }, 220);

    return () => {
      if (responseTimerRef.current) {
        window.clearTimeout(responseTimerRef.current);
      }
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, [isOpen]);

  const sendMessage = async (rawText) => {
    const text = rawText.trim();

    if (!text || isTyping) return;

    const userMessage = { id: `user-${Date.now()}`, role: 'user', text };
    justSentByUserRef.current = true;
    setMessages((current) => [...current, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const result = await sendAssistantMessage(text);

      let assistantText = '';
      if (result && result.ok) {
        assistantText = result.assistant || 'No response from assistant.';
      } else {
        assistantText = (result && result.message) || 'Assistant is not available.';
      }

      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', text: assistantText },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: 'Assistant error: Unable to reach backend. Try again later.',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(inputValue);
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(inputValue);
    }
  };

  return (
    <div className={`ai-assistant ${isOpen ? 'open' : ''}`}>
      {isPanelVisible ? (
        <button
          type="button"
          className={`ai-backdrop ${isOpen ? 'visible' : 'closing'}`}
          aria-label="Close AI assistant"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      {isPanelVisible ? (
        <div
          className={`ai-panel ${isOpen ? 'panel-enter' : 'panel-exit'}`}
          role="dialog"
          aria-modal="false"
          aria-label="AI assistant preview"
        >
          <div className="ai-panel-header">
            <div className="ai-panel-title-wrap">
              <p className="ai-panel-eyebrow">
                <Sparkles size={14} /> AI Assistant
              </p>
              <h2>Ask anything about the product</h2>
              <p className="ai-panel-subtitle">
                Ask for help with careers, skills, and next steps.
              </p>
            </div>
            <button
              type="button"
              className="ai-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close AI assistant"
            >
              <X size={16} />
            </button>
          </div>

          <div className="ai-conversation" ref={scrollRef} aria-live="polite" aria-relevant="additions text">
            {messages.map((message, idx) => {
              const isLast = idx === messages.length - 1;
              return (
                <div key={message.id} ref={isLast ? lastMessageRef : undefined} className={`ai-message-row ${message.role}`}>
                  <div className="ai-message-bubble">
                    <span className="ai-message-role">{message.role === 'assistant' ? 'Assistant' : 'You'}</span>
                    <p>{message.text}</p>
                  </div>
                </div>
              );
            })}

            {isTyping ? (
              <div className="ai-message-row assistant">
                <div className="ai-message-bubble typing">
                  <span className="ai-message-role">Assistant</span>
                  <div className="ai-typing-dots" aria-label="Assistant is typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <form className="ai-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="ai-assistant-input">
              Message the assistant
            </label>
            <textarea
              id="ai-assistant-input"
              ref={inputRef}
              className="ai-input"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Type a question, goal, or prompt..."
              rows={2}
            />

            <div className="ai-composer-footer">
              <p className="ai-composer-note">
                  <ArrowUpRight size={14} /> Ready for message input.
              </p>
              <button type="submit" className="ai-send" disabled={!inputValue.trim() || isTyping}>
                Send
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="ai-launcher"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
      >
        <span className="ai-launcher-icon">
          {isOpen ? <X size={16} /> : <Sparkles size={16} />}
        </span>
        <span className="ai-launcher-text">
          <strong>AI Assistant</strong>
          <small>{isOpen ? 'Close' : 'Open chat'}</small>
        </span>
      </button>
    </div>
  );
}

export default AIAssistantPopup;