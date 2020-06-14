import { parse } from "mathjs";

export { classifyInfluencers };

function classifyInfluencers(payload) {
  let thisNode = payload.thisNode;
  let nodes = payload.nodes;
  //console.log("classifying influencers of ", thisNode.name);

  let formulaExists =
    typeof thisNode.sysFormula != "undefined" && thisNode.sysFormula != "";

  //get all used influencers, add to used and blocking array
  let used = [];
  let blocking = [];
  let delayCallsArgs = [];

  if (formulaExists) {
    let sysFormula = thisNode.sysFormula;
    let parsedSysFormula = parse(sysFormula);
    if ("influencers" in thisNode) {
      thisNode.influencers.forEach(function(influencerId) {
        if (sysFormula.includes(influencerId)) blocking.push(influencerId);
        if (sysFormula.includes(influencerId)) used.push(influencerId);
      });
    }
    //console.log("influencers", thisNode.influencers);

    //get all delay calls

    let selfDelay = false;
    parsedSysFormula.traverse(function(expressionNode, path, parent) {
      if (expressionNode.type == "FunctionNode") {
        if (expressionNode.fn.name == "delay") {
          delayCallsArgs.push(expressionNode.args);
          //if the current node has a delay influence on itself
          if (
            expressionNode.args.length &&
            expressionNode.args[0].name == "$" + thisNode.id
          )
            selfDelay = true;
        }
      }
    });
    if (selfDelay == true) blocking.push(thisNode.id);
  } //end of calculation for if formulaExists

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
      if (args.length && args[0].name.substring(1) == influencerId) {
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
        let historyAvailable = false; //TODO: check if history is available
        let influencerNode = nodes.find(function(node) {
          return node.id == influencerId;
        });
        //but if the influencer node is "thisNode", then set it as such
        //to get its newest values.
        if (influencerId == thisNode.id) {
          influencerNode = thisNode;
        }
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
  //console.log({ unused });

  return {
    blocking: blocking,
    unused: unused
  };
}
