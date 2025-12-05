# Kernel Replay Behavior Tests

Tests to determine video replay behavior when browser sessions are deleted.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file with your Kernel API key:

   ```
   KERNEL_API_KEY=your_kernel_api_key_here
   ```

   Get your API key from https://dashboard.onkernel.com/api-keys

## Running Tests

```bash
pnpm test
```

## Test Scenarios

| Test | Scenario                                     | Purpose                                      |
| ---- | -------------------------------------------- | -------------------------------------------- |
| 1    | Start replay, delete browser without stop    | Test if replays are auto-stopped on deletion |
| 2    | Start replay, stop, delete immediately (0ms) | Test immediate deletion after stop           |
| 3    | Start replay, stop, wait 250ms, delete       | Test 250ms delay                             |
| 4    | Start replay, stop, wait 500ms, delete       | Test 500ms delay                             |
| 5    | Start replay, stop, wait 1000ms, delete      | Test 1000ms delay                            |

## Test Results (December 5, 2025)

All 5 tests passed with **100% replay generation success**:

| Test Name                 | Stop Called | Wait (ms) | Replay Generated | File Size |
| ------------------------- | ----------- | --------- | ---------------- | --------- |
| No stop, immediate delete | No          | 0         | ✅ Yes           | 27.6 KB   |
| Stop, 0ms wait, delete    | Yes         | 0         | ✅ Yes           | 30.0 KB   |
| Stop, 250ms wait, delete  | Yes         | 250       | ✅ Yes           | 27.9 KB   |
| Stop, 500ms wait, delete  | Yes         | 500       | ✅ Yes           | 27.9 KB   |
| Stop, 1000ms wait, delete | Yes         | 1000      | ✅ Yes           | 27.1 KB   |

### Key Findings

**1. Are video replays automatically stopped when a browser is deleted?**

- **YES** - Replays are automatically stopped when the browser is deleted. The test with no `stop()` call still generated a replay successfully.

**2. Do you need to wait before calling delete after stop?**

- **NO** - Based on these tests, even immediate deletion (0ms wait) after `stop()` successfully generated replays.

**3. Are the replay files valid (non-empty)?**

- **YES** - All replay files downloaded successfully with sizes between 27-30 KB, confirming actual video content is being generated.
