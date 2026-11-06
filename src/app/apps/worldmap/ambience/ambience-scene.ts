/**
 * Small ambient life drifting over the world map: clouds, now and then a bird, a falling leaf, and the
 * odd snow flurry. Plain DOM with the Web Animations API, animating only transform and opacity so it stays
 * cheap. The layer is in screen space: it does not pan or zoom with the map.
 *
 * Everything is styled inline, so the scene works in any container (a Leaflet pane, a component host).
 */

const SVG = 'http://www.w3.org/2000/svg';

const CLOUD_SVG =
  '<svg viewBox="0 0 200 90" width="100%" height="100%" preserveAspectRatio="none" style="display:block">' +
  // Dark rain-cloud grey, slightly lighter on top.
  '<defs><linearGradient id="cloud-shade" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#6b7380"/><stop offset="1" stop-color="#363c46"/></linearGradient></defs>' +
  '<g fill="url(#cloud-shade)">' +
  '<ellipse cx="100" cy="64" rx="92" ry="22"/>' +
  '<circle cx="62" cy="52" r="26"/><circle cx="104" cy="40" r="36"/><circle cx="146" cy="54" r="24"/>' +
  '</g></svg>';

const LEAF_COLOURS = ['#c8702a', '#a8452a', '#d9a03b', '#8a9a3b', '#b85c1f'];

/** Random number in [min, max). */
function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export class AmbienceScene {
  private readonly document: Document;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private running = false;
  private destroyed = false;

  constructor(private readonly layer: HTMLElement) {
    this.document = layer.ownerDocument;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.overflow = 'hidden';
    layer.style.pointerEvents = 'none';
  }

  /** Starts or stops the scene. Stays still when the user asks the system for less motion. */
  setRunning(running: boolean): void {
    const reduced = this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const wanted = running && !reduced && !this.destroyed && typeof Element.prototype.animate === 'function';
    if (wanted === this.running) {
      return;
    }
    this.running = wanted;
    if (wanted) {
      this.start();
    } else {
      this.stop();
    }
  }

  destroy(): void {
    this.setRunning(false);
    this.destroyed = true;
  }

  private start(): void {
    // A couple of clouds are already partway across, so the map doesn't start empty.
    this.cloud(between(0.1, 0.4));
    this.cloud(between(0.55, 0.85));
    this.repeat(() => this.cloud(0), 16, 32, 10);
    this.repeat(() => this.birds(), 35, 90, between(8, 20));
    this.repeat(() => this.leaf(), 18, 45, between(5, 15));
    this.repeat(() => this.snowFlurry(), 150, 360, between(45, 100));
  }

  private stop(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    for (const child of Array.from(this.layer.children)) {
      child.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      child.remove();
    }
  }

  /** Runs `spawn` after `firstDelay` seconds, then every `min`–`max` seconds. */
  private repeat(spawn: () => void, min: number, max: number, firstDelay: number): void {
    this.after(firstDelay, () => {
      spawn();
      this.repeat(spawn, min, max, between(min, max));
    });
  }

  private after(seconds: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.running) {
        run();
      }
    }, seconds * 1000);
    this.timers.add(timer);
  }

  private size(): { width: number; height: number } | null {
    const width = this.layer.clientWidth;
    const height = this.layer.clientHeight;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  /** Adds an element at the top left of the layer and removes it when its animation ends. */
  private spawn(element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation {
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    element.style.willChange = 'transform, opacity';
    this.layer.append(element);
    const animation = element.animate(keyframes, { fill: 'both', ...options });
    const remove = () => element.remove();
    animation.finished.then(remove, remove);
    return animation;
  }

  /** A soft cloud with its shadow, drifting left to right. `progress` starts it partway across. */
  private cloud(progress: number): void {
    const size = this.size();
    if (!size) {
      return;
    }
    const width = Math.max(180, size.width * between(0.22, 0.4));
    const height = width * between(0.38, 0.5);
    const y = size.height * between(-0.1, 0.75);
    const cloud = this.document.createElement('div');
    cloud.innerHTML = CLOUD_SVG;
    cloud.style.width = `${width}px`;
    cloud.style.height = `${height}px`;
    cloud.style.filter = `blur(${Math.round(width / 28)}px) drop-shadow(${width * 0.12}px ${width * 0.2}px ${width * 0.06}px rgba(0, 0, 0, 0.3))`;
    const peak = between(0.5, 0.7);
    const drift = between(-0.05, 0.05) * size.height;
    const duration = between(45, 75) * 1000;
    const animation = this.spawn(
      cloud,
      [
        { transform: `translate(${-width}px, ${y}px)`, opacity: 0 },
        { opacity: peak, offset: 0.1 },
        { opacity: peak, offset: 0.9 },
        { transform: `translate(${size.width}px, ${y + drift}px)`, opacity: 0 },
      ],
      { duration, easing: 'linear' },
    );
    animation.currentTime = duration * progress;
  }

  /** Usually a single bird, sometimes a small flock, crossing the map on a gentle curve. */
  private birds(): void {
    const size = this.size();
    if (!size) {
      return;
    }
    const count = Math.random() < 0.7 ? 1 : Math.floor(between(2, 5));
    const leftToRight = Math.random() < 0.5;
    const startY = size.height * between(0.1, 0.8);
    const endY = startY + size.height * between(-0.3, 0.3);
    const bow = size.height * between(-0.15, 0.15);
    const duration = between(14, 24) * 1000;
    for (let i = 0; i < count; i++) {
      const offsetX = i * between(26, 40) * (leftToRight ? -1 : 1);
      const offsetY = i === 0 ? 0 : between(-30, 30);
      this.bird(size.width, startY + offsetY, endY + offsetY, bow, leftToRight, offsetX, duration, i * 120);
    }
  }

  private bird(
    width: number,
    startY: number,
    endY: number,
    bow: number,
    leftToRight: boolean,
    offsetX: number,
    duration: number,
    delay: number,
  ): void {
    const span = between(18, 28);
    const bird = this.document.createElement('div');
    bird.style.width = `${span}px`;
    bird.style.height = `${span / 2}px`;
    bird.style.filter = 'drop-shadow(10px 18px 3px rgba(0, 0, 0, 0.18))';
    const svg = this.document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 40 20');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    const wings: SVGPathElement[] = [];
    for (const d of ['M20 10 Q13 2 2 5 Q11 7 20 12Z', 'M20 10 Q27 2 38 5 Q29 7 20 12Z']) {
      const wing = this.document.createElementNS(SVG, 'path');
      wing.setAttribute('d', d);
      wing.setAttribute('fill', '#2a2a2a');
      wing.style.transformOrigin = '20px 10px';
      wings.push(wing);
      svg.append(wing);
    }
    bird.append(svg);

    const fromX = (leftToRight ? -span * 2 : width + span * 2) + offsetX;
    const toX = (leftToRight ? width + span * 2 : -span * 2) + offsetX;
    const steps = 6;
    const keyframes: Keyframe[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = fromX + (toX - fromX) * t;
      const y = startY + (endY - startY) * t + bow * Math.sin(Math.PI * t);
      keyframes.push({ transform: `translate(${x}px, ${y}px)`, opacity: s === 0 || s === steps ? 0 : 0.85 });
    }
    const flight = this.spawn(bird, keyframes, { duration, delay, easing: 'linear' });

    // Flapping with short glides: wings fold up and down, then hold still for a moment.
    const flap = between(260, 360);
    for (const wing of wings) {
      wing.animate(
        [
          { transform: 'scaleY(1)' },
          { transform: 'scaleY(-0.7)', offset: 0.15 },
          { transform: 'scaleY(1)', offset: 0.3 },
          { transform: 'scaleY(-0.7)', offset: 0.45 },
          { transform: 'scaleY(1)', offset: 0.6 },
          { transform: 'scaleY(0.85)' },
        ],
        { duration: flap * 6, iterations: Infinity, easing: 'ease-in-out' },
      );
    }
    const stopFlapping = () => bird.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    flight.finished.then(stopFlapping, stopFlapping);
  }

  /** One leaf (now and then two or three) tumbling down and swaying, fading out near the bottom. */
  private leaf(): void {
    const size = this.size();
    if (!size) {
      return;
    }
    const count = Math.random() < 0.75 ? 1 : Math.floor(between(2, 4));
    for (let i = 0; i < count; i++) {
      this.singleLeaf(size.width, size.height, i * between(600, 2000));
    }
  }

  private singleLeaf(width: number, height: number, delay: number): void {
    const leafWidth = between(12, 20);
    const leaf = this.document.createElement('div');
    leaf.style.width = `${leafWidth}px`;
    leaf.style.height = `${leafWidth * 1.5}px`;
    leaf.style.filter = 'drop-shadow(6px 10px 2px rgba(0, 0, 0, 0.2))';
    leaf.innerHTML =
      `<svg viewBox="0 0 20 30" width="100%" height="100%" style="display:block">` +
      `<path d="M10 1 C19 8 18 21 10 29 C2 21 1 8 10 1Z" fill="${pick(LEAF_COLOURS)}"/>` +
      `<path d="M10 4 V28" stroke="rgba(0,0,0,0.3)" stroke-width="1" fill="none"/></svg>`;

    const startX = width * between(0.05, 0.95);
    const wind = between(-0.15, 0.25) * width;
    const sway = between(25, 60);
    const fall = height * between(0.55, 1.05);
    const startY = -40;
    let turn = between(0, 360);
    const spin = between(-120, 120);
    const steps = 8;
    const keyframes: Keyframe[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = startX + wind * t + sway * Math.sin(t * Math.PI * 3);
      const y = startY + fall * t;
      turn += spin + 40 * Math.sin(t * Math.PI * 3);
      const opacity = s === 0 ? 0 : s === steps ? 0 : 0.95;
      keyframes.push({ transform: `translate(${x}px, ${y}px) rotate(${turn}deg)`, opacity });
    }
    this.spawn(leaf, keyframes, { duration: between(9, 15) * 1000, delay, easing: 'ease-in-out' });
  }

  /** A short snow shower: flakes for 20–40 seconds, thickening and thinning out again. */
  private snowFlurry(): void {
    const length = between(20, 40);
    const wind = between(-60, 120);
    const started = performance.now();
    const next = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed > length) {
        return;
      }
      // Busiest in the middle of the shower.
      const intensity = Math.sin(Math.PI * (elapsed / length));
      this.flake(wind);
      this.after(between(0.08, 0.25) / Math.max(intensity, 0.15), next);
    };
    next();
  }

  private flake(wind: number): void {
    const size = this.size();
    if (!size) {
      return;
    }
    const diameter = between(2, 6);
    const flake = this.document.createElement('div');
    flake.style.width = `${diameter}px`;
    flake.style.height = `${diameter}px`;
    flake.style.borderRadius = '50%';
    flake.style.background = '#fff';
    flake.style.boxShadow = '0 0 3px rgba(255, 255, 255, 0.8)';
    if (diameter > 4.5) {
      flake.style.filter = 'blur(1px)';
    }
    const startX = between(-0.1, 1) * size.width;
    const sway = between(10, 35);
    const phase = between(0, Math.PI * 2);
    const steps = 6;
    const keyframes: Keyframe[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = startX + wind * t + sway * Math.sin(phase + t * Math.PI * 2);
      const y = -10 + (size.height + 20) * t;
      keyframes.push({ transform: `translate(${x}px, ${y}px)`, opacity: s === 0 ? 0 : s === steps ? 0 : 0.9 });
    }
    // Bigger flakes are "closer" and fall faster.
    const duration = (14 - diameter * 1.2 + between(-1.5, 1.5)) * 1000;
    this.spawn(flake, keyframes, { duration, easing: 'linear' });
  }
}
