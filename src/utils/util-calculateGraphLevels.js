// TODO: Only consider influeners and influencees present in input nodes

export function calculateGraphLevels(nodes) {
  //if a node has an influencer, increase dependencyLevel number to one above influencer
  let depLevsChanging = true;
  let depLevs = {};
  let tempDepLevs = {};
  let influencerTempDepLev = 0;

  //loop until dependency levels don't change anymore
  let whileLoopCount = 0;
  while (depLevsChanging && whileLoopCount < 10) {
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

  //unless node has no influencees (is output node), set node's dependencyLevel to lowest influencee dependencyLevel - 1
  //and loop until dependency levels don't change anymore
  tempDepLevs = {};
  depLevsChanging = true;
  whileLoopCount = 0;
  while (depLevsChanging && whileLoopCount < 10) {
    whileLoopCount++;
    nodes.forEach(function(node) {
      if (!node.influencees || !node.influencees.length) {
        // node is output node; do nothing
        console.log(node.name);
      } else {
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
          tempDepLevs[node.id] = lowestInfluenceeDepLev - 1;
        } else {
          //node has no influencers and no influencees, we'll say that it has no dependency level
          tempDepLevs[node.id] = null;
        }
        //if dependencyLevel has changed from previous iteration
        if (tempDepLevs[node.id] != depLevs[node.id]) {
          //save tempDepLevs into depLevs
          depLevs[node.id] = tempDepLevs[node.id];
          depLevsChanging = true;
        }
      }
    });
  }

  //now depLevs have become graphLevels, so just return depLevs.
  return depLevs;
}
