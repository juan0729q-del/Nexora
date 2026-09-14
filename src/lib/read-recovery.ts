/** Repite una lectura transitoria una vez; nunca debe envolver escrituras. */
export async function recoverRead<T>(read: () => Promise<T>, retryable: (error: unknown) => boolean): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!retryable(error)) throw error;
    return read();
  }
}
