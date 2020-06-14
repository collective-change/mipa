// TODO: Only consider influeners and influencees present in input nodes

export function calculateDependencyLevels(nodes) {
  //if a node has an influencer, increase dependencyLevel number to one above influencer
  let depLevsChanging = true;
  let depLevs = {};
  let tempDepLevs = {};
  let influencerTempDepLev = 0;

  //loop until dependency levels don't change anymore
  let whileLoopCount = 0;
  while (depLevsChanging) {
    whileLoopCount++;
    //let nodeCount = 0;
    depLevsChanging = false;
    nodes.forEach(function(node) {
      //nodeCount++;
      tempDepLevs[node.id] = 0;
      if (node.influencers && node.influencers.length) {
        node.influencers.forEach(function(influencer) {
          influencerTempDepLev =
            typeof tempDepLevs[influencer] === "undefined"
              ? 0
              : tempDepLevs[influencer];
          tempDepLevs[node.id] =
            influencerTempDepLev >= tempDepLevs[node.id]
              ? influencerTempDepLev + 1
              : tempDepLevs[node.id];
        });
      }

      //if dependencyLevel has changed from previous iteration
      if (tempDepLevs[node.id] != depLevs[node.id]) {
        //save tempDepLevs into depLevs
        depLevs[node.id] = tempDepLevs[node.id];
        depLevsChanging = true;
      }
    }, this);
  }

  //if a node has no influencers, then set dependencyLevel to lowest influencee dependencyLevel - 1
  nodes.forEach(function(node) {
    if (!node.influencers || !node.influencers.length) {
      if (
        typeof node.influencees !== "undefined" &&
        Array.isArray(node.influencees) &&
        node.influencees.length > 0
      ) {
        let lowestInfluenceeDepLev = Infinity;
        node.influencees.forEach(function(influencee) {
          if (depLevs[influencee] < lowestInfluenceeDepLev) {
            lowestInfluenceeDepLev = depLevs[influencee];
          }
        });
        depLevs[node.id] = lowestInfluenceeDepLev - 1;
      } else {
        //node has no influencers and no influencees, we'll say that it has no dependency level
        depLevs[node.id] = null;
      }
    }
  });
  return depLevs;
}
