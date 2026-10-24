// Crowd and performers.
//
// People are modelled at real proportions (nominal 1.70 m, scaled 1.50–1.90 m per
// person) from tapered limb segments, and posed entirely in the vertex shader from
// the song's beat position and energy, so thousands move in time on the GPU.
//
// Behaviours (uMode):
//   0 concert  standing; sway, jump on beat when energy is high, hands up, phones in slow parts
//   1 club     groove: hip sway, alternating arms
//   2 garba    sidestep around a ring, two-clap on every beat
//   3 dandiya  ring dance with sticks striking on the beat
//   4 stage    performers: singer, DJ, guitarist, drummer, dhol, keys
//   5 watcher  people at the edge: weight shift, soft claps, phones
//
// What is stylised: faces are featureless, clothing is simple colour blocks, limbs are
// rigid segments (no cloth sim, hands are spheres). Proportions, scale, density and
// motion timing are what is meant to be believable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfaceUniforms, MAX_LIGHTS, LIGHT_GLSL } from './stage.js';

const PART = { TORSO: 0, UARM_L: 1, FARM_L: 2, UARM_R: 3, FARM_R: 4, HEAD: 5, LEG_L: 6, LEG_R: 7, SKIRT: 8 };
const MAT = { SKIN: 0, TOP: 1, BOTTOM: 2, HAIR: 3, ACC: 4, DARK: 5, STICK: 6, PHONE: 7 };
// tag: which instance flag shows this piece. 0 always, 1 long hair, 2 turban, 3 dupatta (F) / kurta (M), 4 phone, 5 sticks
const TAG = { ALWAYS: 0, LONGHAIR: 1, TURBAN: 2, DUPATTA: 3, PHONE: 4, STICKS: 5 };

function tag(geo, part, mat, t = 0) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const fill = (v) => new THREE.BufferAttribute(new Float32Array(n).fill(v), 1);
  geo.setAttribute('aPart', fill(part));
  geo.setAttribute('aMat', fill(mat));
  geo.setAttribute('aTag', fill(t));
  return geo;
}

function ellipsoid(c, r, part, mat, t = 0, rotX = 0) {
  const g = new THREE.SphereGeometry(1, 8, 6);
  g.scale(r[0], r[1], r[2]);
  if (rotX) g.rotateX(rotX);
  g.translate(c[0], c[1], c[2]);
  return tag(g, part, mat, t);
}

// tapered limb from p0 (radius r0) to p1 (radius r1); flat = [sx, sz] squashes the cross-section
function limb(p0, p1, r0, r1, part, mat, t = 0, flat = [1, 1]) {
  const A = new THREE.Vector3(...p0), B = new THREE.Vector3(...p1);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r0, r1, len, 8, 1, false);
  g.scale(flat[0], 1, flat[1]);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), A.clone().sub(B).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return tag(g, part, mat, t);
}

function box(c, s, part, mat, t = 0, rot = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(...s);
  g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]);
  g.translate(...c);
  return tag(g, part, mat, t);
}

// variant 'F': chaniya-style flared skirt (garba); 'M': trousers + short kurta; 'W': trousers/jeans with a narrower build (women outside garba)
export function humanGeometry(variant) {
  const P = [];
  const F = variant === 'F';
  const W = variant === 'W';
  for (const s of [-1, 1]) {
    const part = s < 0 ? PART.LEG_L : PART.LEG_R;
    if (!F) {
      P.push(limb([s * 0.09, 0.93, 0], [s * 0.095, 0.5, 0.01], 0.085, 0.062, part, MAT.BOTTOM));
      P.push(limb([s * 0.095, 0.5, 0.01], [s * 0.09, 0.09, 0], 0.058, 0.042, part, MAT.BOTTOM));
    } else {
      P.push(limb([s * 0.08, 0.2, 0], [s * 0.085, 0.07, 0], 0.04, 0.034, part, MAT.SKIN)); // ankles under the hem
    }
    P.push(box([s * 0.09, 0.035, 0.06], [0.095, 0.07, 0.26], part, MAT.DARK)); // shoe
  }
  P.push(ellipsoid([0, 0.97, 0], [F || W ? 0.15 : 0.17, 0.09, 0.11], PART.TORSO, MAT.BOTTOM));
  // torso (choli / shirt)
  P.push(limb([0, 1.41, 0], [0, 0.98, 0], F || W ? 0.155 : 0.185, F || W ? 0.135 : 0.15, PART.TORSO, MAT.TOP, 0, [1.12, 0.68]));
  P.push(limb([0, 1.5, 0], [0, 1.4, 0], 0.05, 0.057, PART.TORSO, MAT.SKIN));
  // head, hair, face-forward nose bump gives the head a readable direction
  P.push(ellipsoid([0, 1.6, 0.005], [0.093, 0.115, 0.104], PART.HEAD, MAT.SKIN));
  P.push(ellipsoid([0, 1.6, 0.1], [0.016, 0.022, 0.02], PART.HEAD, MAT.SKIN));
  const cap = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.56);
  cap.scale(0.103, 0.115, 0.112);
  cap.rotateX(-0.3);
  cap.translate(0, 1.625, -0.012);
  P.push(tag(cap, PART.HEAD, MAT.HAIR));
  P.push(ellipsoid([0, 1.585, -0.032], [0.101, 0.112, 0.088], PART.HEAD, MAT.HAIR));
  P.push(limb([0, 1.66, -0.085], [0, 1.2, -0.115], 0.075, 0.05, PART.HEAD, MAT.HAIR, TAG.LONGHAIR, [1, 0.55]));
  P.push(ellipsoid([0, 1.678, 0], [0.128, 0.085, 0.132], PART.HEAD, MAT.ACC, TAG.TURBAN));
  // arms: sleeve upper arm, bare forearm, hand
  for (const s of [-1, 1]) {
    const up = s < 0 ? PART.UARM_L : PART.UARM_R, fa = s < 0 ? PART.FARM_L : PART.FARM_R;
    P.push(ellipsoid([s * 0.2, 1.39, 0], [0.062, 0.062, 0.062], up, MAT.TOP));
    P.push(limb([s * 0.2, 1.39, 0], [s * 0.215, 1.13, 0], 0.056, 0.046, up, MAT.TOP));
    P.push(ellipsoid([s * 0.215, 1.13, 0], [0.047, 0.047, 0.047], fa, MAT.SKIN));
    P.push(limb([s * 0.215, 1.13, 0], [s * 0.225, 0.89, 0.015], 0.044, 0.032, fa, MAT.SKIN));
    P.push(ellipsoid([s * 0.227, 0.85, 0.025], [0.042, 0.058, 0.036], fa, MAT.SKIN));
    // dandiya: one stick per hand, pointing forward
    const stick = new THREE.CylinderGeometry(0.011, 0.011, 0.42, 6);
    stick.rotateX(Math.PI / 2);
    stick.translate(s * 0.227, 0.86, 0.2);
    P.push(tag(stick, fa, MAT.STICK, TAG.STICKS));
  }
  // phone held up in the right hand (concert)
  P.push(box([0.227, 0.9, 0.065], [0.07, 0.145, 0.012], PART.FARM_R, MAT.PHONE, TAG.PHONE));
  if (F) {
    // flared skirt with a contrasting hem band, and a dupatta across the chest and down the back
    const skirt = new THREE.CylinderGeometry(0.17, 0.56, 0.9, 16, 1, true);
    skirt.translate(0, 0.56, 0);
    P.push(tag(skirt, PART.SKIRT, MAT.BOTTOM));
    const hem = new THREE.CylinderGeometry(0.535, 0.565, 0.1, 16, 1, true);
    hem.translate(0, 0.17, 0);
    P.push(tag(hem, PART.SKIRT, MAT.ACC));
    P.push(box([0, 1.0, -0.12], [0.36, 0.72, 0.012], PART.TORSO, MAT.ACC, TAG.DUPATTA));
    P.push(box([0.02, 1.2, 0.105], [0.085, 0.6, 0.012], PART.TORSO, MAT.ACC, TAG.DUPATTA, [0, 0, 0.55]));
  } else if (!W) {
    // kurta/kediyu skirt of the shirt, hip length
    const kurta = new THREE.CylinderGeometry(0.17, 0.215, 0.4, 12, 1, true);
    kurta.translate(0, 0.84, 0);
    P.push(tag(kurta, PART.TORSO, MAT.TOP, TAG.DUPATTA));
  }
  return mergeGeometries(P);
}

// ---------- shaders ----------

const VERT = /* glsl */ `
  attribute float aPart; attribute float aMat; attribute float aTag;
  attribute vec3 aPos;      // world x, base height, world z (ring centre in ring modes)
  attribute vec4 aRing;     // radius, start angle, direction (+1/-1), speed scale | role in stage mode (.w)
  attribute vec4 aLook;     // height scale, seed 0..1, hair shade, yaw
  attribute vec3 aTop; attribute vec3 aBot; attribute vec3 aSkin; attribute vec3 aAcc;
  attribute vec4 aFlags;    // long hair, turban, dupatta/kurta, 1 phone | 2 sticks
  uniform float uT; uniform float uBP; uniform float uEnergy; uniform float uBPM; uniform float uMode;
  uniform float uPhoneOn; uniform float uSilence;
  varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vEmit; varying float vMat;

  const float PI = 3.14159265;
  vec3 rotX(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c) + o; }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
  vec3 rotZ(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z) + o; }
  float pulse(float f, float k) { return exp(-f * k); }

  void main() {
    float seed = aLook.y;
    float ph = seed * 6.2831;
    float bp = uBP + seed * 0.12;
    float f = fract(bp);
    float en = uEnergy;
    // visibility of optional pieces
    bool hidden = false;
    if (aTag > 0.5 && aTag < 1.5 && aFlags.x < 0.5) hidden = true;
    if (aTag > 1.5 && aTag < 2.5 && aFlags.y < 0.5) hidden = true;
    if (aTag > 2.5 && aTag < 3.5 && aFlags.z < 0.5) hidden = true;
    if (aTag > 3.5 && aTag < 4.5 && abs(aFlags.w - 1.0) > 0.5) hidden = true;
    if (aTag > 4.5 && aTag < 5.5 && abs(aFlags.w - 2.0) > 0.5) hidden = true;

    vec3 p = position;
    float armL = 0.0, armR = 0.0;    // shoulder pitch (forward positive)
    float abL = 0.0, abR = 0.0;      // abduction (outward positive)
    float elL = 0.0, elR = 0.0;      // elbow bend
    float bob = 0.0, lean = 0.0, nod = 0.0, swing = 0.0, twist = 0.0;
    float mode = uMode;
    float hype = smoothstep(0.5, 0.9, en);

    if (mode < 0.5) {
      // CONCERT
      float style = seed;
      float jump = hype * 0.14 * abs(sin(PI * bp));
      bob = jump + (1.0 - hype) * 0.012 * sin(PI * bp + ph);
      lean = 0.035 * sin(PI * 0.5 * bp + ph) * (1.0 - hype * 0.5);
      nod = hype * 0.18 * sin(PI * bp) * (seed > 0.5 ? 1.0 : 0.5);
      if (style < 0.34 && en > 0.45) {
        // hands up, pumping on the beat
        float pump = 0.18 * sin(PI * 2.0 * bp);
        armL = 2.55 + pump; armR = 2.55 - pump; abL = 0.28; abR = 0.28; elL = 0.3; elR = 0.3;
      } else if (style < 0.5 && aFlags.w > 0.5 && uPhoneOn > 0.5) {
        armR = 2.35; elR = 0.5; abR = 0.1; armL = 0.12; // phone up
      } else if (style < 0.62 && en > 0.6) {
        float clap = pulse(f, 7.0);
        armL = 2.3 + 0.3 * clap; armR = armL; abL = -0.05 + 0.5 * (1.0 - clap); abR = abL; elL = 0.9 * clap; elR = elL;
      } else {
        armL = 0.12 + 0.06 * sin(PI * bp + ph); armR = armL; elL = 0.2; elR = 0.2;
      }
      swing = 0.05 * sin(PI * bp + ph);
    } else if (mode < 1.5) {
      // CLUB
      bob = 0.03 + 0.035 * abs(sin(PI * bp + ph * 0.1)) * (0.5 + hype);
      lean = 0.07 * sin(PI * 0.5 * bp + ph);
      twist = 0.22 * sin(PI * 0.5 * bp + ph);
      float a = sin(PI * bp);
      if (seed < 0.4 && en > 0.62) { armL = 2.2 + 0.5 * a; armR = 2.2 - 0.5 * a; abL = 0.4; abR = 0.4; elL = 0.5; elR = 0.5; }
      else { armL = 0.9 + 0.5 * a; armR = 0.9 - 0.5 * a; elL = 1.2; elR = 1.2; abL = 0.15; abR = 0.15; }
      swing = 0.25 * sin(PI * bp);
    } else if (mode < 3.5) {
      // GARBA / DANDIYA: two-clap on every beat, step side to side
      float step = sin(PI * bp);
      bob = 0.03 * abs(step) + 0.018 * pulse(f, 6.0);
      lean = 0.05 * step;
      swing = 0.35 * step;
      nod = 0.05 * step;
      float ex = 0.6 + 0.4 * smoothstep(0.2, 0.7, en);
      if (mode < 2.5) {
        // clap: hands meet in front of the chest on the beat, open out between
        float open = smoothstep(0.0, 0.55, f) * (1.0 - smoothstep(0.55, 1.0, f));
        float up = 0.9 + 0.5 * hype;
        float lift = hype * 0.9 * smoothstep(0.0, 0.5, f) * (1.0 - smoothstep(0.5, 1.0, f));
        armL = 1.15 + lift; armR = armL; elL = 1.0 - 0.4 * open; elR = elL;
        abL = -0.32 + 1.05 * open * ex; abR = abL;
        if (seed > 0.8) { armL = 2.4; armR = 2.4 + 0.1 * step; abL = 0.3; abR = 0.3; elL = 0.2; elR = 0.2; } // arms up, as many do on the faster beats
      } else {
        // dandiya: sticks strike across the body on the beat, swing out between
        float strike = pulse(f, 9.0);
        float side = sin(PI * bp + ph * 0.0);
        armL = 1.25 + 0.2 * strike; armR = 1.25 + 0.2 * strike;
        abL = -0.45 + 1.0 * (1.0 - strike) * ex; abR = -0.45 + 1.0 * (1.0 - strike) * ex * (0.6 + 0.4 * side);
        elL = 0.7; elR = 0.7;
        twist = 0.2 * sin(PI * bp);
      }
    } else if (mode > 4.5) {
      // SPECTATOR at the edge: weight shift, soft clap on the beat, some hold phones up
      float open = smoothstep(0.0, 0.5, f) * (1.0 - smoothstep(0.5, 1.0, f));
      bob = 0.012 * abs(sin(PI * bp + ph));
      lean = 0.03 * sin(PI * 0.5 * bp + ph);
      if (seed < 0.3) { armL = 1.15; armR = 1.15; elL = 1.0; elR = 1.0; abL = -0.3 + 0.55 * open; abR = abL; }
      else if (seed < 0.45 && aFlags.w > 0.5) { armR = 2.3; elR = 0.5; abR = 0.1; armL = 0.1; }
      else { armL = 0.1; armR = 0.1; elL = 0.2; elR = 0.2; }
    } else {
      // STAGE performers; role in aRing.w
      float role = aRing.w;
      float beatNod = sin(PI * bp);
      bob = 0.012 * abs(beatNod) + 0.02 * hype * abs(beatNod);
      nod = 0.1 * beatNod;
      if (role < 1.5) { // singer: mic hand at the mouth, other arm gestures
        armR = 2.0; elR = 2.0; abR = 0.05;
        armL = 0.5 + 0.9 * hype * (0.5 + 0.5 * sin(PI * 0.5 * bp)); abL = 0.5; elL = 0.5;
        lean = 0.04 * sin(PI * 0.5 * bp);
      } else if (role < 2.5) { // DJ: both hands on the decks
        armL = 0.9; armR = 0.9; elL = 1.0; elR = 1.0; abL = 0.0; abR = 0.0;
        armL += 0.1 * sin(PI * 2.0 * bp + 1.0); armR += 0.1 * sin(PI * 2.0 * bp);
        bob += 0.02 * abs(beatNod);
      } else if (role < 3.5) { // guitar/bass: strum
        armR = 0.8 + 0.3 * sin(PI * 4.0 * bp); elR = 1.1; abR = 0.0;
        armL = 1.2; elL = 0.5; abL = 0.0;
        lean = 0.06 * sin(PI * 0.5 * bp);
        swing = 0.12 * sin(PI * bp);
      } else if (role < 4.5) { // drummer: alternating strikes
        float a = pulse(fract(bp * 2.0), 8.0), b = pulse(fract(bp * 2.0 + 0.5), 8.0);
        armL = 0.95 + 0.4 * a; armR = 0.95 + 0.4 * b; elL = 1.1; elR = 1.1; abL = 0.2; abR = 0.2;
      } else if (role < 5.5) { // dhol: strike with stick and hand, strong lean
        float a = pulse(fract(bp), 8.0), b = pulse(fract(bp + 0.5), 8.0);
        armL = 1.0 + 0.5 * a; armR = 0.9 + 0.5 * b; elL = 0.9; elR = 0.9; abL = 0.2; abR = 0.25;
        lean = 0.1 * sin(PI * bp);
      } else { // keys / harmonium
        armL = 1.0 + 0.1 * sin(PI * 2.0 * bp); armR = 1.0; elL = 0.9; elR = 0.9; abL = 0.05; abR = 0.05;
      }
    }
    // everyone drops their arms and stops in a real silence
    if (uSilence > 0.5) { armL = 0.1; armR = 0.1; abL = 0.0; abR = 0.0; elL = 0.2; elR = 0.2; bob = 0.0; swing = 0.0; }

    // ---- apply pose (model space, feet at origin, facing +z) ----
    vec3 SL = vec3(-0.2, 1.39, 0.0), SR = vec3(0.2, 1.39, 0.0);
    vec3 EL = vec3(-0.215, 1.13, 0.0), ER = vec3(0.215, 1.13, 0.0);
    if (aPart > 1.5 && aPart < 2.5) p = rotX(p, EL, -elL);
    if (aPart > 3.5 && aPart < 4.5) p = rotX(p, ER, -elR);
    if (aPart > 0.5 && aPart < 2.5) { p = rotZ(p, SL, -abL); p = rotX(p, SL, -armL); }
    if (aPart > 2.5 && aPart < 4.5) { p = rotZ(p, SR, abR); p = rotX(p, SR, -armR); }
    if (aPart > 5.5 && aPart < 6.5) p = rotX(p, vec3(-0.09, 0.93, 0.0), swing);
    if (aPart > 6.5 && aPart < 7.5) p = rotX(p, vec3(0.09, 0.93, 0.0), -swing);
    if (aPart > 4.5 && aPart < 5.5) p = rotX(p, vec3(0.0, 1.46, 0.0), nod);
    if (p.y > 0.95) p = rotY(p - vec3(0.0, 1.0, 0.0), twist * smoothstep(0.95, 1.4, p.y)) + vec3(0.0, 1.0, 0.0);
    p = rotZ(p, vec3(0.0), lean);
    p.y += bob;
    p *= aLook.x;
    if (hidden) p = vec3(0.0);

    // ---- place in the world ----
    vec3 base = aPos;
    float yaw = aLook.w;
    if (mode > 1.5 && mode < 3.5) {
      float r = aRing.x;
      float speed = 0.3 * (uBPM / 60.0) * aRing.w; // metres per second along the ring
      float a = aRing.y + aRing.z * speed * uT / max(r, 0.5);
      base = vec3(aPos.x + r * sin(a), aPos.y, aPos.z + r * cos(a));
      yaw = a + PI; // face the centre
    }
    vec3 wp = base + rotY(p, yaw);
    vW = wp;
    vN = normalize(rotY(normal, yaw));
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);

    // ---- colour ----
    vMat = aMat;
    vec3 hair = mix(vec3(0.012, 0.009, 0.007), vec3(0.1, 0.055, 0.03), aLook.z);
    vec3 col = aSkin;
    vEmit = 0.0;
    if (aMat > 0.5 && aMat < 1.5) col = aTop;
    else if (aMat > 1.5 && aMat < 2.5) col = aBot;
    else if (aMat > 2.5 && aMat < 3.5) col = hair;
    else if (aMat > 3.5 && aMat < 4.5) col = aAcc;
    else if (aMat > 4.5 && aMat < 5.5) col = vec3(0.025, 0.02, 0.018);
    else if (aMat > 5.5 && aMat < 6.5) col = vec3(0.45, 0.25, 0.1);
    else if (aMat > 6.5) { col = vec3(0.6, 0.8, 1.0); vEmit = 1.0; }
    vCol = col;
  }`;

const FRAG = /* glsl */ `
  varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vEmit; varying float vMat;
  uniform float uPhoneGlow;
  ${LIGHT_GLSL}
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 V = normalize(cameraPosition - vW);
    vec3 spec;
    vec3 lit = lightAt(vW, n, V, 0.12, uCountHi, spec);
    // faint rim so silhouettes against haze and beams stay readable
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    vec3 col = vCol * lit + spec + vCol * rim * (uFogCol * 2.0 + vec3(0.01)) + vCol * vEmit * uPhoneGlow;
    gl_FragColor = vec4(applyFog(col, vW), 1.0);
  }`;

// ---------- crowd builder ----------

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hexLin = (h) => new THREE.Color(h);

const SKIN = ['#8d5a3c', '#a86b45', '#c68863', '#7a4a30', '#b97a57', '#d9a07a', '#6e402b', '#c9906b'];
const GARBA_F = ['#c8102e', '#e8590c', '#f2a900', '#0b8f5a', '#1c5bd8', '#8e24aa', '#d81b60', '#00897b', '#f06292', '#5e35b1', '#ef6c00'];
const GARBA_ACC = ['#ffd54a', '#ffffff', '#ff7043', '#26c6da', '#ec407a', '#ffee58', '#a5d6a7'];
const GARBA_M = ['#f4ecd8', '#f2e2c4', '#e8dcc0', '#1c5bd8', '#c8102e', '#0b8f5a', '#f2a900', '#e8590c', '#ffffff'];
const CASUAL_TOP = ['#101114', '#16181d', '#2a2d34', '#f0f0f0', '#7a1f1f', '#1c3a5e', '#3b3b3b', '#d8d2c4', '#2a4a3a', '#8a8a8a', '#e0a030'];
const CASUAL_BOT = ['#14161c', '#1d2a44', '#2b2f3a', '#0f0f10', '#3a3224', '#1a2030'];
const CLUB_TOP = ['#0c0c10', '#1a1a22', '#c2185b', '#6a1b9a', '#e0e0e0', '#00838f', '#101018', '#8e0000'];

const col3 = (c) => [c.r, c.g, c.b];

export class Crowd {
  constructor() { this.list = []; }
  // spec: { variant:'F'|'M', mode, x, y, z, yaw, ring?:{r,a0,dir,spd}, role?, look:'garba'|'casual'|'club'|'perf', seed }
  add(spec) { this.list.push(spec); }

  static colors(look, variant, r) {
    const skin = hexLin(SKIN[Math.floor(r() * SKIN.length)]);
    let top, bot, acc;
    if (look === 'garba') {
      if (variant === 'F') { bot = hexLin(GARBA_F[Math.floor(r() * GARBA_F.length)]); top = hexLin(GARBA_F[Math.floor(r() * GARBA_F.length)]); acc = hexLin(GARBA_ACC[Math.floor(r() * GARBA_ACC.length)]); }
      else { top = hexLin(GARBA_M[Math.floor(r() * GARBA_M.length)]); bot = hexLin(r() < 0.6 ? '#f0e6d0' : '#222226'); acc = hexLin(GARBA_F[Math.floor(r() * GARBA_F.length)]); }
    } else if (look === 'club') {
      top = hexLin(CLUB_TOP[Math.floor(r() * CLUB_TOP.length)]); bot = variant === 'F' ? hexLin(CLUB_TOP[Math.floor(r() * CLUB_TOP.length)]) : hexLin(CASUAL_BOT[Math.floor(r() * CASUAL_BOT.length)]); acc = top;
    } else if (look === 'perf') {
      top = hexLin(['#111111', '#6b1010', '#14223d', '#f0e6d0'][Math.floor(r() * 4)]); bot = hexLin('#101010'); acc = hexLin('#d9a400');
    } else {
      top = hexLin(CASUAL_TOP[Math.floor(r() * CASUAL_TOP.length)]); bot = variant === 'F' && r() < 0.35 ? hexLin(CASUAL_TOP[Math.floor(r() * CASUAL_TOP.length)]) : hexLin(CASUAL_BOT[Math.floor(r() * CASUAL_BOT.length)]); acc = hexLin('#8a1a1a');
    }
    return { skin, top, bot, acc };
  }

  build() {
    const group = new THREE.Group();
    const uniforms = {
      uT: { value: 0 }, uBP: { value: 0 }, uEnergy: { value: 0.5 }, uBPM: { value: 120 },
      uPhoneOn: { value: 0 }, uSilence: { value: 0 }, uPhoneGlow: { value: 0 },
    };
    const geos = { F: humanGeometry('F'), M: humanGeometry('M'), W: humanGeometry('W') };
    const buckets = new Map();
    for (const s of this.list) {
      const key = `${s.variant === 'F' && s.look !== 'garba' ? 'W' : s.variant}|${s.mode}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(s);
    }
    for (const [key, items] of buckets) {
      const [variant, mode] = key.split('|');
      const n = items.length;
      const g = new THREE.InstancedBufferGeometry();
      const base = geos[variant];
      for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.attributes[name]);
      g.instanceCount = n;
      const A = (size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      const aPos = A(3), aRing = A(4), aLook = A(4), aTop = A(3), aBot = A(3), aSkin = A(3), aAcc = A(3), aFlags = A(4);
      items.forEach((s, i) => {
        const r = rng((s.seed ?? i) * 7919 + 13);
        const wv = s.variant;
        const c = Crowd.colors(s.look || 'casual', wv, r);
        const height = (wv === 'F' ? 1.58 : 1.7) + (r() - 0.5) * 0.2 + (s.tall || 0);
        aPos.setXYZ(i, s.x, s.y || 0, s.z);
        aRing.set([s.ring?.r ?? 0, s.ring?.a0 ?? 0, s.ring?.dir ?? 1, s.ring ? (s.ring.spd ?? 1) : (s.role ?? 0)], i * 4);
        aLook.set([height / 1.7, r(), r(), s.yaw ?? 0], i * 4);
        aTop.set(col3(c.top), i * 3); aBot.set(col3(c.bot), i * 3); aSkin.set(col3(c.skin), i * 3); aAcc.set(col3(c.acc), i * 3);
        const longHair = wv === 'F' ? (r() < 0.75 ? 1 : 0) : (r() < 0.06 ? 1 : 0);
        const turban = s.look === 'garba' && wv === 'M' && r() < 0.18 ? 1 : 0;
        const dup = s.look === 'garba' ? 1 : (s.look === 'perf' ? 0 : (wv === 'M' ? 0 : (r() < 0.1 ? 1 : 0)));
        const hand = s.mode === 3 ? 2 : ((s.mode === 0 || s.mode === 5) && r() < 0.3 ? 1 : 0);
        aFlags.set([longHair, turban, dup, hand], i * 4);
      });
      g.setAttribute('aPos', aPos); g.setAttribute('aRing', aRing); g.setAttribute('aLook', aLook);
      g.setAttribute('aTop', aTop); g.setAttribute('aBot', aBot); g.setAttribute('aSkin', aSkin); g.setAttribute('aAcc', aAcc); g.setAttribute('aFlags', aFlags);
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...surfaceUniforms, ...uniforms, uMode: { value: +mode } },
        defines: { MAXL: MAX_LIGHTS },
        vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    group.userData.count = this.list.length;
    // state: { t, bp, energy, bpm, silence, phones }
    group.userData.update = (s) => {
      uniforms.uT.value = s.t;
      uniforms.uBP.value = s.bp;
      uniforms.uEnergy.value = s.energy;
      uniforms.uBPM.value = s.bpm;
      uniforms.uSilence.value = s.silence ? 1 : 0;
      uniforms.uPhoneOn.value = s.phones ? 1 : 0;
      uniforms.uPhoneGlow.value = s.phones ? 3 : 0;
    };
    return group;
  }
}

// helpers for venues ---------------------------------------------------------

// Jittered grid of standing people in a rectangle; density(z) 0..1 thins the back.
export function standingField(crowd, { x0, x1, z0, z1, spacing = 0.62, density = () => 1, faceTo = [0, 0, -20], look = 'casual', mode = 0, y = 0, seed = 1, fRatio = 0.5 }) {
  const r = rng(seed);
  let k = 0;
  for (let z = z0; z <= z1; z += spacing * 0.9) {
    const row = Math.round((z - z0) / (spacing * 0.9));
    for (let x = x0 + (row % 2) * spacing * 0.5; x <= x1; x += spacing) {
      if (r() > density(z, x)) continue;
      const px = x + (r() - 0.5) * spacing * 0.6, pz = z + (r() - 0.5) * spacing * 0.5;
      const yaw = Math.atan2(faceTo[0] - px, faceTo[2] - pz) + (r() - 0.5) * 0.5;
      crowd.add({ variant: r() < fRatio ? 'F' : 'M', mode, x: px, y, z: pz, yaw, look, seed: seed * 100003 + k++ });
    }
  }
  return k;
}

// Concentric dance rings around (cx, cz).
export function danceRings(crowd, { cx, cz, rMin, rMax, gap = 1.05, arc = 0.85, mode = 2, seed = 1, y = 0, fRatio = 0.62 }) {
  const r = rng(seed);
  let k = 0, ring = 0;
  for (let R = rMin; R <= rMax; R += gap, ring++) {
    const n = Math.floor((2 * Math.PI * R) / arc);
    const dir = mode === 3 && ring % 2 ? -1 : 1; // dandiya: neighbouring rings counter-rotate
    const spd = 1 - 0.25 * ((R - rMin) / Math.max(1, rMax - rMin)); // outer rings move a little slower
    const a0 = r() * 6.28;
    for (let i = 0; i < n; i++) {
      if (r() < 0.06) continue; // gaps
      const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.05;
      const rr = R + (r() - 0.5) * 0.35;
      crowd.add({ variant: r() < fRatio ? 'F' : 'M', mode, x: cx, y, z: cz, ring: { r: rr, a0: a, dir, spd }, look: 'garba', seed: seed * 100003 + k++ });
    }
  }
  return k;
}
