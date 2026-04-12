import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '@/assets/sociva_app_icon.png';
import { hideSplashScreen } from '@/lib/capacitor';

const MIN_DISPLAY_MS = 1800;
const MAX_DISPLAY_MS = 4000;
const VIDEO_FALLBACK_MS = 2000;

interface AppSplashScreenProps {
  ready: boolean;
  onComplete: () => void;
}

export function AppSplashScreen({ ready, onComplete }: AppSplashScreenProps) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
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

  // Hard cap timer — force exit regardless
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!exiting) setExiting(true);
    }, MAX_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  // Video fallback timer — only trigger if video hasn't started playing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!videoPlaying && videoRef.current && videoRef.current.readyState < 2) {
        setVideoFailed(true);
      }
    }, VIDEO_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [videoPlaying]);

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
          className="fixed z-[9999] flex flex-col items-center justify-center overflow-hidden"
          style={{ backgroundColor: '#000000', top: -1, left: -1, right: -1, bottom: -1 }}
        >
          {/* Video splash — full screen */}
          {!videoFailed && (
            <video
              ref={videoRef}
              src="/splash-video.mp4"
              autoPlay
              muted
              playsInline
              preload="auto"
              onPlaying={() => setVideoPlaying(true)}
              onError={() => setVideoFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Logo fallback if video fails to load */}
          {videoFailed && (
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <img src={logoImg} alt="SOCIVA" className="w-40 h-40 object-contain" />
            </motion.div>
          )}

          {/* Subtle loading indicator — positioned at bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"
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
