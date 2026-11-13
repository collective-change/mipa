// Compare how two mathjs versions parse the same formula.
//
// Each formula is parsed with both versions and reduced to a version-neutral
// structural form (operators, function names, symbols, constants), ignoring
// cosmetic differences such as redundant parentheses. If the two structures
// differ, the formula means something different under the new version.

import * as mathOld from "mathjs-old";
import * as mathNew from "mathjs-new";

// String arguments that the calc engine itself parses as expressions (for
// example the time adjustment in date functions) are compared recursively.
function canon(node, math) {
  if (node.type === "ParenthesisNode") return canon(node.content, math);

  const children = [];
  node.forEach(child => children.push(canon(child, math)));

  let tag = node.type;
  switch (node.type) {
    case "OperatorNode":
      tag += `:${node.fn}`;
      break;
    case "FunctionNode":
      tag += `:${node.fn && node.fn.name ? node.fn.name : canon(node.fn, math)}`;
      break;
    case "SymbolNode":
      tag += `:${node.name}`;
      break;
    case "ConstantNode":
      if (typeof node.value === "string") {
        tag += `:string:${canonString(node.value, math)}`;
      } else {
        tag += `:${typeof node.value}:${String(node.value)}`;
      }
      break;
    case "AssignmentNode":
    case "FunctionAssignmentNode":
      tag += `:${node.name}`;
      if (node.params) tag += `(${node.params.join(",")})`;
      break;
    case "ObjectNode":
      tag += `:${Object.keys(node.properties).join(",")}`;
      break;
    case "RelationalNode":
      tag += `:${node.conditionals.join(",")}`;
      break;
    case "AccessorNode":
    case "IndexNode":
      if (node.dotNotation) tag += ":dot";
      break;
  }
  return children.length ? `${tag}(${children.join(" ")})` : tag;
}

function canonString(value, math) {
  try {
    return `expr[${canon(math.parse(value), math)}]`;
  } catch {
    return JSON.stringify(value);
  }
}

function interpret(formula, math) {
  try {
    const node = math.parse(formula);
    return {
      ok: true,
      canon: canon(node, math),
      shown: node.toString({ parenthesis: "all", implicit: "show" })
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Returns null when both versions agree, otherwise a description of the change.
export function compareFormula(formula) {
  if (typeof formula !== "string" || formula.trim() === "") return null;

  const before = interpret(formula, mathOld);
  const after = interpret(formula, mathNew);

  if (before.ok && after.ok) {
    if (before.canon === after.canon) return null;
    return { kind: "meaning changed", before: before.shown, after: after.shown };
  }
  if (!before.ok && !after.ok) {
    return { kind: "invalid in both", before: before.error, after: after.error };
  }
  if (before.ok) {
    return { kind: "no longer parses", before: before.shown, after: after.error };
  }
  return { kind: "parses now (was invalid)", before: before.error, after: after.shown };
}

export const versions = { old: mathOld.version, new: mathNew.version };
