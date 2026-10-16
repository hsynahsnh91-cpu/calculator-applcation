import confetti from 'canvas-confetti';

// Detect low-end devices (few cores / little memory) once.
// On those, we skip the particle burst so the UI stays snappy on Android 7+.
let cached: boolean | null = null;
export function isLowEnd(): boolean {
  if (cached !== null) return cached;
  const nav = navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 8;
  const mem = nav.deviceMemory || 8;
  cached = cores <= 4 || mem <= 3;
  return cached;
}

// Celebration burst that respects both the device capability and the OS
// "reduce motion" setting. No-op on low-end devices.
export function burst(colors: string[], particles = 14): void {
  if (isLowEnd()) return;
  try {
    confetti({
      particleCount: particles,
      spread: 50,
      origin: { y: 0.78 },
      colors,
      disableForReducedMotion: true
    });
  } catch {
    // confetti canvas may be unavailable in some WebViews
  }
}
