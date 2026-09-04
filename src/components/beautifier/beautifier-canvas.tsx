import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { BeautifierConfig, BeautifierSourceFile } from '@/schemas/beautifier-schema';
import styles from './beautifier-canvas.module.css';

interface BeautifierCanvasProps {
  source: BeautifierSourceFile;
  config: BeautifierConfig;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackground(ctx: CanvasRenderingContext2D, config: BeautifierConfig) {
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, config.width, config.height);

  if (config.backgroundStyle === 'checker') {
    const tile = Math.max(48, Math.round(Math.min(config.width, config.height) / 16));
    for (let y = 0; y < config.height; y += tile) {
      for (let x = 0; x < config.width; x += tile) {
        if ((x / tile + y / tile) % 2 === 0) {
          ctx.fillStyle = 'rgba(15, 21, 17, 0.045)';
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }
    return;
  }

  if (config.backgroundStyle === 'soft-grid') {
    const spacing = Math.max(80, Math.round(Math.min(config.width, config.height) / 9));
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 21, 17, 0.075)';
    ctx.lineWidth = 1;
    for (let x = spacing; x < config.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, config.height);
      ctx.stroke();
    }
    for (let y = spacing; y < config.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(config.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawImageFrame(ctx: CanvasRenderingContext2D, image: HTMLImageElement, config: BeautifierConfig) {
  const safePadding = Math.min(config.padding, Math.floor(Math.min(config.width, config.height) / 3));
  const frameWidth = config.frameWidth;
  const availableWidth = Math.max(1, config.width - safePadding * 2 - frameWidth * 2);
  const availableHeight = Math.max(1, config.height - safePadding * 2 - frameWidth * 2);
  const imageRatio = image.naturalWidth / image.naturalHeight || 1;
  const availableRatio = availableWidth / availableHeight;

  let imageWidth = availableWidth;
  let imageHeight = availableHeight;
  if (imageRatio > availableRatio) {
    imageHeight = imageWidth / imageRatio;
  } else {
    imageWidth = imageHeight * imageRatio;
  }

  const frameX = (config.width - imageWidth - frameWidth * 2) / 2;
  const frameY = (config.height - imageHeight - frameWidth * 2) / 2;
  const frameOuterWidth = imageWidth + frameWidth * 2;
  const frameOuterHeight = imageHeight + frameWidth * 2;
  const imageX = frameX + frameWidth;
  const imageY = frameY + frameWidth;
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const angle = (config.rotation * Math.PI) / 180;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.translate(-centerX, -centerY);

  if (config.shadowStrength > 0) {
    ctx.shadowColor = `rgba(15, 21, 17, ${0.1 + config.shadowStrength * 0.003})`;
    ctx.shadowBlur = 14 + config.shadowStrength * 0.55;
    ctx.shadowOffsetY = 8 + config.shadowStrength * 0.2;
  }

  roundedRect(ctx, frameX, frameY, frameOuterWidth, frameOuterHeight, config.imageRadius + frameWidth);
  ctx.fillStyle = config.frameColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  roundedRect(ctx, imageX, imageY, imageWidth, imageHeight, config.imageRadius);
  ctx.save();
  ctx.clip();
  ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);
  ctx.restore();

  if (frameWidth > 0) {
    roundedRect(ctx, imageX, imageY, imageWidth, imageHeight, config.imageRadius);
    ctx.strokeStyle = 'rgba(15, 21, 17, 0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function BeautifierCanvasComponent({ source, config, onCanvasReady }: BeautifierCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const configRef = useRef(config);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const [renderError, setRenderError] = useState<string | null>(null);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const currentConfig = configRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = currentConfig.width;
    canvas.height = currentConfig.height;
    canvas.style.aspectRatio = `${currentConfig.width} / ${currentConfig.height}`;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawBackground(ctx, currentConfig);
    drawImageFrame(ctx, image, currentConfig);
    setRenderError(null);
    onCanvasReadyRef.current?.(canvas);
  }, []);

  useEffect(() => {
    onCanvasReadyRef.current = onCanvasReady;
  }, [onCanvasReady]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      imageRef.current = image;
      renderCanvas();
    };
    image.onerror = () => {
      setRenderError('The source image could not be loaded.');
      imageRef.current = null;
      onCanvasReadyRef.current?.(null);
    };
    image.src = source.cdnUrl;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [source.cdnUrl, renderCanvas]);

  useEffect(() => {
    configRef.current = config;
    renderCanvas();
  }, [config, renderCanvas]);

  return (
    <div className={styles.stage}>
      <div
        className={styles.wash}
        aria-hidden
      />
      <div className={styles.frame}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
        />
        {renderError ? <div className={styles.error}>{renderError}</div> : null}
      </div>
    </div>
  );
}

export const BeautifierCanvas = memo(BeautifierCanvasComponent);
