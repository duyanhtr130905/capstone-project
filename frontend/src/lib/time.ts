export function formatCountdown(timestamp: bigint) {
  const finish = Number(timestamp);
  if (finish <= 0) return "No active period";

  const secondsLeft = finish - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return "Finished";

  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function formatDateTime(timestamp: bigint) {
  const seconds = Number(timestamp);
  if (seconds <= 0) return "Not started";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));
}

export function rewardPeriodProgress(periodFinish: bigint, duration: bigint) {
  const finish = Number(periodFinish);
  const length = Number(duration);
  if (finish <= 0 || length <= 0) return 0;

  const start = finish - length;
  const now = Math.floor(Date.now() / 1000);

  if (now <= start) return 0;
  if (now >= finish) return 100;

  return ((now - start) / length) * 100;
}
