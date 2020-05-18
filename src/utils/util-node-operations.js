import { parse } from "mathjs";

export { classifyInfluencers };

function classifyInfluencers(payload) {
  let thisNode = payload.thisNode;
  let nodes = payload.nodes;

  let sysFormula = thisNode.sysFormula;
  let parsedSysFormula = parse(sysFormula);
  //get all used influencers, add to used and blocking array
  let used = [];
  let blocking = [];
  if ("influencers" in thisNode) {
    thisNode.influencers.forEach(function(influencerId) {
      if (sysFormula.includes(influencerId)) blocking.push(influencerId);
      if (sysFormula.includes(influencerId)) used.push(influencerId);
    });
  }

  //get all delay calls
  let delayCallsArgs = [];
  let selfDelay = false;
  parsedSysFormula.traverse(function(node, path, parent) {
    if (node.type == "FunctionNode") {
      if (node.fn.name == "delay") {
        delayCallsArgs.push(node.args);
        //if the current node has a delay influence on itself
        if (node.args[0].name == "$" + thisNode.id) selfDelay = true;
      }
    }
  });
  if (selfDelay == true) blocking.push(thisNode.id);

  //console.log({ blocking });

  let blockingArrForIteration = [...blocking];

  blockingArrForIteration.forEach(function(influencerId, index, object) {
    //console.log("processing ", influencerId);
    //remove influencer from blocking if it is only in non-blocking delay
    let influencerIsBlocking = true;
    let influencerDelayCallsArgs = [];
    //is influencer is used in any delay?
    delayCallsArgs.forEach(function(args) {
      //console.log(args);
      //if influencer is used in any delay, then influencerIsBlocking = false
      if (args[0].name.substring(1) == influencerId) {
        influencerIsBlocking = false;
        influencerDelayCallsArgs.push(args);
      }
    });
    //for each delay call the influencer is in
    influencerDelayCallsArgs.forEach(function(args) {
      //if a blocking delay, then set influencerIsBlocking = true
      //if initialValue is not set then influencerIsBlocking = true
      if (args.length < 3) influencerIsBlocking = true;
      let initialValue = args[2];
      if (initialValue == "best_guess") {
        //console.log("processing best_guess for ", args[0]);
        let historyAvailable = false; //todo: check if history is available
        let influencerNode = nodes.find(function(node) {
          return node.id == influencerId;
        });
        if (
          typeof influencerNode.currentValue != "undefined" &&
          influencerNode.currentValue != "" &&
          !isNaN(Number(influencerNode.currentValue))
        )
          var currentValueAvailable = true;
        else var currentValueAvailable = false;
        //console.log(influencerId, { currentValueAvailable });
        if (!historyAvailable && !currentValueAvailable)
          influencerIsBlocking = true;
      }
    });
    if (influencerIsBlocking == false) {
      //remove influencer from blocking array
      //console.log("removing", influencerId);
      const index = blocking.indexOf(influencerId);
      if (index > -1) {
        blocking.splice(index, 1);
      }
    }
  });
  // end of calculation for blocking influencers

  //unused influencers = all influencers - used influencers
  let unused = [];
  if ("influencers" in thisNode) {
    unused = thisNode.influencers.filter(el => !used.includes(el));
  }

  return { blocking: blocking, unused: unused };
}
