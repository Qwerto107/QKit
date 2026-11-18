export default class geometryChecker {
    constructor() {

    }
    computeRotatedPoint(x, y, angle, cx, cy) {
        var radians = (Math.PI / 180) * -angle,
            cos = Math.cos(radians),
            sin = Math.sin(radians),
            nx = cos * (x - cx) + sin * (y - cy) + cx,
            ny = cos * (y - cy) - sin * (x - cx) + cy;
        return { x: nx, y: ny };
    }
    computeTriangleArea(A, B, C) {
        var area =
            Math.abs(
                B.x * A.y -
                A.x * B.y +
                (C.x * B.y - B.x * C.y) +
                (A.x * C.y - C.x * A.y)
            ) / 2;
        return area;
    }

    checkIfPointInsideRectangle(P, A, B, C, D) {
        var apd = this.computeTriangleArea(P, A, D);
        var dpc = this.computeTriangleArea(P, D, C);
        var cpb = this.computeTriangleArea(P, C, B);
        var pba = this.computeTriangleArea(P, B, A);
        var abc = this.computeTriangleArea(B, A, C);
        var dbc = this.computeTriangleArea(D, B, C);
        return apd + dpc + cpb + pba <= abc + dbc;
    }
    checkIfPointInsideTriangle(P, A, B, C) {
        var pab = this.computeTriangleArea(P, A, B);
        var pbc = this.computeTriangleArea(P, B, C);
        var pca = this.computeTriangleArea(P, C, A);
        var abc = this.computeTriangleArea(A, B, C);
        return pab + pbc + pca < abc;
    }
    //conversion_from_endpoint_to_center_parameterization
    //sample :  svgArcToCenterParam(200,200,50,50,0,1,1,300,200)
    // x1 y1 rx ry φ fA fS x2 y2
    svgArcToCenterParam(x1, y1, rx, ry, phi, fA, fS, dx, dy) {
        var x2 = x1 + dx;
        var y2 = y1 + dy;
        var cx, cy;

        if (rx < 0) {
            rx = -rx;
        }
        if (ry < 0) {
            ry = -ry;
        }

        var s_phi = Math.sin(phi);
        var c_phi = Math.cos(phi);
        var hd_x = (x1 - x2) / 2.0; // half diff of x
        var hd_y = (y1 - y2) / 2.0; // half diff of y
        var hs_x = (x1 + x2) / 2.0; // half sum of x
        var hs_y = (y1 + y2) / 2.0; // half sum of y

        // F6.5.1
        var x1_ = c_phi * hd_x + s_phi * hd_y;
        var y1_ = c_phi * hd_y - s_phi * hd_x;

        // F.6.6 Correction of out-of-range radii
        //   Step 3: Ensure radii are large enough
        var lambda = (x1_ * x1_) / (rx * rx) + (y1_ * y1_) / (ry * ry);
        if (lambda > 1) {
            rx = rx * Math.sqrt(lambda);
            ry = ry * Math.sqrt(lambda);
        }

        var rxry = rx * ry;
        var rxy1_ = rx * y1_;
        var ryx1_ = ry * x1_;
        var sum_of_sq = rxy1_ * rxy1_ + ryx1_ * ryx1_; // sum of square

        var coe = Math.sqrt(Math.abs((rxry * rxry - sum_of_sq) / sum_of_sq));
        if (fA == fS) {
            coe = -coe;
        }

        // F6.5.2
        var cx_ = (coe * rxy1_) / ry;
        var cy_ = (-coe * ryx1_) / rx;

        // F6.5.3
        cx = c_phi * cx_ - s_phi * cy_ + hs_x;
        cy = s_phi * cx_ + c_phi * cy_ + hs_y;

        return { cx: cx, cy: cy };
    }
}
