import { findMatches } from "./regex.js";
import { startRegexWorker } from "./regex-worker-host.js";

startRegexWorker(findMatches);
