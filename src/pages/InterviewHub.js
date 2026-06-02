import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import './InterviewHub.css';
import { getIconComponent } from '../utils/iconMap';

const features = [
  { id: 'resume', title: 'Smart Resume Engine', desc: 'Start here — upload resume + job description. Powers tailored questions for everything else.', icon: 'book-open', path: '/interview/resume', gradient: 'linear-gradient(135deg,#06b6d4,#10b981)', tag: 'Start Here' },
  { id: 'mock', title: 'AI Mock Interview', desc: 'Video-based practice with real-time speech & body language analysis. Questions tailored to your JD.', icon: 'bot', path: '/interview/mock', gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', tag: 'Video + Audio' },
  { id: 'technical', title: 'Technical Assessment', desc: 'Coding problems tailored to your target role with AI code review that analyzes your actual code.', icon: 'career-software', path: '/interview/technical', gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)', tag: 'Code Review' },
];

export default function InterviewHub() {
  return (
    <div className="interview-hub">
      <div className="container">
        <motion.header className="hub-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Interview Intelligence</h1>
          <p>Master interviews with AI practice, real-time feedback, and smart resume optimization.</p>
        </motion.header>
        <div className="hub-header-actions">
          <Link to="/interview/history" className="hub-action-btn">View Past Sessions</Link>
        </div>
        <div className="hub-grid">
          {features.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Link to={f.path} className="hub-card">
                <div className="hub-card-glow" style={{ background: f.gradient }} />
                <div className="hub-card-content">
                  <span className="hub-card-icon">
                    {(() => { const Icon = getIconComponent(f.icon); return <Icon size={28} />; })()}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                  <div className="hub-card-footer"><span className="hub-card-tag">{f.tag}</span><span className="hub-card-arrow">→</span></div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
