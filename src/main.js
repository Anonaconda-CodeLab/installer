// Anonaconda Installer: page logic.
// Copyright (C) 2026 Anonaconda Code Lab
// SPDX-License-Identifier: GPL-3.0-or-later

import { connectPhone, installApk, forgetKey, webUsbSupported } from "./adb.js";
import { checkApkFile, sha256Hex, normaliseChecksum, formatSize, signingCertSha256s, formatFingerprint } from "./apk.js";
import { OFFICIAL_APPS, findOfficialBuild, isStudioSigned, hasAnyRelease, downloadUrl } from "./apps.js";
import { explainConnectError, explainInstallError } from "./errors.js";

const $ = (id) => document.getElementById(id);

/** Small DOM helper. Text children are always set as text, never as HTML. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function notice(kind, title, detail, raw) {
  return h(
    "div",
    { class: `notice ${kind}`, role: kind === "danger" ? "alert" : "status" },
    h("p", {}, h("b", {}, title)),
    detail && h("p", {}, detail),
    raw && h("details", { class: "raw" }, h("summary", {}, "Message from the phone"), h("pre", {}, raw)),
  );
}

function show(el, ...content) {
  el.replaceChildren(...content);
  el.hidden = content.length === 0;
}

// ---------------------------------------------------------------------------
// State

const state = {
  readyDone: false,
  phone: null, // { adb, name, android }
  connecting: false,
  path: "ours", // "ours" | "other"
  selection: null, // { file, bytes, sha256, certs, official, trusted }
  installing: false,
  installed: false,
};

function installable() {
  const s = state.selection;
  if (!s) return false;
  return s.official ? true : state.path === "other" && s.trusted;
}

function refresh() {
  const s1 = state.readyDone || state.phone ? "done" : "current";
  const s2 = state.phone ? "done" : s1 === "done" ? "current" : "pending";
  const s3 = installable() ? "done" : s2 === "done" ? "current" : "pending";
  const s4 = state.installed ? "done" : state.phone && installable() ? "current" : "pending";
  $("step-ready").dataset.state = s1;
  $("step-connect").dataset.state = s2;
  $("step-choose").dataset.state = s3;
  $("step-install").dataset.state = s4;
  $("ready-done").hidden = s1 === "done";

  const button = $("install");
  button.disabled = !(state.phone && installable()) || state.installing;
  button.textContent = state.phone ? `Install on ${state.phone.name}` : "Install";

  const summary = $("install-summary");
  if (state.installing) return;
  if (!state.phone && !installable()) summary.textContent = "Connect your phone and choose an app first.";
  else if (!state.phone) summary.textContent = "Connect your phone first.";
  else if (!installable()) summary.textContent = "Choose an app first.";
  else summary.textContent = `Ready to install ${selectionLabel()} (${formatSize(state.selection.file.size)}).`;
}

function selectionLabel() {
  const { official, file } = state.selection;
  return official ? `${official.app.name} ${official.release.version}` : file.name;
}

// ---------------------------------------------------------------------------
// Step 1

$("ready-done").addEventListener("click", () => {
  state.readyDone = true;
  refresh();
  $("connect").focus();
});

// ---------------------------------------------------------------------------
// Step 2: connect

if (!webUsbSupported()) {
  $("browser-warning").hidden = false;
  $("connect").disabled = true;
}

$("connect").addEventListener("click", async () => {
  if (state.connecting) return;
  state.connecting = true;
  show($("connect-error"));
  $("connect").disabled = true;
  try {
    const phone = await connectPhone({
      onWaitingForApproval: () => {
        $("connect-idle").hidden = true;
        $("connect-waiting").hidden = false;
      },
    });
    if (!phone) {
      show(
        $("connect-error"),
        notice(
          "caution",
          "No phone was chosen",
          "If your phone wasn't in the list, check that it's unlocked, USB debugging is on, and the cable carries data. See “My phone isn't in the list” below.",
        ),
      );
      return;
    }
    state.phone = phone;
    state.readyDone = true;
    $("phone-name").textContent = phone.name;
    $("phone-android").textContent = phone.android ? `, Android ${phone.android}` : "";
    $("connect-idle").hidden = true;
    $("connect-done").hidden = false;
    phone.disconnected.then(() => onDisconnected(phone));
  } catch (error) {
    console.error(error);
    const { title, detail, raw } = explainConnectError(error);
    show($("connect-error"), notice("danger", title, detail, raw));
  } finally {
    state.connecting = false;
    $("connect-waiting").hidden = true;
    if (!state.phone) $("connect-idle").hidden = false;
    $("connect").disabled = !webUsbSupported();
    refresh();
  }
});

let disconnectRequested = false;

$("disconnect").addEventListener("click", async () => {
  if (!state.phone || state.installing) return;
  disconnectRequested = true;
  try {
    await state.phone.adb.close();
  } catch (error) {
    console.error(error);
  }
});

function onDisconnected(phone) {
  if (state.phone !== phone) return;
  state.phone = null;
  $("connect-done").hidden = true;
  $("connect-idle").hidden = false;
  if (!disconnectRequested && !state.installing) {
    show(
      $("connect-error"),
      notice("caution", "The phone was disconnected", "Plug it back in, unlock it, and connect again."),
    );
  }
  disconnectRequested = false;
  refresh();
}

// ---------------------------------------------------------------------------
// Step 3: choose the app

function renderCatalogue() {
  const list = $("catalogue");
  list.replaceChildren(
    ...OFFICIAL_APPS.map((app) => {
      const latest = app.release;
      // Download in place: leaving this page would drop the phone's USB connection.
      // The install page opens in a new tab for the same reason.
      const status = latest
        ? h(
            "span",
            { class: "app-links" },
            h("a", { class: "app-download", href: downloadUrl(app) }, `Download ${latest.version}`),
            app.installPage &&
              h(
                "a",
                { class: "app-page", href: app.installPage, target: "_blank", rel: "noopener noreferrer" },
                "Install page",
                h("span", { "aria-hidden": "true" }, " ↗"),
                h("span", { class: "visually-hidden" }, " (opens in a new tab)"),
              ),
          )
        : h("span", { class: "app-status" }, "Not released yet");
      return h(
        "li",
        {},
        h("span", { class: "app-name" }, app.name, app.blurb && h("span", { class: "app-blurb" }, app.blurb)),
        status,
      );
    }),
  );
  const any = hasAnyRelease();
  $("ours-none").hidden = any;
  $("ours-pick").classList.toggle("disabled", !any);
  $("file-ours").disabled = !any;
}

const tabs = [$("tab-ours"), $("tab-other")];

function selectPath(path, { focus = false } = {}) {
  if (state.installing) return;
  state.path = path;
  for (const tab of tabs) {
    const selected = tab.id === `tab-${path}`;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  clearSelection();
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectPath(tab.id.replace("tab-", "")));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectPath(state.path === "ours" ? "other" : "ours", { focus: true });
  });
}

function clearSelection() {
  pickId++;
  state.selection = null;
  state.installed = false;
  delete document.body.dataset.installed;
  $("file-ours").value = "";
  $("file-other").value = "";
  show($("ours-result"));
  show($("other-result"));
  show($("install-result"));
  refresh();
}

function fileFacts({ file, sha256, certs }, { claimed = false } = {}) {
  return h(
    "dl",
    { class: "file-facts" },
    h("dt", {}, "File"),
    h("dd", {}, `${file.name} (${formatSize(file.size)})`),
    h("dt", {}, "SHA-256"),
    h("dd", {}, h("code", { class: "checksum" }, sha256), copyButton(sha256)),
    h("dt", {}, claimed ? "Signing certificate (as stated in the file)" : "Signing certificate"),
    h(
      "dd",
      {},
      certs
        ? certs.map((c) => h("code", { class: "checksum" }, formatFingerprint(c)))
        : "Not shown: this file uses an older signature format.",
    ),
  );
}

function copyButton(text) {
  const button = h("button", { type: "button", class: "button text" }, "Copy checksum");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Couldn't copy. Select the text instead.";
    }
    setTimeout(() => (button.textContent = "Copy checksum"), 2500);
  });
  return button;
}

// Each pick (or tab switch) gets a number; results from an older pick are ignored,
// so a slow check can never replace a newer choice.
let pickId = 0;

async function readFile(file, resultEl) {
  const id = ++pickId;
  const stale = () => id !== pickId;
  state.selection = null;
  state.installed = false;
  delete document.body.dataset.installed;
  show($("install-result"));
  refresh();
  if (!file) {
    show(resultEl);
    return null;
  }
  show(resultEl, h("p", { class: "aside", role: "status" }, `Checking ${file.name}…`));
  const problem = await checkApkFile(file);
  if (stale()) return null;
  if (problem) {
    show(resultEl, notice("danger", problem.title, problem.detail));
    return null;
  }
  // Read once: the checks run on these bytes, and these same bytes are installed.
  let bytes;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    if (!stale()) show(resultEl, notice("danger", "Couldn't read this file", "Choose it again. If it keeps happening, download it again."));
    return null;
  }
  const sha256 = await sha256Hex(bytes);
  const certs = await signingCertSha256s(bytes);
  if (stale()) return null;
  const studioSigned = isStudioSigned(certs);
  const match = findOfficialBuild(sha256);
  // Ours only if the checksum is a published release AND it carries our certificate.
  const official = match && studioSigned ? match : null;
  return { file, bytes, sha256, certs, studioSigned, official, checksumOnly: match && !studioSigned };
}

$("file-ours").addEventListener("change", async (event) => {
  const resultEl = $("ours-result");
  const checked = await readFile(event.target.files[0], resultEl);
  if (!checked) return;
  if (checked.official) {
    const { app, release } = checked.official;
    state.selection = { ...checked, trusted: true };
    show(
      resultEl,
      notice(
        "verified",
        `Verified, official build: ${app.name} ${release.version}`,
        "This file is exactly the one we published: its checksum matches our latest release and it's signed with our certificate.",
      ),
      fileFacts(checked),
    );
  } else if (checked.checksumOnly) {
    show(
      resultEl,
      notice(
        "danger",
        "This file's signature doesn't match ours",
        "Don't install it. Its checksum matches one of our releases, but it isn't signed with our certificate. Please tell us at hello@anonacondacodelab.com.",
      ),
      fileFacts(checked),
    );
  } else if (checked.studioSigned) {
    show(
      resultEl,
      notice(
        "caution",
        "This isn't the latest release",
        "It's signed with our certificate, but it isn't the current version of any of our apps. Download the latest version from the app's install page, listed above, and choose that file.",
      ),
      fileFacts(checked),
    );
  } else {
    show(
      resultEl,
      notice(
        "danger",
        "This file doesn't match any build we've published",
        "Don't install it. It may be damaged, out of date, or changed by someone else. Download it again from the app's own install page.",
      ),
      fileFacts(checked),
    );
  }
  refresh();
});

$("file-other").addEventListener("change", async (event) => {
  const resultEl = $("other-result");
  const checked = await readFile(event.target.files[0], resultEl);
  if (!checked) return;

  if (checked.official) {
    const { app, release } = checked.official;
    state.selection = { ...checked, trusted: true };
    show(
      resultEl,
      notice(
        "verified",
        `This is our app: ${app.name} ${release.version}`,
        "Its checksum matches our latest release and it's signed with our certificate, so it's an official build.",
      ),
      fileFacts(checked),
    );
    refresh();
    return;
  }

  state.selection = { ...checked, trusted: false };
  const compareResult = h("p", { class: "compare-result", role: "status" });
  const compareInput = h("input", {
    type: "text",
    id: "compare-input",
    autocomplete: "off",
    spellcheck: false,
    placeholder: "Paste the SHA-256 from the publisher's site",
  });
  const consent = h("input", { type: "checkbox", id: "consent" });
  consent.addEventListener("change", () => {
    if (state.selection?.file === checked.file) state.selection.trusted = consent.checked;
    refresh();
  });

  // A pasted checksum that doesn't match blocks the install outright.
  function setBlocked(blocked) {
    consent.dataset.blocked = String(blocked);
    consent.disabled = blocked || state.installing;
    if (blocked && consent.checked) {
      consent.checked = false;
      if (state.selection?.file === checked.file) state.selection.trusted = false;
    }
    refresh();
  }

  compareInput.addEventListener("input", () => {
    const pasted = normaliseChecksum(compareInput.value);
    if (!pasted) {
      compareResult.textContent = "";
      compareResult.className = "compare-result";
      setBlocked(false);
    } else if (!/^[0-9a-f]{64}$/.test(pasted)) {
      compareResult.textContent = "That isn't a complete SHA-256. It should be 64 letters and numbers.";
      compareResult.className = "compare-result";
      setBlocked(false);
    } else if (pasted === checked.sha256) {
      compareResult.textContent = "Match. This is the same file the publisher lists.";
      compareResult.className = "compare-result match";
      setBlocked(false);
    } else {
      compareResult.textContent =
        "No match. This file is different from the one the publisher lists, so it can't be installed. Download it again from the publisher's own site.";
      compareResult.className = "compare-result nomatch";
      setBlocked(true);
    }
  });

  show(
    resultEl,
    fileFacts(checked, { claimed: true }),
    h(
      "div",
      { class: "compare" },
      h("label", { for: "compare-input" }, "Compare with the publisher's checksum (optional)"),
      compareInput,
      compareResult,
    ),
    h(
      "label",
      { class: "consent", for: "consent" },
      consent,
      h(
        "span",
        {},
        "I got this file from a publisher I trust, and I've checked its checksum where they publish one. I understand that apps not made by Anonaconda Code Lab haven't been checked by us, and that a harmful app could access my data or misuse the permissions I give it.",
      ),
    ),
  );
  refresh();
});

// ---------------------------------------------------------------------------
// Step 4: install

$("install").addEventListener("click", async () => {
  if (!state.phone || !installable() || state.installing) return;
  const phone = state.phone;
  const label = selectionLabel();
  const appName = state.selection.official ? state.selection.official.app.name : "the app";

  state.installing = true;
  setInputsLocked(true);
  refresh();
  show($("install-result"));
  $("install-summary").textContent = `Installing ${label} on ${phone.name}.`;
  const bar = $("progress-bar");
  const progressLabel = $("progress-label");
  bar.value = 0;
  $("install-progress").hidden = false;
  progressLabel.textContent = "Sending to the phone: 0%";

  let phase = "sending";
  try {
    await installApk(phone.adb, new Blob([state.selection.bytes]), {
      onProgress: (fraction) => {
        if (phase !== "sending") return;
        if (fraction >= 1) {
          phase = "installing";
          bar.removeAttribute("value");
          progressLabel.textContent = "Installing on the phone. Keep the cable plugged in. If the phone asks, tap Install.";
        } else {
          bar.value = fraction;
          progressLabel.textContent = `Sending to the phone: ${Math.floor(fraction * 100)}%`;
        }
      },
    });
    state.installed = true;
    document.body.dataset.installed = "";
    show(
      $("install-result"),
      notice("verified", `Installed ${label}`, `You'll find ${appName} in your phone's app list.`),
      notice(
        "caution",
        "When you've finished installing, turn off Developer options",
        "On the phone, go to Settings → System → Developer options and switch it off at the top. This also turns off USB debugging, so nothing can use the connection. Turn it back on the next time you install or update an app this way.",
      ),
      h("button", { type: "button", class: "button secondary", onclick: () => clearSelection() }, "Install another app"),
    );
    $("install-summary").textContent = `Finished installing on ${phone.name}.`;
  } catch (error) {
    console.error(error);
    const { title, detail, raw } = explainInstallError(error);
    show($("install-result"), notice("danger", title, detail, raw));
    refresh();
  } finally {
    state.installing = false;
    $("install-progress").hidden = true;
    setInputsLocked(false);
    const summary = $("install-summary").textContent;
    refresh();
    if (state.installed) $("install-summary").textContent = summary;
  }
});

function setInputsLocked(locked) {
  for (const id of ["file-ours", "file-other", "connect", "disconnect", "tab-ours", "tab-other"]) {
    $(id).disabled = locked || (id === "file-ours" && !hasAnyRelease()) || (id === "connect" && !webUsbSupported());
  }
  const consent = document.getElementById("consent");
  if (consent) consent.disabled = locked || consent.dataset.blocked === "true";
}

window.addEventListener("beforeunload", (event) => {
  if (state.installing) event.preventDefault();
});

// ---------------------------------------------------------------------------
// Help: forget key

$("forget-key").addEventListener("click", async () => {
  const status = $("forget-key-status");
  if (state.phone) {
    status.textContent = "Disconnect your phone first.";
    return;
  }
  try {
    await forgetKey();
    status.textContent = "Deleted. Your phone will ask for approval next time you connect.";
  } catch {
    status.textContent = "Couldn't delete the key. Clearing this site's data in your browser settings does the same thing.";
  }
});

// ---------------------------------------------------------------------------

renderCatalogue();
refresh();
