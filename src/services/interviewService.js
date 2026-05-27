// Interview Intelligence Service
// PDF extraction happens in-browser via pdfjs-dist
// AI calls route through the backend server (SigV4-signed Bedrock)

// In dev, CRA proxy routes /api/interview/* to localhost:5000
// In production, set REACT_APP_API_URL to your backend URL
const API_BASE = process.env.REACT_APP_API_URL || '';

async function callBackend(endpoint, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error('Cannot reach server. Make sure the backend is running on ' + API_BASE);
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `Server error ${response.status}` }));
    throw new Error(err.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

// ─── PDF Extraction (in-browser, no server needed) ─────────────────────────────

export async function extractTextFromPDF(file) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  const cleaned = fullText.trim();
  if (cleaned.length < 20) {
    throw new Error('PDF appears to be image-based (scanned). Please paste your resume text instead.');
  }
  return cleaned;
}

// ─── Interview Analysis ────────────────────────────────────────────────────────

export async function analyzeInterviewResponse(question, answer, role, difficulty) {
  const result = await callBackend('/api/interview/analyze-response', {
    question, answer, role, difficulty,
  });
  return result.analysis;
}

export async function generateInterviewQuestions(jobDescription, type, difficulty) {
  const result = await callBackend('/api/interview/generate-questions', {
    jobDescription, type, difficulty,
  });
  return result.questions;
}

// ─── Resume ────────────────────────────────────────────────────────────────────

export async function analyzeResume(resumeText, jobDescription) {
  const result = await callBackend('/api/interview/analyze-resume', {
    resumeText, jobDescription,
  });
  return result.analysis;
}

export async function generateOptimizedResume(resumeText, jobDescription, analysis) {
  const result = await callBackend('/api/interview/generate-resume', {
    resumeText, jobDescription, analysis,
  });
  return result.resume;
}

// ─── Code Review ───────────────────────────────────────────────────────────────

export async function generateCodeReview(code, language, problemDescription) {
  const result = await callBackend('/api/interview/code-review', {
    code, language, problemDescription,
  });
  return result.review;
}

// ─── Job-Tailored Problems ─────────────────────────────────────────────────────

export async function generateTailoredProblems(jobDescription) {
  const result = await callBackend('/api/interview/tailored-problems', {
    jobDescription,
  });
  return result.problems;
}
