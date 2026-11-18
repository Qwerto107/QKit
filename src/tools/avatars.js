import { $, act, download } from "../dom.js";
import { canvasPng } from "./media.js";

function bindAvatar(id, loadGenerator) {
  const panel = $(`#${id}`);
  const image = $("[data-avatar-preview]", panel);
  const status = $(".avatar-status", panel);
  const randomize = $("[data-avatar-randomize]", panel);
  const save = $("[data-avatar-download]", panel);
  const saveSvg = $("[data-avatar-svg]", panel);
  let avatarImage;
  let avatarSvg;

  randomize.onclick = () => act(randomize, async () => {
    let url;
    if (!avatarImage) status.textContent = "正在生成头像…";
    // 只在生成头像时加载绘图代码。成功替换预览后才释放旧图。
    try {
      const generate = await loadGenerator();
      const svg = new Blob([generate()], { type: "image/svg+xml" });
      url = URL.createObjectURL(svg);
      const decoded = new Image();
      decoded.src = url;
      await decoded.decode();
      if (avatarImage) URL.revokeObjectURL(avatarImage.src);
      else {
        save.disabled = false;
        if (saveSvg) saveSvg.disabled = false;
      }
      avatarImage = decoded;
      avatarSvg = svg;
      image.src = url;
      image.hidden = false;
      status.hidden = true;
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      if (!avatarImage) status.textContent = "头像生成失败，请重试。";
      throw error;
    }
  });

  panel.addEventListener("toolshow", () => {
    if (!avatarImage) randomize.click();
  });

  save.onclick = () => act(save, async () => {
    const canvas = document.createElement("canvas");
    canvas.width = avatarImage.naturalWidth;
    canvas.height = avatarImage.naturalHeight;
    canvas.getContext("2d").drawImage(avatarImage, 0, 0);
    download(await canvasPng(canvas), `${id}.png`);
  });
  if (saveSvg) saveSvg.onclick = () => download(avatarSvg, `${id}.svg`);
}

export function initAvatars() {
  bindAvatar("ugly-avatar", async () => (await import("./ugly-avatar/render.js")).generateUglyAvatar);
  bindAvatar("simple-avatar", async () => (await import("./simple-avatar/render.js")).generateSimpleAvatar);
}
