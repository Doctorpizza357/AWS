import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from './UserContext';
import { fetchMarketOverview, fetchHeatmapData, fetchSalaryData, fetchViabilityData } from '../services/marketDataService';

const MarketIntelligenceContext = createContext();

// Cache TTL: 1 hour (BLS data updates infrequently)
const CACHE_TTL_MS = 60 * 60 * 1000;

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
  lastFetchTimestamps: {},
  errors: {},
};

export function MarketIntelligenceProvider({ children }) {
  const { user } = useUser();
  const [state, setState] = useState(initialState);
  const cacheRef = useRef({}); // { [careerId]: { heatmap, salary, viability, timestamp } }

  const loadAllData = useCallback(async (careerId, forceRefresh = false) => {
    // Check cache first
    const cached = cacheRef.current[careerId];
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      setState(prev => ({
        ...prev,
        heatmapData: cached.heatmap,
        salaryData: cached.salary,
        viabilityData: cached.viability,
        loadingStates: {
          heatmap: 'success',
          salary: 'success',
          viability: 'success',
        },
        errors: {},
        lastFetchTimestamps: {
          heatmap: new Date(cached.timestamp),
          salary: new Date(cached.timestamp),
          viability: new Date(cached.timestamp),
        },
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      loadingStates: {
        heatmap: 'loading',
        salary: 'loading',
        viability: 'loading',
      },
    }));

    // Parallel fetch panels
    const [heatmap, salary, viability] = await Promise.allSettled([
      fetchHeatmapData(careerId),
      fetchSalaryData(careerId),
      fetchViabilityData(careerId),
    ]);

    const heatmapData = heatmap.status === 'fulfilled' ? heatmap.value : [];
    const salaryData = salary.status === 'fulfilled' ? salary.value : { historical: [], predicted: [] };
    const viabilityData = viability.status === 'fulfilled' ? viability.value : [];

    // Store in cache
    cacheRef.current[careerId] = {
      heatmap: heatmapData,
      salary: salaryData,
      viability: viabilityData,
      timestamp: Date.now(),
    };

    setState(prev => ({
      ...prev,
      heatmapData,
      salaryData,
      viabilityData,
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

  // Force refresh bypasses cache
  const refreshData = useCallback(() => {
    if (state.selectedCareerId) {
      loadAllData(state.selectedCareerId, true);
    }
  }, [state.selectedCareerId, loadAllData]);

  return (
    <MarketIntelligenceContext.Provider value={{
      ...state,
      selectCareer,
      selectState,
      loadAllData,
      refreshData,
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
