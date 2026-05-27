import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useInterview } from '../context/InterviewContext';
import { generateCodeReview, generateTailoredProblems } from '../services/interviewService';
import './TechnicalAssessment.css';

const defaultProblems = [
  { id: 'two-sum', title: 'Two Sum', difficulty: 'easy', category: 'arrays', description: 'Given an array of integers and a target, return indices of two numbers that add up to target.', examples: [{ input: 'nums=[2,7,11,15], target=9', output: '[0,1]', explanation: '2+7=9' }], starterCode: { javascript: 'function twoSum(nums, target) {\n  // Your code here\n}', python: 'def two_sum(nums, target):\n    pass' }, hints: ['Use a hash map'], optimalComplexity: { time: 'O(n)', space: 'O(n)' } },
  { id: 'valid-parens', title: 'Valid Parentheses', difficulty: 'easy', category: 'stacks', description: 'Given a string of brackets, determine if the input is valid (properly opened and closed).', examples: [{ input: '"()[]{}"', output: 'true', explanation: 'All matched' }], starterCode: { javascript: 'function isValid(s) {\n  // Your code here\n}', python: 'def is_valid(s):\n    pass' }, hints: ['Use a stack'], optimalComplexity: { time: 'O(n)', space: 'O(n)' } },
  { id: 'merge-intervals', title: 'Merge Intervals', difficulty: 'medium', category: 'arrays', description: 'Given an array of intervals, merge all overlapping intervals.', examples: [{ input: '[[1,3],[2,6],[8,10]]', output: '[[1,6],[8,10]]', explanation: '[1,3] and [2,6] overlap' }], starterCode: { javascript: 'function merge(intervals) {\n  // Your code here\n}', python: 'def merge(intervals):\n    pass' }, hints: ['Sort by start time first'], optimalComplexity: { time: 'O(n log n)', space: 'O(n)' } },
];

export default function TechnicalAssessment() {
  const { jobDescription } = useInterview();
  const [view, setView] = useState('list');
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [lang, setLang] = useState('javascript');
  const [review, setReview] = useState(null);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tailored, setTailored] = useState([]);
  const [loadingTailored, setLoadingTailored] = useState(false);

  useEffect(() => {
    if (jobDescription && jobDescription.length > 20 && tailored.length === 0) {
      setLoadingTailored(true);
      generateTailoredProblems(jobDescription).then(p => setTailored(p || [])).catch(() => {}).finally(() => setLoadingTailored(false));
    }
  }, [jobDescription, tailored.length]);

  const selectProblem = (p) => { setProblem(p); setCode(p.starterCode?.javascript || ''); setReview(null); setOutput(''); setView('editor'); };

  const runCode = () => {
    if (lang === 'javascript') {
      try {
        const logs = [];
        const mockConsole = { log: (...a) => logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ')) };
        let execCode = code + '\n';
        const fnMatch = code.match(/function\s+(\w+)\s*\(/);
        if (fnMatch && problem?.examples?.length > 0) {
          const fnName = fnMatch[1];
          problem.examples.forEach((ex, i) => {
            execCode += `\ntry { console.log("Example ${i+1}:", JSON.stringify(${fnName}(${extractArgs(ex.input)}))); } catch(e) { console.log("Example ${i+1} Error:", e.message); }`;
          });
        }
        const fn = new Function('console', 'JSON', execCode);
        fn(mockConsole, JSON);
        setOutput(logs.length > 0 ? logs.join('\n') : 'Executed (no output). Add console.log() to see results.');
      } catch (e) { setOutput('Error: ' + e.message); }
    } else if (lang === 'python') {
      runPython();
    }
  };

  const runPython = async () => {
    setOutput('Loading Python runtime...');
    try {
      if (!window.pyodide) {
        // Load Pyodide from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
        document.head.appendChild(script);
        await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
        window.pyodide = await window.loadPyodide();
      }
      const pyodide = window.pyodide;

      // Build code with test calls
      let execCode = code + '\n';
      const fnMatch = code.match(/def\s+(\w+)\s*\(/);
      if (fnMatch && problem?.examples?.length > 0) {
        const fnName = fnMatch[1];
        problem.examples.forEach((ex, i) => {
          execCode += `\ntry:\n    print(f"Example ${i+1}: {${fnName}(${extractArgsPython(ex.input)})}")\nexcept Exception as e:\n    print(f"Example ${i+1} Error: {e}")\n`;
        });
      }

      // Capture stdout
      pyodide.runPython(`import sys; from io import StringIO; sys.stdout = StringIO()`);
      pyodide.runPython(execCode);
      const stdout = pyodide.runPython('sys.stdout.getvalue()');
      pyodide.runPython('sys.stdout = sys.__stdout__');
      setOutput(stdout || 'Executed (no output). Add print() to see results.');
    } catch (e) {
      setOutput('Python Error: ' + (e.message || String(e)));
    }
  };

  function extractArgsPython(input) {
    if (!input) return '';
    const assignments = input.match(/=\s*([^,]+(?:\[[^\]]*\])?)/g);
    if (assignments) return assignments.map(a => a.replace(/^=\s*/, '').trim()).join(', ');
    return input;
  }

  const getReview = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try { const r = await generateCodeReview(code, lang, problem?.description || 'General'); setReview(r); } catch (e) { setOutput('Review failed: ' + e.message); }
    setLoading(false);
  };

  if (view === 'list') return (
    <div className="tech-assess"><div className="container">
      <motion.header className="ta-header" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}>
        <h1>💻 Technical Assessment</h1>
        <p>Practice coding with AI code review</p>
      </motion.header>
      {loadingTailored && <p className="ta-loading">Generating problems for your job description...</p>}
      {tailored.length > 0 && (<>
        <h3 className="ta-section-title">🎯 Tailored to Your Job</h3>
        <div className="ta-list">{tailored.map((p,i) => <div key={p.id||i} className="ta-card tailored" onClick={() => selectProblem(p)}><h4>{p.title}</h4><span className={`ta-diff ${p.difficulty}`}>{p.difficulty}</span>{p.relevance && <small>{p.relevance}</small>}</div>)}</div>
      </>)}
      <h3 className="ta-section-title">📚 Practice Problems</h3>
      <div className="ta-list">{defaultProblems.map(p => <div key={p.id} className="ta-card" onClick={() => selectProblem(p)}><h4>{p.title}</h4><span className={`ta-diff ${p.difficulty}`}>{p.difficulty}</span><small>{p.category}</small></div>)}</div>
    </div></div>
  );

  return (
    <div className="tech-assess ta-editor-view"><div className="ta-layout">
      <div className="ta-problem">
        <button className="btn-secondary" onClick={() => setView('list')}>← Back</button>
        <h2>{problem?.title}</h2>
        <p>{problem?.description}</p>
        {problem?.examples?.map((ex,i) => <div key={i} className="ta-example"><code>Input: {ex.input}</code><code>Output: {ex.output}</code>{ex.explanation && <small>{ex.explanation}</small>}</div>)}
        {problem?.optimalComplexity && <p className="ta-complexity">Target: {problem.optimalComplexity.time} time, {problem.optimalComplexity.space} space</p>}
        {problem?.hints && <details className="ta-hints"><summary>💡 Hints</summary>{problem.hints.map((h,i)=><p key={i}>{h}</p>)}</details>}
      </div>
      <div className="ta-code-panel">
        <div className="ta-code-header">
          <span className="ta-lang-label">JavaScript</span>
          <div><button className="ta-run" onClick={runCode}>▶ Run</button><button className="ta-review-btn" onClick={getReview} disabled={loading}>{loading?'Reviewing...':'🤖 AI Review'}</button></div>
        </div>
        <textarea className="ta-editor" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} />
        {output && <pre className="ta-output">{output}</pre>}
        {review && (
          <div className="ta-review">
            <h4>🤖 AI Code Review</h4>
            <div className="ta-review-scores">
              <span>Correctness: {review.correctness?.score}</span>
              <span>Efficiency: {review.efficiency?.score}</span>
              <span>Quality: {review.codeQuality?.score}</span>
              <span>Overall: {review.overallScore}</span>
            </div>
            {review.efficiency && <p className="ta-complexity">Time: {review.efficiency.timeComplexity} | Space: {review.efficiency.spaceComplexity}</p>}
            {review.correctness?.issues?.length > 0 && <div><strong>⚠️ Issues Found:</strong><ul>{review.correctness.issues.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {review.improvements?.length > 0 && <div><strong>🔧 Improvements:</strong><ul>{review.improvements.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {review.edgeCases?.length > 0 && <div><strong>🎯 Edge Cases:</strong><ul>{review.edgeCases.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {review.alternativeApproaches?.length > 0 && <div><strong>💡 Alternative Approaches:</strong><ul>{review.alternativeApproaches.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {review.solutionHint && <div className="ta-solution"><strong>✅ Optimal Approach:</strong><p>{review.solutionHint}</p></div>}
          </div>
        )}
      </div>
    </div></div>
  );
}
