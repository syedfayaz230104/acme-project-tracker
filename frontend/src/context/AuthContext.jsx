import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import * as api from '../services/api';
import { authApi } from '../services/resources';

const AuthContext = createContext(null);

/**
 * Provides the signed-in user, login/logout, and a `can(action)` permission check.
 * Permissions come from the backend so the UI and API always agree.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.loadSession()?.user ?? null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      setUser(null);
      setSessionExpired(true);
    });
    // Refresh the profile so role changes made by an admin are picked up.
    if (api.loadSession()) {
      authApi.me()
        .then((me) => {
          const session = api.loadSession();
          if (session) api.saveSession({ ...session, user: me });
          setUser(me);
        })
        .catch(() => {});
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const session = await api.login(email, password);
    setSessionExpired(false);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  const can = useCallback((action) => Boolean(user?.permissions?.includes(action)), [user]);

  const value = useMemo(() => ({
    user, login, logout, can, sessionExpired,
  }), [user, login, logout, can, sessionExpired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired };

/** @returns {{user: object|null, login: Function, logout: Function, can: (a: string) => boolean, sessionExpired: boolean}} */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
