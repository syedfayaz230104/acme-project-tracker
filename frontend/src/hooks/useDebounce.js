import { useEffect, useState } from 'react';

/**
 * Return `value` after it has stopped changing for `delay` ms (used for search boxes).
 * @template T
 * @param {T} value
 * @param {number} [delay=300]
 * @returns {T}
 */
export default function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
