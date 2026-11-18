import { prepareZXingModule, readBarcodes, writeBarcode } from "zxing-wasm";
import wasmUrl from "zxing-wasm/full/zxing_full.wasm?url";

// WASM 随 QKit 部署，从同一站点加载。
prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });

export function scanQr(image) {
  return readBarcodes(image, { formats: ["QRCode"], maxNumberOfSymbols: 9 });
}

export async function makeQr(bytes) {
  const code = await writeBarcode(bytes, {
    format: "QRCode",
    scale: 5,
    options: "ecLevel=M",
  });
  if (!code.image) throw new Error("二维码生成失败");
  return code.image;
}
