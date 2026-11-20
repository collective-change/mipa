import fs from "node:fs";
import path from "node:path";

/**
 * Guard kind declaration (MIPA-45):
 * Deterministic static source scanner executed via Vitest (`test/unit/unboundedReadsGuard.spec.js`)
 * across client stores, workers, pages, components, utilities, and public/user-scoped Cloud Functions.
 */
export const GUARD_KIND = "static-source-and-query-scanner-vitest";

export const DEFAULT_SCAN_TARGETS = [
  "src/store",
  "src/workers",
  "src/pages",
  "src/components",
  "src/utils",
  "functions/src/publicDossier.ts",
  "functions/src/orgMembers.ts",
  "functions/src/notifications/weeklyDigest.ts"
];

/**
 * Three historical unbounded read instances that are now bounded by default (limit(50)).
 */
export const KNOWN_FIXED_INSTANCES = [
  {
    id: "MIPA-10",
    file: "src/store/store-actions.js",
    lines: [215, 228, 265, 274],
    description: "Actions page queries (bindActions & bindMatchingActions) enforce DEFAULT_ACTIONS_LIMIT = 50."
  },
  {
    id: "MIPA-23",
    file: "src/store/store-model.js",
    lines: [335, 344],
    description: "Model graph query (bindNodes) enforces DEFAULT_NODES_LIMIT = 50 unless explicitly expanded."
  },
  {
    id: "MIPA-38",
    file: "src/pages/PageModelDossier.vue",
    lines: [743, 744],
    description: "Public shared model dossier (fetchNodes) enforces nodesLimit = 50 by default."
  }
];

/**
 * Explicit dated exception registry for collection reads that are intentionally unbounded
 * or bounded by user/org invariants other than limit()/window().
 * Every entry requires a non-empty reason and an ISO YYYY-MM-DD date.
 */
export const UNBOUNDED_READ_EXCEPTIONS = [
  {
    id: "STARTER-NODES-INIT",
    file: "src/store/store-model.js",
    line: 159,
    date: "2026-11-20",
    reason: "Runs once during createInitialNodes immediately after writing the 7 starter role factors (fixed cardinality = 7)."
  },
  {
    id: "MIPA-23-LOAD-ALL",
    file: "src/store/store-model.js",
    line: 334,
    date: "2026-11-20",
    reason: "MIPA-23: Explicit user-triggered 'Load all factors' opt-in branch (isUnbounded) after default limit(50) bounded graph load."
  },
  {
    id: "MIPA-38-LOAD-ALL",
    file: "src/pages/PageModelDossier.vue",
    line: 743,
    date: "2026-11-20",
    reason: "MIPA-38: Explicit user-triggered 'Load all factors' opt-in branch (showAll) on public dossier after default limit(50) partial view."
  },
  {
    id: "USER-UNREAD-CHATS",
    file: "src/store/store-chats.js",
    line: 139,
    date: "2026-11-20",
    reason: "Scoped strictly to signed-in user's currently unread chats (members array-contains uid && unreadBy.<uid> == true)."
  },
  {
    id: "USER-MY-INVITATIONS",
    file: "src/store/store-members.js",
    line: 133,
    date: "2026-11-20",
    reason: "Scoped strictly to pending invitations addressed to the signed-in user's normalized lowercase email."
  },
  {
    id: "ORG-INVITATIONS-SEAT-BOUNDED",
    file: "src/store/store-members.js",
    line: 144,
    date: "2026-11-20",
    reason: "Bounded by construction to organization tier seatLimit (1..150) enforced server-side in functions/src/orgMembers.ts createInvitation."
  },
  {
    id: "USER-ORGS-MEMBERSHIP",
    file: "src/store/store-orgs.js",
    line: 267,
    date: "2026-11-20",
    reason: "Scoped to organizations where the signed-in user is an active member (users array-contains uid)."
  },
  {
    id: "ORG-MEMBERS-SEAT-BOUNDED",
    file: "src/store/store-users.js",
    line: 55,
    date: "2026-11-20",
    reason: "Bounded by construction to organization tier seatLimit (1..150) enforced server-side in functions/src/orgMembers.ts acceptInvitation."
  },
  {
    id: "EARLY-ACCESS-INVITE-FALLBACK",
    file: "src/utils/earlyAccess.js",
    line: 61,
    date: "2026-11-20",
    reason: "Client fallback when checkUserAccess callable is unavailable; scoped to single normalized email address."
  },
  {
    id: "WORKER-CHAINED-ACTIONS-IN-LIST",
    file: "src/workers/calcWorker.js",
    line: 885,
    date: "2026-11-20",
    reason: "Bounded by explicit actionIds array via Firestore 'in' filter (max 30 IDs per query)."
  },
  {
    id: "ORG-MODELS-TX-SYNC-BY-ORGID",
    file: "functions/src/orgMembers.ts",
    line: 42,
    date: "2026-11-20",
    reason: "Admin transaction syncing member editors.users across an organization's models during membership changes."
  },
  {
    id: "ORG-MODELS-TX-SYNC-LEGACY",
    file: "functions/src/orgMembers.ts",
    line: 43,
    date: "2026-11-20",
    reason: "Admin transaction syncing member editors.users across legacy viewers.org models during membership changes."
  },
  {
    id: "ORG-INVITATIONS-CAPACITY-CHECK",
    file: "functions/src/orgMembers.ts",
    line: 147,
    date: "2026-11-20",
    reason: "Admin transaction counting pending org invitations (bounded <= seatLimit 1..150) during createInvitation."
  },
  {
    id: "WEEKLY-DIGEST-FETCH-MOCK-FALLBACK",
    file: "functions/src/notifications/weeklyDigest.ts",
    line: 512,
    date: "2026-11-20",
    reason: "MIPA-37: Test-mock fallback branch only reached when mock collection lacks .limit(); production uses db.getAll or .limit(1000)."
  },
  {
    id: "WEEKLY-DIGEST-ACTIONS-MOCK-FALLBACK",
    file: "functions/src/notifications/weeklyDigest.ts",
    line: 580,
    date: "2026-11-20",
    reason: "MIPA-37: Test-mock fallback branch only reached when mock query lacks .limit(); production always executes .limit(actionCap)."
  }
];

const SELF_GUARD_PATH = "src/utils/unboundedReadsGuard.js";
const GENERIC_BIND_WRAPPER_PATH = "src/store/firestore-bind.js";

/**
 * Strips // and /* *\/ comments while keeping all newlines intact so 1-based line numbers
 * match the original file verbatim. Respects string and regex literals.
 */
export function stripCommentsPreservingLines(source) {
  const out = [];
  let i = 0;
  const len = source.length;
  let state = "code"; // "code" | "single" | "double" | "template" | "regex" | "line_comment" | "block_comment"
  let inRegexClass = false;
  let prevNonSpaceChar = "";

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : "";

    if (state === "line_comment") {
      if (ch === "\n") {
        state = "code";
        out.push("\n");
      } else {
        out.push(ch === "\r" ? "\r" : " ");
      }
      i++;
      continue;
    }

    if (state === "block_comment") {
      if (ch === "*" && next === "/") {
        out.push("  ");
        state = "code";
        i += 2;
      } else {
        out.push(ch === "\n" ? "\n" : ch === "\r" ? "\r" : " ");
        i++;
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      out.push(ch);
      if (ch === "\\") {
        if (i + 1 < len) {
          out.push(source[i + 1]);
          i += 2;
          continue;
        }
      } else if (
        (state === "single" && ch === "'") ||
        (state === "double" && ch === '"') ||
        (state === "template" && ch === "`")
      ) {
        state = "code";
        prevNonSpaceChar = ch;
      }
      i++;
      continue;
    }

    if (state === "regex") {
      out.push(ch);
      if (ch === "\\") {
        if (i + 1 < len) {
          out.push(source[i + 1]);
          i += 2;
          continue;
        }
      } else if (ch === "[" && !inRegexClass) {
        inRegexClass = true;
      } else if (ch === "]" && inRegexClass) {
        inRegexClass = false;
      } else if (ch === "/" && !inRegexClass) {
        state = "code";
        prevNonSpaceChar = "/";
      } else if (ch === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    // state === "code"
    if (ch === "/" && next === "/") {
      out.push("  ");
      state = "line_comment";
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      out.push("  ");
      state = "block_comment";
      i += 2;
      continue;
    }
    if (ch === "'") {
      state = "single";
      out.push(ch);
      i++;
      continue;
    }
    if (ch === '"') {
      state = "double";
      out.push(ch);
      i++;
      continue;
    }
    if (ch === "`") {
      state = "template";
      out.push(ch);
      i++;
      continue;
    }
    if (ch === "/" && "=(,[!:&|?{};~^+-*%".includes(prevNonSpaceChar || "=")) {
      state = "regex";
      inRegexClass = false;
      out.push(ch);
      i++;
      continue;
    }

    out.push(ch);
    if (!/\s/.test(ch)) {
      prevNonSpaceChar = ch;
    }
    i++;
  }

  return out.join("");
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function extractBalancedParen(text, openParenIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0 && ch === ")") {
        return {
          inner: text.slice(openParenIndex + 1, i),
          innerStart: openParenIndex + 1,
          endIndex: i
        };
      }
    }
  }
  return null;
}

function splitTopLevelArgs(argsText, baseOffset = 0) {
  const args = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      args.push({
        text: argsText.slice(start, i),
        offset: baseOffset + start
      });
      start = i + 1;
    }
  }
  args.push({
    text: argsText.slice(start),
    offset: baseOffset + start
  });
  return args;
}

function splitTopLevelTernary(exprText, baseOffset) {
  let depth = 0;
  let quote = null;
  let qMarkIndex = -1;
  let ternaryDepth = 0;

  for (let i = 0; i < exprText.length; i++) {
    const ch = exprText[i];
    const next = i + 1 < exprText.length ? exprText[i + 1] : "";
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 0) continue;

    // Ignore optional chaining '?.' and nullish coalescing '??'
    if (ch === "?" && next !== "." && next !== "?") {
      if (qMarkIndex === -1) {
        qMarkIndex = i;
      } else {
        ternaryDepth++;
      }
    } else if (ch === "?" && next === "?") {
      i++;
    } else if (ch === ":" && qMarkIndex !== -1) {
      if (ternaryDepth === 0) {
        return {
          trueExpr: exprText.slice(qMarkIndex + 1, i),
          trueOffset: baseOffset + qMarkIndex + 1,
          falseExpr: exprText.slice(i + 1),
          falseOffset: baseOffset + i + 1
        };
      }
      ternaryDepth--;
    }
  }
  return null;
}

function hasBoundConstraint(exprText) {
  return /\b(?:limit|limitToLast|startAt|startAfter|endAt|endBefore)\s*\(/.test(exprText);
}

function isSingleDocRead(exprText) {
  const trimmed = exprText.trim();
  if (/^\s*doc\s*\(/.test(trimmed)) return true;
  if (/\.\s*doc\s*\([^)]*\)\s*(?:\.\s*get\s*\(\s*\))?\s*$/.test(trimmed)) return true;
  if (/\.\s*count\s*\(\s*\)/.test(trimmed)) return true;
  return false;
}

function isCollectionExpression(exprText) {
  return /\b(?:collection|collectionGroup|query)\s*\(/.test(exprText) ||
    /\.\s*(?:collection|collectionGroup)\s*\(/.test(exprText);
}

/**
 * Collects local variable assignments and reassignments preceding `beforeOffset`
 * within the current function/block scope.
 */
function resolveVariableChain(stripped, varName, beforeOffset, visited = new Set()) {
  if (visited.has(varName)) return "";
  visited.add(varName);

  const scopeStart = Math.max(0, beforeOffset - 8000);
  const windowText = stripped.slice(scopeStart, beforeOffset);
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Match declarations like `const q = ...;` or `let actionsQuery: Type = ...;` and reassignments
  const declPattern = new RegExp(
    `(?:(?:const|let|var)\\s+${escaped}(?:\\s*:[^=]+)?\\s*=|\\b${escaped}\\s*=)([\\s\\S]*?);`,
    "g"
  );
  const assignments = [];
  let m;
  while ((m = declPattern.exec(windowText)) !== null) {
    // Avoid matching `==` or `===`
    const fullMatch = m[0];
    if (/^\s*==/.test(m[1])) continue;
    if (fullMatch.includes("==") && !fullMatch.includes("= ")) {
      // double check the '=' isn't part of '==' or '!=' or '<=' or '>='
      const eqIdx = fullMatch.indexOf("=");
      const prevChar = eqIdx > 0 ? fullMatch[eqIdx - 1] : "";
      const nextChar = eqIdx + 1 < fullMatch.length ? fullMatch[eqIdx + 1] : "";
      if ("=!<>".includes(prevChar) || nextChar === "=") continue;
    }
    const rhsOffset = scopeStart + m.index + (m[0].length - m[1].length - 1);
    assignments.push({ rhs: m[1].trim(), rhsOffset });
  }

  if (assignments.length === 0) return "";

  const combined = assignments.map((a) => a.rhs).join(" ; ");
  // Recursively expand referenced identifiers (e.g. `nodesQuery` -> `nodesCol`)
  let expanded = combined;
  const identMatches = combined.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) || [];
  for (const ident of new Set(identMatches)) {
    if (
      ident === varName ||
      ["collection", "collectionGroup", "query", "where", "orderBy", "limit", "limitToLast", "doc", "db", "firebaseDb"].includes(ident)
    ) {
      continue;
    }
    const resolved = resolveVariableChain(stripped, ident, assignments[0].rhsOffset, new Set(visited));
    if (resolved && (isCollectionExpression(resolved.expanded) || hasBoundConstraint(resolved.expanded))) {
      expanded += " ; " + resolved.expanded;
    }
  }

  return {
    latest: assignments[assignments.length - 1],
    combined,
    expanded
  };
}

function normalizeFilePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function findMatchingException(exceptions, filePath, line) {
  const norm = normalizeFilePath(filePath);
  return (exceptions || []).find((ex) => normalizeFilePath(ex.file) === norm && Number(ex.line) === Number(line));
}

function buildViolation(filePath, line, rawLines) {
  const snippet = (rawLines[line - 1] || "").trim();
  return {
    file: normalizeFilePath(filePath),
    line,
    snippet,
    message: `${normalizeFilePath(filePath)}:${line} — Unbounded Firestore collection read without limit() or window: ${snippet}`
  };
}

/**
 * Scans a single JS/TS/Vue source file for unbounded Firestore collection reads.
 */
export function scanSourceForUnboundedReads(sourceText, filePath, exceptions = UNBOUNDED_READ_EXCEPTIONS) {
  const normPath = normalizeFilePath(filePath);
  if (normPath === SELF_GUARD_PATH || normPath === GENERIC_BIND_WRAPPER_PATH) {
    return { violations: [], approvedExceptionsHit: [], checkedReads: 0 };
  }

  const stripped = stripCommentsPreservingLines(sourceText);
  const rawLines = sourceText.split(/\r?\n/);
  const violations = [];
  const approvedExceptionsHit = [];
  const recordedSites = new Set();
  let checkedReads = 0;

  const inspectReadCandidate = (exprText, exprOffset, sinkLine) => {
    const trimmed = exprText.trim();
    if (!trimmed) return;

    // 1. Check direct ternary or variable ternary
    const directTernary = splitTopLevelTernary(exprText, exprOffset);
    if (directTernary) {
      inspectReadCandidate(directTernary.trueExpr, directTernary.trueOffset, lineNumberAt(stripped, directTernary.trueOffset));
      inspectReadCandidate(directTernary.falseExpr, directTernary.falseOffset, lineNumberAt(stripped, directTernary.falseOffset));
      return;
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) {
      const resolved = resolveVariableChain(stripped, trimmed, exprOffset);
      if (!resolved) return;

      const latestTernary = splitTopLevelTernary(resolved.latest.rhs, resolved.latest.rhsOffset);
      if (latestTernary) {
        inspectReadCandidate(
          latestTernary.trueExpr,
          latestTernary.trueOffset,
          lineNumberAt(stripped, latestTernary.trueOffset)
        );
        inspectReadCandidate(
          latestTernary.falseExpr,
          latestTernary.falseOffset,
          lineNumberAt(stripped, latestTernary.falseOffset)
        );
        return;
      }

      inspectBranch(resolved.expanded, sinkLine, resolved.expanded);
      return;
    }

    // Inline expression with potential nested variable identifiers (e.g. query(nodesCol, limit(50)))
    let expandedExpr = trimmed;
    const idents = trimmed.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) || [];
    for (const ident of new Set(idents)) {
      if (["collection", "collectionGroup", "query", "where", "orderBy", "limit", "doc", "firebaseDb", "db"].includes(ident)) {
        continue;
      }
      const res = resolveVariableChain(stripped, ident, exprOffset);
      if (res && res.expanded) {
        expandedExpr += " ; " + res.expanded;
      }
    }
    inspectBranch(expandedExpr, sinkLine, expandedExpr);
  };

  const inspectBranch = (branchExpr, reportLine, fallbackContext) => {
    const trimmed = branchExpr.trim();
    if (!trimmed) return;

    // If the ternary branch itself is a variable name (e.g. `nodesCol`), expand it
    let effective = trimmed;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) && fallbackContext) {
      effective = fallbackContext;
    }

    if (isSingleDocRead(effective)) return;
    if (!isCollectionExpression(effective)) return;

    checkedReads++;
    if (hasBoundConstraint(effective)) return;

    const siteKey = `${normPath}:${reportLine}`;
    if (recordedSites.has(siteKey)) return;
    recordedSites.add(siteKey);

    const ex = findMatchingException(exceptions, normPath, reportLine);
    if (ex) {
      approvedExceptionsHit.push({ ...ex, line: reportLine });
    } else {
      violations.push(buildViolation(normPath, reportLine, rawLines));
    }
  };

  // A. Client SDK sinks: bindFirestoreRef(key, queryOrDoc, ...), getDocs(query), onSnapshot(queryOrDoc, ...)
  const clientSinkRe = /\b(bindFirestoreRef|getDocs|onSnapshot)\s*\(/g;
  let match;
  while ((match = clientSinkRe.exec(stripped)) !== null) {
    const fnName = match[1];
    const openIdx = match.index + match[0].length - 1;
    const paren = extractBalancedParen(stripped, openIdx);
    if (!paren) continue;

    const args = splitTopLevelArgs(paren.inner, paren.innerStart);
    const targetArg = fnName === "bindFirestoreRef" ? args[1] : args[0];
    if (!targetArg) continue;

    const sinkLine = lineNumberAt(stripped, match.index);
    inspectReadCandidate(targetArg.text, targetArg.offset, sinkLine);
  }

  // B. Admin SDK sinks (used in Cloud Functions): tx.get(...) and <chain>.get()
  const txGetRe = /\btx\s*\.\s*get\s*\(/g;
  while ((match = txGetRe.exec(stripped)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const paren = extractBalancedParen(stripped, openIdx);
    if (!paren) continue;
    const args = splitTopLevelArgs(paren.inner, paren.innerStart);
    if (!args[0]) continue;
    const sinkLine = lineNumberAt(stripped, match.index);
    inspectReadCandidate(args[0].text, args[0].offset, sinkLine);
  }

  // Match .get() receiver chains
  const dotGetRe = /\.\s*get\s*\(\s*\)/g;
  while ((match = dotGetRe.exec(stripped)) !== null) {
    // Walk backwards across chained calls/identifiers/member expressions to capture full receiver
    let i = match.index - 1;
    let depth = 0;
    let quote = null;
    while (i >= 0) {
      const ch = stripped[i];
      if (quote) {
        if (ch === quote && stripped[i - 1] !== "\\") quote = null;
        i--;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        quote = ch;
        i--;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        depth++;
        i--;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        if (depth === 0) break;
        depth--;
        i--;
        continue;
      }
      if (depth === 0 && !/[A-Za-z0-9_$.\s]/.test(ch)) {
        break;
      }
      i--;
    }
    const receiver = stripped.slice(i + 1, match.index).trim();
    if (!receiver) continue;

    // Skip single-doc `.doc(...).get()` and aggregation `.count().get()`
    if (isSingleDocRead(receiver)) continue;

    const sinkLine = lineNumberAt(stripped, match.index);
    inspectReadCandidate(receiver, i + 1, sinkLine);
  }

  return { violations, approvedExceptionsHit, checkedReads };
}

function collectFilesToScan(rootDir, targets) {
  const files = [];
  for (const relTarget of targets) {
    const full = path.resolve(rootDir, relTarget);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      files.push(relTarget.replace(/\\/g, "/"));
    } else if (stat.isDirectory()) {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(abs);
          } else if (/\.(js|ts|vue)$/.test(entry.name) && !/\.(test|spec)\.(js|ts)$/.test(entry.name)) {
            files.push(path.relative(rootDir, abs).replace(/\\/g, "/"));
          }
        }
      };
      walk(full);
    }
  }
  return files.sort();
}

/**
 * Scans all configured workspace directories/files for unbounded Firestore collection reads.
 */
export function scanWorkspaceForUnboundedReads(
  rootDir = process.cwd(),
  options = {}
) {
  const targets = options.targets || DEFAULT_SCAN_TARGETS;
  const exceptions = options.exceptions || UNBOUNDED_READ_EXCEPTIONS;
  const files = collectFilesToScan(rootDir, targets);

  const violations = [];
  const approvedExceptionsHit = [];
  let totalCheckedReads = 0;

  for (const relFile of files) {
    const abs = path.resolve(rootDir, relFile);
    const content = fs.readFileSync(abs, "utf8");
    const res = scanSourceForUnboundedReads(content, relFile, exceptions);
    violations.push(...res.violations);
    approvedExceptionsHit.push(...res.approvedExceptionsHit);
    totalCheckedReads += res.checkedReads;
  }

  return {
    guardKind: GUARD_KIND,
    scannedFiles: files.length,
    totalCheckedReads,
    violations,
    approvedExceptionsHit
  };
}

/**
 * Validates that every registered exception carries a non-empty reason,
 * a valid ISO YYYY-MM-DD date, and points to an existing workspace file/line.
 */
export function validateExceptionList(
  exceptions = UNBOUNDED_READ_EXCEPTIONS,
  rootDir = process.cwd()
) {
  const errors = [];
  const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

  for (const ex of exceptions || []) {
    if (!ex || typeof ex !== "object") {
      errors.push("Exception entry must be an object.");
      continue;
    }
    if (!ex.id || typeof ex.id !== "string") {
      errors.push(`Exception at ${ex.file}:${ex.line} is missing an id.`);
    }
    if (!ex.file || typeof ex.file !== "string") {
      errors.push(`Exception ${ex.id || "(unknown)"} is missing a file path.`);
      continue;
    }
    if (!Number.isInteger(ex.line) || ex.line < 1) {
      errors.push(`Exception ${ex.id} has invalid line number: ${ex.line}.`);
    }
    if (!ex.date || !isoDateRe.test(ex.date)) {
      errors.push(`Exception ${ex.id} (${ex.file}:${ex.line}) must carry an ISO YYYY-MM-DD date.`);
    }
    if (!ex.reason || typeof ex.reason !== "string" || ex.reason.trim().length < 15) {
      errors.push(`Exception ${ex.id} (${ex.file}:${ex.line}) must carry an explicit reason (>= 15 chars).`);
    }

    const abs = path.resolve(rootDir, ex.file);
    if (!fs.existsSync(abs)) {
      errors.push(`Exception ${ex.id} references missing file: ${ex.file}.`);
    } else {
      const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
      if (ex.line > lines.length) {
        errors.push(`Exception ${ex.id} line ${ex.line} exceeds ${ex.file} length (${lines.length}).`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Measures Firestore read cost per active organisation using production mipa-2
 * collection telemetry (2026-11-18: 88 orgs, 89 models, 1,535 nodes, 264 actions)
 * and compares bounded vs. unbounded reads at both current average and large scale.
 */
export function measureOrgFirestoreReadCost(options = {}) {
  const pricePerReadUsd = options.pricePerReadUsd ?? 0.0000006; // $0.06 per 100,000 reads
  const defaultBound = options.defaultBound ?? 50;
  const memberSessionsPerMonth = options.memberSessionsPerMonth ?? 100;
  const contextReadsPerSession = options.contextReadsPerSession ?? 13;

  const computeScenario = ({ name, nodesPerModel, actionsPerOrg, dossierViewsPerMonth }) => {
    // Unbounded reads per session/view
    const unboundedSessionReads = contextReadsPerSession + nodesPerModel + actionsPerOrg;
    const unboundedDossierReads = 1 + nodesPerModel + actionsPerOrg;
    const unboundedMonthlyReads =
      memberSessionsPerMonth * unboundedSessionReads +
      dossierViewsPerMonth * unboundedDossierReads;

    // Bounded reads (limit(50) + 1 count read per collection on workspace; limit(50) + 1 count + projected actions on dossier)
    const boundedNodesReads = Math.min(nodesPerModel, defaultBound) + 1;
    const boundedActionsReads = Math.min(actionsPerOrg, defaultBound) + 1;
    const boundedSessionReads = contextReadsPerSession + boundedNodesReads + boundedActionsReads;
    const boundedDossierReads = 1 + boundedNodesReads + Math.min(actionsPerOrg, 1000);
    const boundedMonthlyReads =
      memberSessionsPerMonth * boundedSessionReads +
      dossierViewsPerMonth * boundedDossierReads;

    const savedMonthlyReads = Math.max(0, unboundedMonthlyReads - boundedMonthlyReads);
    const reductionPct = unboundedMonthlyReads > 0
      ? Number(((savedMonthlyReads / unboundedMonthlyReads) * 100).toFixed(2))
      : 0;

    return {
      name,
      nodesPerModel,
      actionsPerOrg,
      memberSessionsPerMonth,
      dossierViewsPerMonth,
      unbounded: {
        readsPerMemberSession: unboundedSessionReads,
        readsPerDossierView: unboundedDossierReads,
        monthlyReads: unboundedMonthlyReads,
        monthlyCostUsd: Number((unboundedMonthlyReads * pricePerReadUsd).toFixed(6))
      },
      bounded: {
        readsPerMemberSession: boundedSessionReads,
        readsPerDossierView: boundedDossierReads,
        monthlyReads: boundedMonthlyReads,
        monthlyCostUsd: Number((boundedMonthlyReads * pricePerReadUsd).toFixed(6))
      },
      savings: {
        monthlyReadsSaved: savedMonthlyReads,
        monthlyCostSavedUsd: Number((savedMonthlyReads * pricePerReadUsd).toFixed(6)),
        reductionPct
      }
    };
  };

  // Production mipa-2 average (88 orgs, 89 models, 1,535 nodes -> 17.25 nodes/model; 264 actions -> 3.00 actions/org)
  const productionAverage = computeScenario({
    name: "mipa-2 Production Average Active Org (2026-11-18)",
    nodesPerModel: 17.25,
    actionsPerOrg: 3.0,
    dossierViewsPerMonth: 50
  });

  // Large-scale org (500 factors, 400 actions, 500 shared dossier views/mo)
  const largeScaleOrg = computeScenario({
    name: "Large Scale Org (500 factors, 400 actions, public dossier traffic)",
    nodesPerModel: 500,
    actionsPerOrg: 400,
    dossierViewsPerMonth: 500
  });

  return {
    telemetryDate: "2026-11-18",
    telemetrySource: "mipa-2 production (88 orgs, 89 models, 1,535 nodes, 264 actions)",
    pricePer100kReadsUsd: Number((pricePerReadUsd * 100_000).toFixed(4)),
    defaultBound,
    productionAverage,
    largeScaleOrg
  };
}
