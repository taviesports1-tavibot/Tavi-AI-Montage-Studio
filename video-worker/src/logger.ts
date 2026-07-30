type LogEvent =
  | "UPLOAD"
  | "ANALYSIS"
  | "DIRECTOR"
  | "RENDER"
  | "COMPLETE"
  | "ERROR"
  | "SYSTEM";

export function logEvent(
  event: LogEvent,
  message: string,
  context: Record<string, unknown> = {},
) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    message,
    ...context,
  };

  const output = JSON.stringify(entry);
  if (event === "ERROR") {
    console.error(output);
  } else {
    console.info(output);
  }
}
