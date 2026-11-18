export function startRegexWorker(findMatches) {
  // 引擎就绪后再开始计时，让主线程可以终止耗时匹配。
  self.onmessage = ({ data }) => {
    try {
      self.postMessage(findMatches(data));
    } catch (error) {
      self.postMessage({ error: error.message });
    }
  };
  self.postMessage({ ready: true });
}
