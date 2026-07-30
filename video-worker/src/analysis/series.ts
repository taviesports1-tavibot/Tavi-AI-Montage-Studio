export interface TimedValue {
  time: number;
  value: number;
}

export function percentile(values: number[], target: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * target)),
  );
  return sorted[index] ?? 0;
}

export function robustNormalize(series: TimedValue[]) {
  if (!series.length) return [];
  const values = series.map((item) => item.value).filter(Number.isFinite);
  const low = percentile(values, 0.1);
  const high = percentile(values, 0.9);
  const range = Math.max(0.0001, high - low);

  return series.map((item) => ({
    time: item.time,
    value: Math.min(1, Math.max(0, (item.value - low) / range)),
  }));
}

export function valueNear(
  series: TimedValue[],
  time: number,
  tolerance = 0.55,
) {
  let nearest: TimedValue | null = null;
  for (const item of series) {
    const distance = Math.abs(item.time - time);
    if (distance <= tolerance && (!nearest || distance < Math.abs(nearest.time - time))) {
      nearest = item;
    }
  }
  return nearest?.value ?? 0;
}
