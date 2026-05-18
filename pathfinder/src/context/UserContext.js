import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

const initialState = {
  isOnboarded: false,
  profile: {
    name: '',
    interests: [],
    skills: [],
    preferences: {},
  },
  progress: {
    level: 1,
    xp: 0,
    xpToNext: 100,
    badges: [],
    completedScenarios: [],
    unlockedPaths: [],
    decisions: [],
  },
  recommendedCareers: [],
};

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('stemPathfindr_user');
    return saved ? JSON.parse(saved) : initialState;
  });

  useEffect(() => {
    localStorage.setItem('stemPathfindr_user', JSON.stringify(user));
  }, [user]);

  const completeOnboarding = (profile, careers) => {
    setUser(prev => ({
      ...prev,
      isOnboarded: true,
      profile,
      recommendedCareers: careers,
      progress: {
        ...prev.progress,
        unlockedPaths: careers.map(c => c.id),
      },
    }));
  };

  const addXP = (amount) => {
    setUser(prev => {
      let newXP = prev.progress.xp + amount;
      let newLevel = prev.progress.level;
      let newXPToNext = prev.progress.xpToNext;

      while (newXP >= newXPToNext) {
        newXP -= newXPToNext;
        newLevel++;
        newXPToNext = Math.floor(newXPToNext * 1.5);
      }

      return {
        ...prev,
        progress: {
          ...prev.progress,
          xp: newXP,
          level: newLevel,
          xpToNext: newXPToNext,
        },
      };
    });
  };

  const earnBadge = (badge) => {
    setUser(prev => {
      if (prev.progress.badges.find(b => b.id === badge.id)) return prev;
      return {
        ...prev,
        progress: {
          ...prev.progress,
          badges: [...prev.progress.badges, badge],
        },
      };
    });
  };

  const completeScenario = (scenarioId) => {
    setUser(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        completedScenarios: [...new Set([...prev.progress.completedScenarios, scenarioId])],
      },
    }));
  };

  const addDecision = (decision) => {
    setUser(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        decisions: [...prev.progress.decisions, decision],
      },
    }));
  };

  const resetProgress = () => {
    setUser(initialState);
    localStorage.removeItem('stemPathfindr_user');
  };

  return (
    <UserContext.Provider value={{
      user,
      completeOnboarding,
      addXP,
      earnBadge,
      completeScenario,
      addDecision,
      resetProgress,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
