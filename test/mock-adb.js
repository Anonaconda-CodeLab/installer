// Stand-in for src/adb.js used only by the UI test build (no real USB).
// Behaviour is driven by window.__mock, set by the test before the page loads:
//   usb: false            -> browser without WebUSB
//   connect: "ok" | "cancel" | "busy" | "denied" | "hang"
//   install: "ok" | "<pm error text>" | "disconnect"
//   installDelayMs: number (time spent "installing" after the upload)

const mock = () => window.__mock ?? {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function webUsbSupported() {
  return mock().usb !== false;
}

export async function connectPhone({ onWaitingForApproval } = {}) {
  const how = mock().connect ?? "ok";
  await wait(50);
  if (how === "cancel") return null;
  if (how === "busy") {
    const e = new Error("The device is already in used by another program");
    e.name = "DeviceBusyError";
    throw e;
  }
  if (how === "denied") {
    const e = new Error("Access denied.");
    e.name = "SecurityError";
    throw e;
  }
  onWaitingForApproval?.();
  if (how === "hang") return new Promise(() => {});
  await wait(mock().approvalDelayMs ?? 100);
  let disconnect;
  const disconnected = new Promise((r) => (disconnect = r));
  window.__unplug = () => disconnect();
  return {
    adb: { close: async () => disconnect() },
    disconnected,
    name: "Google Pixel 8",
    android: "16",
  };
}

export async function installApk(_adb, file, { onProgress } = {}) {
  // Record what would reach the phone, so the test can check it's the file that was checked.
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  window.__installedSha = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    if (mock().pauseAt === i) await new Promise(() => {});
    await wait(20);
    onProgress?.(i / steps);
  }
  await wait(mock().installDelayMs ?? 50);
  const result = mock().install ?? "ok";
  if (result === "ok") return;
  if (result === "disconnect") throw new Error("Transfer error: device disconnected");
  throw new Error(result);
}

export async function forgetKey() {}
