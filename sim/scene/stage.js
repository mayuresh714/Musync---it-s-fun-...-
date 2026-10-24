// Renderer, post-processing and the shared lit-surface shader.
//
// Every venue surface and every person uses LIGHT_GLSL: one shader chunk that
// accumulates the light pools of the strongest fixtures (up to MAX_FIXTURE_LIGHTS)
// plus static "practical" lights (lamp posts, bulbs, bar glow), then applies a haze
// fog that is tinted by the light currently in the air. That tint is what makes a
// beam-filled room glow the colour of its lights, as it does in real haze.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const MAX_LIGHTS = 120;
export const MAX_FIXTURE_LIGHTS = 88; // the rest is reserved for practicals

const vec3Array = (n, v = [0, 0, 0]) => Array.from({ length: n }, () => new THREE.Vector3(...v));

export const surfaceUniforms = {
  uCount: { value: 0 },
  uCountHi: { value: 0 }, // strongest fixture lights + practicals: all a person needs
  uLPos: { value: vec3Array(MAX_LIGHTS) },
  uLDir: { value: vec3Array(MAX_LIGHTS, [0, -1, 0]) },
  uLCol: { value: vec3Array(MAX_LIGHTS) },
  uLCone: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector2(0.9, 0.95)) },
  uFill: { value: new THREE.Vector3() },
  uAmbientCol: { value: new THREE.Vector3(0.006, 0.008, 0.016) },
  uFogCol: { value: new THREE.Vector3(0.004, 0.005, 0.01) },
  uFogDen: { value: 0.01 },
  uSurr: { value: 0.4 }, // how bright the surroundings are (practical lamps, glowing signs); set from the Look panel
};

export const LIGHT_GLSL = /* glsl */ `
  uniform int uCount; uniform int uCountHi;
  uniform vec3 uLPos[MAXL]; uniform vec3 uLDir[MAXL]; uniform vec3 uLCol[MAXL]; uniform vec2 uLCone[MAXL];
  uniform vec3 uFill; uniform vec3 uAmbientCol; uniform vec3 uFogCol; uniform float uFogDen;
  vec3 lightAt(vec3 W, vec3 n, vec3 V, float sheen, int count, out vec3 spec) {
    vec3 acc = uAmbientCol * (0.55 + 0.45 * n.y) + uFill;
    spec = vec3(0.0);
    for (int i = 0; i < MAXL; i++) {
      if (i >= count) break;
      vec3 L = W - uLPos[i];
      float d = length(L);
      L /= d;
      float cone = smoothstep(uLCone[i].x, uLCone[i].y, dot(L, uLDir[i]));
      if (cone <= 0.0) continue;
      float lam = max(0.0, dot(n, -L));
      // wrap lighting keeps faces turned slightly away from a light from going dead black
      lam = mix(lam, max(0.0, dot(n, -L) * 0.5 + 0.5), 0.25);
      vec3 c = uLCol[i] * cone / (1.0 + 0.025 * d * d);
      acc += c * lam;
      if (sheen > 0.0) spec += c * sheen * pow(max(0.0, dot(reflect(L, n), V)), 24.0);
    }
    return acc;
  }
  vec3 applyFog(vec3 c, vec3 W) {
    float f = 1.0 - exp(-uFogDen * length(cameraPosition - W));
    return c * (1.0 - f) + uFogCol * f;
  }
`;

export function surfaceMaterial(albedo, { sheen = 0, map = null, mapScale = 0.1, mapMix = 1, side = THREE.FrontSide, emissive = null, uv = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...surfaceUniforms,
      uAlbedo: { value: new THREE.Color(albedo) },
      uSheen: { value: sheen },
      uMap: { value: map },
      uMapScale: { value: mapScale },
      uMapMix: { value: map ? mapMix : 0 },
      uEmissive: { value: emissive ? new THREE.Color(emissive) : new THREE.Color(0) },
    },
    defines: uv ? { MAXL: MAX_LIGHTS, UVMAP: 1 } : { MAXL: MAX_LIGHTS },
    side,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN; varying vec3 vTint; varying vec2 vUv;
      void main() {
        mat4 M = modelMatrix;
        vTint = vec3(1.0);
        vUv = uv;
        #ifdef USE_INSTANCING
          M = modelMatrix * instanceMatrix;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        vec4 w = M * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(M) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAlbedo; uniform float uSheen; uniform sampler2D uMap; uniform float uMapScale; uniform float uMapMix; uniform vec3 uEmissive; uniform float uSurr;
      varying vec3 vW; varying vec3 vN; varying vec3 vTint; varying vec2 vUv;
      ${LIGHT_GLSL}
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vW);
        vec3 albedo = uAlbedo * vTint;
        #ifdef UVMAP
          if (uMapMix > 0.0) albedo *= mix(vec3(1.0), texture2D(uMap, vUv).rgb, uMapMix);
        #else
          if (uMapMix > 0.0) albedo *= mix(vec3(1.0), texture2D(uMap, vW.xz * uMapScale).rgb, uMapMix);
        #endif
        vec3 spec;
        vec3 lit = lightAt(vW, n, V, uSheen, uCount, spec);
        vec3 col = albedo * lit + spec + uEmissive * uSurr;
        gl_FragColor = vec4(applyFog(col, vW), 1.0);
      }`,
  });
}

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio)); // adaptive quality takes it from here
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.7, 0.6, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const setPixelRatio = (pr) => { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(container.clientWidth, container.clientHeight); };
  return { renderer, scene, camera, controls, composer, bloom, setPixelRatio };
}

// Static lights that belong to the venue (lamp posts, bulb strings, bar glow).
// Written after the fixture pools so fixtures always win the slots they need.
export const practicals = [];
export function setPracticals(list) {
  practicals.length = 0;
  practicals.push(...list);
}
export function practical(pos, rgb, { reach = 1, dir = [0, -1, 0], cone = null } = {}) {
  // omni unless a cone (cosOuter, cosInner) is given
  return { pos: new THREE.Vector3(...pos), dir: new THREE.Vector3(...dir).normalize(), col: rgb.map((v) => v * reach), cosOuter: cone ? cone[0] : -1.01, cosInner: cone ? cone[1] : -1.0 };
}

let practicalK = 0.4;
export function setSurroundings(k) { practicalK = k; surfaceUniforms.uSurr.value = k; }

export function writeSurfaceLights(fixtureLights, fill) {
  const U = surfaceUniforms;
  const K = 40; // people and other busy shading only evaluate these plus the practicals
  const nf = Math.min(MAX_FIXTURE_LIGHTS, fixtureLights.length);
  let n = 0;
  const put = (L, k = 1) => {
    U.uLPos.value[n].copy(L.pos);
    U.uLDir.value[n].copy(L.dir);
    U.uLCol.value[n].set(L.col[0] * k, L.col[1] * k, L.col[2] * k);
    U.uLCone.value[n].set(L.cosOuter, L.cosInner);
    n++;
  };
  for (let i = 0; i < Math.min(K, nf); i++) put(fixtureLights[i]);
  for (const P of practicals) if (n < MAX_LIGHTS) put(P, practicalK);
  U.uCountHi.value = n;
  for (let i = K; i < nf && n < MAX_LIGHTS; i++) put(fixtureLights[i]);
  U.uCount.value = n;
  U.uFill.value.copy(fill);
}

// Haze in the air takes on the colour of the light inside it.
export function setHaze({ base, density, tint, amount }) {
  const U = surfaceUniforms;
  U.uFogDen.value = density;
  U.uFogCol.value.set(base[0] + tint[0] * amount, base[1] + tint[1] * amount, base[2] + tint[2] * amount);
}

// ---------- geometry helpers ----------

export function cyl(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}

// Box-section truss (4 chords + zig-zag lacing) between two points.
export function trussGeometry(a, b, size = 0.3) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const s1 = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(size / 2);
  const s2 = new THREE.Vector3().crossVectors(dir, s1).normalize().multiplyScalar(size / 2);
  const corners = [s1.clone().add(s2), s1.clone().sub(s2), s1.clone().negate().sub(s2), s1.clone().negate().add(s2)];
  const geos = [];
  for (const c of corners) geos.push(cyl(A.clone().add(c).toArray(), B.clone().add(c).toArray(), 0.024));
  const step = size * 1.6;
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) {
    const p0 = A.clone().addScaledVector(dir, i * step), p1 = A.clone().addScaledVector(dir, Math.min(len, (i + 1) * step));
    for (let k = 0; k < 4; k++) {
      const c0 = corners[k], c1 = corners[(k + 1) % 4];
      geos.push(cyl(p0.clone().add(i % 2 ? c0 : c1).toArray(), p1.clone().add(i % 2 ? c1 : c0).toArray(), 0.012));
    }
  }
  return mergeGeometries(geos);
}

export function mergeTruss(list, size = 0.3) {
  return mergeGeometries(list.map(([a, b]) => trussGeometry(a, b, size)));
}
