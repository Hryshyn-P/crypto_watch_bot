function isWhatPercentOf(prev, current) {
  return +(prev > current ?
    -Math.abs((((prev - current) / current) * 100)) :
    Math.abs((((prev - current) / current) * 100))).toFixed(3);
}

function inRange(x, min = 1, max = 14) {
  return ((x - min) * (x - max) <= 0);
}

function trimNum(stringNum) {
  if (stringNum.endsWith('.0')) stringNum = stringNum.slice(0, -2);
  if (stringNum.endsWith('.')) stringNum = stringNum.slice(0, -1);
  return stringNum;
}

export {isWhatPercentOf, inRange, trimNum};
