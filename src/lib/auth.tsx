import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import type { Session } from '@supabase/supabase-js';
import type { StringKey } from './i18n';
import { mobileToLoginId } from './phone';
import { supabase } from './supabase';
import { heartbeat, syncTrips } from './sync';

export type Driver = {
  id: string;
  mobile: string;
  full_name: string;
  address: string;
  nic: string;
  vehicle_no: string;
  licence_no: string;
  /** False when an admin has deactivated the account. Missing in profiles cached by older versions. */
  active?: boolean;
  last_seen_at?: string | null;
};

export type Registration = Omit<Driver, 'id' | 'active' | 'last_seen_at'> & { password: string };

const DRIVER_KEY = 'driver';

function loadCachedDriver(): Driver | null {
  const raw = Storage.getItemSync(DRIVER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Driver;
  } catch {
    return null;
  }
}

/** Map Supabase auth errors onto messages a driver can act on. */
function authErrorKey(err: { message?: string; name?: string; status?: number }, fallback: StringKey): StringKey {
  const msg = (err.message ?? '').toLowerCase();
  if (err.name === 'AuthRetryableFetchError' || msg.includes('network') || msg.includes('fetch')) return 'networkError';
  if (msg.includes('already registered') || msg.includes('already exists')) return 'phoneTaken';
  if (msg.includes('invalid login')) return 'loginFailed';
  return fallback;
}

type Auth = {
  configured: boolean;
  /** False until the stored session has been read on launch. */
  ready: boolean;
  session: Session | null;
  driver: Driver | null;
  /** The admin has deactivated this driver; the app is blocked until reactivated. */
  deactivated: boolean;
  signIn: (mobile94: string, password: string) => Promise<StringKey | null>;
  register: (r: Registration) => Promise<StringKey | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [driver, setDriver] = useState<Driver | null>(loadCachedDriver);

  const refreshDriver = useCallback(async (userId: string): Promise<Driver | null> => {
    if (!supabase) return null;
    const { data } = await supabase.from('drivers').select('*').eq('id', userId).maybeSingle<Driver>();
    if (data) {
      Storage.setItemSync(DRIVER_KEY, JSON.stringify(data));
      setDriver(data);
    }
    return data ?? null;
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session) {
        refreshDriver(data.session.user.id).catch(() => {});
        syncTrips().catch(() => {});
        heartbeat().catch(() => {});
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    // Coming back to the app: upload trips finished offline, tell the office the
    // driver is online, and pick up a status change made by an admin.
    const appState = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      syncTrips().catch(() => {});
      heartbeat().catch(() => {});
      client.auth.getSession().then(({ data: d }) => {
        if (d.session) refreshDriver(d.session.user.id).catch(() => {});
      });
    });
    // While the app is open, say so every 2 minutes (during a hire the trip upload does it every minute).
    const beat = setInterval(() => {
      if (AppState.currentState === 'active') heartbeat().catch(() => {});
    }, 120_000);
    return () => {
      data.subscription.unsubscribe();
      appState.remove();
      clearInterval(beat);
    };
  }, [refreshDriver]);

  const signIn = useCallback(
    async (mobile94: string, password: string): Promise<StringKey | null> => {
      if (!supabase) return 'setupNeeded';
      const { data, error } = await supabase.auth.signInWithPassword({ email: mobileToLoginId(mobile94), password });
      if (error) return authErrorKey(error, 'loginFailed');
      const profile = await refreshDriver(data.user.id).catch(() => null);
      if (profile?.active === false) {
        Storage.removeItemSync(DRIVER_KEY);
        setDriver(null);
        await supabase.auth.signOut();
        return 'accountDeactivated';
      }
      syncTrips().catch(() => {});
      heartbeat().catch(() => {});
      return null;
    },
    [refreshDriver],
  );

  const register = useCallback(
    async ({ password, ...details }: Registration): Promise<StringKey | null> => {
      if (!supabase) return 'setupNeeded';
      // The `drivers` row is created from this metadata by a database trigger (supabase/schema.sql).
      const { data, error } = await supabase.auth.signUp({
        email: mobileToLoginId(details.mobile),
        password,
        options: { data: details },
      });
      if (error) return authErrorKey(error, 'registerFailed');
      // Supabase returns a fake user with no identities for an existing address.
      if (data.user && data.user.identities?.length === 0) return 'phoneTaken';
      if (!data.session) return 'registerFailed'; // email confirmation is still on in the project
      await refreshDriver(data.session.user.id).catch(() => {});
      return null;
    },
    [refreshDriver],
  );

  const signOut = useCallback(async () => {
    Storage.removeItemSync(DRIVER_KEY);
    setDriver(null);
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<Auth>(
    () => ({
      configured: !!supabase,
      ready,
      session,
      driver,
      deactivated: driver?.active === false,
      signIn,
      register,
      signOut,
    }),
    [ready, session, driver, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
