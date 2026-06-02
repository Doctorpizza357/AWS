import React, { useState } from 'react';
import { useInterview } from '../context/InterviewContext';
import { motion } from 'framer-motion';
import { getIconComponent } from '../utils/iconMap';
import './InterviewHistory.css';

export default function InterviewHistory() {
  const { sessions, setSessions } = useInterview();
  const [expandedId, setExpandedId] = useState(null);

  const clearAll = () => {
    if (!confirm('Clear all saved interview sessions?')) return;
    setSessions([]);
  };

  const removeOne = (id) => {
    if (!confirm('Remove this session?')) return;
    setSessions((sessions || []).filter(s => s.id !== id));
  };

  return (
    <div className="interview-history container">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="ih-inner">
        <h1>{(() => { const Icon = getIconComponent('clock'); return <><Icon size={20} style={{marginRight:8}}/> Interview History</>; })()}</h1>
        <p>Review past sessions, transcripts, AI feedback, and body-language summaries.</p>

        <div className="ih-actions">
          <button className="btn-secondary" onClick={clearAll} disabled={!sessions || sessions.length===0}>Clear All</button>
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="ih-empty">No past sessions saved yet.</div>
        ) : (
          <div className="ih-list">
            {sessions.map(sess => (
              <div key={sess.id} className="ih-card">
                <div className="ih-card-head">
                  <div>
                    <strong>{sess.type}</strong>
                    <div className="ih-date">{new Date(sess.date).toLocaleString()}</div>
                  </div>
                  <div className="ih-card-actions">
                    <button className="btn-link" onClick={() => setExpandedId(expandedId===sess.id? null : sess.id)}>{expandedId===sess.id ? 'Collapse' : 'View'}</button>
                    <button className="btn-danger" onClick={() => removeOne(sess.id)}>Delete</button>
                  </div>
                </div>

                {expandedId === sess.id && (
                  <div className="ih-card-body">
                    <h4>Summary</h4>
                    <div className="ih-summary">
                      <div><strong>Questions:</strong> {sess.results?.length || 0}</div>
                      <div><strong>Saved answers:</strong> {sess.replayEntries?.length || 0}</div>
                    </div>

                    {sess.replayEntries && sess.replayEntries.length > 0 && (
                      <div>
                        <h4>Answers</h4>
                        {sess.replayEntries.map((r, i) => (
                          <div key={i} className="ih-answer">
                            <div className="ih-answer-meta"><strong>{r.label}</strong> • {r.duration}s • {r.wpm} WPM • {r.fillerCount} fillers</div>
                            <div className="ih-answer-text">{r.answer || 'No transcript captured.'}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {sess.analysis && (
                      <div>
                        <h4>AI Analysis</h4>
                        <div className="ih-analysis">
                          <div><strong>Overall:</strong> {sess.analysis.overallScore}</div>
                          {sess.analysis.strengths && <div><strong>Strengths:</strong><ul>{sess.analysis.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
                          {sess.analysis.improvements && <div><strong>Improvements:</strong><ul>{sess.analysis.improvements.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
