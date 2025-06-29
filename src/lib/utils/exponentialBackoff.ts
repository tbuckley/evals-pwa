/**
 * Options for configuring the exponential backoff behavior.
 */
interface BackoffOptions {
  /**
   * The maximum number of retry attempts.
   * @default 10
   */
  maxRetries?: number;
  /**
   * The initial delay in milliseconds before the first retry.
   * @default 1000
   */
  initialDelay?: number;
  /**
   * The maximum delay in milliseconds between retries.
   * @default 30000
   */
  maxDelay?: number;
  /**
   * The multiplication factor for the delay.
   * @default 2
   */
  factor?: number;
  /**
   * The amount of jitter to add to the delay.
   * @default 0.5
   */
  jitter?: number;
  /**
   * An optional callback function that is called before each retry attempt.
   * @param error The error that caused the retry.
   * @param attempt The current attempt number (starting from 1).
   * @param delay The delay in ms before the next attempt.
   */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * A helper function to create a delay using a Promise.
 * @param ms The number of milliseconds to wait.
 * @returns A promise that resolves after the specified delay.
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  options?: BackoffOptions,
): Promise<T> {
  // Set default values for options
  const {
    maxRetries = 10,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    jitter = 0.5,
    onRetry,
  } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt to execute the function
      return await fn();
    } catch (error) {
      lastError = error;

      // If we've reached the max number of retries, re-throw the last error
      if (attempt === maxRetries) {
        console.error(`All ${maxRetries} retry attempts failed.`);
        throw lastError;
      }

      // Calculate the next delay
      const jitterFactor = 1 - jitter + jitter * Math.random();
      const delay = Math.min(initialDelay * Math.pow(factor, attempt) * jitterFactor, maxDelay);

      // Call the onRetry callback if it's provided
      if (onRetry) {
        try {
          onRetry(error, attempt + 1, delay);
        } catch (e) {
          console.error('Error in onRetry callback:', e);
        }
      }

      // Wait for the calculated delay before the next attempt
      await wait(delay);
    }
  }

  // This line should be unreachable, but it satisfies the TypeScript compiler
  // that a value is always returned or an error is thrown.
  throw lastError;
}
