// First sale is attainable within the initial progression; later networks scale x3.
export function franchiseThreshold(count) {
  return 10000000 * Math.pow(3, count);
}
