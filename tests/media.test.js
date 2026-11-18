import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { prepareZXingModule, readBarcodes, writeBarcode } from "zxing-wasm";
import { renderBitPlane } from "../src/tools/blind-watermark.js";
import { makeQrFrames, receiveQrFrames } from "../src/tools/qr-frames.js";

test("盲水印按通道读取低位，透明像素同样读取 RGB 样本", () => {
  const image = {
    width: 2,
    height: 1,
    channels: 4,
    depth: 16,
    data: new Uint16Array([
      0xab01, 0xff00, 0xfe04, 0, 0x8100, 0x0102, 0xfe00, 1,
    ]),
  };
  const pixels = new Uint8ClampedArray(8);
  const white = [255, 255, 255, 255];
  const black = [0, 0, 0, 255];
  for (const [channel, bit, expected] of [
    [0, 0, [...white, ...black]],
    [1, 1, [...black, ...white]],
    [2, 2, [...white, ...black]],
    [3, 0, [...black, ...white]],
  ]) {
    renderBitPlane(image, channel, bit, pixels);
    assert.deepEqual([...pixels], expected);
  }
});

test("动态二维码经真实编码与识别，乱序和重复的帧仍能逐字节还原文件", async () => {
  prepareZXingModule({
    overrides: {
      wasmBinary: readFileSync(
        new URL(import.meta.resolve("zxing-wasm/full/zxing_full.wasm")),
      ),
    },
  });
  const data = new Uint8Array(randomBytes(1536));
  const file = new File([data], "中文 文件.bin");
  const frames = await makeQrFrames(file);
  assert.ok(frames.length > 1);
  const receiver = receiveQrFrames();
  assert.throws(() => receiver.file(), /未接收完整/);
  for (const frame of frames.toReversed()) {
    const { image } = await writeBarcode(frame, {
      format: "QRCode",
      scale: 5,
      options: "ecLevel=M",
    });
    const [result] = await readBarcodes(image, { formats: ["QRCode"] });
    assert.ok(receiver.add(result.bytes));
    assert.ok(receiver.add(result.bytes));
  }
  assert.equal(receiver.count, frames.length);
  const result = await receiver.file();
  assert.equal(result.filename, file.name);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), data);
});

test("支持压缩帧和空文件，拒绝内容冲突的重复帧", async () => {
  for (const text of ["", "QKit".repeat(512)]) {
    const file = new File([text], "内容.txt", { type: "text/plain" });
    const frames = await makeQrFrames(file);
    assert.equal(frames[0][4], text ? 90 : 82);
    const receiver = receiveQrFrames();
    assert.equal(
      receiver.add(new TextEncoder().encode("https://example.com")),
      false,
    );
    frames.forEach((frame) => receiver.add(frame));
    const conflict = frames[0].slice();
    conflict[conflict.length - 1] ^= 1;
    assert.throws(() => receiver.add(conflict), /内容不一致/);
    assert.equal(await (await receiver.file()).blob.text(), text);
  }
});
