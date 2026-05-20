import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useUser } from './UserContext';
import { fetchMarketOverview, fetchHeatmapData, fetchSalaryData, fetchViabilityData } from '../services/marketDataService';

const MarketIntelligenceContext = createContext();

const initialState = {
  selectedCareerId: null,
  loadingStates: {
    heatmap: 'idle',
    salary: 'idle',
    viability: 'idle',
  },
  heatmapData: [],
  salaryData: { historical: [], predicted: [] },
  viabilityData: [],
  selectedState: null,
  selectedPercentile: 50,
  // stream removed
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
      },
    }));

    // Parallel fetch panels (no job stream)
    const [heatmap, salary, viability] = await Promise.allSettled([
      fetchHeatmapData(careerId),
      fetchSalaryData(careerId),
      fetchViabilityData(careerId),
    ]);

    setState(prev => ({
      ...prev,
      heatmapData: heatmap.status === 'fulfilled' ? heatmap.value : [],
      salaryData: salary.status === 'fulfilled' ? salary.value : { historical: [], predicted: [] },
      viabilityData: viability.status === 'fulfilled' ? viability.value : [],
      loadingStates: {
        heatmap: heatmap.status === 'fulfilled' ? 'success' : 'error',
        salary: salary.status === 'fulfilled' ? 'success' : 'error',
        viability: viability.status === 'fulfilled' ? 'success' : 'error',
      },
      errors: {
        heatmap: heatmap.status === 'rejected' ? heatmap.reason.message : null,
        salary: salary.status === 'rejected' ? salary.reason.message : null,
        viability: viability.status === 'rejected' ? viability.reason.message : null,
      },
      lastFetchTimestamps: {
        heatmap: new Date(),
        salary: new Date(),
        viability: new Date(),
      },
    }));
  }, []);

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

  // Job stream removed: no stream filters or refresh handler

  return (
    <MarketIntelligenceContext.Provider value={{
      ...state,
      selectCareer,
      selectState,
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
