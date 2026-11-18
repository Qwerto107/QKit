import { createPCRE2, FLAGS, parseFlags } from "pcre2-wasm";
import { REGEX_FLAGS, collectMatches, validateFlags, validateRegexInput } from "./regex.js";
import { startRegexWorker } from "./regex-worker-host.js";

function* pcreMatches(engine, { pattern, flags, text }) {
  // 禁止匹配半个 UTF-8 字符，保证结果可以按字符在原文中高亮。
  const options = FLAGS.UTF | FLAGS.NEVER_BACKSLASH_C | parseFlags(flags);
  for (const match of engine.matchAllIterator(pattern, text, options)) {
    yield {
      start: match.index,
      end: match.index + match.match.length,
      groups: match.groups.map((value) => value ?? undefined),
      named: Object.entries(match.namedGroups ?? {}).map(([name, value]) => [
        name,
        value ?? undefined,
      ]),
    };
  }
}

createPCRE2().then(
  (engine) =>
    startRegexWorker((input) => {
      validateRegexInput(input);
      validateFlags(input.flags, REGEX_FLAGS.pcre2);
      return collectMatches(pcreMatches(engine, input), input.flags.includes("g"));
    }),
  () => self.postMessage({ error: "无法加载 PCRE2 引擎" }),
);
