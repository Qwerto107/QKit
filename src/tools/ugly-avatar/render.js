import { generateFace } from "./generate-face.js";

const pick = (values) => values[Math.floor(Math.random() * values.length)];
const coordinates = (points) =>
  points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

function polyline(points, fill, stroke, width) {
  return `<polyline points="${coordinates(points)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" filter="url(#fuzzy)"/>`;
}

// The original renderer uses overlapping, irregular rings for pupils and nostrils.
function rings(x, y, radius, spread, clip) {
  return Array.from({ length: 10 }, () => {
    const cx = x + (Math.random() - 0.5) * spread;
    const cy = y + (Math.random() - 0.5) * spread;
    return `<circle cx="${cx}" cy="${cy}" r="${radius + Math.random() * 2}" stroke="black" fill="none" stroke-width="${1 + Math.random() * 0.5}" filter="url(#fuzzy)"${clip ? ` clip-path="url(#${clip})"` : ""}/>`;
  }).join("");
}

function drawEye(face, side, sign) {
  const eyeX = sign * (face.center[0] + face.distanceBetweenEyes + face[`${side}EyeOffsetX`]);
  const eyeY = face.center[1] - face.eyeHeightOffset - face[`${side}EyeOffsetY`];
  const name = `eye${side === "left" ? "Left" : "Right"}`;
  const contour = face[`${name}Countour`];
  const width = (face.haventSleptForDays ? 5 : 3) / face.faceScale;
  return `<g transform="translate(${eyeX} ${eyeY})">
    <clipPath id="${name}"><polygon points="${coordinates(contour)}"/></clipPath>
    ${polyline(contour, "white", "none", 0)}
    ${polyline(face[`${name}Upper`], "none", "black", width)}
    ${polyline(face[`${name}Lower`], "none", "black", width)}
    ${rings(face[`${side}PupilShiftX`], face[`${side}PupilShiftY`], 3, 5, name)}
  </g>`;
}

function drawNose(face) {
  const { leftNoseCenterX: lx, leftNoseCenterY: ly, rightNoseCenterX: rx,
    rightNoseCenterY: ry, eyeHeightOffset } = face;
  if (Math.random() > 0.5) return rings(rx, ry, 1, 4) + rings(lx, ly, 1, 4);
  return `<path d="M ${lx} ${ly} Q ${rx} ${ry * 1.5} ${(lx + rx) / 2} ${-eyeHeightOffset * 0.2}" fill="none" stroke="black" stroke-width="${2.5 + Math.random()}" filter="url(#fuzzy)"/>`;
}

export function generateUglyAvatar() {
  const face = generateFace();
  const hair = face.hairs.map((line) =>
    polyline(line, "none", face.hairColor, 0.5 + Math.random() * 2.5),
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="-100 -100 200 200">
    <title>Ugly Avatar</title>
    <desc>Ugly Avatar by Xuan Tang, adapted for QKit. https://github.com/txstc55/ugly-avatar — CC BY-NC 4.0</desc>
    <defs>
      <filter id="fuzzy">
        <feTurbulence baseFrequency="0.05" numOctaves="3" type="noise" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2"/>
      </filter>
      <linearGradient id="rainbowGradient">
        <stop offset="0%" stop-color="${pick(face.hairColors.slice(0, 10))}"/>
        <stop offset="${face.dyeColorOffset}" stop-color="${pick(face.hairColors)}"/>
        <stop offset="100%" stop-color="${pick(face.hairColors)}"/>
      </linearGradient>
    </defs>
    <rect x="-100" y="-100" width="200" height="200" fill="${pick(face.backgroundColors)}"/>
    ${polyline(face.computedFacePoints, "#ffc9a9", "black", 3 / face.faceScale)}
    ${drawEye(face, "right", 1)}
    ${drawEye(face, "left", -1)}
    ${hair}
    ${drawNose(face)}
    ${polyline(face.mouthPoints, "rgb(215,127,140)", "black", 2.7 + Math.random() * 0.5)}
  </svg>`;
}
