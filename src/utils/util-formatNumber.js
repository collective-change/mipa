export function formatNumber(num, precision) {
  if (typeof num == "undefined") return "";
  else if (typeof precision != "undefined" && Number.isInteger(precision))
    return parseFloat(num.toPrecision(precision)).toLocaleString();
  else return num.toLocaleString();
}
