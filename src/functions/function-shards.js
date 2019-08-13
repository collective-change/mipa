export function mergeShards(shards, propertyName) {
  Array.prototype.clone = function() {
    return this.slice(0);
  };
  Array.prototype.extend = function(other_array) {
    /* You should include a test to check whether other_array really is an array */
    if (Array.isArray(other_array)) {
      other_array.forEach(function(v) {
        this.push(v);
      }, this);
    } else {
      throw new Error("Input needs to be an array of arrays.");
    }
  };

  console.log("shards: ", shards);

  if (Array.isArray(shards) && shards.length > 1) {
    var result = shards[0][propertyName].clone();
    console.log("result: ", result);
    for (var i = 1; i < shards.length; i++) {
      result.extend(shards[i][propertyName]);
    }
    return result;
  } else {
    return shards;
  }
}
