import { useEffect, useRef, useCallback } from 'react';

// Simple beep sound using Web Audio API
function createBeepSound(audioContext: AudioContext) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800; // Frequency in Hz
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);

  return oscillator;
}

export function useUrgentOrderSound(isActive: boolean) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const playBeep = useCallback(() => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      createBeepSound(audioContextRef.current);
    } catch (e) {
      console.log('Could not play notification sound');
    }
  }, []);

  const startRinging = useCallback(() => {
    // Play immediately
    playBeep();

    // Then repeat every 5 seconds
    intervalRef.current = setInterval(() => {
      playBeep();
    }, 5000);
  }, [playBeep]);

  const stopRinging = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      startRinging();
    } else {
      stopRinging();
    }

    return () => {
      stopRinging();
    };
  }, [isActive, startRinging, stopRinging]);

  return { playBeep, stopRinging };
}
