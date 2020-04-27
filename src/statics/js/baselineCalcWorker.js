//import { parse, format, toTex } from "mathjs";
importScripts("https://unpkg.com/mathjs@6.6.4/dist/math.min.js");

const parser = self.math.parser();

onmessage = function(e) {
  //console.log("Message received from main script");
  console.log(e.data);
  let modelNodes = e.data.nodes;

  const expr = e.data.expr;
  let result = null;
  let err = null;
  let scope = {};
  let formulasArray = [];

  try {
    // gather up formulas from nodes into an array ordered by calculation order
    // i.e. do topological sorting
    formulasArray = [];

    // evaluate the expression
    result = parser.evaluate(expr);
    math.evaluate(formulasArray, scope);
  } catch (e) {
    // return the error
    err = e;
  }

  //console.log("Posting message back to main script");
  console.log("result ", result);
  postMessage(result);
};
