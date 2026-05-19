import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useUser } from './UserContext';
import { fetchMarketOverview, fetchHeatmapData, fetchSalaryData, fetchViabilityData, fetchJobListings } from '../services/marketDataService';

const MarketIntelligenceContext = createContext();

const initialState = {
  selectedCareerId: null,
  loadingStates: {
    heatmap: 'idle',
    salary: 'idle',
    viability: 'idle',
    stream: 'idle',
  },
  heatmapData: [],
  salaryData: { historical: [], predicted: [] },
  viabilityData: [],
  streamData: [],
  selectedState: null,
  selectedPercentile: 50,
  streamFilters: {
    location: null,
    minSalary: null,
    tags: [],
    recency: '7d',
    source: [],
  },
  lastFetchTimestamps: {},
  errors: {},
};

export function MarketIntelligenceProvider({ children }) {
  const { user } = useUser();
  const [state, setState] = useState(initialState);

  const loadAllData = useCallback(async (careerId) => {
    setState(prev => ({
      ...prev,
      loadingStates: {
        heatmap: 'loading',
        salary: 'loading',
        viability: 'loading',
        stream: 'loading',
      },
    }));

    // Parallel fetch all panels
    const [heatmap, salary, viability, jobs] = await Promise.allSettled([
      fetchHeatmapData(careerId),
      fetchSalaryData(careerId),
      fetchViabilityData(careerId),
      fetchJobListings(careerId, state.streamFilters),
    ]);

    setState(prev => ({
      ...prev,
      heatmapData: heatmap.status === 'fulfilled' ? heatmap.value : [],
      salaryData: salary.status === 'fulfilled' ? salary.value : { historical: [], predicted: [] },
      viabilityData: viability.status === 'fulfilled' ? viability.value : [],
      streamData: jobs.status === 'fulfilled' ? jobs.value : [],
      loadingStates: {
        heatmap: heatmap.status === 'fulfilled' ? 'success' : 'error',
        salary: salary.status === 'fulfilled' ? 'success' : 'error',
        viability: viability.status === 'fulfilled' ? 'success' : 'error',
        stream: jobs.status === 'fulfilled' ? 'success' : 'error',
      },
      errors: {
        heatmap: heatmap.status === 'rejected' ? heatmap.reason.message : null,
        salary: salary.status === 'rejected' ? salary.reason.message : null,
        viability: viability.status === 'rejected' ? viability.reason.message : null,
        stream: jobs.status === 'rejected' ? jobs.reason.message : null,
      },
      lastFetchTimestamps: {
        heatmap: new Date(),
        salary: new Date(),
        viability: new Date(),
        stream: new Date(),
      },
    }));
  }, [state.streamFilters]);

  // Set initial career from user's recommended careers
  useEffect(() => {
    if (user.recommendedCareers.length > 0 && !state.selectedCareerId) {
      setState(prev => ({ ...prev, selectedCareerId: user.recommendedCareers[0].id }));
    }
  }, [user.recommendedCareers, state.selectedCareerId]);

  // Fetch all data when career changes
  useEffect(() => {
    if (state.selectedCareerId) {
      loadAllData(state.selectedCareerId);
    }
  }, [state.selectedCareerId, loadAllData]);

  const selectCareer = useCallback((careerId) => {
    setState(prev => ({ ...prev, selectedCareerId: careerId }));
  }, []);

  const selectState = useCallback((stateCode) => {
    setState(prev => ({ ...prev, selectedState: stateCode }));
  }, []);

  const setStreamFilters = useCallback((filters) => {
    setState(prev => ({ ...prev, streamFilters: { ...prev.streamFilters, ...filters } }));
  }, []);

  const refreshJobs = useCallback(async () => {
    if (!state.selectedCareerId) return;
    setState(prev => ({ ...prev, loadingStates: { ...prev.loadingStates, stream: 'loading' } }));
    try {
      const jobs = await fetchJobListings(state.selectedCareerId, state.streamFilters);
      setState(prev => ({
        ...prev,
        streamData: jobs,
        loadingStates: { ...prev.loadingStates, stream: 'success' },
        lastFetchTimestamps: { ...prev.lastFetchTimestamps, stream: new Date() },
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loadingStates: { ...prev.loadingStates, stream: 'error' },
        errors: { ...prev.errors, stream: err.message },
      }));
    }
  }, [state.selectedCareerId, state.streamFilters]);

  return (
    <MarketIntelligenceContext.Provider value={{
      ...state,
      selectCareer,
      selectState,
      setStreamFilters,
      refreshJobs,
      loadAllData,
    }}>
      {children}
    </MarketIntelligenceContext.Provider>
  );
}

export function useMarketIntelligence() {
  const context = useContext(MarketIntelligenceContext);
  if (!context) {
    throw new Error('useMarketIntelligence must be used within a MarketIntelligenceProvider');
  }
  return context;
}
