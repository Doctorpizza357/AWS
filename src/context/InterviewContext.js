import React, { createContext, useContext, useReducer, useCallback } from 'react';

const InterviewContext = createContext();

const initialState = {
  jobDescription: '',
  resumeText: '',
  resumeAnalysis: null,
  generatedResume: null,
  sessions: [],
  loading: false,
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_JOB_DESCRIPTION': return { ...state, jobDescription: action.payload };
    case 'SET_RESUME_TEXT': return { ...state, resumeText: action.payload };
    case 'SET_RESUME_ANALYSIS': return { ...state, resumeAnalysis: action.payload };
    case 'SET_GENERATED_RESUME': return { ...state, generatedResume: action.payload };
    case 'SET_LOADING': return { ...state, loading: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload, loading: false };
    case 'ADD_SESSION': return { ...state, sessions: [action.payload, ...state.sessions] };
    default: return state;
  }
}

export function InterviewProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setJobDescription = useCallback((jd) => dispatch({ type: 'SET_JOB_DESCRIPTION', payload: jd }), []);
  const setResumeText = useCallback((t) => dispatch({ type: 'SET_RESUME_TEXT', payload: t }), []);
  const setResumeAnalysis = useCallback((a) => dispatch({ type: 'SET_RESUME_ANALYSIS', payload: a }), []);
  const setGeneratedResume = useCallback((r) => dispatch({ type: 'SET_GENERATED_RESUME', payload: r }), []);
  const setLoading = useCallback((l) => dispatch({ type: 'SET_LOADING', payload: l }), []);
  const setError = useCallback((e) => dispatch({ type: 'SET_ERROR', payload: e }), []);
  const addSession = useCallback((s) => dispatch({ type: 'ADD_SESSION', payload: s }), []);

  return (
    <InterviewContext.Provider value={{ ...state, setJobDescription, setResumeText, setResumeAnalysis, setGeneratedResume, setLoading, setError, addSession }}>
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview() {
  const ctx = useContext(InterviewContext);
  if (!ctx) throw new Error('useInterview must be inside InterviewProvider');
  return ctx;
}
