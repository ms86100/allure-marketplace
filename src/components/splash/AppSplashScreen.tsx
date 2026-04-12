import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { hideSplashScreen } from '@/lib/capacitor';

const MIN_DISPLAY_MS = 1500;
const MAX_DISPLAY_MS = 3000;
const VIDEO_FALLBACK_MS = 800;

interface AppSplashScreenProps {
  ready: boolean;
  onComplete: () => void;
}

export function AppSplashScreen({ ready, onComplete }: AppSplashScreenProps) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountTime = useRef(Date.now());

  // Hide native splash as soon as web splash mounts
  useEffect(() => {
    hideSplashScreen();
  }, []);

  // Min display timer
  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Hard cap timer
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!exiting) setExiting(true);
    }, MAX_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  // Video fallback timer
  useEffect(() => {
    const timer = setTimeout(() => {
      if (videoRef.current && videoRef.current.readyState < 2) {
        setVideoFailed(true);
      }
    }, VIDEO_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  // Begin exit when ready + min elapsed
  useEffect(() => {
    if (ready && minElapsed && !exiting) {
      setExiting(true);
    }
  }, [ready, minElapsed, exiting]);

  const handleExitComplete = useCallback(() => {
    const bootTime = Date.now() - mountTime.current;
    console.log(`[Splash] Total display time: ${bootTime}ms`);
    onComplete();
  }, [onComplete]);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {!exiting && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          {/* Video splash */}
          {!videoFailed && (
            <video
              ref={videoRef}
              src="/splash-video.mp4"
              autoPlay
              muted
              playsInline
              onError={() => setVideoFailed(true)}
              className="w-48 h-48 object-contain"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* SVG fallback if video fails */}
          {videoFailed && (
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <svg width="160" height="160" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                <rect width="1024" height="1024" rx="180" fill="transparent" />
                <text
                  x="512" y="540"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  fontSize="200" fontWeight="700"
                  textAnchor="middle" dominantBaseline="middle"
                  letterSpacing="-4"
                >
                  <tspan fill="#10b981">S</tspan>
                  <tspan fill="#e8e8e8">OCI</tspan>
                  <tspan fill="#10b981">V</tspan>
                  <tspan fill="#e8e8e8">A</tspan>
                </text>
              </svg>
            </motion.div>
          )}

          {/* Subtle loading indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-8 flex gap-1.5"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-white/50"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
