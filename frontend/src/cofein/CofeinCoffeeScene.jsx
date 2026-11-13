import { useEffect, useImperativeHandle, useRef } from 'react';
import { clamp01, coffeeImpacts, coffeePose, floodRadius, poolRadius, smooth } from './coffeeSceneMath.js';
import './cofein-coffee-scene.css';

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

/** Smooth deterministic contours: no per-frame random noise or costly SVG filters. */
function poolPath(context, x, y, radius, seed) {
  context.beginPath();
  const steps = 100;
  for (let i = 0; i <= steps; i += 1) {
    const angle = i / steps * Math.PI * 2;
    const edge = 1 + Math.sin(angle * 3 + seed) * 0.10 + Math.cos(angle * 5 - seed) * 0.045 + Math.sin(angle * 7 + seed * 2) * 0.025;
    const px = x + Math.cos(angle) * radius * edge;
    const py = y + Math.sin(angle) * radius * edge * 0.84;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function drawDrop(context, x, y, radius, stretch, opacity) {
  context.save();
  context.globalAlpha = opacity;
  context.translate(x, y);
  context.scale(1, stretch);
  const shine = context.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
  shine.addColorStop(0, '#c38b4e');
  shine.addColorStop(0.32, '#753f21');
  shine.addColorStop(1, '#24120b');
  context.fillStyle = shine;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawCoffee(context, width, height, progress, pose) {
  const flow = smooth((progress - 0.23) / 0.10) * (1 - smooth((progress - 0.72) / 0.13));
  if (flow <= 0) return;
  const start = pose.lip;
  const end = { x: width * 0.43, y: height * 0.76 };
  const length = smooth((progress - 0.24) / 0.10);
  const bottomY = start.y + (end.y - start.y) * length;
  const bottomX = start.x + (end.x - start.x) * length;
  const thickness = Math.max(3, pose.initialSize * 0.017) * flow;
  const gradient = context.createLinearGradient(start.x - thickness, 0, start.x + thickness * 2, 0);
  gradient.addColorStop(0, '#28150b');
  gradient.addColorStop(0.30, '#8f542d');
  gradient.addColorStop(0.48, '#b27b42');
  gradient.addColorStop(0.70, '#64321a');
  gradient.addColorStop(1, '#28130b');
  context.save();
  context.globalAlpha = flow * pose.opacity;
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(start.x - thickness, start.y + 2);
  context.bezierCurveTo(start.x - thickness - 6, start.y + 45, bottomX - thickness * 0.35, bottomY - 80, bottomX - thickness * 0.55, bottomY);
  context.quadraticCurveTo(bottomX, bottomY + thickness, bottomX + thickness * 0.55, bottomY);
  context.bezierCurveTo(bottomX + thickness * 0.35, bottomY - 80, start.x + thickness * 0.7, start.y + 45, start.x + thickness, start.y + 2);
  context.quadraticCurveTo(start.x, start.y - thickness * 0.65, start.x - thickness, start.y + 2);
  context.closePath();
  context.fill();
  context.restore();

  coffeeImpacts.forEach((impact, index) => {
    const flight = clamp01((progress - (impact.at - 0.075)) / 0.075);
    if (flight <= 0 || flight >= 1) return;
    const x = start.x + (impact.x * width - start.x) * flight;
    const y = start.y + (impact.y * height - start.y) * flight ** 1.55;
    drawDrop(context, x, y, (4 + index % 3) * Math.min(1.5, width / 500), 1.7 - flight * 0.5, pose.opacity);
  });
}

function drawScene(canvas, images, progress) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  // Cap backing-store pixels on large/retina screens. The scene only redraws on input.
  const ratio = Math.min(window.devicePixelRatio || 1, width <= 760 ? 1.25 : 1.5, Math.sqrt(2800000 / (width * height)));
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#030507';
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.28, height * 0.24, 0, width * 0.3, height * 0.3, Math.max(width, height) * 0.60);
  glow.addColorStop(0, 'rgba(44,77,108,.15)');
  glow.addColorStop(0.5, 'rgba(17,31,46,.08)');
  glow.addColorStop(1, 'rgba(3,5,7,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = '#000';
  coffeeImpacts.forEach(impact => {
    const radius = poolRadius(width, height, progress, impact);
    if (radius < 0.1) return;
    poolPath(context, width * impact.x, height * impact.y, radius, impact.seed);
    context.fill();
  });
  const flood = floodRadius(width, height, progress);
  if (flood > 0) {
    poolPath(context, width * 0.46, height * 0.66, flood, 5);
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
  // A thin, brief warm meniscus marks each fresh impact, not every old hole.
  coffeeImpacts.forEach(impact => {
    const age = progress - impact.at;
    if (age <= 0 || age > 0.11) return;
    poolPath(context, width * impact.x, height * impact.y, poolRadius(width, height, progress, impact), impact.seed);
    context.strokeStyle = `rgba(164,112,59,${0.4 * (1 - age / 0.11)})`;
    context.lineWidth = 1;
    context.stroke();
  });

  if (!images) return;
  const pose = coffeePose(width, height, progress);
  if (pose.opacity <= 0) return;

  context.save();
  context.globalAlpha = pose.saucer.opacity;
  context.translate(pose.saucer.x, pose.saucer.y);
  context.rotate(pose.saucer.rotation);
  context.drawImage(images.saucer, -pose.saucer.size * 0.5, -pose.saucer.size / 3, pose.saucer.size, pose.saucer.size * 2 / 3);
  context.restore();

  context.save();
  context.globalAlpha = pose.opacity;
  context.translate(pose.x, pose.y);
  context.rotate(pose.rotation);
  context.drawImage(images.cup, -pose.size * 0.42, -pose.size * 0.60, pose.size, pose.size * 2 / 3);
  if (images.empty) {
    context.globalAlpha = pose.opacity * smooth((progress - 0.34) / 0.40);
    context.drawImage(images.empty, -pose.size * 0.42, -pose.size * 0.60, pose.size, pose.size * 2 / 3);
  }
  // The exact original menu outlines travel with the ceramic, never generated text.
  context.globalAlpha = pose.opacity * 0.86;
  context.drawImage(images.logo, -pose.size * 0.129, -pose.size * 0.234, pose.size * 0.29, pose.size * 0.29 * 572 / 2379);
  context.restore();
  drawCoffee(context, width, height, progress, pose);
}

export default function CofeinCoffeeScene({ ref, onReady, onError }) {
  const canvasRef = useRef(null);
  const imagesRef = useRef(null);
  const progressRef = useRef(0);

  useImperativeHandle(ref, () => ({
    render(progress) {
      progressRef.current = clamp01(progress);
      if (canvasRef.current) drawScene(canvasRef.current, imagesRef.current, progressRef.current);
    },
  }), []);

  useEffect(() => {
    let active = true;
    let frame = 0;
    const canvas = canvasRef.current;
    const paint = () => {
      frame = 0;
      if (active) drawScene(canvas, imagesRef.current, progressRef.current);
    };
    const resize = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    if (!canvas.getContext('2d')) { onError(); return undefined; }
    const resolution = window.innerWidth <= 760 ? 768 : 1280;
    let empty;
    // The initial still life never waits for the later empty-cup variant.
    loadImage(`/cofein/intro/cup-empty-${resolution}.webp`).then(image => {
      if (!active) return;
      empty = image;
      if (imagesRef.current) {
        imagesRef.current.empty = image;
        if (progressRef.current > 0.34) paint();
      }
    }).catch(() => { /* A decorative later frame may fall back to the full cup. */ });
    Promise.all([
      loadImage(`/cofein/intro/cup-${resolution}.webp`),
      loadImage(`/cofein/intro/saucer-${resolution}.webp`),
      loadImage('/cofein/brand/cofein-lockup.svg'),
    ]).then(([cup, saucer, logo]) => {
      if (!active) return;
      imagesRef.current = { cup, saucer, empty, logo };
      paint();
      onReady();
    }).catch(() => { if (active) onError(); });
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      active = false;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onReady, onError]);

  return <canvas className="coffee-scene" ref={canvasRef} aria-hidden="true" />;
}
