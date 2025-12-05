import Kernel from "@onkernel/sdk";
import "dotenv/config";
import { chromium } from "playwright-core";

const kernel = new Kernel();

interface TestResult {
  name: string;
  sessionId: string;
  replayId: string | null;
  stopCalled: boolean;
  waitMs: number;
  replayFound: boolean;
  replayStatus?: string;
  replayFileSize?: number;
  error?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest(
  name: string,
  stopReplay: boolean,
  waitBeforeDeleteMs: number
): Promise<TestResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Starting test: ${name}`);
  console.log(`  - Stop replay: ${stopReplay}`);
  console.log(`  - Wait before delete: ${waitBeforeDeleteMs}ms`);
  console.log("=".repeat(60));

  const result: TestResult = {
    name,
    sessionId: "",
    replayId: null,
    stopCalled: stopReplay,
    waitMs: waitBeforeDeleteMs,
    replayFound: false,
  };

  try {
    // 1. Create browser
    console.log("Creating browser...");
    const kernelBrowser = await kernel.browsers.create({
      timeout_seconds: 300,
    });
    result.sessionId = kernelBrowser.session_id;
    console.log(`  Browser created: ${kernelBrowser.session_id}`);
    console.log(`  Live view: ${kernelBrowser.browser_live_view_url}`);

    // 2. Connect Playwright and generate some video content
    console.log("Connecting Playwright...");
    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());

    console.log("Navigating to generate video content...");
    await page.goto("https://example.com");
    await page.waitForLoadState("networkidle");

    // 3. Start replay recording
    console.log("Starting replay recording...");
    const replay = await kernel.browsers.replays.start(kernelBrowser.session_id);
    result.replayId = replay.replay_id;
    console.log(`  Replay started: ${replay.replay_id}`);

    // Give some time for recording
    console.log("Recording for 2 seconds...");
    await page.click("body");
    await sleep(1000);
    await page.goto("https://example.com/");
    await sleep(1000);

    // 4. Close Playwright connection
    console.log("Closing Playwright connection...");
    await browser.close();

    // 5. Apply test conditions: stop replay if specified
    if (stopReplay) {
      console.log("Stopping replay...");
      await kernel.browsers.replays.stop(replay.replay_id, {
        id: kernelBrowser.session_id,
      });
      console.log("  Replay stopped");
    } else {
      console.log("Skipping replay stop (testing auto-stop behavior)");
    }

    // 6. Wait before delete if specified
    if (waitBeforeDeleteMs > 0) {
      console.log(`Waiting ${waitBeforeDeleteMs}ms before delete...`);
      await sleep(waitBeforeDeleteMs);
    }

    // 7. Delete browser
    console.log("Deleting browser...");
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
    console.log("  Browser deleted");

    // 8. Wait for processing
    console.log("Waiting 3 seconds for replay processing...");
    await sleep(3000);

    // 9. List replays to check if generated
    console.log("Checking for replays...");
    try {
      const replays = await kernel.browsers.replays.list(kernelBrowser.session_id);
      console.log(`  Found ${replays.length} replay(s)`);

      if (replays.length > 0) {
        result.replayFound = true;
        for (const r of replays) {
          console.log(`    - Replay ID: ${r.replay_id}`);
          console.log(`      View URL: ${r.replay_view_url || "N/A"}`);
          if (r.replay_id === replay.replay_id) {
            result.replayStatus = "found";

            // Download replay to verify file size
            console.log("    Downloading replay to verify file size...");
            try {
              const videoData = await kernel.browsers.replays.download(
                r.replay_id,
                { id: kernelBrowser.session_id }
              );
              const blob = await videoData.blob();
              result.replayFileSize = blob.size;
              console.log(`      File size: ${blob.size} bytes (${(blob.size / 1024).toFixed(2)} KB)`);
            } catch (downloadError: unknown) {
              const dlErr = downloadError instanceof Error ? downloadError.message : String(downloadError);
              console.log(`      Download error: ${dlErr}`);
              result.replayFileSize = 0;
            }
          }
        }
      } else {
        result.replayFound = false;
        result.replayStatus = "not_found";
      }
    } catch (listError: unknown) {
      const errorMessage = listError instanceof Error ? listError.message : String(listError);
      console.log(`  Error listing replays: ${errorMessage}`);
      // This might happen if the session is fully deleted
      result.replayFound = false;
      result.replayStatus = `list_error: ${errorMessage}`;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Test error: ${errorMessage}`);
    result.error = errorMessage;
  }

  return result;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Kernel Replay Behavior Tests                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Testing video replay behavior when browser sessions are deleted.");
  console.log("This will help answer:");
  console.log("  1. Are replays auto-stopped on browser deletion?");
  console.log("  2. What wait time is needed between stop and delete?");
  console.log("");

  const results: TestResult[] = [];

  // Test 1: Delete without calling stop
  results.push(await runTest("No stop, immediate delete", false, 0));

  // Test 2: Stop then immediate delete (0ms wait)
  results.push(await runTest("Stop, 0ms wait, delete", true, 0));

  // Test 3: Stop, wait 250ms, delete
  results.push(await runTest("Stop, 250ms wait, delete", true, 250));

  // Test 4: Stop, wait 500ms, delete
  results.push(await runTest("Stop, 500ms wait, delete", true, 500));

  // Test 5: Stop, wait 1000ms, delete
  results.push(await runTest("Stop, 1000ms wait, delete", true, 1000));

  // Print summary
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                                   TEST RESULTS SUMMARY                                   ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════════════════╣");
  console.log("║ Test Name                      │ Stop │ Wait(ms) │ Replay │ File Size    │ Status       ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════════════════════╣");

  for (const r of results) {
    const name = r.name.padEnd(30);
    const stop = r.stopCalled ? "Yes " : "No  ";
    const wait = r.waitMs.toString().padStart(8);
    const found = r.replayFound ? "✅" : "❌";
    const fileSize = r.replayFileSize !== undefined
      ? (r.replayFileSize > 0 ? `${(r.replayFileSize / 1024).toFixed(1)} KB`.padStart(12) : "0 bytes".padStart(12))
      : "N/A".padStart(12);
    const status = (r.error || r.replayStatus || "unknown").substring(0, 12).padEnd(12);
    console.log(`║ ${name} │ ${stop} │ ${wait} │   ${found}   │ ${fileSize} │ ${status} ║`);
  }

  console.log("╚══════════════════════════════════════════════════════════════════════════════════════════╝");

  // Analysis
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("ANALYSIS:");
  console.log("═══════════════════════════════════════════════════════════════════════════");

  const noStopTest = results.find((r) => !r.stopCalled);
  const immediateStopTest = results.find((r) => r.stopCalled && r.waitMs === 0);
  const delayedTests = results.filter((r) => r.stopCalled && r.waitMs > 0);

  if (noStopTest) {
    console.log(`\n1. Auto-stop behavior (no stop called before delete):`);
    console.log(`   Replay generated: ${noStopTest.replayFound ? "YES" : "NO"}`);
    if (noStopTest.replayFound) {
      console.log("   → Replays ARE automatically stopped when browser is deleted");
    } else {
      console.log("   → Replays are NOT automatically stopped - you MUST call stop()");
    }
  }

  if (immediateStopTest) {
    console.log(`\n2. Immediate delete after stop (0ms wait):`);
    console.log(`   Replay generated: ${immediateStopTest.replayFound ? "YES" : "NO"}`);
  }

  const successfulDelays = delayedTests.filter((r) => r.replayFound);
  if (successfulDelays.length > 0) {
    const minSuccessfulDelay = Math.min(...successfulDelays.map((r) => r.waitMs));
    console.log(`\n3. Minimum wait time for reliable replay generation:`);
    console.log(`   Smallest successful delay: ${minSuccessfulDelay}ms`);
  } else if (delayedTests.length > 0) {
    console.log(`\n3. No delayed tests succeeded. May need longer delays.`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("Session IDs for reference:");
  for (const r of results) {
    console.log(`  ${r.name}: ${r.sessionId}`);
  }
  console.log("═══════════════════════════════════════════════════════════════════════════");
}

main().catch(console.error);

