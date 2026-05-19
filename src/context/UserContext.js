import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { getDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

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

const getUserStorageKey = (uid) => (uid ? `stemPathfindr_user_${uid}` : 'stemPathfindr_guest_user');

export function UserProvider({ children }) {
  const [user, setUser] = useState(initialState);
  // Start hydrating if there's already an authenticated user (covers the gap before the uid effect runs)
  const { user: authUser } = useAuth();
  const [isHydrating, setIsHydrating] = useState(!!authUser);
  // Ref tracks hydration synchronously to prevent race conditions with the progress persistence effect
  const isHydratingRef = useRef(!!authUser);
  // Track the uid that has been fully hydrated so consumers can tell if data is stale
  const hydratedUidRef = useRef(null);

  // Listen for authenticated Firebase user and sync Firestore profile

  useEffect(() => {
    let mounted = true;
    if (!authUser || !authUser.uid) {
      hydratedUidRef.current = null;
      setIsHydrating(false);
      try {
        const savedGuest = localStorage.getItem(getUserStorageKey(null));
        setUser(savedGuest ? JSON.parse(savedGuest) : initialState);
      } catch {
        setUser(initialState);
      }
      return () => { mounted = false; };
    }

    // Immediately clear out any previous user's state while the new account loads.
    isHydratingRef.current = true;
    setIsHydrating(true);
    setUser(initialState);

    (async () => {
      try {
        const userRef = doc(db, 'users', authUser.uid);
        const snap = await getDoc(userRef);
        if (!mounted) return;
        const data = snap.exists() ? snap.data() : {};

        // Replace local state with a Firestore-anchored state so stale localStorage doesn't persist XP
        const hasExplicitFlag = data.isOnboarded === true;
        const hasProfile = data.profile && Object.keys(data.profile).length > 0;
        const hasProgress = data.progress && (
          (typeof data.progress.xp === 'number' && data.progress.xp > 0) ||
          (Array.isArray(data.progress.completedScenarios) && data.progress.completedScenarios.length > 0) ||
          (Array.isArray(data.progress.badges) && data.progress.badges.length > 0)
        );
        const hasRecommended = Array.isArray(data.recommendedCareers) && data.recommendedCareers.length > 0;

        const newUserState = {
          ...initialState,
          isOnboarded: hasExplicitFlag || hasProfile || hasProgress || hasRecommended,
          profile: {
            ...initialState.profile,
            ...(data.profile || {}),
            name: data.displayName || authUser.displayName || (data.profile && data.profile.name) || initialState.profile.name,
          },
          progress: {
            ...initialState.progress,
            ...(data.progress || {}),
          },
          recommendedCareers: data.recommendedCareers || [],
        };

        setUser(newUserState);
        localStorage.setItem(getUserStorageKey(authUser.uid), JSON.stringify(newUserState));
        hydratedUidRef.current = authUser.uid;
        isHydratingRef.current = false;
        setIsHydrating(false);
      } catch (err) {
        isHydratingRef.current = false;
        setIsHydrating(false);
        console.error('UserContext: failed to sync Firestore profile', err);
      }
    })();

    return () => { mounted = false; };
  }, [authUser?.uid]);

  useEffect(() => {
    if (isHydrating) return;
    if (authUser && authUser.uid) {
      localStorage.setItem(getUserStorageKey(authUser.uid), JSON.stringify(user));
    } else {
      localStorage.setItem(getUserStorageKey(null), JSON.stringify(user));
    }
  }, [user, authUser?.uid, isHydrating]);

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

    // Persist onboarding profile and recommended careers to Firestore when user is authenticated
    (async () => {
      try {
        if (authUser && authUser.uid) {
          await setDoc(doc(db, 'users', authUser.uid), {
            displayName: profile.name || authUser.displayName || '',
            photoURL: authUser.photoURL || '',
            profile,
            recommendedCareers: careers,
            isOnboarded: true,
          }, { merge: true });
        }
      } catch (err) {
        console.error('UserContext: failed to persist onboarding to Firestore', err);
      }
    })();
  };

  // Persist progress (XP, level, badges, etc.) to Firestore when it changes for authenticated users
  useEffect(() => {
    // Use the ref for a synchronous check — prevents writing zeroed initialState to Firestore
    // during the window between setUser(initialState) and the Firestore fetch completing.
    if (isHydratingRef.current || isHydrating) return;
    if (!authUser || !authUser.uid) return;

    // Don't persist if progress is still at initial defaults (nothing meaningful to write)
    const p = user.progress;
    if (
      p.xp === 0 &&
      p.level === 1 &&
      p.xpToNext === 100 &&
      p.badges.length === 0 &&
      p.completedScenarios.length === 0 &&
      p.unlockedPaths.length === 0 &&
      p.decisions.length === 0
    ) {
      return;
    }

    let mounted = true;
    (async () => {
      try {
        await setDoc(doc(db, 'users', authUser.uid), { progress: user.progress }, { merge: true });
      } catch (err) {
        if (mounted) console.error('UserContext: failed to persist progress to Firestore', err);
      }
    })();

    return () => { mounted = false; };
  }, [user.progress, authUser?.uid, isHydrating]);

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
    if (authUser && authUser.uid) {
      localStorage.removeItem(getUserStorageKey(authUser.uid));
    } else {
      localStorage.removeItem(getUserStorageKey(null));
    }
  };

  // isHydrating should be true if:
  // 1. The internal hydrating state is true (actively fetching), OR
  // 2. There's an authenticated user but we haven't finished hydrating their data yet
  //    (covers the gap between authUser appearing and the uid effect starting hydration)
  const effectiveIsHydrating = isHydrating || (!!authUser && hydratedUidRef.current !== authUser.uid);

  return (
    <UserContext.Provider value={{
      user,
      isHydrating: effectiveIsHydrating,
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
