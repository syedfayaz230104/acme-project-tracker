import { useCallback, useEffect, useState } from 'react';

/**
 * Load data from an async function and expose loading / error / reload state.
 *
 * Re-runs whenever `deps` change (deps must be JSON-serialisable). Responses from
 * superseded requests are ignored. Previous data stays visible while reloading so
 * lists don't flash.
 *
 * @template T
 * @param {() => Promise<T>} loader Async function returning the data
 * @param {Array<any>} deps Values that trigger a reload
 * @returns {{data: T|undefined, loading: boolean, error: Error|null, reload: () => void}}
 */
export default function useApi(loader, deps = []) {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState({ key: null, data: undefined, error: null });
  const key = `${JSON.stringify(deps)}#${tick}`;

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setResult((prev) => ({ key, data: prev.data, error }));
      });
    return () => {
      cancelled = true;
    };
    // `key` captures deps + reload tick; `loader` is re-created each render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = result.key === key;
  return {
    data: result.data,
    loading: !current,
    error: current ? result.error : null,
    reload,
  };
}
