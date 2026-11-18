import { $, download, notify } from "../dom.js";
import { bindLocalFiles, numberField, openBitmap } from "./media.js";
import { makeQrFrames, receiveQrFrames } from "./qr-frames.js";

export function initAnimatedQr() {
  const panel = $("#animated-qr");
  const send = $("#qr-send-info");
  const progress = $("#qr-send-progress");
  const play = $("#qr-play");
  const preview = $("#qr-preview");
  const camera = $("#qr-camera");
  const video = $("#qr-video");
  const receive = $("#qr-receive-info");
  const save = $("#qr-download");
  let frames, previewUrl, playbackTimer;
  let sendRevision = 0;
  let playback = 0;
  let playing = false;
  let receiver = receiveQrFrames();
  let received,
    finalizing = false;
  let stream, cameraTimer;
  let cameraRevision = 0;
  let cameraActive = false;
  let scanRevision = 0;

  const stopPlayback = () => {
    playback++;
    clearTimeout(playbackTimer);
    playing = false;
    play.textContent = "开始播放";
  };
  const setPreview = (blob) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = blob ? URL.createObjectURL(blob) : undefined;
    if (previewUrl) preview.src = previewUrl;
    else preview.removeAttribute("src");
    preview.hidden = !previewUrl;
  };
  bindLocalFiles($("#qr-send-drop"), $("#qr-send-file"), async ([file]) => {
    const revision = ++sendRevision;
    stopPlayback();
    setPreview();
    frames = null;
    play.disabled = true;
    progress.textContent = "";
    send.textContent = "正在准备文件…";
    try {
      const next = await makeQrFrames(file);
      if (revision !== sendRevision) return;
      frames = next;
      send.textContent = `${file.name} · 共 ${frames.length} 帧`;
      play.disabled = false;
    } catch (error) {
      if (revision === sendRevision) send.textContent = error.message;
    }
  });
  play.onclick = () => {
    if (playing) {
      stopPlayback();
      return;
    }
    playing = true;
    play.textContent = "暂停播放";
    const revision = ++playback;
    let index = 0;
    const showFrame = async () => {
      try {
        const { makeQr } = await import("./qr-codec.js");
        if (revision !== playback) return;
        const image = await makeQr(frames[index]);
        if (revision !== playback) return;
        setPreview(image);
        progress.textContent = `第 ${index + 1} / ${frames.length} 帧`;
        index = (index + 1) % frames.length;
        playbackTimer = setTimeout(showFrame, numberField("qr-interval"));
      } catch (error) {
        if (revision !== playback) return;
        stopPlayback();
        notify(error.message, true);
      }
    };
    showFrame();
  };

  const stopCamera = () => {
    cameraRevision++;
    clearTimeout(cameraTimer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    cameraActive = false;
    video.srcObject = null;
    video.hidden = true;
    camera.textContent = "打开摄像头";
  };
  const readImage = async (image, revision) => {
    const { scanQr } = await import("./qr-codec.js");
    const codes = await scanQr(image);
    if (revision !== scanRevision || received || finalizing) return false;
    let accepted = false;
    for (const { bytes } of codes) {
      accepted = receiver.add(bytes) || accepted;
      if (!receiver.total || receiver.count !== receiver.total) continue;
      finalizing = true;
      try {
        const file = await receiver.file();
        if (revision !== scanRevision) return false;
        received = file;
        save.hidden = false;
        receive.textContent = `接收完成：${file.filename}`;
        stopCamera();
      } finally {
        if (revision === scanRevision) finalizing = false;
      }
      return true;
    }
    if (receiver.total)
      receive.textContent = `已接收 ${receiver.count} / ${receiver.total} 帧，可继续补扫。`;
    return accepted;
  };
  const canvas = document.createElement("canvas");
  const snapshot = (source, width, height, maxEdge) => {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };
  camera.onclick = async () => {
    if (cameraActive) {
      stopCamera();
      return;
    }
    if (received) return notify("已接收完成，请先重置再开始新的传输", true);
    if (!navigator.mediaDevices?.getUserMedia)
      return notify(
        "摄像头需要 HTTPS 或本机预览地址，也可以选择二维码图片",
        true,
      );
    const revision = ++cameraRevision;
    const scan = scanRevision;
    cameraActive = true;
    camera.textContent = "关闭摄像头";
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } },
        audio: false,
      });
      if (revision !== cameraRevision) {
        activeStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = activeStream;
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      const scanFrame = async () => {
        if (revision !== cameraRevision) return;
        try {
          if (video.readyState >= 2 && video.videoWidth)
            await readImage(
              snapshot(video, video.videoWidth, video.videoHeight, 1600),
              scan,
            );
          if (revision === cameraRevision)
            cameraTimer = setTimeout(scanFrame, 100);
        } catch (error) {
          if (revision !== cameraRevision) return;
          stopCamera();
          notify(error.message, true);
        }
      };
      scanFrame();
    } catch {
      if (revision !== cameraRevision) return;
      stopCamera();
      notify("无法打开摄像头，请检查浏览器权限或选择二维码图片", true);
    }
  };
  let importing = false;
  bindLocalFiles(
    $("#qr-receive-drop"),
    $("#qr-receive-files"),
    async (files) => {
      if (importing) return;
      if (received) return notify("已接收完成，请先重置再开始新的传输", true);
      stopCamera();
      importing = true;
      const revision = scanRevision;
      let accepted = false;
      try {
        for (const file of files) {
          if (revision !== scanRevision || received) return;
          const image = await openBitmap(file);
          try {
            if (revision !== scanRevision) return;
            accepted =
              (await readImage(
                snapshot(image, image.width, image.height, 2400),
                revision,
              )) || accepted;
          } finally {
            image.close();
          }
        }
        if (!accepted && revision === scanRevision)
          notify("图片中没有找到这类传输二维码", true);
      } finally {
        importing = false;
      }
    },
  );
  $("#qr-clear").onclick = () => {
    scanRevision++;
    stopCamera();
    receiver = receiveQrFrames();
    received = undefined;
    finalizing = false;
    receive.textContent = "等待接收二维码";
    save.hidden = true;
  };
  save.onclick = () => {
    if (received) download(received.blob, received.filename);
  };
  panel.addEventListener("toolhide", () => {
    stopCamera();
    stopPlayback();
  });
  $(".seg", panel).addEventListener("click", (event) => {
    const mode = event.target.closest("button")?.dataset.v;
    if (mode === "send") stopCamera();
    if (mode === "receive") stopPlayback();
  });
}
