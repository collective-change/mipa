export function formatNumber(num, precision) {
  if (typeof num == "undefined" || num == null) return "";
  else if (typeof precision != "undefined" && Number.isInteger(precision)) {
    if (Math.abs(num) >= 1)
      return withSiPrefix(parseFloat(num.toPrecision(precision)), precision);
    else return parseFloat(num.toPrecision(precision));
  } else return num.toLocaleString();
  /*return parseFloat(num.toPrecision(precision)).toLocaleString();*/
}

function withSiPrefix(num, digits) {
  var si = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" }
  ];
  var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var i;
  //var sign = Math.sign(num);
  var absNum = Math.abs(num);
  for (i = si.length - 1; i > 0; i--) {
    if (absNum >= si[i].value) {
      break;
    }
  }
  return (
    (num / si[i].value).toFixed(digits).replace(rx, "$1") + " " + si[i].symbol
  );
}
