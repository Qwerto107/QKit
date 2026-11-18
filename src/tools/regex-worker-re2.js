import { RE2JS } from "re2js";
import { REGEX_FLAGS, collectMatches, validateFlags, validateRegexInput } from "./regex.js";
import { startRegexWorker } from "./regex-worker-host.js";

function* re2Matches({ pattern, flags, text }) {
  let options = 0;
  if (flags.includes("i")) options |= RE2JS.CASE_INSENSITIVE;
  if (flags.includes("m")) options |= RE2JS.MULTILINE;
  if (flags.includes("s")) options |= RE2JS.DOTALL;
  const expression = RE2JS.compile(pattern, options);
  const names = Object.entries(expression.namedGroups());
  const matcher = expression.matcher(text);
  let previousEnd = -1;
  while (matcher.find()) {
    const start = matcher.start();
    const end = matcher.end();
    // Go 的 FindAll 系列会跳过紧邻上一个匹配的空匹配。
    if (start === end && start === previousEnd) continue;
    previousEnd = end;
    yield {
      start,
      end,
      groups: Array.from({ length: expression.groupCount() }, (_, index) =>
        matcher.group(index + 1) ?? undefined,
      ),
      named: names.map(([name, index]) => [name, matcher.group(index) ?? undefined]),
    };
  }
}

startRegexWorker((input) => {
  validateRegexInput(input);
  validateFlags(input.flags, REGEX_FLAGS.re2);
  return collectMatches(re2Matches(input), input.flags.includes("g"));
});
