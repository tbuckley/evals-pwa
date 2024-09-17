// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export function assert(val: unknown): asserts val {
  if (!val) {
    throw new Error(`assertion failed: ${String(val)}`);
  }
}

export function cast<T>(val: T): NonNullable<T> {
  if (val === null || val === undefined) {
    throw new Error(`cast failed: ${String(val)}`);
  }
  return val as NonNullable<T>;
}
