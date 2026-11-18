const text = new TextEncoder();
const decoder = new TextDecoder();
export const MAX_TRANSFER = 2 * 1024 ** 2;
const FRAME_SIZE = 750;
const MAX_FRAMES = 3000;
const MAX_CHUNK = 3000;
const SEPARATOR = 124;

export async function makeQrFrames(file) {
  if (file.size > MAX_TRANSFER) throw new Error("文件不能超过 2 MB");
  let body = new Uint8Array(await file.arrayBuffer());
  let flag = "R";
  if (typeof CompressionStream !== "undefined") {
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    if (packed.length < body.length) {
      body = packed;
      flag = "Z";
    }
  }
  // 兼容参考工具：帧 1 带 R/Z 标志、文件名和 MIME，文件内容保持原始字节。
  const header = text.encode(
    `${flag}${encodeURIComponent(file.name)}|${file.type.replaceAll("|", "")}|`,
  );
  if (header.length >= FRAME_SIZE) throw new Error("文件名过长，请改短后重试");
  const transfer = new Uint8Array(header.length + body.length);
  transfer.set(header);
  transfer.set(body, header.length);
  const total = Math.ceil(transfer.length / FRAME_SIZE);
  return Array.from({ length: total }, (_, i) => {
    const prefix = text.encode(`${i + 1}/${total}|`);
    const payload = transfer.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
    const frame = new Uint8Array(prefix.length + payload.length);
    frame.set(prefix);
    frame.set(payload, prefix.length);
    return frame;
  });
}

async function unpack(parts) {
  const [first, ...rest] = parts;
  const nameEnd = first.indexOf(SEPARATOR, 1);
  const typeEnd = first.indexOf(SEPARATOR, nameEnd + 1);
  if ((first[0] !== 82 && first[0] !== 90) || nameEnd < 2 || typeEnd < 0) {
    throw new Error("首帧不包含有效的文件信息");
  }
  const name = decodeURIComponent(decoder.decode(first.subarray(1, nameEnd)))
    .replace(/[\\/:*?"<>|\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, "_")
    .trim();
  const filename = !name || name === "." || name === ".." ? "接收文件" : name;
  const blob = new Blob([first.subarray(typeEnd + 1), ...rest], {
    type: "application/octet-stream",
  });
  if (first[0] === 82) {
    if (blob.size > MAX_TRANSFER) throw new Error("接收文件不能超过 2 MB");
    return { filename, blob };
  }
  const reader = blob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const blocks = [];
  let size = 0;
  // 扫到的二维码是外部输入，解压时也必须限制大小。
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_TRANSFER) {
      await reader.cancel();
      throw new Error("解压后的文件不能超过 2 MB");
    }
    blocks.push(value);
  }
  return {
    filename,
    blob: new Blob(blocks, { type: "application/octet-stream" }),
  };
}

export function receiveQrFrames() {
  const frames = new Map();
  let total = 0;
  let size = 0;
  return {
    get count() {
      return frames.size;
    },
    get total() {
      return total;
    },
    add(bytes) {
      const separator = bytes.subarray(0, 16).indexOf(SEPARATOR);
      const meta =
        separator >= 0 &&
        /^([1-9]\d*)\/([1-9]\d*)$/.exec(
          decoder.decode(bytes.subarray(0, separator)),
        );
      if (!meta || bytes.length - separator - 1 > MAX_CHUNK) return false;
      const index = Number(meta[1]);
      const expected = Number(meta[2]);
      if (index > expected || expected > MAX_FRAMES) return false;
      if (total && total !== expected)
        throw new Error("检测到不同批次的二维码，请重置后扫描同一批次");
      const payload = bytes.subarray(separator + 1);
      const existing = frames.get(index);
      if (existing) {
        if (
          existing.length !== payload.length ||
          !existing.every((byte, i) => byte === payload[i])
        ) {
          throw new Error("同一帧的内容不一致，请重置后重新扫描");
        }
        return true;
      }
      if (size + payload.length > MAX_TRANSFER + MAX_CHUNK)
        throw new Error("接收文件不能超过 2 MB");
      size += payload.length;
      total = expected;
      frames.set(index, payload.slice());
      return true;
    },
    file() {
      if (!total || frames.size !== total) throw new Error("还有帧未接收完整");
      return unpack(Array.from({ length: total }, (_, i) => frames.get(i + 1)));
    },
  };
}
