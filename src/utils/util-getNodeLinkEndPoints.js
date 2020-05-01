export { getNodeLinkEndPoints, getDistance };

function getNodeLinkEndPoints(d, radius, targetOffset) {
  var dx = d.target.x - d.source.x;
  var dy = d.target.y - d.source.y;

  var t_gamma = Math.atan2(dy, dx); // Math.atan2 returns the angle in the correct quadrant as opposed to Math.atan
  var tx = d.target.x - Math.cos(t_gamma) * (radius + targetOffset);
  var ty = d.target.y - Math.sin(t_gamma) * (radius + targetOffset);

  var s_gamma = Math.atan2(-dy, -dx);
  var sx = d.source.x - Math.cos(s_gamma) * radius;
  var sy = d.source.y - Math.sin(s_gamma) * radius;

  return { sx: sx, sy: sy, tx: tx, ty: ty };
}

function getDistance(d) {
  var dx = d.target.x - d.source.x;
  var dy = d.target.y - d.source.y;
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}
