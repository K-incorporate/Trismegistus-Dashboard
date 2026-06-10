import { useState, useMemo, useEffect, useRef } from "react";

export const MOBILE_BREAKPOINT = 700;

export function useObsMediaQuery() {
  const [windowWidth, setWindowWidth] = useState<number>(() => window.innerWidth);
  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = useMemo(() => windowWidth < MOBILE_BREAKPOINT, [windowWidth]);
  const isTablet = useMemo(
    () => windowWidth >= MOBILE_BREAKPOINT && windowWidth < 1024,
    [windowWidth],
  );
  const isDesktop = useMemo(() => windowWidth >= 1024, [windowWidth]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handleResize = () => {
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
      resizeTimeout.current = setTimeout(() => {
        setWindowWidth(window.innerWidth);
      }, 100);
    };

    const handleMediaQueryChange = () => {
      setWindowWidth(window.innerWidth);
    };

    mediaQuery.addEventListener("change", handleMediaQueryChange);
    window.addEventListener("resize", handleResize);

    return () => {
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
      mediaQuery.removeEventListener("change", handleMediaQueryChange);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return { isMobile, isTablet, isDesktop, windowWidth };
}
