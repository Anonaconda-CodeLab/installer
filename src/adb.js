// Thin wrapper around Tango (ya-webadb). Everything here runs in the browser;
// the APK goes straight from the chosen file to the phone over USB.

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { PackageManager } from "@yume-chan/android-bin";

// Name attached to this browser's ADB key (it can show in the phone's
// list of authorised computers).
const KEY_NAME = "Anonaconda Installer";
// Tango keeps the browser's ADB key in this IndexedDB database.
const KEY_DATABASE = "Tango";

export function webUsbSupported() {
  return typeof navigator !== "undefined" && "usb" in navigator && !!AdbDaemonWebUsbDeviceManager.BROWSER;
}

/**
 * Asks the user to pick a phone, then connects and authenticates.
 * `onWaitingForApproval` is called when the phone should be showing
 * the "Allow USB debugging?" prompt.
 * Returns null when the user closes the picker without choosing.
 */
export async function connectPhone({ onWaitingForApproval } = {}) {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  const device = await manager.requestDevice();
  if (!device) return null;

  let connection;
  try {
    connection = await device.connect();
  } catch (error) {
    if (error instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
      const busy = new Error(error.message);
      busy.name = "DeviceBusyError";
      throw busy;
    }
    throw error;
  }

  onWaitingForApproval?.();
  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore: new AdbWebCredentialStore(KEY_NAME),
  });
  const adb = new Adb(transport);

  const [manufacturer, model, release] = await Promise.all([
    adb.getProp("ro.product.manufacturer").catch(() => ""),
    adb.getProp("ro.product.model").catch(() => ""),
    adb.getProp("ro.build.version.release").catch(() => ""),
  ]);

  return {
    adb,
    disconnected: transport.disconnected,
    name: prettyName(manufacturer.trim(), model.trim()) || device.name || "your phone",
    android: release.trim(),
  };
}

function prettyName(manufacturer, model) {
  if (!model) return manufacturer;
  if (!manufacturer || model.toLowerCase().startsWith(manufacturer.toLowerCase())) return model;
  return `${capitalise(manufacturer)} ${model}`;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Streams the file (a Blob holding the exact bytes that were checked) to the phone and installs it.
 * `onProgress(fraction)` reports how much of the file has been sent (0–1).
 * Resolves when the phone reports success; rejects with the phone's message otherwise.
 */
export async function installApk(adb, file, { onProgress } = {}) {
  let sent = 0;
  const counted = file.stream().pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        sent += chunk.byteLength;
        onProgress?.(Math.min(sent / file.size, 1));
        controller.enqueue(chunk);
      },
    }),
  );
  const pm = new PackageManager(adb);
  await pm.installStream(file.size, counted);
}

/** Deletes this browser's ADB key, so the phone will ask for approval again. */
export function forgetKey() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(KEY_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Another tab still has the key open: the deletion waits, so don't report it as done.
    request.onblocked = () => {
      const blocked = new Error("The key is in use in another tab");
      blocked.name = "KeyInUseError";
      reject(blocked);
    };
  });
}
