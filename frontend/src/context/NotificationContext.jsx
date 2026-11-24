import {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import { Alert, Snackbar } from '@mui/material';

const NotificationContext = createContext(null);

/** App-wide toast notifications for success and failure feedback. */
export function NotificationProvider({ children }) {
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, severity = 'success') => {
    setToast({ message, severity, key: Date.now() });
  }, []);

  const value = useMemo(() => ({
    success: (message) => notify(message, 'success'),
    error: (message) => notify(message, 'error'),
  }), [notify]);

  const handleClose = (_event, reason) => {
    if (reason !== 'clickaway') setToast(null);
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === 'error' ? 6000 : 3000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert onClose={handleClose} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

NotificationProvider.propTypes = { children: PropTypes.node.isRequired };

/** @returns {{success: (msg: string) => void, error: (msg: string) => void}} */
// eslint-disable-next-line react-refresh/only-export-components
export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotify must be used inside NotificationProvider');
  return ctx;
}
