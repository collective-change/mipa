//import { parse, format, toTex } from "mathjs";
importScripts("https://unpkg.com/mathjs@6.6.4/dist/math.min.js");

const parser = self.math.parser();

onmessage = function(e) {
  let startTime = new Date();
  //console.log("Message received from main script");
  //console.log(e.data);

  let nodes = prepForSort(e.data.modelNodes);
  //let nodes = e.data.modelNodes.map(simplifyForSort);
  //console.log("nodes: ", nodes);
  let sortedNodes = topoSort(nodes);

  //import custom functions
  delay.rawArgs = true;
  math.import({
    delay: delay
  });

  //create custom units
  math.createUnit({
    person: { baseName: "person", aliases: ["persons", "people"] }
  });

  //prepare scope object
  let initialTimeS = Math.floor(Date.now() / 1000);
  //let initialDate = new Date(initialTimeS * 1000);
  //console.log({ initialDate });

  let scope = {
    initialTimeS: initialTimeS, //this will remain constant throughout the simulation
    timeS: initialTimeS, //timeS will increment with each iteration
    dt: math.unit("1 day"), //delta time
    timeSeries: { timeSPoints: [], nodes: {} }
  }; //todo: load timeSeries with current or historical values
  sortedNodes.forEach(function(node, index) {
    scope.timeSeries.nodes[node.id] = [];
  });
  //console.log({ sortedNodes });

  let completedLoops = 0;
  let maxLoops = 10;

  try {
    // gather up current values from nodes into scope
    console.log("begin loading");
    sortedNodes.forEach(function(node, index) {
      //console.log({ node });
      if ("currentValue" in node && node.currentValue != "") {
        //console.log("yay");
        scope["$" + node.id] = math.unit(Number(node.currentValue), node.unit);
        //console.log("in");
      }
    });
    //console.log({ scope });

    // gather up formulas from nodes into an array ordered by calculation order
    let expressionsArray = sortedNodes.map(function(node) {
      //if formula includes a variable then save it
      if (node.sysFormula.includes("$")) {
        return "$" + node.id + " = " + node.sysFormula;
      } else {
        //else set as value and units
        return (
          "$" + node.id + " = unit(" + node.sysFormula + ",'" + node.unit + "')"
        );
      }
    });

    let compiledExpressions = expressionsArray.map(function(expression) {
      return math.parse(expression).compile();
    });

    while (completedLoops < maxLoops) {
      //console.log("starting loop ", completedLoops + 1);
      // evaluate the formulas
      compiledExpressions.forEach(function(code, index) {
        //todo: if timeS == initialTimeS then evaluate current value
        code.evaluate(scope);
        //todo: if on first few loops, check result of evaluation against units expected by user.
      });

      //save time and node values into results object
      scope.timeSeries.timeSPoints.push(scope.timeS);
      sortedNodes.forEach(function(node, index) {
        scope.timeSeries.nodes[node.id].push(scope["$" + node.id]);
      });
      scope.timeS = scope.timeS + scope.dt.toNumber("seconds");
      completedLoops++;
      this.postMessage({ progressValue: completedLoops / maxLoops });
      //console.log("completed loop ", completedLoops);
    }
  } catch (err) {
    console.log(err);
    this.postMessage(err);
  }

  //clean up scope.timeSeries for posting back to main script
  //console.log(scope);
  let resultTimeSeriesNodesValues = {};
  sortedNodes.forEach(function(node, index) {
    let nodeValues = scope.timeSeries.nodes[node.id].map(function(val) {
      //get only the numeric value of each value entry in the array
      if (typeof val == "number") {
        return val;
      } else {
        return val.toNumber(node.unit);
      }
    });
    resultTimeSeriesNodesValues[node.id] = nodeValues;
  });

  let outputTimeSeries = {
    timeSPoints: scope.timeSeries.timeSPoints,
    nodes: resultTimeSeriesNodesValues
  };
  let endTime = new Date();
  console.log("calcTime:", endTime - startTime, "ms");
  //console.log("Posting message back to main script");
  //console.log({ scope });
  //console.log(outputTimeSeries);
  postMessage(outputTimeSeries);
};

function topoSort(nodes) {
  let L = []; //for storing sorted elements
  let S = nodes.filter(node => node.blockingInDegree == 0); //nodes with no incoming edges
  let unvisitedNodes = nodes.filter(node => node.blockingInDegree != 0);
  let n = null; //node to process
  let influencee = null; //a working variable

  while (S.length) {
    // remove a node n from S and append to tail of L
    n = S.shift();
    L.push(n);
    //console.log("n: ", n);
    n.blockedInfluencees.forEach(function(influenceeId, index) {
      influencee = unvisitedNodes.find(node => node.id == influenceeId);
      influencee.blockingInDegree--;
      if (influencee.blockingInDegree == 0) {
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
  //now try to sort out unvisited nodes (ones in or blocked by a cycle)

  try {
    //if there are unvisited nodes, then graph has at least one cycle
    if (unvisitedNodes.length) {
      console.log("unvisitedNodes: ", unvisitedNodes);
      throw "Circular dependency detected.";
    }
  } catch (err) {
    console.log(err);
    this.postMessage(err);
  }
  return L;
}

function prepForSort(nodes) {
  let preppedNodes = [];
  nodes.forEach(function(outerNode) {
    // calculate blockedInfluencees
    let blockedInfluencees = [];
    //examine each candidate node to check for current node being in blockingInfluencers
    nodes.forEach(function(innerNode) {
      if (innerNode.id != outerNode.id) {
        //skip self
        if (innerNode.blockingInfluencers.includes(outerNode.id)) {
          blockedInfluencees.push(innerNode.id);
        }
      }
    });
    preppedNodes.push({
      id: outerNode.id,
      name: outerNode.name,
      blockingInDegree: outerNode.blockingInfluencers.length,
      blockedInfluencees: blockedInfluencees,
      sysFormula:
        typeof outerNode.sysFormula !== "undefined" ? outerNode.sysFormula : "",
      unit: typeof outerNode.unit !== "undefined" ? outerNode.unit : "",
      currentValue:
        typeof outerNode.currentValue !== "undefined"
          ? outerNode.currentValue
          : ""
    });
  });
  return preppedNodes;
}

function simplifyForSort(node) {
  return {
    id: node.id,
    name: node.name,
    inDegree:
      typeof node.influencers !== "undefined"
        ? node.blockingInfluencers.length
        : 0,
    influencees:
      typeof node.influencees !== "undefined" ? node.influencees : [],
    sysFormula: typeof node.sysFormula !== "undefined" ? node.sysFormula : "",
    unit: typeof node.unit !== "undefined" ? node.unit : "",
    currentValue:
      typeof node.currentValue !== "undefined" ? node.currentValue : ""
  };
}

function delay(args, math, scope) {
  let $nodeId = args[0].name;
  let nodeId = $nodeId.substr(1);
  let delayTime = args[1].compile().evaluate(scope);
  let initialValue = null;
  if (args.length <= 1) {
    console.error('"delay" function needs at least 2 arguments.');
    throw '"delay" function needs at least 2 arguments.';
  } else if (args.length == 2) {
    //no initial value defined
  } else if (args.length == 3) {
    if (typeof args[2] == "number") initialValue = args[2];
    else if (args[2] == "best_guess") initialValue = "best_guess";
    else {
      console.error("Initial value not recognized for " + nodeId);
      throw "Initial value not recognized for " + nodeId;
    }
  } else {
    console.error('"delay" function takes at most 3 arguments.');
    throw '"delay" function takes at most 3 arguments.';
  }

  let values = scope.timeSeries.nodes[nodeId];
  let timeSPoints = scope.timeSeries.timeSPoints;
  //let defaultValue = scope[$nodeId];
  let targetTimeS = scope.timeS - delayTime.toNumber("seconds");

  //interpolate value at targetTimeS
  return interpolate(timeSPoints, values, targetTimeS, initialValue);
}

function interpolate(rawTimeSPoints, rawValues, targetTimeS, initialValue) {
  let timeSPoints = [];
  let values = [];
  //extract only available data points
  //todo: only extract data points surrounding targetTimeS
  for (var i = 0; i < rawTimeSPoints.length; i++) {
    //if (typeof rawValuesWithUnits[i] == "number") {
    timeSPoints.push(rawTimeSPoints[i]);
    values.push(rawValues[i]);
    //}
  }
  //console.log(timeSPoints[0], timeSPoints[timeSPoints.length - 1], targetTimeS);
  //if symbol has no history, then return default value
  if (values.length == 0) {
    //console.log("No history; using default value.");
    if (typeof initialValue == "number") return initialValue;
    else {
      console.error("No history and no initial value available.");
      throw "No history and no initial value available.";
    }
  }
  //else if history starts after target time, then return initial value if available, or first value in history
  else if (timeSPoints[0] > targetTimeS) {
    //console.log("History starts after target time; using default value if available, else first value in history.");
    if (typeof initialValue == "number") return initialValue;
    else if (initialValue == "best_guess") return values[0];
  }
  //else if history ends before target time, then return last value in history
  else if (timeSPoints[timeSPoints.length - 1] < targetTimeS) {
    //console.log("History ends before target time; using initialValue or best_guess.");
    if (typeof initialValue == "number") return initialValue;
    else if (initialValue == "best_guess") return values[values.length - 1];
  }
  //else if history is only one point (should be at targetTimeS) then return its value
  else if (timeSPoints.length == 1) {
    //console.log("History is only one point; using it.");
    return values[0];
  }
  //else interpolate
  else {
    //console.log("Going to interpolate.");
    return interpolateFromLookup(timeSPoints, values, targetTimeS);
  }
}

function interpolateFromLookup(timeSPoints, values, targetTimeS) {
  //console.log({ timeSPoints, values, targetTimeS });

  var i = 0;
  //find index when targetTimeS equals or exceeds position in timeSPoints
  try {
    while (timeSPoints[i] < targetTimeS) {
      i++;
    }
    if (i == 0) return values[0];
    let t0 = timeSPoints[i - 1];
    let t1 = timeSPoints[i];
    let v0 = values[i - 1];
    let v1 = values[i];
    //let vt = v0 + ((targetTimeS - t0) * (v1 - v0)) / (t1 - t0);
    let vt = math.add(
      v0,
      math.divide(
        math.multiply(targetTimeS - t0, math.subtract(v1, v0)),
        t1 - t0
      )
    );
    //console.log({ t0, t1, v0, v1, targetTimeS, vt });
    return vt;
  } catch (err) {
    console.log(err);
  }
}
