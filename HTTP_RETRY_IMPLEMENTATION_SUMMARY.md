# HTTP Retry Logic Implementation Summary

## Overview
This document summarizes the changes made to implement proper HTTP error retry logic in the OpenAI, Gemini, and Anthropic providers. The implementation ensures that exponential backoff only retries for appropriate HTTP errors (429 and 5xx status codes) and skips retries for 4xx client errors that are unlikely to be resolved by retrying.

## Changes Made

### 1. Enhanced Exponential Backoff Utility (`src/lib/utils/exponentialBackoff.ts`)

#### Added `shouldRetry` Option
- Extended the `BackoffOptions` interface with a new optional `shouldRetry` function
- This function allows callers to determine whether a specific error should be retried
- Default behavior remains unchanged (retry all errors) for backward compatibility

#### New Class: `HttpError`
- Custom error class that extends the standard `Error` class
- Takes a message (string) and HTTP status code (number) as constructor parameters
- Provides type-safe access to the HTTP status code via the `status` property
- Maintains proper stack traces and error inheritance

#### New Function: `shouldRetryHttpError`
- Exported function that determines if an HTTP error should be retried
- **Primary behavior:** Checks if error is an `HttpError` instance and examines the `status` property directly
- **Fallback behavior:** For regular `Error` instances, parses status codes from error messages
- **Retryable errors:**
  - HTTP 429 (Too Many Requests)
  - HTTP 5xx (Server Error codes: 500-599)
  - Common network error patterns (network errors, timeouts, etc.)
- **Non-retryable errors:**
  - HTTP 4xx client errors (400-428, 430-499) - these indicate client-side issues that won't be fixed by retrying
  - Unrecognized error patterns

#### Updated Retry Logic
- Modified the main `exponentialBackoff` function to respect the `shouldRetry` option
- If `shouldRetry` returns `false`, the function immediately throws the error without retrying
- Maintains all existing functionality when `shouldRetry` is not provided

### 2. Updated Provider Implementations

#### OpenAI Provider (`src/lib/providers/openai.ts`)
- Added import for `shouldRetryHttpError` function and `HttpError` class
- Updated error handling to throw `HttpError` instances with proper status codes
- Updated the `exponentialBackoff` call to use `{ shouldRetry: shouldRetryHttpError }`
- Now provides type-safe HTTP status codes and only retries appropriate errors

#### Gemini Provider (`src/lib/providers/gemini.ts`)
- Added import for `shouldRetryHttpError` function and `HttpError` class
- Updated error handling to throw `HttpError` instances with proper status codes
- Updated the `exponentialBackoff` call to use `{ shouldRetry: shouldRetryHttpError }`
- Now provides type-safe HTTP status codes and only retries appropriate errors

#### Anthropic Provider (`src/lib/providers/anthropic.ts`)
- Added import for `shouldRetryHttpError` function and `HttpError` class
- Updated error handling to throw `HttpError` instances with proper status codes
- Updated the `exponentialBackoff` call to use `{ shouldRetry: shouldRetryHttpError }`
- Now provides type-safe HTTP status codes and only retries appropriate errors

### 3. Comprehensive Test Coverage (`src/lib/utils/exponentialBackoff.test.ts`)

#### New Tests for `HttpError` Class
- Test proper instantiation with message and status code
- Verify inheritance from Error class
- Test stack trace maintenance

#### New Tests for `shouldRetry` Option
- Test that non-retryable errors are not retried
- Test that retryable errors are properly retried
- Verify the `shouldRetry` function is called with correct parameters

#### New Tests for `shouldRetryHttpError` Function
- **HttpError Instance Tests:** 
  - Verify 429 errors are marked as retryable
  - Verify all server error codes (500-599) are marked as retryable
  - Verify client error codes (400-428, 430-499) are marked as non-retryable
  - Verify 1xx, 2xx, 3xx codes are marked as non-retryable
- **Fallback Behavior Tests (regular Error instances):**
  - HTTP status code parsing from error messages
  - Pattern matching for common error types
  - Edge cases with unrecognized patterns

## Benefits

### 1. Improved Reliability
- Avoids wasting time and resources on retries that will never succeed
- Focuses retry attempts on genuinely transient issues

### 2. Better User Experience
- 4xx errors fail fast, providing immediate feedback for client-side issues
- 5xx and 429 errors are retried, handling temporary server issues gracefully

### 3. API Provider Compliance
- Respects rate limiting (429) by retrying with backoff
- Avoids unnecessary load on provider APIs for non-retryable errors
- Follows HTTP status code semantics correctly

### 4. Backward Compatibility
- All existing code continues to work unchanged
- New retry logic is opt-in via the `shouldRetry` parameter
- Default behavior remains the same when `shouldRetry` is not specified

## Technical Details

### Error Detection Strategy
The `shouldRetryHttpError` function uses a multi-layered approach:

1. **Type-Safe Status Check:** First checks if error is an `HttpError` instance and examines the `status` property directly
2. **Fallback Status Code Parsing:** For regular `Error` instances, extracts HTTP status codes from error messages using regex
3. **Pattern Matching:** Falls back to common error pattern recognition for network-level issues
4. **Conservative Default:** Returns `false` for unrecognized errors to avoid infinite retries

### Status Code Categories
- **429 (Too Many Requests):** Always retryable - indicates rate limiting
- **5xx (Server Errors):** Always retryable - indicates temporary server issues
- **4xx (Client Errors):** Not retryable - indicates permanent client-side issues
  - Exception: 429 is treated as retryable despite being in the 4xx range

### Integration Points
All three providers now use the enhanced retry logic in their main HTTP request flows:
- OpenAI: Chat completions API calls
- Gemini: Stream generate content API calls  
- Anthropic: Messages API calls

## Example Behavior

### Before Implementation
```typescript
// All errors were retried, including:
// - 400 Bad Request (invalid parameters)
// - 401 Unauthorized (invalid API key)
// - 404 Not Found (invalid model)
// This led to wasted retries and poor user experience
```

### After Implementation
```typescript
// Type-safe error handling with HttpError class:
throw new HttpError('Too Many Requests', 429);        // ✅ RETRY with backoff
throw new HttpError('Internal Server Error', 500);    // ✅ RETRY with backoff
throw new HttpError('Bad Gateway', 502);              // ✅ RETRY with backoff
throw new HttpError('Bad Request', 400);              // ❌ FAIL FAST (no retry)
throw new HttpError('Unauthorized', 401);             // ❌ FAIL FAST (no retry)
throw new HttpError('Not Found', 404);                // ❌ FAIL FAST (no retry)

// shouldRetryHttpError checks error.status directly for type safety
// Falls back to message parsing for backward compatibility
```

This implementation ensures robust and efficient error handling across all AI provider integrations while maintaining backward compatibility and following HTTP best practices.