//import { parse, format, toTex } from "mathjs";
importScripts("https://unpkg.com/mathjs@6.6.4/dist/math.min.js");

const parser = self.math.parser();

onmessage = function(e) {
  //console.log("Message received from main script");
  //console.log(e.data);

  let nodes = e.data.modelNodes.map(simplifyForSort);
  //console.log("nodes: ", nodes);

  let sortedNodes = topoSort(nodes);

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

function topoSort(nodes) {
  let L = []; //for storing sorted elements
  let S = nodes.filter(node => node.inDegree == 0); //nodes with no incoming edges
  let unvisitedNodes = nodes.filter(node => node.inDegree != 0);
  let n = null; //node to process
  let influencee = null; //a working variable

  while (S.length) {
    // remove a node n from S and append to tail of L
    n = S.shift();
    L.push(n);
    //console.log("n: ", n);
    n.influencees.forEach(function(influenceeId, index) {
      influencee = unvisitedNodes.find(node => node.id == influenceeId);
      influencee.inDegree--;
      if (influencee.inDegree == 0) {
        S.push(influencee);
        //remove influencee from unvisited nodes
        for (var i = 0; i < unvisitedNodes.length; i++) {
          if (unvisitedNodes[i] === influencee) {
            unvisitedNodes.splice(i, 1);
          }
        }
      }
    });
  }
  //if number of sorted nodes is not the same as incoming nodes, then graph has at least one cycle
  if (unvisitedNodes.length) {
    //console.log("unvisitedNodes: ", unvisitedNodes);
    return "Graph has at least one cycle";
  } else {
    //console.log("L: ", L);
    return L;
  }
}

function simplifyForSort(node) {
  return {
    id: node.id,
    name: node.name,
    inDegree:
      typeof node.influencers !== "undefined" ? node.influencers.length : 0,
    influencees: node.influencees !== "undefined" ? node.influencees : []
  };
}
