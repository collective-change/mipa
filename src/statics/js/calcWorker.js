//import { parse, format, toTex } from "mathjs";
importScripts("https://unpkg.com/mathjs@6.6.4/dist/math.min.js");

const parser = self.math.parser();
var modelNodes = [];

onmessage = function(e) {
  switch (e.data.calculationType) {
    case "baseline":
      coordinateScenarioSimulations(e.data);
      //calculateBaseline(e.data);
      break;
    case "actions":
      coordinateScenarioSimulations(e.data);
      //calculateBaseline(e.data);
      break;
    default:
      console.error(
        `calculationType "${e.data.calculationType}" not recognized.`
      );
  }
};

/*
function coordinateScenarioSimulations({calculationType, requestedActions, requestedSituations})
  prep environment, scope, etc
  baseline = simulateScenario({scenario: null})
  save baseline to IndexedDb
  return if calculatonType is baseline
  if requestedIssues < all issues, add in blocked and children issues
  topoSort issues
  after initial release:
    getDisjointSets(sortedIssues)
    numLogicalProcessors = window.navigator.hardwareConcurrency
    put disjoint sets into work packages
    assign work packages to workers
    onmessage, accumulate results
  post available results to vuex store every 0.5 seconds
  when all finished, save results to IndexedDb; briefResults [{i:id, b:benefit, c:cost, r:roi, t:calcStartTime}]
  and post back to caller for saving to cloud

function getDisjointSets(sortedIssues)
  for each issue in reverse topoSort order
  getRootIssue of the issue
  put issue into same set as root

function getRootIssue()
  if issue has no parent, then return issue
  else return getRootIssue(parent)

function doWork(sim, issuesPackage)
  for each issue
    gather status and impacts of blocked and children issues
    simulateScenario including impacts from self, blocked and children issues
    calculate aggregate deviations from baseline
    post results to coordinator every 0.5 seconds and when finished
*/

function coordinateScenarioSimulations(data) {
  //prep environment, scope, etc
  let sim = prepSim(data);
  if (sim.errorOccurred) return;
  let baseline = calculateBaseline(sim);
  //todo: save baseline to IndexedDb
  if (data.calculationType == "baseline") return;

  let actions = data.actions;

  //topoSortActions
  let sortedActions = topoSortActions(actions); //todo: actually write topoSortActions
  let actionResults = calculateActionsResults(sim, sortedActions);

  //and post available results to vuex store every 0.5 seconds
  //when all finished, save results to IndexedDb; briefResults[{ i: id, b: benefit, c: cost, r: roi, t: calcStartTime }]
  //and post back to caller for saving to cloud
}

function calculateActionsResults(sim, actions) {
  //simulate each action
  actions.forEach(function(action) {
    scenario = { type: "action", action: action, actions: actions };
    resetScope(sim);
    iterateThroughTime(sim, scenario);
  });
  if (sim.errorOccurred) return;
}

function iterateThroughTime(sim, scenario) {
  let completedLoops = 0;
  let expectedUnit = null;
  while (completedLoops < sim.maxLoops) {
    // evaluate the formulas
    sim.compiledExpressions.forEach(function(code, index) {
      if (!sim.errorOccurred)
        try {
          //todo: if timeS == initialTimeS then evaluate current value
          code.evaluate(sim.scope);

          //adjust the node value by action's impacts
          //loop through each of action's impacts to see if it impacts the node just calculated
          if (scenario.type == "action") {
            //scenario.sim.scope["$" + sim.sortedNodes[index].id];
          }

          //on first 2 loops, check result of evaluation against units expected by user.
          if (completedLoops < 2) {
            expectedUnit = sim.expectedUnits[index];
            if (
              !sim.expectedUnits[index].equalBase(
                sim.scope["$" + sim.sortedNodes[index].id]
              )
            )
              throw `dimensions of expected units and calculated units do not match.
              <br/> Expected: "${expectedUnit.toString()}"
              <br/> Calculated: "${sim.scope[
                "$" + sim.sortedNodes[index].id
              ].toString()}"`;
          }
        } catch (err) {
          //console.log(err);
          this.postMessage({
            errorType: "evaluation error",
            errorMessage: `For node "${sim.sortedNodes[index].name}",  <br/> ${err}`
          });
          sim.errorOccurred = true;
        }
      if (sim.errorOccurred) return;
    });
    if (!sim.errorOccurred)
      try {
        //save time and node values into time points and value time series
        sim.scope.timeSeries.timeSPoints.push(sim.scope.timeS);
        sim.sortedNodes.forEach(function(node, index) {
          sim.scope.timeSeries.nodes[node.id].push(sim.scope["$" + node.id]);
        });
      } catch (err) {
        console.log(err);
        this.postMessage(err);
        sim.errorOccurred = true;
      }
    if (sim.errorOccurred) return;

    if (completedLoops > 0)
      sim.scope.dt = math.multiply(
        sim.scope.dt,
        1 + sim.params.timeStepGrowthRate
      );
    sim.scope.timeS = sim.scope.timeS + sim.scope.dt.toNumber("seconds");
    completedLoops++;

    //report progress every 500 ms
    if (
      new Date() - sim.lastProgressReportTime >= 500 ||
      completedLoops == sim.maxLoops
    ) {
      this.postMessage({ progressValue: completedLoops / sim.maxLoops });
      sim.lastProgressReportTime = new Date();
    }
  }
  sim.calcTimeLog.push({ stage: "iterate", endTime: new Date() });
}

function calculateBaseline(sim) {
  let scenario = { type: "baseline" };
  iterateThroughTime(sim, scenario);
  if (sim.errorOccurred) return;

  const resultTimeSeriesNodesValues = extractTimeSeriesNodesValues(sim);
  if (sim.errorOccurred) return;

  const log = sim.calcTimeLog;
  const calcTimeMs = log[log.length - 1].endTime - log[0].endTime;

  const calcTimeStages = getCalcTimeStages(log);

  const resultsMessage = {
    resultsType: "baseline",
    timeSPoints: sim.scope.timeSeries.timeSPoints,
    nodes: resultTimeSeriesNodesValues,
    calcTimeLog: sim.calcTimeLog,
    calcTimeStages: calcTimeStages,
    calcTimeMs: calcTimeMs
  };

  console.log("calcTime:", calcTimeMs, "ms");

  postMessage(resultsMessage);

  return resultsMessage;
}

function prepSim(data) {
  let sim = prepEnvironment(data);
  if (sim.errorOccurred) return sim;

  sim.nodes = prepForSort(sim);
  if (sim.errorOccurred) return sim;

  sim.sortedNodes = topoSortNodes(sim);
  if (sim.errorOccurred) return sim;

  sim.scope = prepScope(sim);
  if (sim.errorOccurred) return sim;

  loadCurrentValues(sim);
  if (sim.errorOccurred) return sim;

  sim.expressionsArray = prepExpressionsArray(sim);
  if (sim.errorOccurred) return sim;

  sim.parsedExpressions = parseExpressions(sim);
  if (sim.errorOccurred) return sim;

  sim.compiledExpressions = compileExpressions(sim);
  if (sim.errorOccurred) return sim;

  sim.expectedUnits = prepExpectedUnits(sim);
  if (sim.errorOccurred) return sim;

  return sim;
}

function prepEnvironment(data) {
  let sim = {
    calcTimeLog: [], //used for tracking calculation times of different sections
    data: data,
    errorOccurred: false,
    params: data.simulationParams,
    maxLoops: data.simulationParams.numTimeSteps + 1
  };

  sim.calcTimeLog.push({ stage: "start", endTime: new Date() });
  this.postMessage({ progressValue: 0 });
  sim.lastProgressReportTime = new Date();

  modelNodes = data.modelNodes; //make modelNodes globally accessible

  //import custom functions
  delay.rawArgs = true;
  math.import({
    delay: delay
  });

  //create currency units
  math.createUnit(data.exchangeRates.base);
  Object.keys(data.exchangeRates.rates)
    .filter(function(currency) {
      return currency !== data.exchangeRates.base;
    })
    .forEach(function(currency) {
      math.createUnit(
        currency,
        math.unit(
          1 / data.exchangeRates.rates[currency],
          data.exchangeRates.base
        )
      );
    });

  //create custom units
  math.createUnit({
    person: {
      baseName: "person",
      aliases: ["persons", "people"]
    }
  });

  sim.calcTimeLog.push({ stage: "prepEnv", endTime: new Date() });
  return sim;
}

function prepScope(sim) {
  //prepare scope object
  let initialTimeS = Math.floor(Date.now() / 1000);

  let scope = {
    initialTimeS: initialTimeS, //this will remain constant throughout the simulation
    timeS: initialTimeS, //timeS will increment with each iteration
    dt: math.unit(sim.params.timeStepNumber, sim.params.timeStepUnit), //delta time
    timeSeries: { timeSPoints: [], nodes: {} }
  }; //todo: load timeSeries with current or historical values

  sim.sortedNodes.forEach(function(node, index) {
    scope.timeSeries.nodes[node.id] = [];
  });

  sim.calcTimeLog.push({
    stage: "prep timeSeries",
    endTime: new Date()
  });
  return scope;
}

function resetScope(sim) {
  let scope = sim.scope;
  scope.timeS = scope.initialTimeS;
  scope.dt = math.unit(sim.params.timeStepNumber, sim.params.timeStepUnit);
  scope.timeSeries = { timeSPoints: [], nodes: {} };
  sim.sortedNodes.forEach(function(node, index) {
    scope.timeSeries.nodes[node.id] = [];
  });
}

function loadCurrentValues(sim) {
  // gather up current values from nodes into scope
  //console.log("begin loading currentValues");
  sim.sortedNodes.forEach(function(node, index) {
    if (!sim.errorOccurred)
      try {
        sim.scope["$" + node.id + "_unit"] = node.unit;
        if ("currentValue" in node && node.currentValue != "") {
          sim.scope["$" + node.id] = math.unit(
            Number(node.currentValue),
            node.unit
          );
        }
      } catch (err) {
        this.postMessage({
          errorType: "current value loading error",
          errorMessage: `For node "${node.name}", current value "${node.currentValue}", unit "${node.unit}" <br/> ${err}`
        });
        sim.errorOccurred = true;
      }
  });
  sim.calcTimeLog.push({
    stage: "load currentValues",
    endTime: new Date()
  });
}

function prepExpressionsArray(sim) {
  // gather up formulas from nodes into an array ordered by calculation order
  expressionsArray = [];
  sim.sortedNodes.forEach(function(node) {
    if (!sim.errorOccurred)
      try {
        //if formula includes a variable then save it
        if (node.sysFormula.includes("$")) {
          expressionsArray.push("$" + node.id + " = " + node.sysFormula);
        } else {
          //else set as value and units
          expressionsArray.push(
            "$" +
              node.id +
              " = unit(" +
              node.sysFormula +
              ",'" +
              node.unit +
              "')"
          );
        }
      } catch (err) {
        console.log(err);
        this.postMessage({
          errorType: "expression array error",
          errorMessage: `For node "${node.name}" <br/> ${err}`
        });
        sim.errorOccurred = true;
      }
  });
  sim.calcTimeLog.push({
    stage: "load expressions",
    endTime: new Date()
  });
  return expressionsArray;
}

function parseExpressions(sim) {
  var parsedExpressions = [];
  sim.expressionsArray.forEach(function(expression) {
    if (!sim.errorOccurred)
      try {
        parsedExpressions.push(math.parse(expression));
      } catch (err) {
        let nodeName = replace$NodeIdsWithName(
          expression.split(" =")[0]
          //data.modelNodes
        );
        let replacedExpression = replace$NodeIdsWithSymbol(
          expression
          //data.modelNodes
        );
        this.postMessage({
          errorType: "parse error",
          errorMessage: `For node "${nodeName}"<br/>Expression: ${replacedExpression} <br/> ${err}`
        });
        sim.errorOccurred = true;
      }
  });
  sim.calcTimeLog.push({
    stage: "parse expressions",
    endTime: new Date()
  });
  return parsedExpressions;
}

function compileExpressions(sim) {
  try {
    var compiledExpressions = sim.parsedExpressions.map(function(expression) {
      return expression.compile();
    });
  } catch (err) {
    console.log(err);
    this.postMessage(err);
    sim.errorOccurred = true;
  }
  sim.calcTimeLog.push({
    stage: "compile expressions",
    endTime: new Date()
  });
  return compiledExpressions;
}

function prepExpectedUnits(sim) {
  expectedUnits = [];
  sim.sortedNodes.forEach(function(node) {
    if (!sim.errorOccurred)
      try {
        expectedUnits.push(math.unit(node.unit));
      } catch (err) {
        this.postMessage({
          errorType: "unit loading error",
          errorMessage: `For node "${node.name}", unit "${node.unit}" <br/> ${err}`
        });
        sim.errorOccurred = true;
      }
  });
  sim.calcTimeLog.push({ stage: "load units", endTime: new Date() });
  return expectedUnits;
}

function extractTimeSeriesNodesValues(sim) {
  //clean up scope.timeSeries for posting back to main script
  //console.log(scope);
  let resultTimeSeriesNodesValues = {};
  sim.sortedNodes.forEach(function(node, index) {
    try {
      let nodeValues = sim.scope.timeSeries.nodes[node.id].map(function(val) {
        //get only the numeric value of each value entry in the array
        if (typeof val == "number") {
          return val;
        } else {
          return val.toNumber(node.unit);
        }
      });
      resultTimeSeriesNodesValues[node.id] = nodeValues;
    } catch (err) {
      //console.log(err);
      this.postMessage({
        errorType: "results number extraction error",
        errorMessage: `For node "${node.name}", timeSeries [${
          sim.scope.timeSeries.nodes[node.id]
        }] <br/> ${err}`
      });
      sim.errorOccurred = true;
    }
  });

  sim.calcTimeLog.push({ stage: "prepare results", endTime: new Date() });
  return resultTimeSeriesNodesValues;
}

function getCalcTimeStages(log) {
  let calcTimeStages = [];
  //let prevStage = null;
  log.forEach(function(item, index) {
    if (index > 0) {
      calcTimeStages.push({
        stageName: item.stage,
        stageTimeMs: item.endTime - prevItem.endTime
      });
    }
    prevItem = item;
  });
  return calcTimeStages;
}

function topoSortNodes(sim) {
  //let nodes = sim.nodes;
  let L = []; //for storing sorted elements
  let S = sim.nodes.filter(node => node.blockingInDegree == 0); //nodes with no incoming edges
  let unvisitedNodes = sim.nodes.filter(node => node.blockingInDegree != 0);
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
  sim.calcTimeLog.push({ stage: "topoSort", endTime: new Date() });
  return L;
}

function topoSortActions(actions) {
  //todo: actually do the topological sort
  let sortedActions = actions;
  return sortedActions;
}

function prepForSort(sim) {
  nodes = sim.data.modelNodes;
  let preppedNodes = [];
  nodes.forEach(function(outerNode) {
    // calculate blockedInfluencees
    let blockedInfluencees = [];
    //examine each candidate node to check for current node being in blockingInfluencers
    nodes.forEach(function(innerNode) {
      if (innerNode.id != outerNode.id) {
        //skip self
        if (
          "blockingInfluencers" in innerNode &&
          innerNode.blockingInfluencers.includes(outerNode.id)
        ) {
          blockedInfluencees.push(innerNode.id);
        }
      }
    });
    preppedNodes.push({
      id: outerNode.id,
      name: outerNode.name,
      blockingInDegree:
        typeof outerNode.blockingInfluencers !== "undefined"
          ? outerNode.blockingInfluencers.length
          : 0,
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
  sim.calcTimeLog.push({ stage: "prepForSort", endTime: new Date() });
  return preppedNodes;
}

function delay(args, math, scope) {
  let $nodeId = args[0].name;
  let nodeId = $nodeId.substr(1);
  let delayTime = valueIsANumber(args[1])
    ? args[1]
    : args[1].compile().evaluate(scope);
  let values = scope.timeSeries.nodes[nodeId];
  let timeSPoints = scope.timeSeries.timeSPoints;
  //let defaultValue = scope[$nodeId];
  let targetTimeS = scope.timeS - delayTime.toNumber("seconds");

  //quick case: if the last value in the time series is for the target time, then return it
  if (timeSPoints[timeSPoints.length - 1] == targetTimeS) {
    //console.log("match");
    return values[values.length - 1];
  }

  let initialValue = null;
  let currentValue = scope[$nodeId];

  if (args.length <= 1) {
    console.error('"delay" function needs at least 2 arguments.');
    throw '"delay" function needs at least 2 arguments.';
  } else if (args.length == 2) {
    //no initial value defined
  } else if (args.length == 3) {
    if (!isNaN(args[2])) initialValue = Number(args[2]);
    else if (args[2] == "best_guess") initialValue = "best_guess";
    else {
      console.error(
        `Initial value not recognized for "${replaceNodeIdsWithName(
          nodeId
        )}" <br/> ${args}`
      );
      throw `Initial value not recognized for "${replaceNodeIdsWithName(
        nodeId
      )}" <br/> ${args}`;
    }
  } else {
    console.error('"delay" function takes at most 3 arguments.');
    throw '"delay" function takes at most 3 arguments.';
  }

  //interpolate value at targetTimeS
  return interpolate(
    timeSPoints,
    values,
    targetTimeS,
    initialValue,
    currentValue,
    nodeId,
    scope
  );
}

function interpolate(
  rawTimeSPoints,
  rawValues,
  targetTimeS,
  initialValue,
  currentValue,
  nodeId,
  scope
) {
  //quick case: if the last value in the time series is for the target time, then return it
  if (rawTimeSPoints[rawTimeSPoints.length - 1] == targetTimeS) {
    //console.log("match");
    return rawValues[rawValues.length - 1];
  }
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
    //if (typeof initialValue == "number") return initialValue;
    if (valueIsANumber(initialValue))
      return math.unit(Number(initialValue), scope["$" + nodeId + "_unit"]);
    else if (initialValue == "best_guess") {
      //if currentValue is available then return current value
      if (currentValue != "") return currentValue;
      else {
        console.error(
          `No history, no initial value, and no current value available for best guess for node "${replaceNodeIdsWithName(
            nodeId
          )}", initialValue: (${typeof initialValue}) ${initialValue}`
        );
        throw `No history, no initial value, and no current value available for best guess for node "${replaceNodeIdsWithName(
          nodeId
        )}", initialValue: (${typeof initialValue}) ${initialValue}`;
      }
    } else {
      console.error(
        `No history and no initial value available for node "${replaceNodeIdsWithName(
          nodeId
        )}", initialValue: (${typeof initialValue}) ${initialValue}`
      );
      throw `No history and no initial value available for node "${replaceNodeIdsWithName(
        nodeId
      )}", initialValue: (${typeof initialValue}) ${initialValue}`;
    }
  }
  //else if history starts after target time, then return initial value if available, or first value in history
  else if (timeSPoints[0] > targetTimeS) {
    //console.log("History starts after target time; using default value if available, else first value in history.");
    if (valueIsANumber(initialValue))
      return math.unit(Number(initialValue), scope["$" + nodeId + "_unit"]);
    else if (initialValue == "best_guess") return values[0];
  }
  //else if history ends before target time, then return last value in history
  else if (timeSPoints[timeSPoints.length - 1] < targetTimeS) {
    //console.log("History ends before target time; using initialValue or best_guess.");
    if (valueIsANumber(initialValue))
      return math.unit(Number(initialValue), scope["$" + nodeId + "_unit"]);
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

function valueIsANumber(val) {
  //console.log(val, typeof val != "undefined", val != "", !isNaN(Number(val)));
  return typeof val != "undefined" && val !== "" && !isNaN(Number(val));
}

function replace$NodeIdsWithName(workingString) {
  /*modelNodes.forEach(
    node => (workingString = workingString.replace("$" + node.id, node.name))
  );
  return workingString;*/
  return replaceNodeIdsWithName("$" + workingString);
}

function replaceNodeIdsWithName(workingString) {
  modelNodes.forEach(
    node => (workingString = workingString.replace(node.id, node.name))
  );
  return workingString;
}

function replace$NodeIdsWithSymbol(workingString) {
  modelNodes.forEach(
    node => (workingString = workingString.replace("$" + node.id, node.symbol))
  );
  return workingString;
}
