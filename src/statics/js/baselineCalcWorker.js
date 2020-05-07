//import { parse, format, toTex } from "mathjs";
importScripts("https://unpkg.com/mathjs@6.6.4/dist/math.min.js");

const parser = self.math.parser();

onmessage = function(e) {
  //console.log("Message received from main script");
  //console.log(e.data);

  let nodes = e.data.modelNodes.map(simplifyForSort);
  //console.log("nodes: ", nodes);
  let sortedNodes = [];

  try {
    sortedNodes = topoSort(nodes);
  } catch (err) {
    this.postMessage(err);
  }

  //import custom functions
  delay.rawArgs = true;
  math.import({
    delay: delay
  });

  //prepare scope object
  let initialTimeS = Math.floor(Date.now() / 1000);
  //let initialDate = new Date(initialTimeS * 1000);
  //console.log({ initialDate });

  let scope = {
    timeS: initialTimeS,
    deltaT: math.unit("1 day"),
    timeSeries: { timeSPoints: [] }
  }; //todo: load timeSeries with current or historical values
  sortedNodes.forEach(function(node, index) {
    scope.timeSeries[node.id] = [];
  });
  let err = null;
  let formulasArray = [];
  let completedLoops = 0;

  try {
    // gather up current values from nodes into scope
    sortedNodes.forEach(function(node, index) {
      scope[node.id] = node.currentValue;
    });
    // gather up formulas from nodes into an array ordered by calculation order
    formulasArray = sortedNodes.map(node => node.id + " = " + node.sysFormula);
    //console.log(formulasArray);

    console.log({ scope });
    while (completedLoops <= 5) {
      // evaluate the formulas
      math.evaluate(formulasArray, scope);

      //save time and node values into results object
      scope.timeSeries.timeSPoints.push(scope.timeS);
      sortedNodes.forEach(function(node, index) {
        scope.timeSeries[node.id].push(scope[node.id]);
      });
      scope.timeS = scope.timeS + scope.deltaT.toNumber("seconds");
      completedLoops++;
    }
  } catch (err) {
    this.postMessage(err);
  }
  //console.log("Posting message back to main script");
  postMessage(scope.timeSeries);
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
    console.log("unvisitedNodes: ", unvisitedNodes);
    throw "Circular dependency detected.";
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
    influencees:
      typeof node.influencees !== "undefined" ? node.influencees : [],
    sysFormula: typeof node.sysFormula !== "undefined" ? node.sysFormula : "",
    currentValue:
      typeof node.currentValue !== "undefined" ? node.currentValue : ""
  };
}

function delay(args, math, scope) {
  let symbol = args[0].name;
  let delayTime = args[1].compile().evaluate(scope);
  //console.log("symbol:", symbol);
  //console.log("delayTime:", delayTime);

  let values = scope.timeSeries[symbol];
  let timeSPoints = scope.timeSeries.timeSPoints;
  let defaultValue = scope[symbol];
  let targetTimeS = scope.timeS - delayTime.toNumber("seconds");
  //let date = new Date(targetTimeS * 1000);
  //console.log({ date });

  //interpolate value of symbol at t-delayTime
  return interpolate(timeSPoints, values, targetTimeS, defaultValue);
}

function interpolate(rawTimeSPoints, rawValues, targetTimeS, defaultValue) {
  let timeSPoints = [];
  let values = [];
  //extract only available data points
  for (var i = 0; i < rawTimeSPoints.length; i++) {
    if (typeof rawValues[i] == "number");
    {
      timeSPoints.push(rawTimeSPoints[i]);
      values.push(rawValues[i]);
    }
  }
  //console.log("timeSPoints", timeSPoints);
  //console.log("values", values);

  //if symbol has no history, then return default value
  if (values.length == 0) return defaultValue;
  //else if history starts after current time, then return default value if available, or first value
  else if (timeSPoints[0] > targetTimeS)
    return typeof defaultValue == "number" ? defaultValue : values[0];
  //else if history ends before current time, then return last value
  else if (timeSPoints[timeSPoints.length - 1] < targetTimeS)
    return values[values.length - 1];
  //else interpolate
  else {
    return interpolateFromLookup(timeSPoints, values, targetTimeS);
  }
}

function interpolateFromLookup(timeSPoints, values, targetTimeS) {
  console.log({ timeSPoints, values, targetTimeS });

  var i = 0;
  //find index when targetTimeS equals or exceeds position in timeSPoints
  while (timeSPoints[i] < targetTimeS) {
    i++;
  }
  if (i == 0) return values[0];
  let t0 = timeSPoints[i - 1];
  let t1 = timeSPoints[i];
  let v0 = values[i - 1];
  let v1 = values[i];
  let vt = v0 + ((targetTimeS - t0) * (v1 - v0)) / (t1 - t0);
  console.log({ i, t0, t1, v0, v1, targetTimeS, vt });
  return vt;
}
