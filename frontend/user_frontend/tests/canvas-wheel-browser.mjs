import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Uses an ALREADY running Vite. All /api/* traffic is fulfilled locally by CDP.
// Run: node tests/canvas-wheel-browser.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://localhost:3000";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await access(chromePath);
const cache = resolve(root, "../node_modules/.cache/ic-canvas-wheel");
await mkdir(cache, { recursive: true });
const output = await mkdtemp(join(cache, "run-"));
const profile = join(output, "chrome-profile");
await mkdir(profile);
const report = { origin, checks: [], wheels: [], warnings: [], exceptions: [], moduleFailures: [], requests: [], unexpectedApi: [] };
const pause = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn, label, timeout = 12000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const value = await fn(); if (value) return value; await pause(100); }
    throw new Error(`Timed out: ${label}`);
}
const now = new Date().toISOString();
const project = { projectNo: "P_WHEEL", title: "Wheel regression", version: 1, updatedAt: now, document: {
    nodes: [
        { id: "wheel-image", type: "image", x: 180, y: 90, width: 220, height: 160, title: "Wheel image" },
        { id: "wheel-text", type: "text", x: 530, y: 110, width: 220, height: 160, title: "Wheel text", content: "Select for toolbar" },
    ], connections: [], viewport: { x: 0, y: 0, k: 1 }, backgroundMode: "dots",
} };
const credits = { available: 100, frozen: 0, totalConsumed: 0 };
function mock(url, method, body) {
    const path = new URL(url).pathname;
    if (path === "/api/auth/me") return { user: { id: 7, email: "wheel@example.test", displayName: "Wheel test", status: "ACTIVE" }, credits, concurrency: { limit: 2, running: 0 } };
    if (path === "/api/account") return { ...credits, totalRecharged: 100, concurrencyLimit: 2, running: 0 };
    if (path === "/api/video-tasks" || path === "/api/account/transactions") return { items: [], page: 1, pageSize: 20, total: 0, hasNext: false };
    if (path === "/api/models" || path === "/api/plans") return [];
    if (path === "/api/canvas-projects/P_WHEEL") {
        if (method === "PUT") { const value = JSON.parse(body); project.document = value.document; project.title = value.title; project.version++; }
        return project;
    }
    if (path === "/api/canvas-projects") return [project];
    report.unexpectedApi.push(`${method} ${path}`);
    return null; // Unknown requests are still intercepted; never reach a real backend.
}
const chrome = spawn(chromePath, ["--headless=new", "--disable-extensions", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let socket;
let cdp;
const deadline = setTimeout(() => { chrome.kill(); }, 70000);
try {
    const port = await wait(async () => { try { return (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { return null; } }, "Chrome startup", 12000);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("CDP connection timeout")), 5000); socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    cdp = (method, params = {}) => new Promise((resolve, reject) => {
        const key = ++id;
        const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
        pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id: key, method, params }));
    });
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id) { const call = pending.get(message.id); if (call) { pending.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); } return; }
        const p = message.params;
        if (message.method === "Fetch.requestPaused") {
            const { requestId, request } = p;
            if (!new URL(request.url).pathname.startsWith("/api/")) { cdp("Fetch.continueRequest", { requestId }).catch(error => report.exceptions.push(error.message)); return; }
            report.requests.push(`${request.method} ${new URL(request.url).pathname}`);
            const data = mock(request.url, request.method, request.postData);
            cdp("Fetch.fulfillRequest", { requestId, responseCode: data === null ? 501 : 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ code: data === null ? "MOCK_UNHANDLED" : "OK", data })).toString("base64") }).catch(error => report.exceptions.push(error.message));
        }
        if (message.method === "Log.entryAdded") { const e = p.entry; if (/passive|preventDefault/i.test(e.text)) report.warnings.push({ source: "Log", text: e.text }); }
        if (message.method === "Runtime.consoleAPICalled") { const text = p.args.map(a => a.value ?? a.description ?? "").join(" "); if (/passive|preventDefault/i.test(text)) report.warnings.push({ source: "Runtime", text: text.slice(0, 1500) }); }
        if (message.method === "Runtime.exceptionThrown") report.exceptions.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text).slice(0, 1200));
        if (message.method === "Network.responseReceived" && p.response.status >= 500) report.moduleFailures.push({ url: p.response.url.split("?")[0], status: p.response.status });
    });
    const evaluate = async expression => { const value = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw new Error(value.exceptionDetails.text); return value.result.value; };
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Network.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp("Fetch.enable", { patterns: [{ urlPattern: "*://*/api/*", requestStage: "Request" }] });
    await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('ic_access_token','mock-wheel-token'); window.__wheelEvents=[];document.addEventListener('wheel',e=>{setTimeout(()=>window.__wheelEvents.push({trusted:e.isTrusted,defaultPrevented:e.defaultPrevented,target:e.target.getAttribute?.('aria-label')||e.target.tagName}),0)},{capture:true,passive:true});` });
    await cdp("Page.navigate", { url: `${origin}/canvas/P_WHEEL` });
    await wait(() => evaluate(`!!document.querySelector('[data-node-id="wheel-image"]')`), "actual canvas project load", 20000);
    const canvas = '[data-canvas-bg="true"]';
    const transform = () => evaluate(`document.querySelector('[data-node-id="wheel-image"]').parentElement.style.transform`);
    const point = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const click = async selector => { const p = await point(selector); assert.ok(p, selector); await cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", clickCount: 1 }); await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", clickCount: 1 }); };
    const check = (name, pass, details) => report.checks.push({ name, pass, ...details });
    const synthetic = async (selector, label, zoom) => {
        const before = await transform();
        const result = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing wheel target');const r=el.getBoundingClientRect();const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-90,clientX:r.x+r.width/2,clientY:r.y+r.height/2});el.dispatchEvent(e);return {defaultPrevented:e.defaultPrevented}})()`);
        await pause(120);
        const after = await transform();
        report.wheels.push({ label, before, after, ...result });
        check(label, zoom ? result.defaultPrevented && before !== after : !result.defaultPrevented && before === after, { before, after, ...result });
    };
    await synthetic(canvas, "canvas synthetic wheel cancels default and zooms", true);
    const beforeNative = await transform();
    const p = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(canvas)}).getBoundingClientRect();return {x:r.right-100,y:r.bottom-100}})()`);
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
    await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", ...p, deltaX: 0, deltaY: -90 });
    await pause(250);
    const afterNative = await transform();
    const trusted = await evaluate("window.__wheelEvents.filter(e=>e.trusted)");
    check("trusted canvas wheel cancels default and zooms", beforeNative !== afterNative && trusted.some(e => e.defaultPrevented), { before: beforeNative, after: afterNative, events: trusted });
    await click('[data-node-id="wheel-image"]');
    await wait(() => evaluate(`!!document.querySelector('[aria-label="节点生成面板"]')`), "actual node composer");
    await synthetic('[aria-label="节点生成面板"]', "composer wheel remains scrollable without canvas zoom", false);
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await wait(() => evaluate(`!document.querySelector('[aria-label="节点生成面板"]')`), "composer closes before toolbar selection");
    await click('[data-node-id="wheel-text"]');
    await wait(() => evaluate(`!!document.querySelector('[data-selection-toolbar]')`), "actual selection toolbar");
    await synthetic('[data-selection-toolbar]', "selection toolbar wheel remains scrollable without canvas zoom", false);
    await pause(100);
    check("no passive preventDefault warnings", report.warnings.length === 0, { count: report.warnings.length });
    check("no module HTTP 500 failures", report.moduleFailures.length === 0, { count: report.moduleFailures.length });
    check("all API requests mocked explicitly", report.unexpectedApi.length === 0, { unexpected: report.unexpectedApi });
    assert.ok(report.checks.every(c => c.pass), report.checks.filter(c => !c.pass).map(c => c.name).join("; "));
} catch (error) {
    report.error = error.message;
    process.exitCode = 1;
} finally {
    clearTimeout(deadline);
    await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
    if (socket?.readyState === WebSocket.OPEN) { try { await cdp("Browser.close"); } catch {} socket.close(); }
    chrome.kill();
    console.log(JSON.stringify({ report: join(output, "report.json"), checks: report.checks.map(c => ({ name: c.name, pass: c.pass })), passiveWarnings: report.warnings.length, moduleFailures: report.moduleFailures, error: report.error }, null, 2));
}
