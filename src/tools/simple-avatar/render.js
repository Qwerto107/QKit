import { SimpleFace } from "./generate-face.js";

function drawMaskShape(face, inset, fill) {
  const [x, y, angle, centerX, centerY, scale, radius, triangleAngle] = face.maskDetailRandoms;
  if (face.faceStyle === 1) {
    return `<path d="M 18,7.75128869404 32,32 4,32 z" transform="translate(${x} ${y - 2.5}) rotate(${triangleAngle} 18 18)" fill="${fill}" stroke="${fill}" stroke-width="${9 * scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const size = 36 - inset * 2;
  return `<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" transform="translate(${x} ${y}) rotate(${angle} ${centerX} ${centerY}) scale(${scale})" fill="${fill}"/>`;
}

function drawMouth(face, color) {
  const [dx, dy, curve, offset] = face.mouthDetailRandoms;
  const width = face.mouthWidth.getSize();
  const height = face.mouthHeight.getSize();
  const x = face.mouthStartX;
  const y = 21 + face.mouthYAdjustment;
  const open = face.mouthStyle === 1;
  const path = open
    ? `<path d="M ${x + dx / 2} ${21 + face.mouthYAdjustment / 2} a ${Math.abs(dy) / 5 + 0.5} ${Math.abs(curve) / 5 + 0.5} 0 0 0 ${width} ${offset}" fill="${color}"/>`
    : `<path d="M ${x} ${y} c ${2 + dx} ${height + dy} ${width - (2 + curve)} ${height + offset} ${width} 0" fill="none" stroke="${color}" stroke-linecap="round"/>`;
  if (face.mouthHappy) return path;
  const pivotY = open
    ? face.arcCenter.cy + Math.max(Math.abs(dy), Math.abs(curve)) / 5 + 0.5
    : y + 2 + dx / 2;
  return `<g transform="rotate(180 ${x + width / 2} ${pivotY})">${path}</g>`;
}

function drawFeatures(face, mask, color) {
  const [x, y, angle, centerX, centerY] = face.faceDetailRandoms;
  const eyes = [face.leftEyeStart, face.rightEyeStart].map((left) =>
    `<rect x="${left}" y="${14 + face.eyeYAdjustment}" width="${face.eyeWidth.getSize()}" height="${face.eyeHeight.getSize()}" rx="1" fill="${color}"/>`,
  ).join("");
  return `<g mask="url(#${mask})">
    <g transform="translate(${x} ${y}) rotate(${angle} ${centerX} ${centerY})">
      ${drawMouth(face, color)}
      ${eyes}
    </g>
  </g>`;
}

export function generateSimpleAvatar() {
  const face = new SimpleFace();
  face.initializationFull();
  // Draw the same features in two colors so they stay visible across the mask boundary.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 36 36" fill="none">
    <title>Simple Avatar</title>
    <desc>Simple Avatar by Xuan Tang, adapted for QKit. https://txstc55.github.io/simple-avatar/</desc>
    <rect width="36" height="36" fill="${face.colorPair[0]}"/>
    <mask id="foreground" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      ${drawMaskShape(face, 0, "white")}
    </mask>
    <mask id="background" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect width="36" height="36" fill="white"/>
      ${drawMaskShape(face, 3, "black")}
    </mask>
    <rect width="36" height="36" fill="${face.colorPair[1]}" mask="url(#foreground)"/>
    ${drawFeatures(face, "foreground", face.foregroundStroke)}
    ${drawFeatures(face, "background", face.backgroundStroke)}
  </svg>`;
}
