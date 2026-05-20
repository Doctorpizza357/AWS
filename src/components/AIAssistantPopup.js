import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Sparkles, X } from 'lucide-react';
import './AIAssistantPopup.css';

function AIAssistantPopup() {
  const [isOpen, setIsOpen] = useState(false);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }

    return () => {
      if (responseTimerRef.current) {
        window.clearTimeout(responseTimerRef.current);
      }
    };
  }, [isOpen]);

  const buildPreviewResponse = (message) => {
    const normalized = message.toLowerCase();

    if (normalized.includes('next step') || normalized.includes('career')) {
      return 'I’m not working yet. This assistant shell is ready, but the AI connection is not hooked up.';
    }

    if (normalized.includes('compare') || normalized.includes('two roles')) {
      return 'I’m not working yet. This assistant shell is ready, but the AI connection is not hooked up.';
    }

    if (normalized.includes('skill') || normalized.includes('build')) {
      return 'I’m not working yet. This assistant shell is ready, but the AI connection is not hooked up.';
    }

    if (normalized.includes('profile') || normalized.includes('strength')) {
      return 'I’m not working yet. This assistant shell is ready, but the AI connection is not hooked up.';
    }

    return 'I’m not working yet. This assistant shell is ready, but the AI connection is not hooked up.';
  };

  const sendMessage = (rawText) => {
    const text = rawText.trim();

    if (!text || isTyping) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages((current) => [...current, userMessage]);
    setInputValue('');
    setIsTyping(true);

    if (responseTimerRef.current) {
      window.clearTimeout(responseTimerRef.current);
    }

    responseTimerRef.current = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: buildPreviewResponse(text),
        },
      ]);
      setIsTyping(false);
    }, 700);
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
      {isOpen ? <button type="button" className="ai-backdrop" aria-label="Close AI assistant" onClick={() => setIsOpen(false)} /> : null}

      {isOpen ? (
        <div className="ai-panel" role="dialog" aria-modal="false" aria-label="AI assistant preview">
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
            {messages.map((message) => (
              <div key={message.id} className={`ai-message-row ${message.role}`}>
                <div className="ai-message-bubble">
                  <span className="ai-message-role">{message.role === 'assistant' ? 'Assistant' : 'You'}</span>
                  <p>{message.text}</p>
                </div>
              </div>
            ))}

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