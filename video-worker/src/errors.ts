export class StudioError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "StudioError";
  }
}

export function asStudioError(error: unknown) {
  if (error instanceof StudioError) {
    return error;
  }

  return new StudioError(
    "INTERNAL_ERROR",
    "Сталася внутрішня помилка. Спробуйте ще раз.",
    500,
    error instanceof Error ? error.message : String(error),
  );
}
