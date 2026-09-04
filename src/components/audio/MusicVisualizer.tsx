import type React from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { resolveCssColor } from '@/libs/css-color';
import styles from './MusicVisualizer.module.css';

/* Hue used when the theme's --primary cannot be resolved, and the colour behind it. */
const DEFAULT_PRIMARY_HUE = 162;
const DEFAULT_PRIMARY_COLOR = 'oklch(0.695 0.17 162)';

/**
 * Turns any CSS colour string the browser hands back - `rgb()`, `oklch()` or
 * `color()`, depending on engine and token syntax - into an HSL hue in degrees.
 * Parsing is delegated to a 1x1 canvas, which normalises every colour syntax to
 * sRGB bytes; achromatic and unparseable colours fall back to `fallbackHue`.
 */
function cssColorToHue(color: string, fallbackHue: number): number {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallbackHue;

  // A syntax the engine cannot parse leaves fillStyle untouched, so a sentinel
  // surviving the assignment means the colour was rejected.
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillStyle = color;
  if (ctx.fillStyle === 'rgba(0, 0, 0, 0)') return fallbackHue;

  ctx.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = ctx.getImageData(0, 0, 1, 1).data;
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return fallbackHue;

  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

interface AudioData {
  bassLevel: number;
  midLevel: number;
  highLevel: number;
  overallLevel: number;
  frequencyData: Uint8Array;
}

interface MusicVisualizerProps {
  audioDataRef: React.RefObject<AudioData>;
  isPlaying: boolean;
}

// Perlin noise implementation for flow field
class PerlinNoise {
  private permutation: number[];

  constructor() {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = p[i]!;
      p[i] = p[j]!;
      p[j] = temp;
    }
    this.permutation = [...p, ...p];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);
    const pX = this.permutation[X] ?? 0;
    const pX1 = this.permutation[X + 1] ?? 0;
    const aa = this.permutation[pX + Y] ?? 0;
    const ab = this.permutation[pX + Y + 1] ?? 0;
    const ba = this.permutation[pX1 + Y] ?? 0;
    const bb = this.permutation[pX1 + Y + 1] ?? 0;
    return this.lerp(
      this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v,
    );
  }
}

// Particle with trail for organic flow
class FlowParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: { x: number; y: number; alpha: number }[];
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  saturation: number;
  lightness: number;

  constructor(x: number, y: number, baseHue: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.trail = [];
    this.maxLife = 200 + Math.random() * 150;
    this.life = this.maxLife;
    this.size = 3 + Math.random() * 4;
    this.hue = baseHue + (Math.random() - 0.5) * 40;
    this.saturation = 70 + Math.random() * 20;
    this.lightness = 60 + Math.random() * 15;
  }

  update(noise: PerlinNoise, time: number, centerX: number, centerY: number, bassLevel: number, highLevel: number) {
    // Store trail point
    if (this.trail.length > 12) this.trail.shift();
    this.trail.push({ x: this.x, y: this.y, alpha: this.life / this.maxLife });

    // Flow field influence
    const noiseScale = 0.003;
    const angle = noise.noise2D(this.x * noiseScale + time * 0.5, this.y * noiseScale) * Math.PI * 4;

    // Calculate direction from center
    const dx = this.x - centerX;
    const dy = this.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normalizedDx = dist > 0 ? dx / dist : 0;
    const normalizedDy = dist > 0 ? dy / dist : 0;

    // Bass pushes outward slowly
    const bassForce = bassLevel * 0.3;

    // High frequencies add turbulence
    const turbulence = highLevel * 0.5;

    this.vx += Math.cos(angle) * 0.15 + normalizedDx * bassForce + (Math.random() - 0.5) * turbulence;
    this.vy += Math.sin(angle) * 0.15 + normalizedDy * bassForce + (Math.random() - 0.5) * turbulence;

    // Damping for smooth motion
    this.vx *= 0.96;
    this.vy *= 0.96;

    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }

  draw(ctx: CanvasRenderingContext2D, intensityBoost: number) {
    const alpha = Math.max(0, this.life / this.maxLife);
    const boostedLightness = Math.min(80, this.lightness + intensityBoost * 20);
    const boostedSaturation = Math.min(90, this.saturation + intensityBoost * 15);

    // Draw trail
    if (this.trail.length > 1) {
      const firstPoint = this.trail[0];
      if (firstPoint) {
        ctx.beginPath();
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < this.trail.length; i++) {
          const point = this.trail[i];
          if (point) {
            ctx.lineTo(point.x, point.y);
          }
        }
        ctx.strokeStyle = `hsla(${this.hue}, ${boostedSaturation}%, ${boostedLightness}%, ${alpha * 0.3})`;
        ctx.lineWidth = this.size * 0.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Draw particle
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.hue}, ${boostedSaturation}%, ${boostedLightness}%, ${alpha * 0.8})`;
    ctx.fill();
  }

  isDead(width: number, height: number): boolean {
    return this.life <= 0 || this.x < -50 || this.x > width + 50 || this.y < -50 || this.y > height + 50;
  }
}

// Smoothed audio data for fluid transitions
interface SmoothedAudioData {
  bass: number;
  mid: number;
  high: number;
  overall: number;
  bassEnergy: number; // For detecting bass peaks
  expansion: number; // Current expansion amount
  afterglow: number; // Lingering glow intensity
}

const MusicVisualizer: React.FC<MusicVisualizerProps> = memo(
  ({ audioDataRef, isPlaying }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<FlowParticle[]>([]);
    const noiseRef = useRef<PerlinNoise>(new PerlinNoise());
    const animationRef = useRef<number | undefined>(undefined);
    const timeRef = useRef<number>(0);
    const smoothedDataRef = useRef<SmoothedAudioData>({
      bass: 0,
      mid: 0,
      high: 0,
      overall: 0,
      bassEnergy: 0,
      expansion: 1,
      afterglow: 0,
    });
    const themeColorsRef = useRef<{ primary: number; chartColors: number[] }>({
      primary: DEFAULT_PRIMARY_HUE,
      chartColors: [DEFAULT_PRIMARY_HUE, 222, 282, 342, 42],
    });
    const lastBassPeakRef = useRef<number>(0);

    // Derive the palette from the theme's --primary. The token is a light-dark()
    // expression, so it has to be resolved to a painted colour before parsing.
    const updateThemeColors = useCallback(() => {
      const primaryHue = cssColorToHue(resolveCssColor('--primary', DEFAULT_PRIMARY_COLOR), DEFAULT_PRIMARY_HUE);

      themeColorsRef.current = {
        primary: primaryHue,
        chartColors: [primaryHue, (primaryHue + 60) % 360, (primaryHue + 120) % 360, (primaryHue + 180) % 360, (primaryHue + 240) % 360],
      };
    }, []);

    // Smooth audio data with different attack/decay rates
    const smoothAudioData = useCallback((target: number, current: number, isAttack: boolean): number => {
      const rate = isAttack ? 0.3 : 0.08; // Fast attack, slow decay
      return current + (target - current) * rate;
    }, []);

    // Draw morphing hexagon
    const drawGeometricCore = useCallback(
      (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, baseRadius: number, smoothed: SmoothedAudioData, time: number) => {
        const { primary } = themeColorsRef.current;
        const vertices = 6;
        const expansion = smoothed.expansion;
        const rotation = time * 0.2 + smoothed.mid * 0.5;

        // Calculate vertex positions with frequency-based displacement
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < vertices; i++) {
          const angle = (Math.PI * 2 * i) / vertices - Math.PI / 2 + rotation;

          // Each vertex responds to different frequency - boosted amplitudes
          const freqIndex = i % 3;
          let displacement = 0;
          if (freqIndex === 0) displacement = smoothed.bass * 60;
          else if (freqIndex === 1) displacement = smoothed.mid * 45;
          else displacement = smoothed.high * 35;

          const radius = (baseRadius + displacement) * expansion;
          points.push({
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          });
        }

        // Draw polygon with bezier curves for organic feel
        ctx.beginPath();
        for (let i = 0; i < vertices; i++) {
          const curr = points[i]!;
          const next = points[(i + 1) % vertices]!;
          const nextNext = points[(i + 2) % vertices]!;
          const midX = (curr.x + next.x) / 2;
          const midY = (curr.y + next.y) / 2;

          if (i === 0) {
            ctx.moveTo(midX, midY);
          }

          const nextMidX = (next.x + nextNext.x) / 2;
          const nextMidY = (next.y + nextNext.y) / 2;
          ctx.quadraticCurveTo(next.x, next.y, nextMidX, nextMidY);
        }
        ctx.closePath();

        // Fill with gradient
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * expansion * 1.5);
        const intensity = Math.min(1, smoothed.overall + smoothed.afterglow * 0.5);
        const saturation = 50 + intensity * 30;
        const lightness = 20 + intensity * 25;

        gradient.addColorStop(0, `hsla(${primary}, ${saturation}%, ${lightness + 20}%, ${0.4 + intensity * 0.3})`);
        gradient.addColorStop(0.5, `hsla(${primary}, ${saturation}%, ${lightness}%, ${0.2 + intensity * 0.2})`);
        gradient.addColorStop(1, `hsla(${primary}, ${saturation}%, ${lightness - 10}%, 0)`);

        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw edge glow
        ctx.strokeStyle = `hsla(${primary}, ${saturation + 20}%, ${lightness + 30}%, ${0.5 + smoothed.afterglow * 0.3})`;
        ctx.lineWidth = 2 + smoothed.bass * 2;
        ctx.stroke();
      },
      [],
    );

    // Draw frequency rings
    const drawFrequencyRings = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        centerX: number,
        centerY: number,
        baseRadius: number,
        smoothed: SmoothedAudioData,
        frequencyData: Uint8Array,
      ) => {
        const { primary, chartColors } = themeColorsRef.current;
        const expansion = smoothed.expansion;

        // Inner ring - bass frequencies (smooth bezier) - boosted
        const innerRadius = (baseRadius + 50) * expansion;
        const innerPoints = 32;
        ctx.beginPath();
        for (let i = 0; i <= innerPoints; i++) {
          const angle = (Math.PI * 2 * i) / innerPoints - Math.PI / 2;
          const freqIndex = Math.floor((i / innerPoints) * (frequencyData.length * 0.1));
          const amplitude = ((frequencyData[freqIndex] || 0) / 255) * 60 * (0.5 + smoothed.bass);
          const r = innerRadius + amplitude;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${primary}, 80%, 60%, ${0.5 + smoothed.bass * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Middle ring - mid frequencies (detailed) - boosted
        const midRadius = (baseRadius + 100) * expansion;
        const midPoints = 64;
        ctx.beginPath();
        for (let i = 0; i <= midPoints; i++) {
          const angle = (Math.PI * 2 * i) / midPoints - Math.PI / 2;
          const freqIndex = Math.floor((i / midPoints) * (frequencyData.length * 0.5));
          const amplitude = ((frequencyData[freqIndex] || 0) / 255) * 50;
          const r = midRadius + amplitude;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${chartColors[1]}, 70%, 55%, ${0.4 + smoothed.mid * 0.4})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Outer ring - high frequencies (sparse indicators) - boosted
        const outerRadius = (baseRadius + 160) * expansion;
        const outerPoints = 24;
        ctx.lineWidth = 2;
        for (let i = 0; i < outerPoints; i++) {
          const angle = (Math.PI * 2 * i) / outerPoints - Math.PI / 2;
          const freqIndex = Math.floor(frequencyData.length * 0.5 + (i / outerPoints) * (frequencyData.length * 0.5));
          const amplitude = ((frequencyData[freqIndex] || 0) / 255) * 40;

          if (amplitude > 3) {
            const startR = outerRadius;
            const endR = outerRadius + amplitude;
            ctx.beginPath();
            ctx.moveTo(centerX + Math.cos(angle) * startR, centerY + Math.sin(angle) * startR);
            ctx.lineTo(centerX + Math.cos(angle) * endR, centerY + Math.sin(angle) * endR);
            ctx.strokeStyle = `hsla(${chartColors[2]}, 60%, 65%, ${0.4 + smoothed.high * 0.5})`;
            ctx.stroke();
          }
        }
      },
      [],
    );

    // Draw central glow / afterglow - boosted
    const drawCentralGlow = useCallback(
      (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, smoothed: SmoothedAudioData) => {
        const { primary } = themeColorsRef.current;
        const glowIntensity = smoothed.overall * 0.8 + smoothed.afterglow * 1.0 + 0.2;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.5);
        const saturation = 70 + glowIntensity * 25;
        const lightness = 55 + glowIntensity * 20;

        gradient.addColorStop(0, `hsla(${primary}, ${saturation}%, ${lightness}%, ${Math.min(0.7, glowIntensity * 0.5)})`);
        gradient.addColorStop(0.4, `hsla(${primary}, ${saturation - 10}%, ${lightness - 10}%, ${glowIntensity * 0.25})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
      },
      [],
    );

    const animate = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Use CSS dimensions for positioning (not pixel dimensions which include DPR)
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.18;

      // Clear canvas (use actual canvas dimensions)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update time
      timeRef.current += 0.016;
      const time = timeRef.current;

      // Smooth audio data
      const audioData = audioDataRef.current;
      const smoothed = smoothedDataRef.current;
      const targetBass = audioData.bassLevel;
      const targetMid = audioData.midLevel;
      const targetHigh = audioData.highLevel;
      const targetOverall = audioData.overallLevel;

      smoothed.bass = smoothAudioData(targetBass, smoothed.bass, targetBass > smoothed.bass);
      smoothed.mid = smoothAudioData(targetMid, smoothed.mid, targetMid > smoothed.mid);
      smoothed.high = smoothAudioData(targetHigh, smoothed.high, targetHigh > smoothed.high);
      smoothed.overall = smoothAudioData(targetOverall, smoothed.overall, targetOverall > smoothed.overall);

      // Bass peak detection and expansion
      const bassDelta = targetBass - smoothed.bassEnergy;
      smoothed.bassEnergy = smoothed.bassEnergy + bassDelta * 0.2;

      const now = performance.now();
      if (targetBass > 0.2 && bassDelta > 0.05 && now - lastBassPeakRef.current > 150) {
        lastBassPeakRef.current = now;
        smoothed.expansion = 1 + targetBass * 0.25; // Stronger expansion
        smoothed.afterglow = Math.min(1, smoothed.afterglow + targetBass * 1.0);
      }

      // Decay expansion and afterglow slowly
      smoothed.expansion = 1 + (smoothed.expansion - 1) * 0.95;
      smoothed.afterglow *= 0.985;

      // Intensity boost from bass
      const intensityBoost = smoothed.bass * 0.5 + smoothed.afterglow * 0.3;

      if (isPlaying) {
        // Spawn particles more aggressively
        const spawnRate = 0.15 + smoothed.overall * 0.35;
        if (Math.random() < spawnRate && particlesRef.current.length < 250) {
          const angle = Math.random() * Math.PI * 2;
          const dist = baseRadius * 1.2 + Math.random() * 50;
          const x = centerX + Math.cos(angle) * dist;
          const y = centerY + Math.sin(angle) * dist;
          const hue = themeColorsRef.current.chartColors[Math.floor(Math.random() * 5)] ?? 220;
          particlesRef.current.push(new FlowParticle(x, y, hue));
        }

        // Draw central glow
        drawCentralGlow(ctx, centerX, centerY, baseRadius, smoothed);

        // Draw geometric core
        drawGeometricCore(ctx, centerX, centerY, baseRadius, smoothed, time);

        // Draw frequency rings
        drawFrequencyRings(ctx, centerX, centerY, baseRadius, smoothed, audioData.frequencyData);
      } else {
        // Ambient mode when not playing
        const ambientPulse = Math.sin(time * 0.5) * 0.5 + 0.5;
        const ambientSmoothed: SmoothedAudioData = {
          bass: ambientPulse * 0.1,
          mid: ambientPulse * 0.08,
          high: ambientPulse * 0.05,
          overall: ambientPulse * 0.08,
          bassEnergy: 0,
          expansion: 1 + ambientPulse * 0.02,
          afterglow: 0,
        };

        drawCentralGlow(ctx, centerX, centerY, baseRadius, ambientSmoothed);
        drawGeometricCore(ctx, centerX, centerY, baseRadius, ambientSmoothed, time);
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.update(noiseRef.current, time, centerX, centerY, smoothed.bass, smoothed.high);

        if (particle.isDead(width, height)) {
          return false;
        }

        particle.draw(ctx, intensityBoost);
        return true;
      });

      animationRef.current = requestAnimationFrame(animate);
    }, [isPlaying, audioDataRef, smoothAudioData, drawGeometricCore, drawFrequencyRings, drawCentralGlow]);

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }, []);

    useEffect(() => {
      updateThemeColors();
      resizeCanvas();

      window.addEventListener('resize', resizeCanvas);

      // Listen for theme changes
      const observer = new MutationObserver(() => {
        updateThemeColors();
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        window.removeEventListener('resize', resizeCanvas);
        observer.disconnect();
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, [resizeCanvas, animate, updateThemeColors]);

    return (
      <canvas
        ref={canvasRef}
        className={styles.canvas}
      />
    );
  },
  (prevProps, nextProps) => {
    return prevProps.isPlaying === nextProps.isPlaying && prevProps.audioDataRef === nextProps.audioDataRef;
  },
);

MusicVisualizer.displayName = 'MusicVisualizer';

export default MusicVisualizer;
