import { useMediaQuery } from 'react-responsive';

/**
 * Breakpoint flags based on react-responsive (aligned with MUI's sm/md breakpoints).
 * @returns {{isMobile: boolean, isTablet: boolean, isDesktop: boolean}}
 */
export default function useResponsive() {
  const isMobile = useMediaQuery({ maxWidth: 599 });
  const isTablet = useMediaQuery({ minWidth: 600, maxWidth: 899 });
  const isDesktop = useMediaQuery({ minWidth: 900 });
  return { isMobile, isTablet, isDesktop };
}
