// Turns low-level errors into plain-English messages.
// Each message has a short title and a sentence or two saying what to do.

const INSTALL_ERRORS = [
  [
    "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
    "A different version of this app is already on the phone",
    "The copy on your phone was signed by someone else (for example, it came from a different store). Uninstall it from the phone first, then install this one. Uninstalling deletes that app's data, so back it up first if you need it.",
  ],
  [
    "INSTALL_FAILED_VERSION_DOWNGRADE",
    "Your phone already has a newer version",
    "This file is older than the version installed on your phone. Use the newer file, or uninstall the app on the phone first.",
  ],
  [
    "INSTALL_FAILED_INSUFFICIENT_STORAGE",
    "Not enough space on the phone",
    "Free up some storage on your phone, then try again.",
  ],
  [
    "INSTALL_FAILED_OLDER_SDK",
    "This app needs a newer version of Android",
    "Your phone's Android version is too old for this app.",
  ],
  [
    "INSTALL_FAILED_DEPRECATED_SDK_VERSION",
    "This app is too old for your phone",
    "Recent Android versions refuse apps built for very old Android versions. Look for a newer release of the app.",
  ],
  [
    "INSTALL_FAILED_NO_MATCHING_ABIS",
    "This file is built for a different kind of phone",
    "The app doesn't include code for your phone's processor. Look for a version made for your phone (often labelled arm64-v8a).",
  ],
  [
    "INSTALL_FAILED_MISSING_SPLIT",
    "This app comes in several pieces",
    "This file is only one part of a split app. This installer handles single-file APKs only.",
  ],
  [
    "INSTALL_FAILED_TEST_ONLY",
    "This is a test build",
    "The file is marked as a developer test build and Android won't install it this way. Ask the publisher for a release build.",
  ],
  [
    "INSTALL_FAILED_USER_RESTRICTED",
    "The phone blocked the install",
    "Check your phone's screen: you may need to tap Install. Some phones (for example Xiaomi) also need \"Install via USB\" turned on in Developer options.",
  ],
  [
    "INSTALL_FAILED_VERIFICATION_FAILURE",
    "The phone's app check rejected this file",
    "A security check on the phone refused the app. Look at the phone's screen for more detail.",
  ],
  [
    "INSTALL_FAILED_DUPLICATE_PERMISSION",
    "Another app on the phone conflicts with this one",
    "An app already on your phone declares the same permission. Uninstall the other version or app first.",
  ],
  [
    "INSTALL_FAILED_CONFLICTING_PROVIDER",
    "Another app on the phone conflicts with this one",
    "An app already on your phone uses the same internal name. Uninstall the other version or app first.",
  ],
  [
    "INSTALL_PARSE_FAILED_NO_CERTIFICATES",
    "This file isn't signed",
    "Android only installs signed apps. The file may be incomplete or damaged; download it again.",
  ],
  [
    "INSTALL_PARSE_FAILED",
    "This file isn't a working app",
    "The phone couldn't read the file. It may be damaged, incomplete, or not an Android app. Download it again.",
  ],
  [
    "INSTALL_FAILED_INVALID_APK",
    "This file isn't a working app",
    "The phone couldn't read the file. It may be damaged or incomplete. Download it again.",
  ],
  [
    "INSTALL_FAILED_ABORTED",
    "The install was cancelled",
    "The phone stopped the install. Try again, and tap Install if your phone asks.",
  ],
];

export function explainInstallError(error) {
  const raw = String(error?.message ?? error ?? "");
  for (const [code, title, detail] of INSTALL_ERRORS) {
    if (raw.includes(code)) return { title, detail, raw };
  }
  if (/disconnect|closed|transfer|NetworkError/i.test(raw)) {
    return {
      title: "The phone was disconnected",
      detail: "The cable may have moved or the phone locked the connection. Plug it back in, connect again, and retry.",
      raw,
    };
  }
  return {
    title: "The phone couldn't install this app",
    detail: "The phone gave the reason below. Search for it, or ask the app's publisher.",
    raw,
  };
}

export function explainConnectError(error) {
  const name = error?.name ?? "";
  const raw = String(error?.message ?? error ?? "");

  if (name === "DeviceBusyError" || /already in used|claim|busy/i.test(raw)) {
    return {
      title: "Another program is using the phone",
      detail:
        "Close Android Studio, scrcpy, or anything else that talks to the phone. If you've used adb in a terminal, run \"adb kill-server\". Then unplug the phone, plug it back in, and connect again.",
      raw,
    };
  }
  if (name === "SecurityError" || /access denied|permission/i.test(raw)) {
    return {
      title: "The computer wouldn't let this browser use the phone",
      detail:
        "On Windows, install the USB driver for your phone (see \"Windows doesn't see my phone\" below). On Linux, the phone needs Android udev rules. Then unplug and plug the phone back in.",
      raw,
    };
  }
  if (name === "NetworkError" || /disconnect|transfer|stall/i.test(raw)) {
    return {
      title: "The connection dropped",
      detail: "Unplug the phone, plug it back in, unlock it, and connect again. If it keeps happening, try another cable or USB port.",
      raw,
    };
  }
  return {
    title: "Couldn't connect to the phone",
    detail: "Unplug the phone, plug it back in, unlock it, and try again.",
    raw,
  };
}
