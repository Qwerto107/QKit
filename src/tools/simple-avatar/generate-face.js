// Adapted from Simple Avatar by Xuan Tang for QKit.
// https://tools.qwerto.cc/simple-avatar/
import Sizing from "./sizing.js";
import ColorReshading from "./colorReshading.js";
import GeometryChecker from "./geometryChecker.js";

const reshading = new ColorReshading();
const gmChecker = new GeometryChecker();

const colors = [
  "#BF3817", "#023d67", "#08415c", "#cc2936", "#95f9c3", "#0b3866", "#264653",
  "#2a9d8f", "#233d4d", "#fe7f2d", "#f0f0d8", "#000000", "#30c5d2", "#471069",
  "#e7ecef", "#274c77", "#26547c", "#ef476f", "#f1faee", "#e63946", "#4F200D",
  "#F6F1E9", "#FF8400", "#FFD93D", "#0B2447", "#19376D", "#245953", "#408E91",
  "#FFF2CC", "#FFD966", "#F0EBD8", "#748CAB", "#FFC1CF", "#E8FFB7", "#ebd1c4",
  "#464249", "#FFF2CC", "#C8E0F4", "#9DD1F1", "#508AA8", "#031927", "#C8E0F4",
];

export class SimpleFace {
  constructor() {
    Object.assign(this, {
      svgViewBoxSize: 36,
      colorPair: ["#ffffff", "#000000"],
      foregroundStroke: "#ffffee",
      backgroundStroke: "#000011",

      eyeHeight: new Sizing(2, 0.25, 1.5),
      eyeWidth: new Sizing(4, 0.5, 1.5),
      distanceBetweenEyes: new Sizing(7, 0.7, 2),
      mouthHeight: new Sizing(3, 0.5, 1.5),
      mouthWidth: new Sizing(9, 0.5, 2),
      mouthDetailRandoms: [0, 0, 0, 0],
      maskDetailRandoms: [0, 0, 0, 0, 0, 0, 0, 0],
      faceDetailRandoms: [0, 0, 0, 0, 0],
      mouthYAdjustment: 0,
      eyeYAdjustment: 0,
      mouthStyle: 0, // 0 for closed, 1 for open
      faceStyle: 0, // 0 for square, 1 for triangle
      mouthHappy: true,
      arcCenter: { cx: 0, cy: 0 },

    });
  }

  randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }
  initializeMouthDetail() {
    this.mouthDetailRandoms[0] = this.randomFloat(-2, 2); // mouth height displacement
    this.mouthDetailRandoms[2] = this.randomFloat(-2, 2); // mouth height displacement
    this.mouthDetailRandoms[1] = this.randomFloat(-1.5, 1.5); // mouth width displacement
    this.mouthDetailRandoms[3] = this.randomFloat(-1.5, 1.5); // mouth width displacement
  }
  initializeMaskDetail() {
    this.maskDetailRandoms[0] = this.randomFloat(-5, 5); // translate x
    this.maskDetailRandoms[1] = this.randomFloat(-5, 5); // translate y
    this.maskDetailRandoms[2] = this.randomFloat(-20, 20); // rotate degree
    this.maskDetailRandoms[3] = this.randomFloat(0, 36); // rotate around x
    this.maskDetailRandoms[4] = this.randomFloat(0, 36); // rotate around y
    this.maskDetailRandoms[5] = this.randomFloat(1.0, 1.2); // scale
    this.maskDetailRandoms[6] = this.randomFloat(4, 36); // radius
    this.maskDetailRandoms[7] = this.randomFloat(-30, 30); // rotate triangle
  }
  initializeFaceDetail() {
    this.faceDetailRandoms[0] = this.randomFloat(-5, 5); // translate x
    this.faceDetailRandoms[1] = this.randomFloat(-5, 5); // translate y
    this.faceDetailRandoms[2] = this.randomFloat(-10, 10); // rotate degree
    this.faceDetailRandoms[3] = this.randomFloat(18, 36); // rotate around x
    this.faceDetailRandoms[4] = this.randomFloat(18, 36); // rotate around y
  }
  initialization() {
    this.eyeHeight.randomize();
    this.eyeWidth.randomize();
    this.distanceBetweenEyes.randomize();
    this.eyeYAdjustment = this.randomFloat(
      -5,
      this.svgViewBoxSize / 2 - 14 - this.eyeHeight.getSize()
    );
    this.mouthYAdjustment = this.randomFloat(
      14 + this.eyeYAdjustment + this.eyeHeight.getSize() + 3 - 21,
      5
    );
    this.mouthHeight.randomize();
    this.mouthWidth.randomize();
    this.initializeMouthDetail();
    this.initializeMaskDetail();
    this.initializeFaceDetail();
    this.arcCenter = gmChecker.svgArcToCenterParam(
      this.mouthStartX + this.mouthDetailRandoms[0] / 2,
      21 + this.mouthYAdjustment / 2,
      Math.abs(this.mouthDetailRandoms[1]) + 0.5,
      Math.abs(this.mouthDetailRandoms[2]) / 5 + 0.0,
      0,
      0,
      0,
      this.mouthWidth.getSize(),
      this.mouthDetailRandoms[3]
    );
  }

  checkIfMostlyInside() {
    var x_min =
      Math.min(this.leftEyeStart, this.mouthStartX) +
      this.faceDetailRandoms[0];
    var y_min = 14 + this.eyeYAdjustment + this.faceDetailRandoms[1];
    var x_max =
      Math.max(
        this.rightEyeStart + this.eyeWidth.getSize(),
        this.mouthStartX + this.mouthWidth.getSize()
      ) + this.faceDetailRandoms[0];
    var y_max = 21 + this.mouthHeight.getSize() + this.faceDetailRandoms[1];
    this.top_left_translated = gmChecker.computeRotatedPoint(
      x_min,
      y_min,
      this.faceDetailRandoms[2],
      this.faceDetailRandoms[3],
      this.faceDetailRandoms[4]
    );
    this.bot_right_translated = gmChecker.computeRotatedPoint(
      x_max,
      y_max,
      this.faceDetailRandoms[2],
      this.faceDetailRandoms[3],
      this.faceDetailRandoms[4]
    );
    this.bot_left_translated = gmChecker.computeRotatedPoint(
      x_min,
      y_max,
      this.faceDetailRandoms[2],
      this.faceDetailRandoms[3],
      this.faceDetailRandoms[4]
    );
    this.top_right_translated = gmChecker.computeRotatedPoint(
      x_max,
      y_min,
      this.faceDetailRandoms[2],
      this.faceDetailRandoms[3],
      this.faceDetailRandoms[4]
    );
    if (this.faceStyle == 0) {
      x_min = 3;
      y_min = 3;
      x_max = 33;
      y_max = 33;
      var top_left_translated_mask = gmChecker.computeRotatedPoint(
        x_min,
        y_min,
        this.maskDetailRandoms[2],
        this.maskDetailRandoms[3],
        this.maskDetailRandoms[4]
      );
      var bot_right_translated_mask = gmChecker.computeRotatedPoint(
        x_max,
        y_max,
        this.maskDetailRandoms[2],
        this.maskDetailRandoms[3],
        this.maskDetailRandoms[4]
      );
      var bot_left_translated_mask = gmChecker.computeRotatedPoint(
        x_min,
        y_max,
        this.maskDetailRandoms[2],
        this.maskDetailRandoms[3],
        this.maskDetailRandoms[4]
      );
      var top_right_translated_mask = gmChecker.computeRotatedPoint(
        x_max,
        y_min,
        this.maskDetailRandoms[2],
        this.maskDetailRandoms[3],
        this.maskDetailRandoms[4]
      );
      top_left_translated_mask.x += this.maskDetailRandoms[0];
      bot_right_translated_mask.x += this.maskDetailRandoms[0];
      bot_left_translated_mask.x += this.maskDetailRandoms[0];
      top_right_translated_mask.x += this.maskDetailRandoms[0];
      top_left_translated_mask.y += this.maskDetailRandoms[1];
      bot_right_translated_mask.y += this.maskDetailRandoms[1];
      bot_left_translated_mask.y += this.maskDetailRandoms[1];
      top_right_translated_mask.y += this.maskDetailRandoms[1];

      let eyeNotInside = 0;
      let mouthNotInside = 0;
      if (
        !gmChecker.checkIfPointInsideRectangle(
          this.top_left_translated,
          top_left_translated_mask,
          top_right_translated_mask,
          bot_right_translated_mask,
          bot_left_translated_mask
        )
      ) {
        eyeNotInside++;
      }
      if (
        !gmChecker.checkIfPointInsideRectangle(
          this.top_right_translated,
          top_left_translated_mask,
          top_right_translated_mask,
          bot_right_translated_mask,
          bot_left_translated_mask
        )
      ) {
        eyeNotInside++;
      }
      if (
        !gmChecker.checkIfPointInsideRectangle(
          this.bot_right_translated,
          top_left_translated_mask,
          top_right_translated_mask,
          bot_right_translated_mask,
          bot_left_translated_mask
        )
      ) {
        mouthNotInside++;
      }
      if (
        !gmChecker.checkIfPointInsideRectangle(
          this.bot_left_translated,
          top_left_translated_mask,
          top_right_translated_mask,
          bot_right_translated_mask,
          bot_left_translated_mask
        )
      ) {
        mouthNotInside++;
      }
      if (mouthNotInside + eyeNotInside <= 3) {
        return true;
      } else {
        return false;
      }
    } else {
      var p1x = 18;
      var p1y =
        7.75128869404 - 6 * ((this.maskDetailRandoms[5] * 1.5) / 2) * 2;
      var p2x =
        32 + 6 * ((this.maskDetailRandoms[5] * 1.5) / 2) * Math.sqrt(3);
      var p2y = 32 + 6 * ((this.maskDetailRandoms[5] * 1.5) / 2);
      var p3x =
        4 - 6 * ((this.maskDetailRandoms[5] * 1.5) / 2) * Math.sqrt(3);
      var p3y = 32 + 6 * ((this.maskDetailRandoms[5] * 1.5) / 2);
      this.p1_translated = gmChecker.computeRotatedPoint(
        p1x,
        p1y,
        this.maskDetailRandoms[7],
        18,
        18
      );
      this.p2_translated = gmChecker.computeRotatedPoint(
        p2x,
        p2y,
        this.maskDetailRandoms[7],
        18,
        18
      );
      this.p3_translated = gmChecker.computeRotatedPoint(
        p3x,
        p3y,
        this.maskDetailRandoms[7],
        18,
        18
      );
      this.p1_translated.x += this.maskDetailRandoms[0];
      this.p2_translated.x += this.maskDetailRandoms[0];
      this.p3_translated.x += this.maskDetailRandoms[0];
      this.p1_translated.y += this.maskDetailRandoms[1] - 2.5;
      this.p2_translated.y += this.maskDetailRandoms[1] - 2.5;
      this.p3_translated.y += this.maskDetailRandoms[1] - 2.5;

      let eyeNotInside = 0;
      let mouthNotInside = 0;
      if (
        !gmChecker.checkIfPointInsideTriangle(
          this.top_left_translated,
          this.p1_translated,
          this.p2_translated,
          this.p3_translated
        )
      ) {
        eyeNotInside++;
      }
      if (
        !gmChecker.checkIfPointInsideTriangle(
          this.top_right_translated,
          this.p1_translated,
          this.p2_translated,
          this.p3_translated
        )
      ) {
        eyeNotInside++;
      }
      if (
        !gmChecker.checkIfPointInsideTriangle(
          this.bot_right_translated,
          this.p1_translated,
          this.p2_translated,
          this.p3_translated
        )
      ) {
        mouthNotInside++;
      }
      if (
        !gmChecker.checkIfPointInsideTriangle(
          this.bot_left_translated,
          this.p1_translated,
          this.p2_translated,
          this.p3_translated
        )
      ) {
        mouthNotInside++;
      }
      if (mouthNotInside + eyeNotInside <= 3) {
        return true;
      } else {
        return false;
      }
    }
  }
  initializeColor() {

    if (Math.random() > 0.5) {
      // switch content of colorPair
      let temp = this.colorPair[0];
      this.colorPair[0] = this.colorPair[1];
      this.colorPair[1] = temp;
    }
    // 0 is background
    // 1 is foreground

    if (reshading.checkColorIsBright(this.colorPair[0])) {
      if (reshading.checkColorIsBright(this.colorPair[1])) {
        if (
          reshading.colorBrightness(this.colorPair[0]) >
          reshading.colorBrightness(this.colorPair[1])
        ) {
          let foregroundHSL = reshading.hexToHSL(this.colorPair[1]);
          let backgroundHSL = reshading.hexToHSL(this.colorPair[0]);
          this.backgroundStroke =
            "hsl(" +
            foregroundHSL[0] +
            ", " +
            foregroundHSL[1] / 1.5 +
            "%, " +
            Math.min(100, (backgroundHSL[2] + 10) * 1.5) +
            "%)";
          this.foregroundStroke =
            "hsl(" +
            backgroundHSL[0] +
            ", " +
            backgroundHSL[1] / 1.5 +
            "%, " +
            Math.min(100, (foregroundHSL[2] + 10) * 1.5) +
            "%)";
        } else {
          let foregroundHSL = reshading.hexToHSL(this.colorPair[1]);
          let backgroundHSL = reshading.hexToHSL(this.colorPair[0]);
          this.foregroundStroke =
            "hsl(" +
            backgroundHSL[0] +
            ", " +
            backgroundHSL[1] / 1.5 +
            "%, " +
            Math.min(100, (foregroundHSL[2] + 10) * 1.5) +
            "%)";
          this.backgroundStroke =
            "hsl(" +
            foregroundHSL[0] +
            ", " +
            foregroundHSL[1] / 1.5 +
            "%, " +
            Math.min(100, (backgroundHSL[2] + 10) * 1.5) +
            "%)";
        }
      } else {
        // background is bright, foreground is dark
        this.foregroundStroke = "#ffffee";
        let foregroundHSL = reshading.hexToHSL(this.colorPair[1]);
        let backgroundHSL = reshading.hexToHSL(this.colorPair[0]);
        this.backgroundStroke =
          "hsl(" +
          foregroundHSL[0] +
          ", " +
          foregroundHSL[1] / 2 +
          "%, " +
          Math.min(100, (backgroundHSL[2] + 25) * 2.5) +
          "%)";
      }
    } else {
      if (!reshading.checkColorIsBright(this.colorPair[1])) {
        // both are dark
        this.foregroundStroke = "#ffffee";
        this.backgroundStroke = "#ffffee";
      } else {
        // foreground is bright, background is dark
        let temp = this.colorPair[0];
        this.colorPair[0] = this.colorPair[1];
        this.colorPair[1] = temp;
        this.foregroundStroke = "#ffffee";
        let foregroundHSL = reshading.hexToHSL(this.colorPair[1]);
        let backgroundHSL = reshading.hexToHSL(this.colorPair[0]);
        this.backgroundStroke =
          "hsl(" +
          foregroundHSL[0] +
          ", " +
          foregroundHSL[1] / 2 +
          "%, " +
          Math.min(100, (backgroundHSL[2] + 15) * 1.5) +
          "%)";
      }
    }
  }

  initializationFull() {
    this.mouthStyle = Math.random() > 0.5 ? 0 : 1;
    this.mouthHappy = Math.random() > 0.4;
    this.faceStyle = Math.random() > 0.75 ? 1 : 0;
    let colorPick1 = Math.floor(Math.random() * colors.length);
    let colorPick2 = Math.floor(Math.random() * colors.length);
    while (colorPick2 === colorPick1) {
      colorPick2 = Math.floor(Math.random() * colors.length);
    }
    let color1_dark = reshading.checkColorIsBright(colors[colorPick1]);
    let color2_dark = reshading.checkColorIsBright(colors[colorPick2]);
    while (color1_dark !== color2_dark) {
      colorPick1 = Math.floor(Math.random() * colors.length);
      colorPick2 = Math.floor(Math.random() * colors.length);
      while (colorPick2 === colorPick1) {
        colorPick2 = Math.floor(Math.random() * colors.length);
      }
      color1_dark = reshading.checkColorIsBright(colors[colorPick1]);
      color2_dark = reshading.checkColorIsBright(colors[colorPick2]);
    }

    this.colorPair = [colors[colorPick1], colors[colorPick2]];
    this.initializeColor();
    this.initialization();
    // Retry layouts whose features would fall outside the face.
    for (let attempts = 0; !this.checkIfMostlyInside(); attempts += 1) {
      if (attempts === 100) throw new Error("头像生成失败，请重试");
      this.initialization();
    }
  }

  get leftEyeStart() {
    return (
      this.svgViewBoxSize / 2 -
      this.distanceBetweenEyes.getSize() / 2 -
      this.eyeWidth.getSize()
    );
  }
  get rightEyeStart() {
    return this.svgViewBoxSize / 2 + this.distanceBetweenEyes.getSize() / 2;
  }
  get mouthStartX() {
    return this.svgViewBoxSize / 2 - this.mouthWidth.getSize() / 2;
  }
}
