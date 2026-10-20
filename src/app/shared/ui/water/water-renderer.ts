/**
 * Animated water behind a map image with transparent sea.
 * The image's alpha channel is turned into a distance-to-coast field, which the shader uses for
 * depth colour, waves rolling towards the shore and surf foam. If WebGL is unavailable the
 * canvas keeps its CSS fallback (the `ui-water` class).
 */

const FIELD_SIZE = 768;
const CANVAS_SIZE = 1280;
/** Distance (as a fraction of the longest image side) at which the water counts as fully deep. */
const DEPTH_CAP = 0.3;
const LAND_ALPHA = 128;
const TIME_OFFSET = 20;

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uField;
uniform float uTime;
uniform vec2 uScale;

const float CAP = ${DEPTH_CAP.toFixed(3)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vUv * uScale;
  float t = uTime;
  float d = texture2D(uField, vUv).r * CAP;

  // Wobble the distance so coast-following lines are organic instead of mechanical.
  float n = fbm(p * 7.0 + vec2(t * 0.03, -t * 0.02));
  float dw = d + (n - 0.5) * 0.018;

  // Depth: turquoise shallows, blue middle, dark deep sea.
  vec3 shallow = vec3(0.47, 0.84, 0.80);
  vec3 mid = vec3(0.15, 0.55, 0.75);
  vec3 deep = vec3(0.04, 0.18, 0.40);
  vec3 col = mix(shallow, mid, smoothstep(0.0, 0.08, dw));
  col = mix(col, deep, smoothstep(0.07, 0.3, dw));

  // Slow broad swells.
  col *= 0.9 + 0.2 * fbm(p * 3.0 + vec2(t * 0.02, t * 0.015));

  // Light caustics on the sea floor, only visible in the shallows.
  float c = noise(p * 60.0 + vec2(t * 0.25, -t * 0.2)) * noise(p * 45.0 - vec2(t * 0.18, t * 0.22));
  col += vec3(0.35, 0.5, 0.45) * smoothstep(0.18, 0.4, c) * (1.0 - smoothstep(0.0, 0.08, dw)) * 0.5;

  // Swell lines that follow the coast and roll towards the shore.
  float phase = dw * 105.0 + t * 0.8 + n * 3.0;
  float crest = pow(0.5 + 0.5 * sin(phase), 4.0);
  float fade = 1.0 - smoothstep(0.03, 0.26, d);
  col = mix(col, vec3(0.85, 0.95, 0.97), crest * fade * 0.5);

  // Surf foam hugging the shoreline, pulsing in and out and broken up into lace.
  float edge = 0.010 + 0.006 * sin(t * 0.9 + n * 8.0);
  float foam = 1.0 - smoothstep(edge, edge + 0.012, dw);
  float lace = smoothstep(0.35, 0.6, noise(p * 90.0 + t * 0.1));
  foam *= mix(1.0, lace, smoothstep(0.0, 0.012, dw));
  col = mix(col, vec3(0.97, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.9);

  // Sun glints.
  // Fine ripples drifting across the surface.
  float ripple = sin((p.x * 70.0 + p.y * 40.0) + fbm(p * 12.0 + t * 0.1) * 9.0 + t * 0.7);
  col += vec3(0.5) * smoothstep(0.7, 1.0, ripple) * 0.06;

  gl_FragColor = vec4(col, 1.0);
}`;

interface Field {
  data: Uint8Array;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

export class WaterRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private frame = 0;
  private token = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async load(url: string): Promise<void> {
    const token = ++this.token;
    this.release();
    const image = await loadImage(url);
    if (!image || token !== this.token) {
      return;
    }
    const field = buildField(image);
    if (field && this.setup(field)) {
      this.canvas.classList.remove('ui-water');
      this.run();
    }
  }

  destroy(): void {
    this.token++;
    this.release();
  }

  private setup(field: Field): boolean {
    const scale = Math.min(1, CANVAS_SIZE / Math.max(field.imageWidth, field.imageHeight));
    this.canvas.width = Math.max(1, Math.round(field.imageWidth * scale));
    this.canvas.height = Math.max(1, Math.round(field.imageHeight * scale));
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) {
      return false;
    }
    const program = createProgram(gl);
    if (!program) {
      return false;
    }
    this.gl = gl;
    this.program = program;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.useProgram(program);
    const longest = Math.max(field.imageWidth, field.imageHeight);
    gl.uniform2f(gl.getUniformLocation(program, 'uScale'), field.imageWidth / longest, field.imageHeight / longest);
    gl.uniform1i(gl.getUniformLocation(program, 'uField'), 0);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    return true;
  }

  private run(): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) {
      return;
    }
    const time = gl.getUniformLocation(program, 'uTime');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const draw = (): void => {
      if (this.gl !== gl) {
        return;
      }
      gl.uniform1f(time, still ? TIME_OFFSET : (performance.now() - start) / 1000 + TIME_OFFSET);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still) {
        this.frame = requestAnimationFrame(draw);
      }
    };
    draw();
  }

  private release(): void {
    cancelAnimationFrame(this.frame);
    const gl = this.gl;
    if (gl) {
      gl.deleteTexture(this.texture);
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(this.program);
    }
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.buffer = null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) {
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/** Red = distance from land (0..DEPTH_CAP of the longest side), green = land coverage. */
function buildField(image: HTMLImageElement): Field | null {
  const imageWidth = image.naturalWidth;
  const imageHeight = image.naturalHeight;
  if (!imageWidth || !imageHeight) {
    return null;
  }
  const scale = Math.min(1, FIELD_SIZE / Math.max(imageWidth, imageHeight));
  const width = Math.max(1, Math.round(imageWidth * scale));
  const height = Math.max(1, Math.round(imageHeight * scale));
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const context = surface.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, width, height);
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  const INF = 1e20;
  const squared = new Float32Array(width * height);
  const land = new Uint8Array(width * height);
  for (let i = 0; i < land.length; i++) {
    const isLand = pixels[i * 4 + 3] >= LAND_ALPHA;
    land[i] = isLand ? 255 : 0;
    squared[i] = isLand ? 0 : INF;
  }
  distanceTransform(squared, width, height);

  const capPixels = DEPTH_CAP * Math.max(width, height);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < land.length; i++) {
    data[i * 4] = Math.min(255, Math.round((Math.sqrt(squared[i]) / capPixels) * 255));
    data[i * 4 + 1] = land[i];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height, imageWidth, imageHeight };
}

/** Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in place. */
function distanceTransform(grid: Float32Array, width: number, height: number): void {
  const size = Math.max(width, height);
  const line = new Float32Array(size);
  const out = new Float32Array(size);
  const hull = new Int32Array(size);
  const bounds = new Float32Array(size + 1);

  const run = (count: number): void => {
    let k = 0;
    hull[0] = 0;
    bounds[0] = -Infinity;
    bounds[1] = Infinity;
    for (let q = 1; q < count; q++) {
      let s = 0;
      while (true) {
        const v = hull[k];
        s = (line[q] + q * q - (line[v] + v * v)) / (2 * q - 2 * v);
        if (s <= bounds[k] && k > 0) {
          k--;
        } else {
          break;
        }
      }
      k++;
      hull[k] = q;
      bounds[k] = s;
      bounds[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < count; q++) {
      while (bounds[k + 1] < q) {
        k++;
      }
      const v = hull[k];
      out[q] = (q - v) * (q - v) + line[v];
    }
  };

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      line[y] = grid[y * width + x];
    }
    run(height);
    for (let y = 0; y < height; y++) {
      grid[y * width + x] = out[y];
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      line[x] = grid[y * width + x];
    }
    run(width);
    for (let x = 0; x < width; x++) {
      grid[y * width + x] = out[x];
    }
  }
}
