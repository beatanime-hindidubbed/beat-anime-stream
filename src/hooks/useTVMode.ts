import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface TVCtx {
  isTV: boolean;
}

const TVModeContext = createContext<TVCtx>({ isTV: false });

export function TVModeProvider({ children }: { children: ReactNode }) {
  const [isTV, setIsTV] = useState(false);

  useEffect(() => {
    // Detect Smart TV by user‑agent OR screen size ≥ 1920x1080
    const byUA = /SmartTV|Tizen|WebOS|HbbTV|VIDAA|NetCast|SMART-TV/i.test(navigator.userAgent);
    const byScreen = window.screen.width >= 1920 && window.screen.height >= 1080;

    if (byUA || byScreen) {
      setIsTV(true);
      document.body.classList.add('tv-mode');
    }

    // Cleanup on unmount (if the component ever unmounts – unlikely, but safe)
    return () => {
      document.body.classList.remove('tv-mode');
    };
  }, []);

  return (
    <TVModeContext.Provider value={{ isTV }}>
      {children}
    </TVModeContext.Provider>
  );
}

export const useTVMode = () => useContext(TVModeContext);