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
  /**
   * An optional function that determines whether an error should be retried.
   * @param error The error that occurred.
   * @returns true if the error should be retried, false otherwise.
   * @default () => true (retry all errors)
   */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * A helper function to create a delay using a Promise.
 * @param ms The number of milliseconds to wait.
 * @returns A promise that resolves after the specified delay.
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTTP Error class that includes the HTTP status code.
 */
export class HttpError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }
}

/**
 * Determines if an HTTP error should be retried based on the status code.
 * Only retries for 429 (Too Many Requests) and 5xx (Server Error) status codes.
 * @param error The error to check
 * @returns true if the error should be retried, false otherwise
 */
export function shouldRetryHttpError(error: unknown): boolean {
  // Check if the error is an HttpError instance
  if (error instanceof HttpError) {
    const status = error.status;
    // Retry for 429 (Too Many Requests) and 5xx (Server Error) status codes
    return status === 429 || (status >= 500 && status < 600);
  }

  // Fallback: Check if the error contains HTTP status information in the message
  if (error instanceof Error) {
    const message = error.message;
    
    // Look for HTTP status codes in the error message
    const statusMatch = message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      
      // Retry for 429 (Too Many Requests) and 5xx (Server Error) status codes
      return status === 429 || (status >= 500 && status < 600);
    }
    
    // If we can't parse a status code, check for common retryable error patterns
    const retryablePatterns = [
      /network.*error/i,
      /connection.*timeout/i,
      /request.*timeout/i,
      /socket.*timeout/i,
      /temporary.*failure/i,
      /service.*unavailable/i,
      /internal.*server.*error/i,
      /bad.*gateway/i,
      /gateway.*timeout/i,
    ];
    
    return retryablePatterns.some(pattern => pattern.test(message));
  }
  
  // For unknown error types, don't retry
  return false;
}

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
    shouldRetry,
  } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt to execute the function
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this error should be retried
      const shouldRetryError = shouldRetry ? shouldRetry(error) : true;

      // If we've reached the max number of retries or the error shouldn't be retried, re-throw the error
      if (attempt === maxRetries || !shouldRetryError) {
        if (attempt === maxRetries) {
          console.error(`All ${maxRetries} retry attempts failed.`);
        }
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
