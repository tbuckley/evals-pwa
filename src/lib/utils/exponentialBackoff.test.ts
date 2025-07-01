import { describe, it, expect, vi, afterEach } from 'vitest';
import { exponentialBackoff, shouldRetryHttpError } from './exponentialBackoff';

describe('exponentialBackoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the result on the first try if the function succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await exponentialBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry the function and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await exponentialBackoff(fn, { initialDelay: 1, maxRetries: 5 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw an error after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(exponentialBackoff(fn, { maxRetries: 3, initialDelay: 1 })).rejects.toThrow(
      'fail',
    );
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial call + 3 retries
  });

  it('should call onRetry callback with correct arguments', async () => {
    const error = new Error('fail');
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');
    const onRetry = vi.fn();

    await exponentialBackoff(fn, { onRetry, initialDelay: 1, maxRetries: 2 });

    expect(onRetry).toHaveBeenCalledTimes(1);
    const [err, attempt, delay] = onRetry.mock.calls[0] as [Error, number, number];
    expect(err).toBe(error);
    expect(attempt).toBe(1);
    expect(delay).toBeGreaterThan(0);
  });

  it('should not call onRetry if the function succeeds on the first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const onRetry = vi.fn();
    await exponentialBackoff(fn, { onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should use default options when none are provided', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await exponentialBackoff(fn, { onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    const delay = onRetry.mock.calls[0][2] as number;
    // Default initialDelay is 1000ms. With jitter it can be between 500 and 1000
    expect(delay).toBeGreaterThanOrEqual(1000 * 0.5);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('should apply exponential backoff delay with jitter', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    await exponentialBackoff(fn, {
      onRetry,
      initialDelay: 100,
      factor: 2,
      jitter: 0.5,
      maxRetries: 2,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);

    const firstDelay = onRetry.mock.calls[0][2] as number;
    expect(firstDelay).toBeGreaterThanOrEqual(100 * (1 - 0.5));
    expect(firstDelay).toBeLessThanOrEqual(100);

    const secondDelay = onRetry.mock.calls[1][2] as number;
    const expectedSecondDelayBase = 100 * Math.pow(2, 1);
    expect(secondDelay).toBeGreaterThanOrEqual(expectedSecondDelayBase * (1 - 0.5));
    expect(secondDelay).toBeLessThanOrEqual(expectedSecondDelayBase);
  });

  it('should cap the delay at maxDelay', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await exponentialBackoff(fn, {
      onRetry,
      initialDelay: 1000,
      factor: 5,
      maxDelay: 2000,
      maxRetries: 1,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);

    const delay = onRetry.mock.calls[0][2] as number;
    expect(delay).toBeLessThanOrEqual(2000);
  });

  it('should handle errors in the onRetry callback gracefully', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockResolvedValue('success');
    const onRetry = vi.fn().mockImplementation(() => {
      throw new Error('onRetry failed');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // Mute console.error
    });

    await exponentialBackoff(fn, { onRetry, initialDelay: 1, maxRetries: 1 });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in onRetry callback:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('should respect shouldRetry function to skip retries for non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Bad Request 400'));
    const shouldRetry = vi.fn().mockReturnValue(false);

    await expect(exponentialBackoff(fn, { shouldRetry, maxRetries: 3 })).rejects.toThrow('Bad Request 400');
    
    expect(fn).toHaveBeenCalledTimes(1); // Should not retry
    expect(shouldRetry).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should retry when shouldRetry function returns true', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Server Error 500'))
      .mockResolvedValue('success');
    const shouldRetry = vi.fn().mockReturnValue(true);

    const result = await exponentialBackoff(fn, { shouldRetry, initialDelay: 1, maxRetries: 3 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2); // Initial call + 1 retry
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });
});

describe('shouldRetryHttpError', () => {
  it('should return true for 429 Too Many Requests', () => {
    const error = new Error('Failed to run model: Too Many Requests 429');
    expect(shouldRetryHttpError(error)).toBe(true);
  });

  it('should return true for 5xx server errors', () => {
    const errors = [
      new Error('Failed to run model: Internal Server Error 500'),
      new Error('Failed to run model: Bad Gateway 502'),
      new Error('Failed to run model: Service Unavailable 503'),
      new Error('Failed to run model: Gateway Timeout 504'),
      new Error('Failed to run model: HTTP Version Not Supported 505'),
      new Error('Failed to run model: Variant Also Negotiates 506'),
      new Error('Failed to run model: Insufficient Storage 507'),
      new Error('Failed to run model: Loop Detected 508'),
      new Error('Failed to run model: Not Extended 510'),
      new Error('Failed to run model: Network Authentication Required 511'),
    ];

    errors.forEach(error => {
      expect(shouldRetryHttpError(error)).toBe(true);
    });
  });

  it('should return false for 4xx client errors (except 429)', () => {
    const errors = [
      new Error('Failed to run model: Bad Request 400'),
      new Error('Failed to run model: Unauthorized 401'),
      new Error('Failed to run model: Payment Required 402'),
      new Error('Failed to run model: Forbidden 403'),
      new Error('Failed to run model: Not Found 404'),
      new Error('Failed to run model: Method Not Allowed 405'),
      new Error('Failed to run model: Not Acceptable 406'),
      new Error('Failed to run model: Proxy Authentication Required 407'),
      new Error('Failed to run model: Request Timeout 408'),
      new Error('Failed to run model: Conflict 409'),
      new Error('Failed to run model: Gone 410'),
      new Error('Failed to run model: Length Required 411'),
      new Error('Failed to run model: Precondition Failed 412'),
      new Error('Failed to run model: Payload Too Large 413'),
      new Error('Failed to run model: URI Too Long 414'),
      new Error('Failed to run model: Unsupported Media Type 415'),
      new Error('Failed to run model: Range Not Satisfiable 416'),
      new Error('Failed to run model: Expectation Failed 417'),
      new Error('Failed to run model: I\'m a teapot 418'),
      new Error('Failed to run model: Misdirected Request 421'),
      new Error('Failed to run model: Unprocessable Entity 422'),
      new Error('Failed to run model: Locked 423'),
      new Error('Failed to run model: Failed Dependency 424'),
      new Error('Failed to run model: Too Early 425'),
      new Error('Failed to run model: Upgrade Required 426'),
      new Error('Failed to run model: Precondition Required 428'),
      new Error('Failed to run model: Request Header Fields Too Large 431'),
      new Error('Failed to run model: Unavailable For Legal Reasons 451'),
    ];

    errors.forEach(error => {
      expect(shouldRetryHttpError(error)).toBe(false);
    });
  });

  it('should return true for common retryable error patterns', () => {
    const errors = [
      new Error('Network error occurred'),
      new Error('Connection timeout'),
      new Error('Request timeout'),
      new Error('Socket timeout'),
      new Error('Temporary failure'),
      new Error('Service unavailable'),
      new Error('Internal server error'),
      new Error('Bad gateway'),
      new Error('Gateway timeout'),
    ];

    errors.forEach(error => {
      expect(shouldRetryHttpError(error)).toBe(true);
    });
  });

  it('should return false for errors without recognizable patterns', () => {
    const errors = [
      new Error('Invalid API key'),
      new Error('Model not found'),
      new Error('Insufficient credits'),
      new Error('Validation error'),
      'not an error object',
      null,
      undefined,
    ];

    errors.forEach(error => {
      expect(shouldRetryHttpError(error)).toBe(false);
    });
  });

  it('should return false for non-Error objects', () => {
    expect(shouldRetryHttpError('string error')).toBe(false);
    expect(shouldRetryHttpError(null)).toBe(false);
    expect(shouldRetryHttpError(undefined)).toBe(false);
    expect(shouldRetryHttpError(123)).toBe(false);
    expect(shouldRetryHttpError({})).toBe(false);
  });
});
