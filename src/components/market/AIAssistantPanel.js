import React, { useState, useRef, useEffect } from 'react';
import { useMarketIntelligence } from '../../context/MarketIntelligenceContext';
import { sendChatMessage, getPresetQuestions } from '../../services/aiChatService';
import './AIAssistantPanel.css';

function AIAssistantPanel({ isOpen, onToggle, careerContext }) {
  const { aiMessages, addAIMessage, aiIsStreaming, setAIStreaming, viabilityData } = useMarketIntelligence();
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const presetQuestions = getPresetQuestions(careerContext?.careerId, careerContext?.currentPanel);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, streamingContent]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async (message) => {
    const text = message || input.trim();
    if (!text || aiIsStreaming) return;

    setInput('');
    addAIMessage({ id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() });
    setAIStreaming(true);
    setStreamingContent('');

    try {
      const context = {
        ...careerContext,
        viabilityScores: viabilityData,
      };

      const assistantResponse = await sendChatMessage(
        text,
        context,
        aiMessages,
        (chunk) => setStreamingContent(chunk)
      );

      // Add final message
      addAIMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantResponse || 'I can help you analyze the market data displayed on your dashboard. What would you like to know?',
        timestamp: new Date(),
      });
    } catch (error) {
      addAIMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I encountered an issue processing your request. Please try again.',
        timestamp: new Date(),
      });
    } finally {
      setAIStreaming(false);
      setStreamingContent('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMarkdown = (text) => {
    // Simple markdown rendering
    return text
      .replace(/## (.*)/g, '<h3 class="ai-h3">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/- (.*)/g, '<li>$1</li>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        className={`ai-toggle-btn ${isOpen ? 'open' : ''}`}
        onClick={onToggle}
        aria-label="Toggle AI Assistant"
      >
        <span className="ai-toggle-icon">{isOpen ? '✕' : '🤖'}</span>
        {!isOpen && <span className="ai-toggle-pulse"></span>}
      </button>

      {/* Panel */}
      <div className={`ai-panel ${isOpen ? 'open' : ''}`}>
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <span className="ai-panel-icon">🧠</span>
            <div>
              <h4>Market Intelligence AI</h4>
              <span className="ai-panel-status">
                {aiIsStreaming ? 'Analyzing...' : 'Ready'}
              </span>
            </div>
          </div>
          <div className="ai-panel-context">
            {careerContext?.careerTitle && (
              <span className="ai-context-chip">
                📊 {careerContext.careerTitle}
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="ai-messages">
          {aiMessages.length === 0 && !aiIsStreaming && (
            <div className="ai-welcome">
              <p className="ai-welcome-text">
                I'm your market intelligence analyst. Ask me about salary trends,
                geographic hotspots, AI displacement risks, or career viability for
                <strong> {careerContext?.careerTitle || 'your selected career'}</strong>.
              </p>
            </div>
          )}

          {aiMessages.map(msg => (
            <div key={msg.id} className={`ai-message ${msg.role}`}>
              {msg.role === 'assistant' ? (
                <div
                  className="ai-message-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              ) : (
                <div className="ai-message-content">{msg.content}</div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {aiIsStreaming && streamingContent && (
            <div className="ai-message assistant streaming">
              <div
                className="ai-message-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
              />
              <span className="ai-cursor">▊</span>
            </div>
          )}

          {aiIsStreaming && !streamingContent && (
            <div className="ai-message assistant">
              <div className="ai-thinking">
                <span className="thinking-dot"></span>
                <span className="thinking-dot"></span>
                <span className="thinking-dot"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Preset Questions */}
        {aiMessages.length === 0 && (
          <div className="ai-presets">
            {presetQuestions.slice(0, 4).map(q => (
              <button
                key={q.id}
                className="ai-preset-chip"
                onClick={() => handleSend(q.text)}
              >
                {q.text}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="ai-input-bar">
          <input
            ref={inputRef}
            type="text"
            className="ai-input"
            placeholder="Ask about market trends..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={aiIsStreaming}
          />
          <button
            className="ai-send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || aiIsStreaming}
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}

export default AIAssistantPanel;
