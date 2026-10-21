"""UI test for the installer, driven with Playwright against dist-test/.

Usage:  node test/build-test.mjs && python3 test/ui_test.py [screenshot-dir]

Uses a simulated phone (test/mock-adb.js), so no USB hardware is needed.
Real-phone testing still has to be done by hand.
"""
import hashlib
import http.server
import socketserver
import sys
import tempfile
import threading
import zipfile
from functools import partial
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None
TMP = Path(tempfile.mkdtemp())


def make_apk(name, payload):
    path = TMP / name
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("AndroidManifest.xml", payload)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


OFFICIAL, OFFICIAL_SHA = make_apk("lead-one-ecg-1.0.0.apk", b"official" * 20000)
TAMPERED, _ = make_apk("lead-one-ecg-1.0.0-modified.apk", b"tampered" * 20000)
OTHER, OTHER_SHA = make_apk("some-other-app.apk", b"other" * 30000)
NOT_APK = TMP / "holiday-photo.apk"
NOT_APK.write_bytes(b"\xff\xd8\xff\xe0 not a zip")
BUNDLE = TMP / "game.xapk"
BUNDLE.write_bytes(b"PK\x03\x04 bundle")


def serve():
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "dist-test"))
    handler.log_message = lambda *a: None
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/"


def shot(page, name, full=True):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)


def open_page(browser, url, mock, **ctx):
    context = browser.new_context(**ctx)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(f"window.__mock = {mock};")
    page.goto(url)
    return page, errors


def connect(page):
    page.click("#connect")
    expect(page.locator("#connect-done")).to_be_visible()


def step_state(page, step):
    return page.locator(f"#step-{step}").get_attribute("data-state")


passed = 0


def check(label, condition):
    global passed
    if not condition:
        raise AssertionError(label)
    passed += 1
    print("ok  ", label)


def main():
    server, url = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        desktop = dict(viewport={"width": 1280, "height": 900})

        # 1. Fresh page, no releases published (the real current state).
        page, errors = open_page(browser, url, "{}", **desktop)
        check("starts on step 1", step_state(page, "ready") == "current")
        check("our-apps file picker disabled with no releases", page.locator("#file-ours").is_disabled())
        check("shows 'not released yet' for all three apps", page.locator(".app-status", has_text="Not released yet").count() == 3)
        check("install button disabled", page.locator("#install").is_disabled())
        shot(page, "01-start")
        check("no JS errors", not errors)
        page.context.close()

        # 2. Browser without WebUSB.
        page, _ = open_page(browser, url, "{usb: false}", **desktop)
        check("unsupported-browser warning shown", page.locator("#browser-warning").is_visible())
        check("connect disabled", page.locator("#connect").is_disabled())
        shot(page, "02-unsupported-browser", full=False)
        page.context.close()

        # 3. Connect errors.
        for kind, text in [("busy", "Another program is using the phone"), ("denied", "wouldn't let this browser"), ("cancel", "No phone was chosen")]:
            page, _ = open_page(browser, url, f"{{connect: '{kind}'}}", **desktop)
            page.click("#connect")
            expect(page.locator("#connect-error")).to_contain_text(text)
            check(f"connect error '{kind}' explained", True)
            if kind == "busy":
                page.locator("#step-connect").scroll_into_view_if_needed()
                shot(page, "03-error-busy", full=False)
            page.context.close()

        # 4. Waiting for approval on the phone.
        page, _ = open_page(browser, url, "{connect: 'hang'}", **desktop)
        page.click("#ready-done")
        page.click("#connect")
        expect(page.locator("#connect-waiting")).to_be_visible()
        check("approval prompt hint shown", True)
        page.locator("#step-connect").scroll_into_view_if_needed()
        shot(page, "04-waiting-for-allow", full=False)
        page.context.close()

        # 5. Official path: verified build, then install.
        page, errors = open_page(browser, url, f"{{officialSha: '{OFFICIAL_SHA}', installDelayMs: 400}}", **desktop)
        connect(page)
        expect(page.locator("#connect-done")).to_contain_text("Google Pixel 8")
        check("connected shows phone name", step_state(page, "connect") == "done")
        page.set_input_files("#file-ours", str(TAMPERED))
        expect(page.locator("#ours-result")).to_contain_text("doesn't match any build")
        check("tampered file refused", page.locator("#install").is_disabled())
        page.locator("#step-choose").scroll_into_view_if_needed()
        shot(page, "05-official-mismatch", full=False)
        page.set_input_files("#file-ours", str(OFFICIAL))
        expect(page.locator("#ours-result")).to_contain_text("Verified, official build: Lead One ECG 1.0.0")
        check("checksum shown", OFFICIAL_SHA in page.locator("#ours-result").inner_text())
        check("install enabled for verified build", page.locator("#install").is_enabled())
        check("install button names the phone", page.locator("#install").inner_text() == "Install on Google Pixel 8")
        shot(page, "06-official-verified")
        page.click("#install")
        expect(page.locator("#progress-label")).to_contain_text("Installing on the phone")
        page.locator("#step-install").scroll_into_view_if_needed()
        shot(page, "07-installing", full=False)
        expect(page.locator("#install-result")).to_contain_text("Installed Lead One ECG 1.0.0")
        check("all steps done after install", all(step_state(page, s) == "done" for s in ["ready", "connect", "choose", "install"]))
        shot(page, "08-installed")
        page.click("text=Install another app")
        check("'install another' clears the file", page.locator("#install").is_disabled())
        check("no JS errors in official flow", not errors)
        page.context.close()

        # 6. Other path: bad files, warning, checksum compare, consent, install error.
        page, errors = open_page(browser, url, "{install: 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package signatures do not match]'}", **desktop)
        connect(page)
        page.click("#tab-other")
        check("warning shown on other path", page.locator("#panel-other .notice.caution").is_visible())
        page.set_input_files("#file-other", str(NOT_APK))
        expect(page.locator("#other-result")).to_contain_text("isn't an Android app file")
        check("non-APK rejected", True)
        page.set_input_files("#file-other", str(BUNDLE))
        expect(page.locator("#other-result")).to_contain_text("app bundle")
        check("bundle rejected", True)
        page.set_input_files("#file-other", str(OTHER))
        expect(page.locator("#other-result")).to_contain_text(OTHER_SHA)
        check("install blocked until consent", page.locator("#install").is_disabled())
        page.fill("#compare-input", "0" * 64)
        expect(page.locator(".compare-result")).to_have_class("compare-result nomatch")
        check("wrong checksum flagged", True)
        page.fill("#compare-input", "SHA256: " + OTHER_SHA.upper())
        expect(page.locator(".compare-result")).to_have_class("compare-result match")
        check("pasted checksum matched (case/prefix tolerant)", True)
        page.check("#consent")
        check("install enabled after consent", page.locator("#install").is_enabled())
        shot(page, "09-other-app")
        page.click("#install")
        expect(page.locator("#install-result")).to_contain_text("A different version of this app is already on the phone")
        check("pm error translated", True)
        page.locator("#step-install").scroll_into_view_if_needed()
        shot(page, "10-install-error", full=False)
        page.click("#tab-ours")
        check("switching path clears selection", page.locator("#install").is_disabled())
        check("no JS errors in other flow", not errors)
        page.context.close()

        # 7. Unplugged while connected.
        page, _ = open_page(browser, url, "{}", **desktop)
        connect(page)
        page.evaluate("window.__unplug()")
        expect(page.locator("#connect-error")).to_contain_text("The phone was disconnected")
        check("unplug detected", step_state(page, "connect") == "current")
        page.context.close()

        # 8. Phone-sized screen and dark mode.
        phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page, _ = open_page(browser, url, f"{{officialSha: '{OFFICIAL_SHA}'}}", **phone)
        connect(page)
        page.set_input_files("#file-ours", str(OFFICIAL))
        expect(page.locator("#ours-result")).to_contain_text("Verified")
        width = page.evaluate("document.documentElement.scrollWidth")
        check(f"no sideways scroll on phone ({width}px)", width <= 390)
        shot(page, "11-phone")
        page.context.close()

        page, _ = open_page(browser, url, "{}", color_scheme="dark", **desktop)
        page.locator("#help details").first.evaluate("d => d.open = true")
        shot(page, "12-dark")
        page.context.close()

        browser.close()
    server.shutdown()
    print(f"\n{passed} checks passed")


main()
