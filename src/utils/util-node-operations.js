//import { parse } from "mathjs";

export { classifyInfluencers };

function classifyInfluencers(payload) {
  let thisNode = payload.thisNode;

  let formulaExists =
    typeof thisNode.sysFormula != "undefined" && thisNode.sysFormula != "";

  let used = [];
  let blocking = [];

  if (formulaExists) {
    let sysFormula = thisNode.sysFormula;
    if ("influencers" in thisNode) {
      thisNode.influencers.forEach(function(influencerId) {
        if (sysFormula.includes(influencerId)) used.push(influencerId);
        if (getBlockingAppearances(sysFormula, influencerId) > 0)
          blocking.push(influencerId);
      });
    }
  }

  //unused influencers = all influencers - used influencers
  let unused = [];
  if ("influencers" in thisNode) {
    unused = thisNode.influencers.filter(el => !used.includes(el));
  }

  return {
    blocking: blocking,
    unused: unused
  };
}

function getBlockingAppearances(sysFormula, influencerId) {
  let $influencerIdRegExp = new RegExp("\\$" + influencerId, "g");
  let delay$influencerIdRegExp = new RegExp(
    "delay\\(\\$" + influencerId + ",",
    "g"
  );
  let totalAppearances = (sysFormula.match($influencerIdRegExp) || []).length;
  let delayedAppearances = (sysFormula.match(delay$influencerIdRegExp) || [])
    .length;
  return totalAppearances - delayedAppearances;
}
