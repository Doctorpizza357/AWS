import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { useInterview } from '../context/InterviewContext';
import { analyzeResume, generateOptimizedResume, extractTextFromPDF } from '../services/interviewService';
import { useUser } from '../context/UserContext';
import './ResumeTailor.css';
import { getIconComponent } from '../utils/iconMap';

export default function ResumeTailor() {
  const { resumeAnalysis, setResumeAnalysis, generatedResume, setGeneratedResume, setJobDescription, setResumeText: setCtxResume, setLoading, loading } = useInterview();
  const { user, saveResume } = useUser();
  const [resumeText, setResumeText] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef(null);
  const activeResumeText = (resumeText || user?.resume?.text || '').trim();
  const hasSavedResume = Boolean(user?.resume?.text);

  useEffect(() => {
    const savedResume = user?.resume;
    if (savedResume?.text) {
      setResumeText(savedResume.text);
      setCtxResume(savedResume.text);
      setFileName(savedResume.fileName || 'Saved resume PDF');
    }
  }, [user?.resume?.text, user?.resume?.fileName, setCtxResume]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    setResumeAnalysis(null);
    setGeneratedResume(null);
    try {
      const text = await extractTextFromPDF(file);
      setResumeText(text);
      setCtxResume(text);
      saveResume({
        fileName: file.name,
        text,
        source: 'interview',
      });
    } catch (err) {
      setError(err.message || 'Could not extract text from the PDF.');
    }
  };

  const handleAnalyze = async () => {
    const text = activeResumeText;
    if (!text) {
      setError('Upload a PDF resume to continue.');
      return;
    }
    if (!jobDesc.trim()) return;
    setLoading(true); setError('');
    setJobDescription(jobDesc);
    setResumeText(text);
    setCtxResume(text);
    try {
      const analysis = await analyzeResume(text, jobDesc);
      setResumeAnalysis(analysis);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleGenerate = async () => {
    const text = activeResumeText;
    if (!text) {
      setError('Upload a PDF resume to continue.');
      return;
    }
    setGenerating(true); setError('');
    try {
      const result = await generateOptimizedResume(text, jobDesc, resumeAnalysis);
      setGeneratedResume(result);
    } catch (err) { setError(err.message); }
    setGenerating(false);
  };

  const downloadPDF = () => {
    const raw = generatedResume?.optimizedResume || resumeText;
    if (!raw) return;
    const text = raw.replace(/\\n/g, '\n');
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    const m = 20, mw = pw - m * 2;
    let y = 22, first = true;
    const check = (n) => { if (y + n > 280) { doc.addPage(); y = 20; } };

    text.split('\n').forEach((line) => {
      const t = line.trim();
      if (!t) { y += 3; return; }
      check(8);
      const isHeader = /^[A-Z][A-Z\s&\/,]{2,}$/.test(t) && t.length < 40;
      if (first && !isHeader && t.length < 60) { doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(t, pw/2, y, {align:'center'}); y += 8; first = false; return; }
      first = false;
      if (isHeader) { y += 4; check(10); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(t, m, y); y += 2; doc.setDrawColor(80,80,80); doc.setLineWidth(0.3); doc.line(m, y, pw-m, y); y += 5; }
      else if (/^[•\-]/.test(t)) { doc.setFont('helvetica','normal'); doc.setFontSize(10); const bt = t.replace(/^[•\-]\s*/,''); doc.splitTextToSize(bt, mw-8).forEach((l,i) => { check(5); doc.text(i===0?'•':'', m+2, y); doc.text(l, m+9, y); y+=4.5; }); }
      else { doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.splitTextToSize(t, mw).forEach(l => { check(5); doc.text(l, m, y); y+=4.5; }); }
    });
    doc.save('optimized-resume.pdf');
  };

  const pri = (p) => p==='high'?'#ef4444':p==='medium'?'#f59e0b':'#10b981';

  return (
    <div className="resume-tailor"><div className="container">
      <motion.header className="rt-header" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}>
        <h1>{(() => { const Icon = getIconComponent('book-open'); return <><Icon size={22} className="rt-header-icon"/> Smart Resume Engine</>; })()}</h1>
        <p>Upload a PDF resume, add a job description, and let AI analyze and optimize it.</p>
      </motion.header>

      {!hasSavedResume && (
        <>
          <div className="rt-upload" onClick={() => fileRef.current?.click()}>
            <span className="rt-upload-icon">{(() => { const Icon = getIconComponent('upload'); return <Icon size={18} />; })()}</span>
            <span>{fileName ? `✓ ${fileName}` : 'Click to upload resume (PDF only)'}</span>
          </div>
          <p className="rt-help">Paste input is disabled here.</p>
        </>
      )}

      {hasSavedResume && (
        <div className="rt-saved-resume-bar">
          <span>Using saved resume: {user?.resume?.fileName || 'uploaded PDF'}</span>
          <button className="rt-replace-btn" onClick={() => fileRef.current?.click()} type="button">
            Replace
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} style={{display:'none'}} />
      {error && <p className="rt-error">{error}</p>}

      <div className="rt-grid">
        <div className="rt-field"><label>Job Description</label><textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder="Paste target job description..." rows={10}/></div>
      </div>

      <div className="rt-actions">
        <button className="btn-primary" onClick={handleAnalyze} disabled={loading||!activeResumeText||!jobDesc.trim()}>{loading ? 'Analyzing...' : (() => { const Icon = getIconComponent('search'); return <><Icon size={16} style={{marginRight:8}}/> Analyze & Optimize</>; })()}</button>
      </div>

      {resumeAnalysis && (
        <motion.div className="rt-results" initial={{opacity:0}} animate={{opacity:1}}>
          <div className="rt-scores">
            <div className="rt-score"><span className="rt-score-val">{resumeAnalysis.matchScore}%</span><span>Job Match</span></div>
            <div className="rt-score"><span className="rt-score-val">{resumeAnalysis.atsScore}%</span><span>ATS Score</span></div>
          </div>
          <div className="rt-section"><h3>{(() => { const Icon = getIconComponent('feature-quiz'); return <><Icon size={16} style={{marginRight:8}}/> Assessment</>; })()}</h3><p>{resumeAnalysis.overallFeedback}</p></div>
          <div className="rt-section"><h3>{(() => { const Icon = getIconComponent('check'); return <><Icon size={16} style={{marginRight:8}}/> Matched</>; })()}</h3><div className="rt-tags">{resumeAnalysis.keywordMatches?.map((k,i)=><span key={i} className="tag-good">{k}</span>)}</div></div>
          <div className="rt-section"><h3>{(() => { const Icon = getIconComponent('x'); return <><Icon size={16} style={{marginRight:8}}/> Missing</>; })()}</h3><div className="rt-tags">{resumeAnalysis.missingKeywords?.map((k,i)=><span key={i} className="tag-bad">{k}</span>)}</div></div>
          <div className="rt-section"><h3>{(() => { const Icon = getIconComponent('zap'); return <><Icon size={16} style={{marginRight:8}}/> Improvements</>; })()}</h3>{resumeAnalysis.improvements?.map((imp,i)=><div key={i} className="rt-imp"><span style={{background:pri(imp.priority)}}>{imp.priority}</span><div><strong>{imp.section}</strong><p>{imp.suggestion}</p></div></div>)}</div>
          <div className="rt-section rt-generate"><h3>{(() => { const Icon = getIconComponent('career-growth'); return <><Icon size={16} style={{marginRight:8}}/> Generate Optimized Resume</>; })()}</h3><button className="btn-primary" onClick={handleGenerate} disabled={generating}>{generating?'Generating...':(() => { const Icon = getIconComponent('zap'); return <><Icon size={14} style={{marginRight:8}}/> Generate</>; })()}</button></div>
          {generatedResume && (
            <div className="rt-section"><div className="rt-gen-header"><h3>{(() => { const Icon = getIconComponent('file-text'); return <><Icon size={16} style={{marginRight:8}}/> Optimized Resume</>; })()}</h3><button className="btn-secondary" onClick={downloadPDF}>{(() => { const Icon = getIconComponent('download'); return <><Icon size={14} style={{marginRight:8}}/> Download PDF</>; })()}</button></div>
              {generatedResume.changesSummary && <ul className="rt-changes">{generatedResume.changesSummary.map((c,i)=><li key={i}>{c}</li>)}</ul>}
              <pre className="rt-resume-text">{(generatedResume.optimizedResume||'').replace(/\\n/g,'\n')}</pre>
            </div>
          )}
        </motion.div>
      )}
    </div></div>
  );
}
