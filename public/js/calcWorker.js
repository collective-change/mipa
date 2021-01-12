importScripts("https://www.gstatic.com/firebasejs/7.18.0/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/7.18.0/firebase-auth.js");
importScripts(
  "https://www.gstatic.com/firebasejs/7.18.0/firebase-firestore.js"
);
importScripts(
  "https://cdnjs.cloudflare.com/ajax/libs/mathjs/8.1.1/math.min.js"
);

//var idb = {}; //placeholder for IndexedDB

var firebaseApp, firebaseAuth, firebaseDb;

const parser = self.math.parser();
var modelNodes = [];
var workerGlobalActions = [];
var currentUserId;
var orgId;

//variables for performance profiling
var perf = {
  evalCount: 0,
  evalTime: 0,
  delayFuncTime: 0,
  compileEvalTimeInDelayFunc: 0
};

onmessage = function(e) {
  switch (e.data.calculationType) {
    case "baseline":
      coordinateScenarioSimulations(e.data);
      break;
    case "actions":
      coordinateScenarioSimulations(e.data);
      break;
    default:
      console.error(
        `calculationType "${e.data.calculationType}" not recognized.`
      );
  }
};

function coordinateScenarioSimulations(data) {
  let sim;
  //prep environment, scope, etc
  // Initialize Firebase
  if (!firebaseApp) {
    firebaseApp = firebase.initializeApp(data.firebaseConfig);
    firebaseAuth = firebaseApp.auth();
    firebaseDb = firebaseApp.firestore();
  }

  sim = prepSim(data);
  if (sim.errorOccurred) {
    self.postMessage({
      errorType: "Error preparing simulation"
      //errorMessage: `For node "${sim.sortedNodes[nodeIndex].name}",  <br/> ${err}`
    });
    return;
  }

  if (sim.errorOcurred) return;

  currentUserId = data.currentUserId;
  orgId = data.orgId;

  testInitializeIdb();

  const defaultBaseline = calculateBaseline(sim);

  if (data.calculationType == "baseline") return;

  let actions = data.actions;

  calculateResultsOfActions(sim, actions, defaultBaseline);
}

async function calculateResultsOfActions(
  sim,
  actionsToCalculate,
  defaultBaseline
) {
  //let yearlyDiscountRate = 0.05;

  let actionResults = {}; // for one action
  let actionsResults = []; // for multiple actions

  let calcTimeMs = 0;

  let averageEffortCostPerHourNode = modelNodes.find(
    node => node.id == sim.roleNodes.averageEffortCostPerHour
  );
  let averageEffortCostPerHour = averageEffortCostPerHourNode.symbolFormula;

  //simulate each action
  let completedLoops = 0;
  //actions.forEach(async function(action) {
  await asyncForEach(
    actionsToCalculate,
    async (action, index, actionsToCalculate) => {
      let startTimeMs = new Date();

      //calculate branchAndBlockeesResults, save effectiveChainedCostsAndImpacts of self
      let branchAndBlockeesResults = await simulateActionWithDependencies(
        sim,
        action,
        averageEffortCostPerHour,
        defaultBaseline
        //yearlyDiscountRate
      );

      //calculate action's effective results (max of branchAndBlockees', and inherited; based on leverage)
      let actionEffectiveResults = branchAndBlockeesResults;
      if (
        action.inheritedResultsNumbers &&
        action.inheritedResultsNumbers.actionLeverage >
          branchAndBlockeesResults.actionResultsNumbers.actionLeverage
      ) {
        actionEffectiveResults = action.inheritedResults;
        console.log("inherited results used");
      }

      actionResults = {
        id: action.id,
        effectiveResultsNumbers: actionEffectiveResults.actionResultsNumbers,
        branchAndBlockeesResultsNumbers:
          branchAndBlockeesResults.actionResultsNumbers,
        effectiveChainedCostsAndImpacts:
          branchAndBlockeesResults.effectiveChainedCostsAndImpacts,
        effectiveChainedCostsAndImpactsExcludingSelf:
          branchAndBlockeesResults.effectiveChainedCostsAndImpactsExcludingSelf,
        calcDate: sim.scope.calcDate,
        startTimeS: sim.scope.initialTimeS
        //calcTimeMs: calcTimeMs,
      };
      //if action has a parent, then retain its inherited results
      if (action.parentActionId) {
        actionResults.inheritedResultsNumbers = action.inheritedResultsNumbers;
      }

      //if action is in actionsResults, then replace it, else add it
      let foundResults = actionsResults.find(
        element => element.id == action.id
      );
      if (foundResults) {
        foundResult = Object.assign({}, actionResults);
      } else {
        actionsResults.push(Object.assign({}, actionResults));
      }

      //if branchAndBlockeesResults changed significantly:
      if (
        true || //TODO: get rid of this line when done with development
        (action.branchAndBlockeesResultsNumbers &&
          resultsNumbersChangedSignificantly(
            branchAndBlockeesResults.actionResultsNumbers,
            action.branchAndBlockeesResultsNumbers
          ))
      ) {
        console.log("branchAndBlockeesResults changed significantly");
        //if action has a parent: add/move parent to end of actionsToCalculate array
        if (action.parentActionId) {
          await addOrMoveActionToEndOfArray(
            [action.parentActionId],
            actionsToCalculate,
            index
          );
        }

        //if action has a blocker: add / move blocker to end of actionsToCalculate array
        if (action.blockerActionIds && action.blockerActionIds.length) {
          await addOrMoveActionToEndOfArray(
            action.blockerActionIds,
            actionsToCalculate,
            index
          );
        }

        //if action has children: write branchAndBlockeesResults to
        //descendants in actionsResults array (add in if missing) as
        //inheritedResults (if leverage is higher) and update
        //descendants' effectiveResults
        //get descendents tree from branch
      }

      //add in nodes values and calc time then save actionResults in IDB
      actionResults.timeSPoints = sim.scope.timeSeries.timeSPoints;
      actionResults.baselineNodesValues =
        branchAndBlockeesResults.baselineNodesValues;
      actionResults.ifDoneNodesValues =
        branchAndBlockeesResults.ifDoneNodesValues;
      actionResults.ifNotDoneNodesValues =
        branchAndBlockeesResults.ifNotDoneNodesValues;
      actionResults.calcTimeMs = new Date() - startTimeMs;
      putActionResultsInIdb(actionResults, action.id);

      if (sim.errorOccurred) return;

      let stage =
        "process " +
        scenario.type +
        " " +
        (scenario.type == "action" ? action.title : "");
      sim.calcTimeLog.push({
        stage: stage,
        endTime: new Date()
      });

      completedLoops++;
      //report progress every 500 ms
      if (
        new Date() - sim.lastProgressReportTime >= 100 ||
        completedLoops == actionsToCalculate.length
      ) {
        self.postMessage({
          progressValue: completedLoops / actionsToCalculate.length
        });
        sim.lastProgressReportTime = new Date();
      }
    }
  ); //end of actions.forEach

  const log = sim.calcTimeLog;
  calcTimeMs = log[log.length - 1].endTime - log[0].endTime;
  const calcTimeStages = getCalcTimeStages(log);

  const workerResults = {
    resultsType: "actions",
    actionsResults,
    calcTimeLog: sim.calcTimeLog,
    calcTimeStages,
    calcTimeMs
  };
  console.log(workerResults);

  console.log("calcTime:", calcTimeMs, "ms");

  self.postMessage(workerResults);
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

async function simulateActionWithDependencies(
  sim,
  action,
  averageEffortCostPerHour,
  defaultBaseline
  //yearlyDiscountRate
) {
  let costsAndImpactsOfSelf = composeCostsAndImpactsOfSelf(
    action,
    averageEffortCostPerHour
  );
  //add costs and impacts from children
  let {
    costsAndImpacts: effectiveChainedCostsAndImpactsFromBranch,
    childrensCostsAndImpacts
  } = await includeCostsAndImpactsFromChildren(action, costsAndImpactsOfSelf);

  // simulate impact sets by including more blockees one by one until leverage drops

  let testCostsAndImpacts = effectiveChainedCostsAndImpactsFromBranch;
  let testActionResults = simulateCostsAndImpacts(
    testCostsAndImpacts,
    sim,
    defaultBaseline,
    action.saveFullResults
  );
  let actionResults = testActionResults;
  actionResults.effectiveChainedCostsAndImpacts = testCostsAndImpacts;
  actionResults.effectiveChainedCostsAndImpactsExcludingSelf = childrensCostsAndImpacts;
  let highestLeverageFound =
    testActionResults.actionResultsNumbers.actionLeverage;

  let blockees = [];
  //get blockees
  if (action.blockeeActionIds && action.blockeeActionIds.length) {
    //console.log("blockeeActionIds", action.blockeeActionIds);
    blockees = await getActionsFromFirestoreAndUpdateWithNewestValues(
      action.blockeeActionIds
    );

    //console.log("blockees", blockees);
  }
  //sort blockees by descending leverage
  blockees.sort(function(a, b) {
    return b.actionLeverage - a.actionLeverage;
  });
  //if (blockees.length) console.log("blockees for", action.title, blockees);
  //include each blockee until resulting leverage drops
  while (blockees.length && blockees[0].actionLeverage > highestLeverageFound) {
    //console.log("blockee leverage", blockees[0].actionLeverage);
    testCostsAndImpacts = includeActionInCostsAndImpacts(
      blockees[0],
      testCostsAndImpacts
    );
    testActionResults = simulateCostsAndImpacts(
      testCostsAndImpacts,
      sim,
      defaultBaseline,
      action.saveFullResults
    );
    if (
      testActionResults.actionResultsNumbers.actionLeverage >
      highestLeverageFound
    ) {
      highestLeverageFound =
        testActionResults.actionResultsNumbers.actionLeverage;
      actionResults = testActionResults;
      actionResults.effectiveChainedCostsAndImpacts = testCostsAndImpacts;
      actionResults.effectiveChainedCostsAndImpactsExcludingSelf = includeActionInCostsAndImpacts(
        blockees[0],
        testCostsAndImpacts
      );
    }
    blockees.shift();
  }
  return actionResults;
}

function composeCostsAndImpactsOfSelf(action, averageEffortCostPerHour) {
  let effortCostPerHour =
    action.effortCostPerHrType == "use_custom"
      ? action.customEffortCostPerHr
      : averageEffortCostPerHour;
  let estEffortHrs = isNaN(action.estEffortHrs) ? 0 : 0 + action.estEffortHrs;
  let estEffortCosts = estEffortHrs * effortCostPerHour;
  let outstandingDirectEffortHrs =
    estEffortHrs *
    (100 -
      (isNaN(action.effortCompletionPercentage)
        ? 0
        : action.effortCompletionPercentage)) *
    0.01;
  let outstandingDirectEffortCosts =
    outstandingDirectEffortHrs * effortCostPerHour;
  let outstandingSpending = isNaN(action.outstandingSpending)
    ? 0
    : 0 + action.outstandingSpending;
  let outstandingDirectCosts =
    outstandingDirectEffortCosts + outstandingSpending;
  let estSpending = isNaN(action.estSpending) ? 0 : 0 + action.estSpending;
  let spentAmount = isNaN(action.spentAmount) ? 0 : 0 + action.spentAmount;
  let estDirectCosts = estEffortCosts + estSpending;

  let newCostsAndImpacts = {
    estEffortHrs,
    estEffortCosts,
    estSpending,
    estDirectCosts,

    spentAmount,

    outstandingDirectEffortHrs,
    outstandingDirectEffortCosts,
    outstandingSpending,
    outstandingDirectCosts,

    impacts: [...action.impacts],
    includedActionIds: [action.id]
  };
  //console.log("newCostsAndImpacts", newCostsAndImpacts);
  return newCostsAndImpacts;
}

function includeActionInCostsAndImpacts(action, costsAndImpacts) {
  let ae = action.effectiveChainedCostsAndImpacts;

  let newCostsAndImpacts = {
    estEffortHrs: costsAndImpacts.estEffortHrs + ae.estEffortHrs,
    estEffortCosts: costsAndImpacts.estEffortCosts + ae.estEffortCosts,
    outstandingDirectEffortHrs:
      costsAndImpacts.outstandingDirectEffortHrs +
      ae.outstandingDirectEffortHrs,
    outstandingDirectEffortCosts:
      costsAndImpacts.outstandingDirectEffortCosts +
      ae.outstandingDirectEffortCosts,
    estSpending: costsAndImpacts.estSpending + ae.estSpending,
    estDirectCosts: costsAndImpacts.estDirectCosts + ae.estDirectCosts,
    spentAmount: costsAndImpacts.spentAmount + ae.spentAmount,
    outstandingSpending:
      costsAndImpacts.outstandingSpending + ae.outstandingSpending,
    outstandingDirectCosts:
      costsAndImpacts.outstandingDirectCosts + ae.outstandingDirectCosts,

    impacts: [...costsAndImpacts.impacts, ...ae.impacts],
    includedActionIds: [...costsAndImpacts.includedActionIds, action.id]
  };
  return newCostsAndImpacts;
}

function simulateCostsAndImpacts(
  testCostsAndImpacts,
  sim,
  defaultBaseline,
  saveFullResults
) {
  let effortImpact = {
    nodeId: sim.roleNodes.effort,
    durationType: "just_once",
    impactType: "if_done",
    operation: "+",
    operand: testCostsAndImpacts.outstandingDirectEffortHrs
  };

  let spendingImpact = {
    nodeId: sim.roleNodes.spending,
    durationType: "just_once",
    impactType: "if_done",
    operation: "+",
    operand: testCostsAndImpacts.outstandingSpending
  };

  let impactsToSimulate = [
    effortImpact,
    spendingImpact,
    ...testCostsAndImpacts.impacts
  ];

  //console.log("impactsToSimulate", impactsToSimulate);

  //TODO: gather begin and end times
  impactsToSimulate.forEach(function(impact) {
    if (impact.durationType == "with_half_life") {
      impact.halfLifeS = math
        .unit(impact.durationNumber, impact.durationUnit)
        .toNumber("seconds");
    }
  });

  //gather nodes for which to extract and save timeSeries
  let onlyNodeIds = [];
  if (saveFullResults) {
    sim.nodes.forEach(function(node) {
      onlyNodeIds.push(node.id);
    });
  } else {
    impactsToSimulate.forEach(function(impact) {
      onlyNodeIds.push(impact.nodeId);
    });
    onlyNodeIds.push(sim.roleNodes.orgBenefit);
    onlyNodeIds.push(sim.roleNodes.orgCost);
    onlyNodeIds.push(sim.roleNodes.worldBenefit);
    onlyNodeIds.push(sim.roleNodes.worldCost);
    //onlyNodeIds.push(sim.roleNodes.effort);
    //onlyNodeIds.push(sim.roleNodes.spending);
  }

  //extract relevant baselineNodesValues
  let baselineNodesValues = {};
  onlyNodeIds.forEach(function(nodeId) {
    baselineNodesValues[nodeId] = defaultBaseline.nodesValues[nodeId];
  });

  //TODO: if extra timepoints are required then build customTimeSPoints
  //TODO: simulate using either default or customTimeSPoints
  //TODO: also simulate baseline using customTimeSPoints, if any
  let hasIfDoneImpacts = false;
  let hasIfNotDoneImpacts = false;
  impactsToSimulate.forEach(function(impact) {
    if (impact.impactType == "if_done") hasIfDoneImpacts = true;
    if (impact.impactType == "if_not_done") hasIfNotDoneImpacts = true;
  });
  let ifDoneNodesValues, ifNotDoneNodesValues;

  if (hasIfDoneImpacts) {
    scenario = {
      type: "action",
      impactType: "if_done",
      impactsToSimulate
    };
    resetScope(sim);
    iterateThroughTime(sim, scenario);
    if (sim.errorOccurred) return;
    //only extract the basic few nodes for calculation and display
    ifDoneNodesValues = extractTimeSeriesNodesValues(sim, onlyNodeIds);
  } else {
    //use baseline values as ifNotDone values
    ifDoneNodesValues = baselineNodesValues;
  }

  if (hasIfNotDoneImpacts) {
    scenario = {
      type: "action",
      impactType: "if_not_done",
      impactsToSimulate
    };
    resetScope(sim);
    iterateThroughTime(sim, scenario);
    if (sim.errorOccurred) return;
    //TODO: extract and save all node values if requested by
    //user for this device
    //only extract the basic few nodes for calculation and display
    ifNotDoneNodesValues = extractTimeSeriesNodesValues(sim, onlyNodeIds);
  } else {
    //use baseline values as ifNotDone values
    ifNotDoneNodesValues = baselineNodesValues;
  }

  timeSPoints = defaultBaseline.timeSPoints;

  let actionResultsNumbers = calcActionResultsFromTimeSeries(
    testCostsAndImpacts.outstandingDirectCosts,
    ifDoneNodesValues,
    ifNotDoneNodesValues,
    timeSPoints,
    sim
  );

  let simulateCostsAndImpactsResults = {
    baselineNodesValues,
    ifDoneNodesValues,
    ifNotDoneNodesValues,
    actionResultsNumbers
  };

  return simulateCostsAndImpactsResults;
}
function getEmptyCostsAndImpacts() {
  let costsAndImpacts = {
    estEffortHrs: 0,
    estEffortCosts: 0,
    estSpending: 0,
    estDirectCosts: 0,

    spentAmount: 0,

    outstandingDirectEffortHrs: 0,
    outstandingSpending: 0,
    outstandingDirectEffortCosts: 0,
    outstandingDirectCosts: 0,

    impacts: [],
    includedActionIds: []
  };
  return costsAndImpacts;
}

async function includeCostsAndImpactsFromChildren(action, costsAndImpacts) {
  let childrensCostsAndImpacts = getEmptyCostsAndImpacts();
  if (action.childrenActionIds && action.childrenActionIds.length) {
    console.log("getting children for", action.title);
    let childrenActions = await getActionsFromFirestoreAndUpdateWithNewestValues(
      action.childrenActionIds
    );

    childrenActions.forEach(function(child) {
      console.log("child", child);
      costsAndImpacts = includeActionInCostsAndImpacts(child, costsAndImpacts);
      childrensCostsAndImpacts = includeActionInCostsAndImpacts(
        child,
        childrensCostsAndImpacts
      );
    });
  }
  return { costsAndImpacts, childrensCostsAndImpacts };
}

async function getActionsFromFirestoreAndUpdateWithNewestValues(actionIds) {
  let actions = getActionsFromFirestore(actionIds);
  //TODO: update actions with newest values from actionsResults
  return actions;
}

async function getActionsFromFirestore(actionIds) {
  const actionsRef = firebaseDb.collection("actions");
  const snapshot = await actionsRef
    .where("id", "in", actionIds)
    .where("orgId", "==", orgId)
    .get();
  if (snapshot.empty) {
    console.log("No matching actions.");
    return;
  }
  let actions = [];
  snapshot.forEach(doc => {
    actions.push(doc.data());
  });
  return actions;
}

function calcActionResultsFromTimeSeries(
  outstandingDirectCosts,
  ifDoneTimeSeriesNodesValues,
  ifNotDoneTimeSeriesNodesValues,
  timeSPoints,
  sim
) {
  const roleNodes = sim.roleNodes;
  const yearlyDiscountRate = sim.yearlyDiscountRate;

  //prepare inputs for calculating NPVs
  const ifDoneOrgBenefitSeries =
    ifDoneTimeSeriesNodesValues[roleNodes.orgBenefit];
  const ifNotDoneOrgBenefitSeries =
    ifNotDoneTimeSeriesNodesValues[roleNodes.orgBenefit];
  const ifDoneOrgCostSeries = ifDoneTimeSeriesNodesValues[roleNodes.orgCost];
  const ifNotDoneOrgCostSeries =
    ifNotDoneTimeSeriesNodesValues[roleNodes.orgCost];

  const ifDoneWorldBenefitSeries =
    ifDoneTimeSeriesNodesValues[roleNodes.worldBenefit];
  const ifNotDoneWorldBenefitSeries =
    ifNotDoneTimeSeriesNodesValues[roleNodes.worldBenefit];
  const ifDoneWorldCostSeries =
    ifDoneTimeSeriesNodesValues[roleNodes.worldCost];
  const ifNotDoneWorldCostSeries =
    ifNotDoneTimeSeriesNodesValues[roleNodes.worldCost];

  //calculate org benefit and cost net present values
  const rawMarginalOrgBenefitNpv = getMarginalNpv(
    ifDoneOrgBenefitSeries,
    ifNotDoneOrgBenefitSeries,
    timeSPoints,
    yearlyDiscountRate
  );

  const rawMarginalOrgCostNpv = getMarginalNpv(
    ifDoneOrgCostSeries,
    ifNotDoneOrgCostSeries,
    timeSPoints,
    yearlyDiscountRate
  );

  //treat negative benefit as cost, negative cost as benefit
  const marginalOrgBenefitNpv =
    (rawMarginalOrgBenefitNpv > 0 ? rawMarginalOrgBenefitNpv : 0) +
    (rawMarginalOrgCostNpv < 0 ? -rawMarginalOrgCostNpv : 0);

  const marginalOrgCostNpv =
    (rawMarginalOrgCostNpv > 0 ? rawMarginalOrgCostNpv : 0) +
    (rawMarginalOrgBenefitNpv < 0 ? -rawMarginalOrgBenefitNpv : 0);

  //calculate world benefit and cost net present values
  const rawMarginalWorldBenefitNpv = getMarginalNpv(
    ifDoneWorldBenefitSeries,
    ifNotDoneWorldBenefitSeries,
    timeSPoints,
    yearlyDiscountRate
  );

  const rawMarginalWorldCostNpv = getMarginalNpv(
    ifDoneWorldCostSeries,
    ifNotDoneWorldCostSeries,
    timeSPoints,
    yearlyDiscountRate
  );

  //treat negative benefit as cost, negative cost as benefit
  const marginalWorldBenefitNpv =
    (rawMarginalWorldBenefitNpv > 0 ? rawMarginalWorldBenefitNpv : 0) +
    (rawMarginalWorldCostNpv < 0 ? -rawMarginalWorldCostNpv : 0);

  const marginalWorldCostNpv =
    (rawMarginalWorldCostNpv > 0 ? rawMarginalWorldCostNpv : 0) +
    (rawMarginalWorldBenefitNpv < 0 ? -rawMarginalWorldBenefitNpv : 0);

  const worldWeightingFactor = sim.params.worldWeightingFactor;
  const orgWeightingFactor = sim.params.orgWeightingFactor;
  const marginalTotalBenefitNpv =
    marginalOrgBenefitNpv * orgWeightingFactor +
    marginalWorldBenefitNpv * worldWeightingFactor;
  const marginalTotalCostNpv =
    marginalOrgCostNpv * orgWeightingFactor +
    marginalWorldCostNpv * worldWeightingFactor;

  //calculate actionLeverage and prepare results
  const marginalNetTotalBenefitNpv =
    marginalTotalBenefitNpv - marginalTotalCostNpv;
  const marginalTotalCostExcludingAction =
    marginalTotalCostNpv - outstandingDirectCosts;
  let totalRoi =
    marginalNetTotalBenefitNpv /
    (outstandingDirectCosts + math.max(0, marginalTotalCostExcludingAction));
  let actionLeverage =
    ((marginalNetTotalBenefitNpv * totalRoi) / outstandingDirectCosts) *
    Math.sign(marginalNetTotalBenefitNpv);

  if (isNaN(totalRoi)) totalRoi = null;
  if (isNaN(actionLeverage)) actionLeverage = null;

  const roiResults = {
    outstandingDirectCosts,
    rawMarginalOrgBenefitNpv,
    rawMarginalOrgCostNpv,
    rawMarginalWorldBenefitNpv,
    rawMarginalWorldCostNpv,
    marginalOrgBenefitNpv,
    marginalOrgCostNpv,
    marginalWorldBenefitNpv,
    marginalWorldCostNpv,
    marginalTotalBenefitNpv,
    marginalNetTotalBenefitNpv,
    marginalTotalCostNpv,
    totalRoi,
    actionLeverage
  };
  //console.log({ roiResults });
  return roiResults;
}

function getMarginalNpv(
  ifDoneSeries,
  ifNotDoneSeries,
  timeSPoints,
  yearlyDiscountRate
) {
  //marginal npv = sum of discounted difference of the same node in the ifDone and ifNotDone series
  let tYears; //time since beginning of simulation in years
  let doneMinusNotDone;
  let Rt; //the Rt in NPV formula: sum over t of Rt/(1+i)^t
  //let npvIncrement, denominator;
  let npv = 0;
  //let debuggingArr = [];
  timeSPoints.forEach(function(timeS, index) {
    doneMinusNotDone = ifDoneSeries[index] - ifNotDoneSeries[index];
    //if (index == 0) prevDoneMinusNotDone = 0;
    tYears = (timeS - timeSPoints[0]) / 31556952; // 31556952 seconds in a year
    Rt = doneMinusNotDone; // - prevDoneMinusNotDone;
    npv += Rt / Math.pow(1 + yearlyDiscountRate, tYears);
    /*debuggingArr.push({
      doneMinusNotDone: doneMinusNotDone,
      tYears: tYears,
      Rt: Rt,
      npv: npv
    });*/
    //prevDoneMinusNotDone = doneMinusNotDone;
  });
  //console.table(debuggingArr);
  return npv;
}

function iterateThroughTime(sim, scenario) {
  //console.log("impacts to simulate", scenario.impactsToSimulate);

  let timeSPoints = sim.defaultTimeSPoints;

  /*let completedLoops = 0;
  let expectedUnit = null;*/

  timeSPoints.forEach(function(timeS, timeSIndex) {
    if (!sim.errorOccurred) {
      sim.scope.timeS = timeS;
      //prepare dt
      if (timeSIndex == 0) {
        sim.scope.dt = sim.initialDt; //delta time
      } else {
        //we're not on the first timeSPoint
        sim.scope.dt = math.unit(
          timeS - timeSPoints[timeSIndex - 1],
          "seconds"
        );
      }

      // evaluate the expressions for each node
      sim.compiledExpressions.forEach(function(code, nodeIndex) {
        if (!sim.errorOccurred) {
          //TODO: if simulating an action, set a changedFromBaseline
          //flag for each node. If influencer nodes of the current node
          //haven't changed for this iteration, then use the baseline's
          //value instead of evaluating.

          sim.scope.currentNodeIndex = nodeIndex;
          sim.scope.currentNodeId = sim.sortedNodes[nodeIndex].id;
          sim.scope.currentNodeName = sim.sortedNodes[nodeIndex].name;

          try {
            const t0 = performance.now();
            code.evaluate(sim.scope);
            const t1 = performance.now();
            perf.evalCount += 1;
            perf.evalTime += t1 - t0;
          } catch (err) {
            sim.errorOccurred = true;
            self.postMessage({
              errorType: "evaluation error",
              errorMessage: `For node "${sim.sortedNodes[nodeIndex].name}",  <br/> ${err}`
            });
          }

          if (sim.errorOccurred) return;

          if (scenario.type == "action") {
            //adjust the node value by action's impacts
            //loop through each of action's impacts to see if it impacts the node just calculated
            //TODO: sort impacts by order of impact.operation (=, *, / , +, -)
            scenario.impactsToSimulate.forEach(function(impact) {
              if (impact.nodeId == sim.sortedNodes[nodeIndex].id) {
                if (impact.impactType == scenario.impactType)
                  try {
                    doImpactIfItAffectsCurrentTime(
                      sim,
                      timeS,
                      nodeIndex,
                      impact
                    );
                  } catch (err) {
                    sim.errorOccurred = true;
                    self.postMessage({
                      errorType: "adjustment by impact error",
                      errorMessage: `For node "${sim.sortedNodes[nodeIndex].name}", impact operation "${impact.operation}" <br/> ${err} <br/> ${nodeIndex}`
                    });
                  }
              }
            });
          }
          //on first 2 loops, check result of evaluation against units expected by user.
          if (timeSIndex < 2)
            try {
              checkUnits(sim, nodeIndex);
            } catch (err) {
              sim.errorOccurred = true;
              self.postMessage({
                errorType: "Unit mismatch",
                errorMessage: `For node "${sim.sortedNodes[nodeIndex].name}" ${err}`
              });
            }
        }
      });
      if (!sim.errorOccurred) composeTimeSeries(sim);
    }
  });

  if (scenario.type == "baseline")
    sim.calcTimeLog.push({
      stage: "iterate for baseline",
      endTime: new Date()
    });
}

function doImpactIfItAffectsCurrentTime(sim, timeS, nodeIndex, impact) {
  switch (impact.durationType) {
    case "just_once":
      if (timeS == sim.scope.initialTimeS) doImpact(sim, nodeIndex, impact);
      break;
    case "forever":
      doImpact(sim, nodeIndex, impact);
      break;
    case "for_period":
      //if timeS <= initialTimeS + unit(durationNumber, durationUnit).to('seconds')
      if (
        timeS <=
        sim.scope.initialTimeS +
          math
            .unit(impact.durationNumber, impact.durationUnit)
            .toNumber("seconds")
      ) {
        doImpact(sim, nodeIndex, impact);
      }
      break;
    case "with_half_life":
      doImpactWithHalfLife(sim, nodeIndex, impact);
      break;
  }
}

function doImpact(sim, nodeIndex, impact, operandScalingFactor = 1) {
  switch (impact.operation) {
    case "+":
      sim.scope["$" + sim.sortedNodes[nodeIndex].id] = math.add(
        sim.scope["$" + sim.sortedNodes[nodeIndex].id],
        sim.expectedUnits[nodeIndex].units.length
          ? math.multiply(
              impact.operand * operandScalingFactor,
              sim.expectedUnits[nodeIndex]
            )
          : impact.operand * operandScalingFactor
      );
      break;
    case "-":
      sim.scope["$" + sim.sortedNodes[nodeIndex].id] = math.subtract(
        sim.scope["$" + sim.sortedNodes[nodeIndex].id],
        sim.expectedUnits[nodeIndex].units.length
          ? math.multiply(
              impact.operand * operandScalingFactor,
              sim.expectedUnits[nodeIndex]
            )
          : impact.operand * operandScalingFactor
      );
      break;
    case "*":
      sim.scope["$" + sim.sortedNodes[nodeIndex].id] = math.multiply(
        sim.scope["$" + sim.sortedNodes[nodeIndex].id],
        impact.operand * operandScalingFactor
      );
      break;
    case "/":
      sim.scope["$" + sim.sortedNodes[nodeIndex].id] = math.divide(
        sim.scope["$" + sim.sortedNodes[nodeIndex].id],
        impact.operand * operandScalingFactor
      );
      break;
    case "=":
      sim.scope["$" + sim.sortedNodes[nodeIndex].id] = sim.expectedUnits[
        nodeIndex
      ].units.length
        ? math.multiply(
            impact.operand * operandScalingFactor,
            sim.expectedUnits[nodeIndex]
          )
        : impact.operand * operandScalingFactor;
      break;
  }
}

function doImpactWithHalfLife(sim, nodeIndex, impact) {
  let timeElapsedS = sim.scope.timeS - sim.scope.initialTimeS;
  let scalingFactor = Math.pow(0.5, timeElapsedS / impact.halfLifeS);
  //determine scaling factor due to half life
  //doImpact() with scaling factor
  doImpact(sim, nodeIndex, impact, scalingFactor);
}

function checkUnits(sim, nodeIndex) {
  expectedUnit = sim.expectedUnits[nodeIndex];
  if (
    // calculation result is a unitless number and the expected isn't
    (typeof sim.scope["$" + sim.sortedNodes[nodeIndex].id] == "number" &&
      sim.expectedUnits[nodeIndex].units.length > 0) ||
    // or calculation result is an object (should be a math.unit) and
    // doesn't have the same base as the expected unit
    (typeof sim.scope["$" + sim.sortedNodes[nodeIndex].id] == "object" &&
      !sim.expectedUnits[nodeIndex].equalBase(
        sim.scope["$" + sim.sortedNodes[nodeIndex].id]
      ) &&
      !sim.scope["$" + sim.sortedNodes[nodeIndex].id].equalBase(
        sim.expectedUnits[nodeIndex]
      ))
  )
    throw `dimensions of expected units and calculated units do not match.
              <br/> Expected unit: "${expectedUnit.toString()}"
              <br/> Calculated result: "${sim.scope[
                "$" + sim.sortedNodes[nodeIndex].id
              ].toString()}"`;
}

function composeTimeSeries(sim) {
  try {
    //save time and node values into time points and value time series
    sim.scope.timeSeries.timeSPoints.push(sim.scope.timeS);
    sim.sortedNodes.forEach(function(node, index) {
      sim.scope.timeSeries.nodes[node.id].push(sim.scope["$" + node.id]);
    });
  } catch (err) {
    console.log(err);
    self.postMessage(err);
    sim.errorOccurred = true;
  }
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

  const results = {
    resultsType: "baseline",
    modelId: sim.data.modelId,
    calcDate: sim.scope.calcDate,
    startTimeS: sim.scope.initialTimeS,
    timeSPoints: sim.scope.timeSeries.timeSPoints,
    nodesValues: resultTimeSeriesNodesValues,
    calcTimeLog: sim.calcTimeLog,
    calcTimeStages: calcTimeStages,
    calcTimeMs: calcTimeMs
  };

  //save to IndexedDb
  //putBaselineResultsInIdb(results, sim.data.modelId);

  console.table(perf);
  console.log("baseline calcTime:", calcTimeMs, "ms");

  postMessage(results);

  return results;
}

function prepSim(data) {
  let sim = prepEnvironment(data);
  if (sim.errorOccurred) return sim;

  sim.nodes = prepNodesForSort(sim);
  if (sim.errorOccurred) return sim;

  sim.sortedNodes = topoSortNodes(sim);
  if (sim.errorOccurred) return sim;

  sim.scope = prepScope(sim);
  if (sim.errorOccurred) return sim;

  sim.defaultTimeSPoints = prepDefaultTimeSPoints(sim);
  if (sim.errorOccurred) return sim;

  loadLatestValues(sim);
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
    roleNodes: data.roleNodes,
    yearlyDiscountRate: 0.05,
    maxLoops: data.simulationParams.numTimeSteps + 1,
    initialDt: math.unit(
      data.simulationParams.timeStepNumber,
      data.simulationParams.timeStepUnit
    ) //delta time
  };

  sim.calcTimeLog.push({ stage: "start", endTime: new Date() });
  self.postMessage({ progressValue: 0 });
  sim.lastProgressReportTime = new Date();

  modelNodes = data.modelNodes; //make modelNodes globally accessible

  //import custom functions
  delay.rawArgs = true;
  getSimDayOfWeek.rawArgs = true;
  getSimMonth.rawArgs = true;
  getSimCalendarMonth.rawArgs = true;
  getSimYear.rawArgs = true;
  math.import({
    delay,
    getSimDayOfWeek,
    getSimMonth,
    getSimCalendarMonth,
    getSimYear
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
      aliases: ["persons", "people", "user", "users"]
    },
    workhour: {
      baseName: "workhour",
      aliases: ["workhours"]
    },
    operation: {
      baseName: "operation",
      aliases: ["operations", "ops"]
    },
    organization: {
      baseName: "organization",
      aliases: ["organizations", "org", "orgs", "company", "companies"]
    },
    baseproduct: {
      baseName: "baseproduct",
      aliases: ["baseproducts", "baseProduct", "baseProducts", "bp"]
    },
    sku: {
      baseName: "sku",
      aliases: ["skus"]
    },
    count: {
      baseName: "count",
      aliases: ["counts"]
    }
  });

  sim.calcTimeLog.push({ stage: "prepEnv", endTime: new Date() });
  return sim;
}

function prepScope(sim) {
  //prepare scope object
  let calcDate = Date.now();
  let scope = {
    calcDate: calcDate,
    initialTimeS: Math.floor(calcDate / 1000), //this will remain constant throughout the simulation
    //timeS: initialTimeS, //timeS will increment with each iteration
    timeSeries: { timeSPoints: [], nodes: {} },
    compiledDelayArg1s: {}
  }; //TODO: load timeSeries with current or historical values

  sim.sortedNodes.forEach(function(node) {
    scope.timeSeries.nodes[node.id] = [];
  });

  sim.calcTimeLog.push({
    stage: "prep timeSeries",
    endTime: new Date()
  });
  return scope;
}

function prepDefaultTimeSPoints(sim) {
  let timeSPoint = sim.scope.initialTimeS;
  let completedLoops = 0;
  let defaultTimeSPoints = [];
  let dt = sim.initialDt;
  while (completedLoops < sim.maxLoops) {
    //Save time point into defaultTimeSPoints.
    //Has implicit unit of seconds; not wrapped with math.unit
    defaultTimeSPoints.push(timeSPoint);
    if (completedLoops > 0) {
      if (sim.params.timeStepGrowthRate != 0) {
        dt = math.multiply(dt, 1 + sim.params.timeStepGrowthRate);
      }
    }
    timeSPoint = timeSPoint + dt.toNumber("seconds");
    completedLoops++;
  }
  return defaultTimeSPoints;
}

function resetScope(sim) {
  sim.scope.timeSeries = { timeSPoints: [], nodes: {} };
  sim.sortedNodes.forEach(function(node) {
    sim.scope.timeSeries.nodes[node.id] = [];
    delete sim.scope["$" + node.id];
  });
  loadLatestValues(sim);
}

function loadLatestValues(sim) {
  // gather up latest values from nodes into scope
  //console.log("begin loading latestValues");
  sim.sortedNodes.forEach(function(node, index) {
    if (!sim.errorOccurred)
      try {
        sim.scope["$" + node.id + "_unit"] = node.unit;
        if ("latestValue" in node && node.latestValue !== "") {
          if (node.unit) {
            sim.scope["$" + node.id] = math.unit(
              Number(node.latestValue),
              node.unit
            );
          } else {
            sim.scope["$" + node.id] = Number(node.latestValue);
          }
        }
      } catch (err) {
        self.postMessage({
          errorType: "latest value loading error",
          errorMessage: `For node "${node.name}", latest value "${node.latestValue}", unit "${node.unit}" <br/> ${err}`
        });
        sim.errorOccurred = true;
      }
  });
  sim.calcTimeLog.push({
    stage: "load latestValues",
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
          if (node.unit == "") {
            expressionsArray.push(
              //"$" + node.id + " = unit(" + node.sysFormula + ")"//
              "$" + node.id + " = " + node.sysFormula
            );
          } else {
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
        }
      } catch (err) {
        console.log(err);
        self.postMessage({
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
        self.postMessage({
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
    self.postMessage(err);
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
        self.postMessage({
          errorType: "unit loading error",
          errorMessage: `For node "${node.name}", unit "${node.unit}" <br/> ${err}`,
          errorData: { nodeId: node.id }
        });
        sim.errorOccurred = true;
      }
  });
  sim.calcTimeLog.push({ stage: "load units", endTime: new Date() });
  return expectedUnits;
}

function extractTimeSeriesNodesValues(sim, onlyNodeIds = null) {
  //clean up scope.timeSeries for posting back to main script
  //console.log(scope);
  let resultTimeSeriesNodesValues = {};
  sim.sortedNodes.forEach(function(node, index) {
    if (onlyNodeIds == null || onlyNodeIds.includes(node.id))
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
        self.postMessage({
          errorType: "results number extraction error",
          errorMessage: `For node "${node.name}", timeSeries [${
            sim.scope.timeSeries.nodes[node.id]
          }] <br/> ${err}`
        });
        sim.errorOccurred = true;
      }
  });

  //sim.calcTimeLog.push({ stage: "prepare results", endTime: new Date() });
  return resultTimeSeriesNodesValues;
}

function getCalcTimeStages(log) {
  let calcTimeStages = [];
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
  let L = []; //for storing sorted elements
  let S = sim.nodes.filter(node => node.blockingInDegree == 0); //nodes with no incoming edges
  let unvisitedNodes = sim.nodes.filter(node => node.blockingInDegree != 0);
  let n = null; //node to process
  let influencee = null; //a working variable

  while (S.length) {
    // remove a node n from S and append to tail of L
    n = S.shift();
    L.push(n);
    n.blockedInfluencees.forEach(function(influenceeId, index) {
      influencee = unvisitedNodes.find(node => node.id == influenceeId);
      if (influencee) {
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
      }
    });
  }

  //now try to sort out unvisited nodes (ones in or blocked by a cycle)

  //If there are unvisited nodes, then graph has at least one cycle,
  //but there may be nodes that come after the circle that are unvisited,
  //so let's remove them first before notifying the user.
  if (unvisitedNodes.length) {
    //topoSort the unvisited nodes using reverse direction of the links
    //to get nodes remaining in circular dependency
    let L2 = []; //for storing sorted elements
    let S2 = unvisitedNodes.filter(node => node.blockingOutDegree == 0); //nodes with no outgoing edges
    let unvisitedNodes2 = unvisitedNodes.filter(
      node => node.blockingOutDegree != 0
    );
    let n2 = null; //node to process
    let influencer = null; //a working variable

    while (S2.length) {
      // remove a node n from S and append to tail of L
      n2 = S2.shift();
      L2.push(n2);
      n2.blockingInfluencers.forEach(function(influencerId, index) {
        influencer = unvisitedNodes.find(node => node.id == influencerId);
        if (influencer) {
          influencer.blockingOutDegree--;
          if (influencer.blockingOutDegree == 0) {
            S2.push(influencer);
            //remove influencer from unvisited nodes
            for (var i = 0; i < unvisitedNodes2.length; i++) {
              if (unvisitedNodes2[i] === influencer) {
                unvisitedNodes2.splice(i, 1);
              }
            }
          }
        }
      });
    }

    const nodeNames = unvisitedNodes2.map(node => node.name).join(" | ");
    sim.errorOccurred = true;
    self.postMessage({
      errorType: "Circular dependency detected", //Don't change the type string; store-calculator looks for it
      errorMessage:
        "Please check affected parts marked in orange, and add a delay at an appropriate place. Tip: start with fixing small loops first.",
      errorData: unvisitedNodes2
    });
  }

  sim.calcTimeLog.push({ stage: "topoSort", endTime: new Date() });
  return L;
}

function prepNodesForSort(sim) {
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
      blockingOutDegree: blockedInfluencees.length,
      blockedInfluencees: blockedInfluencees,
      blockingInfluencers: outerNode.blockingInfluencers,
      sysFormula:
        typeof outerNode.sysFormula !== "undefined" ? outerNode.sysFormula : "",
      unit: typeof outerNode.unit !== "undefined" ? outerNode.unit : "",
      latestValue:
        typeof outerNode.latestValue !== "undefined"
          ? outerNode.latestValue
          : ""
    });
  });
  sim.calcTimeLog.push({ stage: "prepNodesForSort", endTime: new Date() });
  return preppedNodes;
}

function getSimDayOfWeek(args, math, scope) {
  const adjustedDate = getAdjustedDate(args, math, scope, "getSimDayOfWeek()");
  return adjustedDate.getDay();
}

function getSimMonth(args, math, scope) {
  const adjustedDate = getAdjustedDate(args, math, scope, "getSimMonth()");
  return adjustedDate.getMonth();
}

function getSimCalendarMonth(args, math, scope) {
  const adjustedDate = getAdjustedDate(
    args,
    math,
    scope,
    "getSimCalendarMonth()"
  );
  return adjustedDate.getMonth() + 1;
}

function getSimYear(args, math, scope) {
  const adjustedDate = getAdjustedDate(args, math, scope, "getSimYear()");
  return adjustedDate.getFullYear();
}

function getAdjustedDate(args, math, scope, caller) {
  switch (true) {
    case args.length == 0:
      return new Date(scope.timeS * 1000);
      break;
    case args.length == 1:
      if (args[0].args) {
        //user did not wrap argument to caller in quotation marks
        var n = args[0];
      } else {
        //user wrapped argument to caller in quotation marks
        var n = math.parse(args[0].value);
      }
      var timeAdjustment = n.compile().evaluate(scope);
      return new Date(
        (scope.timeS + timeAdjustment.toNumber("seconds")) * 1000
      );
      break;
    case args.length > 1:
      throw new Error(
        caller + " takes at most one argument. " + args.length + " received."
      );
      break;
  }
}

function delay(args, math, scope) {
  const delayT0 = performance.now();
  const $nodeId = args[0].name;
  const nodeId = $nodeId.substr(1);

  const t0 = performance.now();

  // Ted: The following statement is actually faster than caching the
  // compiled args[1], because toString() and stringify() are slow.
  const delayTime = args[1].compile().evaluate(scope);
  const t1 = performance.now();
  perf.compileEvalTimeInDelayFunc += t1 - t0;

  const values = scope.timeSeries.nodes[nodeId];
  const timeSPoints = scope.timeSeries.timeSPoints;
  //let defaultValue = scope[$nodeId];
  let targetTimeS = scope.timeS - delayTime.toNumber("seconds");

  //quick case: if the last value in the time series is for the target time, then return it
  if (timeSPoints[timeSPoints.length - 1] == targetTimeS) {
    //console.log("match");
    return values[values.length - 1];
  }

  let initialValue = null;
  let latestValue = scope[$nodeId];

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
  const interpolated = interpolate(
    timeSPoints,
    values,
    targetTimeS,
    initialValue,
    latestValue,
    nodeId,
    scope
  );
  const delayT1 = performance.now();
  perf.delayFuncTime += delayT1 - delayT0;
  return interpolated;
}

function interpolate(
  rawTimeSPoints,
  rawValues,
  targetTimeS,
  initialValue,
  latestValue,
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
  //TODO: only extract data points surrounding targetTimeS
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
      return getValueWithUnitIfAvailable(
        Number(initialValue),
        scope["$" + nodeId + "_unit"]
      );
    else if (initialValue == "best_guess") {
      //if latestValue is available then return latest value
      if (latestValue !== "") return latestValue;
      else {
        console.error(
          `No history, no initial value, and no latest value available for best guess for node "${replaceNodeIdsWithName(
            nodeId
          )}", initialValue: (${typeof initialValue}) ${initialValue}`
        );
        throw `No history, no initial value, and no latest value available for best guess for node "${replaceNodeIdsWithName(
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
      return getValueWithUnitIfAvailable(
        Number(initialValue),
        scope["$" + nodeId + "_unit"]
      );
    else if (initialValue == "best_guess") return values[0];
  }
  //else if history ends before target time, then return last value in history
  else if (timeSPoints[timeSPoints.length - 1] < targetTimeS) {
    //console.log("History ends before target time; using initialValue or best_guess.");
    if (valueIsANumber(initialValue))
      return getValueWithUnitIfAvailable(
        Number(initialValue),
        scope["$" + nodeId + "_unit"]
      );
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

function getValueWithUnitIfAvailable(value, unit) {
  if (unit) return math.unit(Number(value), unit);
  else return value;
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

function testInitializeIdb() {
  let idb; //placeholder for IndexedDB
  let request = indexedDB.open("mipa", 2);
  request.onupgradeneeded = function(e) {
    idb = request.result;
    idb.createObjectStore("baselines");
    idb.createObjectStore("resultsOfActions");
    console.log("Successfully upgraded idb");
  };
  request.onsuccess = function(e) {
    //idb = request.result;
    //console.log("Initialized idb");
  };
  request.onerror = function(e) {
    //self.postMessage("error");
    console.log("Error initializing idb");
  };
}
function putBaselineResultsInIdb(baselineResults, modelId) {
  putDataInIdb({
    data: baselineResults,
    objectStore: "baselines",
    key: modelId
  });
}

function putActionResultsInIdb(actionResults, actionId) {
  putDataInIdb({
    data: actionResults,
    objectStore: "resultsOfActions",
    key: actionId
  });
}

function putDataInIdb(payload) {
  let request = indexedDB.open("mipa", 2);
  request.onsuccess = function(event) {
    let idb = request.result;
    let requesttrans = idb
      .transaction([payload.objectStore], "readwrite")
      .objectStore(payload.objectStore)
      .put(payload.data, payload.key);
    requesttrans.onerror = function(event) {
      console.log(
        `Error putting ${payload.key} to idb store ${payload.objectStore}`
      );
    };

    requesttrans.onsuccess = function(event) {};
  };
  request.onerror = function(event) {
    self.postMessage("Couldn't open idb");
  };
}

function valueIsANumber(val) {
  //console.log(val, typeof val != "undefined", val !== "", !isNaN(Number(val)));
  return typeof val != "undefined" && val !== "" && !isNaN(Number(val));
}

function replace$NodeIdsWithName(workingString) {
  return replaceNodeIdsWithName(workingString.substr(1));
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

function changedSignificantly(newObj, oldObj, propertyName) {
  if (isNaN(newObj[propertyName]) && !isNaN(oldObj[propertyName])) return true;
  if (!isNaN(newObj[propertyName]) && isNaN(oldObj[propertyName])) return true;
  if (Math.abs(newObj[propertyName] / oldObj[propertyName]) > 1.001)
    return true;
  if (Math.abs(oldObj[propertyName] / newObj[propertyName]) > 1.001)
    return true;
  return false;
}

function resultsNumbersChangedSignificantly(newObj, oldObj) {
  if (typeof oldObj.actionLeverage == "undefined") return true;

  if (changedSignificantly(newObj, oldObj, "actionLeverage")) return true;
  if (changedSignificantly(newObj, oldObj, "marginalNetTotalBenefitNpv"))
    return true;
  if (changedSignificantly(newObj, oldObj, "marginalTotalCostNpv")) return true;
  return false;
}

async function addOrMoveActionToEndOfArray(
  actionIds,
  actionsToCalculate,
  currentIndex
) {
  await asyncForEach(actionIds, async function(actionId) {
    //get index of actionId in actionsToCalculate
    let foundIndex = actionsToCalculate.findIndex(
      action => action.id == actionId
    );
    console.log("found index", foundIndex, "currentIndex", currentIndex);
    //if not found (foundIndex == -1) then add action to end of actionsToCalculate
    if (foundIndex == -1) {
      let singleActionArray = await getActionsFromFirestore([actionId]);
      actionsToCalculate.push(singleActionArray[0]);
      console.log("got action and added to end of array");
    }
    //else if foundIndex <= currentIndex then add to end of actionsToCalculate
    else if (foundIndex <= currentIndex) {
      actionsToCalculate.push(actionsToCalculate[foundIndex]);
      console.log("added processed action to end of array");
    }
    //else move to end of array
    else {
      actionsToCalculate.push(actionsToCalculate.splice(foundIndex, 1)[0]);
      console.log("moved action to end of array");
    }
  });
}
