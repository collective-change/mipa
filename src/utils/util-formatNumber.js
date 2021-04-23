export function formatNumber(num, precision) {
  if (typeof num == "undefined" || num == null || num == "") return "";
  else if (typeof precision != "undefined" && Number.isInteger(precision)) {
    //return num.toExponential(precision - 1);
    if (Math.abs(num) >= 1)
      return withAbbreviation(
        parseFloat(num.toPrecision(precision)),
        precision
      );
    else return parseFloat(num.toPrecision(precision));
  } else return num.toLocaleString();
  /*return parseFloat(num.toPrecision(precision)).toLocaleString();*/
}

function withAbbreviation(num, digits) {
  var abbr = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "K" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "B" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "cutoff" } //cutoff point; will not show in result
  ];
  var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var i;
  var absNum = Math.abs(num);
  for (i = abbr.length - 1; i > 0; i--) {
    if (absNum >= abbr[i].value) {
      break;
    }
  }
  if (abbr[i].symbol == "cutoff") {
    return num.toExponential(digits - 1);
  } else
    return (
      (num / abbr[i].value).toFixed(digits).replace(rx, "$1") + abbr[i].symbol
    );
}
