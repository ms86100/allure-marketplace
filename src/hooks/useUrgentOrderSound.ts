import { useEffect, useRef, useCallback } from 'react';

export function useUrgentOrderSound(isActive: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const playBeep = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/gate_bell.mp3');
      }
      audioRef.current.loop = true;
      audioRef.current.volume = 1.0;
      audioRef.current.play().catch(() => {});
    } catch {
      console.log('Could not play notification sound');
    }
  }, []);

  const stopRinging = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = false;
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isActive) {
      playBeep();
    } else {
      stopRinging();
    }

    return () => {
      stopRinging();
    };
  }, [isActive, playBeep, stopRinging]);

  return { playBeep, stopRinging };
}
