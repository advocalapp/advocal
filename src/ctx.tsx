import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';

import { supabase } from '@/client/supabase';
import { registerPushToken, subscribePushTokenRefresh } from '@/lib/notifications';

const BACKGROUND_TIMEOUT_MS = 300_000; // 300 seconds

type SessionContextType = {
  session: Session | null;
  isLoading: boolean;
  resetToHome: boolean;
  clearResetHome: () => void;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
  resetToHome: false,
  clearResetHome: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resetToHome, setResetToHome] = useState(false);
  const appState = useRef(AppState.currentState);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
      // Register FCM token on app open if already logged in
      if (session) registerPushToken();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // Register FCM token on sign-in
      if (event === 'SIGNED_IN' && session) {
        registerPushToken();
      }
    });

    // Listen for FCM token rotation — re-registers automatically when OS issues new token
    const unsubscribeTokenRefresh = subscribePushTokenRefresh();

    const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      const prev = appState.current;

      // Going to background — record the time
      if (nextState.match(/inactive|background/)) {
        backgroundAt.current = Date.now();
      }

      // Coming back to foreground
      if (Platform.OS !== 'web' && prev.match(/inactive|background/) && nextState === 'active') {
        // If away for more than 300 s, signal reset to home
        if (backgroundAt.current !== null && Date.now() - backgroundAt.current > BACKGROUND_TIMEOUT_MS) {
          setResetToHome(true);
        }
        backgroundAt.current = null;

        // Refresh auth session
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          const msg = error.message?.toLowerCase() ?? '';
          const isAuthError = msg.includes('invalid') || msg.includes('expired') || msg.includes('not found') || msg.includes('jwt');
          if (isAuthError) await supabase.auth.signOut();
        }

        // Re-register push token on every foreground return — catches rotated tokens
        registerPushToken();
      }

      appState.current = nextState;
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
      unsubscribeTokenRefresh();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading, resetToHome, clearResetHome: () => setResetToHome(false) }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

