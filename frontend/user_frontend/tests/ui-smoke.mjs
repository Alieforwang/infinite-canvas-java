import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, access } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run after building: node tests/ui-smoke.mjs. Only a temporary, mocked dist server is started.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const dist = resolve(process.env.UI_SMOKE_DIST || join(root, "dist"));
await access(join(dist, "index.html"));
const outputBase = resolve(root, "../node_modules/.cache/ic-ui-smoke");
await mkdir(outputBase, { recursive: true });
const output = await mkdtemp(join(outputBase, "run-"));
const profile = join(output, "chrome-profile");
await mkdir(profile);
const now = new Date().toISOString();
const imageUrl = "/mock/reference.svg";
const videoFile = (id) => ({ fileNo: `F_${id}`, url: "/mock/video.mp4", contentType: "video/mp4" });
const task = (taskNo, status, prompt) => ({ taskNo, status, prompt, progress: status === "succeeded" ? 100 : 25, modelName: "Smoke Model", channelName: "Mock", params: { seconds: 6, ratio: "16:9", resolution: "720p" }, referenceFileNos: [], heldCredits: 6, settledCredits: status === "succeeded" ? 6 : 0, createdAt: now, ...(status === "succeeded" ? { file: videoFile(taskNo) } : {}) });
const emptyDoc = () => ({ nodes: [], connections: [], viewport: { x: 0, y: 0, k: 1 }, backgroundMode: "dots" });
const state = {
    credits: { available: 2, frozen: 6, totalConsumed: 0 },
    tasks: [task("T_RUNNING", "running", "跨页后台任务"), task("T_WORK", "succeeded", "既有成功作品")],
    projects: [{ projectNo: "P_EXISTING", title: "已有画布", version: 1, document: emptyDoc(), updatedAt: now }],
    unexpected: [], requests: [],
};
const page = (items, url) => ({ items, page: Number(url.searchParams.get("page") || 1), pageSize: Number(url.searchParams.get("pageSize") || 20), total: items.length, hasNext: false });
const bodyOf = async (request) => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks).toString(); };
const multipartValue = (body, name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const route = url.pathname;
    const send = (data, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify({ code: "OK", message: "ok", data })); };
    try {
        if (route.startsWith("/api/")) {
            state.requests.push(`${request.method} ${route}`);
            const user = { id: 7, email: "smoke@example.test", displayName: "冒烟用户", status: "ACTIVE" };
            if (route === "/api/auth/me") return send({ user, credits: state.credits, concurrency: { limit: 2, running: state.tasks.filter(t => ["queued", "running"].includes(t.status)).length } });
            if (route === "/api/account") return send({ ...state.credits, totalRecharged: 100, exchangePerYuan: 10, concurrencyLimit: 2, running: 1, currentPlan: null });
            if (route === "/api/account/transactions") return send(page([], url));
            if (route === "/api/plans") return send([]);
            if (route === "/api/account/redeem") { await bodyOf(request); state.credits.available += 100; return send({ credits: 100 }); }
            if (route === "/api/models") return send([{ id: 1, displayName: "Smoke Model", channelName: "Mock", capability: "video", params: { seconds: ["6", "8"], sizes: ["1280x720"], resolutions: ["720p", "1080p"], ratios: ["16:9", "1:1"], supportsAudio: true, supportsWatermark: true, supportsFirstLastFrame: true, supportsReferenceImages: true, maxReferenceImages: 4, resolutionDefault: "720p" }, pricing: { creditsPerSecond: 1, resolutionFactors: { "720p": 1, "1080p": 2 }, audioFactor: 1, minChargeCredits: 1 } }]);
            if (route === "/api/assets") return send(page([{ assetNo: "A_TEXT", kind: "text", title: "测试素材文本", textContent: "来自素材库的内容", tags: [], createdAt: now }], url));
            if (route === "/api/files" && request.method === "POST") {
                const body = await bodyOf(request);
                const image = body.includes('filename="smoke-image.png"');
                assert(body.includes('name="file"'), "Upload must contain a file");
                return send({ fileNo: image ? "F_UPLOAD_IMAGE" : "F_UPLOAD_VIDEO", url: image ? imageUrl : "/mock/video.mp4", contentType: image ? "image/png" : "video/mp4" });
            }
            if (/^\/api\/files\/.+\/signed-url$/.test(route)) return send({ url: route.includes("F_UPLOAD_IMAGE") ? imageUrl : "/mock/video.mp4" });
            if (route === "/api/video-tasks" && request.method === "GET") { const status = url.searchParams.get("status"); return send(page(state.tasks.filter(t => !status || t.status === status), url)); }
            if (route === "/api/video-tasks" && request.method === "POST") {
                const body = await bodyOf(request);
                const created = task(`T_NEW_${state.tasks.length}`, "running", multipartValue(body, "prompt") || "新生成任务");
                created.params = { seconds: Number(multipartValue(body, "seconds")), resolution: multipartValue(body, "resolution"), ratio: multipartValue(body, "ratio"), mode: multipartValue(body, "mode") };
                created.referenceFileNos = JSON.parse(multipartValue(body, "referenceFileNos") || "[]");
                state.tasks.unshift(created); state.credits.available -= 6; state.credits.frozen += 6;
                return send({ taskNo: created.taskNo, status: created.status, estimatedCredits: 6, heldCredits: 6, pollAfterMs: 100 });
            }
            if (/^\/api\/video-tasks\/[^/]+$/.test(route)) return send(state.tasks.find(t => t.taskNo === route.split("/").at(-1)));
            if (route === "/api/canvas-projects" && request.method === "GET") return send(state.projects.map(p => ({ ...p, nodeCount: p.document.nodes.length })));
            if (route === "/api/canvas-projects" && request.method === "POST") { const body = JSON.parse(await bodyOf(request)); const project = { projectNo: `P_NEW_${state.projects.length}`, version: 1, updatedAt: now, ...body }; state.projects.push(project); return send(project); }
            if (/^\/api\/canvas-projects\/[^/]+$/.test(route)) {
                const project = state.projects.find(p => p.projectNo === route.split("/").at(-1));
                assert(project, `Unknown mock project ${route}`);
                if (request.method === "PUT") { const body = JSON.parse(await bodyOf(request)); assert.equal(body.version, project.version, "Canvas version must match"); Object.assign(project, body, { version: project.version + 1 }); }
                return send(project);
            }
            state.unexpected.push(`${request.method} ${route}`); return send(null, 404);
        }
        if (route === "/mock/reference.svg") { response.writeHead(200, { "Content-Type": "image/svg+xml" }); return response.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#557766"/></svg>'); }
        if (route === "/mock/video.mp4") { response.writeHead(200, { "Content-Type": "video/mp4" }); return response.end(); }
        const relative = route === "/" ? "index.html" : route.slice(1);
        let file = resolve(dist, relative);
        assert(file.startsWith(`${dist}\\`) || file.startsWith(`${dist}/`) || file === join(dist, "index.html"));
        let contents;
        try { contents = await readFile(file); } catch { file = join(dist, "index.html"); contents = await readFile(file); }
        const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
        response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }); response.end(contents);
    } catch (error) { state.unexpected.push(String(error)); response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", "--enable-logging", `--log-file=${join(output, "chrome-debug.log")}`, "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (fn, label, timeout = 15000) => { const end = Date.now() + timeout; let last; do { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(100); } while (Date.now() < end); throw new Error(`Timeout: ${label}${last ? ` (${last.message})` : ""}`); };
let socket;
const report = { origin, output, checks: [], console: [], exceptions: [], uncovered: ["真实后端、登录凭据与扣费结算", "视频编解码播放（mock 文件为空）", "真实文件存储、上传取消与失败、冲突、网络失败和账户切换分支", "触屏手势与真实移动设备"] };
try {
    console.log("Chrome CDP startup");
    const port = await wait(async () => (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0], "Chrome CDP startup");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })).json();
    socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await Promise.race([new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); }), delay(10000).then(() => { throw new Error("CDP WebSocket connection timed out"); })]);
    console.log("CDP WebSocket connected");
    let id = 0;
    const pending = new Map();
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id) { const call = pending.get(message.id); if (call) { pending.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); } }
        if (message.method === "Runtime.exceptionThrown") report.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) report.console.push({ type: message.params.type, text: message.params.args.map(a => a.value ?? a.description).join(" ") });
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
        const key = ++id;
        const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
        pending.set(key, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
        if (method !== "Runtime.evaluate") console.log(`CDP ${method}`);
        socket.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => { const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const visible = "e => !!(e.getBoundingClientRect().width && e.getBoundingClientRect().height)";
    const text = () => evaluate("document.body.innerText");
    const click = (label, selector = "button", scope = "document") => wait(() => evaluate(`(() => {const elements = [...${scope}.querySelectorAll(${JSON.stringify(selector)})].filter(${visible}); const e = elements.find(e => e.innerText.replace(/\\s+/g,'').includes(${JSON.stringify(label.replace(/\s+/g, ""))})); if (!e || e.disabled) return false; e.click(); return true;})()`), `click ${label}`);
    const mouseClick = async (selector, label) => {
        await delay(250); // AntD overlays animate before their final pointer coordinates settle.
        let point;
        try {
            point = await wait(() => evaluate(`(() => {
                const elements = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(${visible});
                const e = elements.find(e => !e.closest('.ant-select-disabled') && !e.disabled && (${JSON.stringify(label ?? "")} === '' || e.innerText.replace(/\\s+/g,'').includes(${JSON.stringify((label ?? "").replace(/\s+/g, ""))})));
                if (!e) return null;
                e.scrollIntoView({ block: 'center', inline: 'nearest' });
                const rect = e.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            })()`), `mouse click ${label ?? selector}`);
        } catch (error) {
            try {
                report.domDiagnostics = await evaluate(`(() => ({
                    selector: ${JSON.stringify(selector)},
                    label: ${JSON.stringify(label ?? "")},
                    selectorCount: document.querySelectorAll('.ant-select-selector').length,
                    candidateCount: document.querySelectorAll(${JSON.stringify(selector)}).length,
                    selectElements: [...document.querySelectorAll('[class*="select"], [role="combobox"], [role="option"]')].slice(0, 50).map(e => ({
                        tag: e.tagName, className: e.className, role: e.getAttribute('role'), text: e.innerText?.slice(0, 150),
                        width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height,
                    })),
                    modalHtml: [...document.querySelectorAll('[role="dialog"], .ant-modal, .ant-select-dropdown')].map(e => e.outerHTML).join('\\n').slice(0, 24000),
                    bodyHtml: document.body.innerHTML.slice(-12000),
                }))()`);
            } catch (diagnosticError) { report.domDiagnosticFailure = String(diagnosticError); }
            throw error;
        }
        await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
        await cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
        await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
    };
    const fill = (selector, value) => wait(() => evaluate(`(() => {const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible}); if(!e)return false; Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`), `fill ${selector}`);
    const has = label => wait(async () => (await text()).replace(/\s+/g, "").includes(label.replace(/\s+/g, "")), `visible ${label}`);
    const screenshot = async name => { const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(join(output, `${name}.png`), Buffer.from(result.data, "base64")); };
    const key = async (key, code, modifiers = 0) => {
        // Native button activation needs Enter's character event as well as its virtual key code.
        const native = code === 'Enter' ? { windowsVirtualKeyCode:13, nativeVirtualKeyCode:13 } : {};
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, ...native, ...(code === 'Enter' ? { text:'\r', unmodifiedText:'\r' } : {}) });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, ...native });
    };
    const nodes = () => evaluate(`Array.from(document.querySelectorAll('[data-node-id]'), e => ({ id:e.dataset.nodeId, x:parseFloat(e.style.left), y:parseFloat(e.style.top), selected:e.dataset.selected==='true' }))`);
    const focusCanvas = () => evaluate(`document.querySelector('[aria-label="无限画布编辑区域"]').focus()`);
    const drag = async (from, to, modifiers = 0) => {
        await cdp('Input.dispatchMouseEvent', { type:'mouseMoved', ...from });
        await cdp('Input.dispatchMouseEvent', { type:'mousePressed', ...from, button:'left', buttons:1, clickCount:1, modifiers });
        for (let step=1;step<=4;step++) await cdp('Input.dispatchMouseEvent', { type:'mouseMoved', x:from.x+(to.x-from.x)*step/4, y:from.y+(to.y-from.y)*step/4, button:'left', buttons:1, modifiers });
        await cdp('Input.dispatchMouseEvent', { type:'mouseReleased', ...to, button:'left', buttons:0, clickCount:1, modifiers });
    };
    const check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
    await cdp("Runtime.enable"); await cdp("Page.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const draft = { modelId: 1, prompt: "草稿初始内容", seconds: 8, resolution: "1080p", ratio: "1:1", audio: true, watermark: true, mode: "reference", references: [{ fileNo: "F_REF", url: imageUrl, name: "参考图片" }] };
    await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `if(location.origin === ${JSON.stringify(origin)}){localStorage.setItem('ic_access_token','mock-access');localStorage.setItem('ic_refresh_token','mock-refresh');if(!sessionStorage.getItem('video-draft:7'))sessionStorage.setItem('video-draft:7',${JSON.stringify(JSON.stringify(draft))});}` });
    const connectionProject={projectNo:'P_CONNECTIONS',title:'连线回归画布',version:1,updatedAt:now,document:{...emptyDoc(),nodes:[
        {id:'edge-source',type:'image',x:120,y:100,width:200,height:140,title:'连线源节点',fileNo:'F_UPLOAD_IMAGE'},
        {id:'edge-target',type:'text',x:660,y:320,width:200,height:140,title:'连线目标节点',content:'目标节点'},
    ],connections:[{id:'edge-existing',fromNodeId:'edge-source',toNodeId:'edge-target'}]}};
    state.projects.push(connectionProject);
    await cdp("Page.navigate", { url: `${origin}/canvas/P_CONNECTIONS` });
    await wait(()=>evaluate(`!!document.querySelector('[data-node-id="edge-source"]')`),'connection fixture canvas loads');
    await wait(()=>evaluate(`!!document.querySelector('[data-connection-id="edge-existing"]')`),'saved connection renders when opening the canvas');
    check('已有节点连线在打开画布时可见');
    const links = () => evaluate(`Array.from(document.querySelectorAll('[data-connection-id]'),e=>({id:e.dataset.connectionId,from:e.dataset.fromNodeId,to:e.dataset.toNodeId,d:e.getAttribute('d')}))`);
    const portPoint = (id,handle) => evaluate(`(()=>{const e=document.querySelector('[data-node-id="${id}"] [data-connection-handle="${handle}"]');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const assertAnchors = () => evaluate(`(()=>{const p=document.querySelector('[data-connection-id="edge-existing"]');const a=document.querySelector('[data-node-id="edge-source"] [data-connection-handle="source"]').getBoundingClientRect();const b=document.querySelector('[data-node-id="edge-target"] [data-connection-handle="target"]').getBoundingClientRect();const screen=t=>{const q=p.getPointAtLength(t);return new DOMPoint(q.x,q.y).matrixTransform(p.getScreenCTM());};const s=screen(0),e=screen(p.getTotalLength());return Math.hypot(s.x-a.x-a.width/2,s.y-a.y-a.height/2)<2&&Math.hypot(e.x-b.x-b.width/2,e.y-b.y-b.height/2)<2;})()`);
    await wait(assertAnchors,'saved link attaches to node ports');
    const titlePoint=await evaluate(`(()=>{const r=document.querySelector('[data-node-id="edge-source"] [title="拖动标题移动节点"]').getBoundingClientRect();return{x:r.x+40,y:r.y+r.height/2};})()`);
    await drag(titlePoint,{x:titlePoint.x+80,y:titlePoint.y+45});
    await wait(async()=>(await nodes()).find(n=>n.id==='edge-source')?.x===200,'source moved in world coordinates');
    await wait(assertAnchors,'moving node updates link geometry');
    await key('Escape','Escape');
    await click('', 'button[aria-label="适应全部画布内容"]');
    await wait(async()=>Math.abs((await portPoint('edge-source','target')).x-390)<2,'fit view rendered centered node bounds');
    await wait(assertAnchors,'fit viewport keeps endpoints attached');
    await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:1050,y:650,deltaX:0,deltaY:-120});
    await wait(()=>evaluate(`document.querySelector('button[title="恢复 100% 缩放"]')?.textContent!=='100%'`),'wheel changes rendered zoom');
    await wait(assertAnchors,'wheel zoom keeps endpoints attached');
    check('节点移动、适应画布与滚轮缩放后连线端点保持贴合');
    await click('', 'button[aria-label="重置画布视图"]');
    await wait(async()=>Math.abs((await portPoint('edge-source','target')).x-200)<2,'reset before port gestures');
    await drag(await portPoint('edge-source','source'),await portPoint('edge-target','target'));
    assert.equal((await links()).length,1,'duplicate directed link rejected');
    await drag(await portPoint('edge-source','source'),await portPoint('edge-source','target'));
    assert.equal((await links()).length,1,'self link rejected');
    await drag(await portPoint('edge-source','target'),await portPoint('edge-target','source'));
    await wait(async()=>(await links()).length===2,'left input drag creates reversed direction');
    assert((await links()).some(l=>l.from==='edge-target'&&l.to==='edge-source'),'input-start link direction must be target to origin');
    await key('z','KeyZ',2); await wait(async()=>(await links()).length===1,'undo only newly created link');
    await drag(await portPoint('edge-target','source'),await portPoint('edge-source','target'));
    await wait(async()=>(await links()).length===2,'right output drag creates directed link');
    check('两侧端口拖拽方向正确，重复连线与自连接被拒绝，新增连线可撤销');
    const cancelFrom=await portPoint('edge-source','source');
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...cancelFrom,button:'left',buttons:1,clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:cancelFrom.x+90,y:cancelFrom.y+100,buttons:1,button:'left'});
    await wait(()=>evaluate(`!!document.querySelector('[data-connection-preview]')`),'live connection preview');
    await evaluate(`(()=>{const canvas=document.querySelector('[aria-label="无限画布编辑区域"]');canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:99,bubbles:true}));})()`);
    assert.equal(await evaluate(`!!document.querySelector('[data-connection-preview]')`),true,'unrelated pointer must not cancel active connection');
    await key('Escape','Escape');
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:cancelFrom.x+90,y:cancelFrom.y+100,button:'left',buttons:0,clickCount:1});
    assert.equal((await links()).length,2);assert.equal(await evaluate(`document.querySelectorAll('[data-connection-preview]').length`),0);
    const hitPoint=await evaluate(`(()=>{const p=document.querySelector('[data-connection-id="edge-existing"]');const q=p.getPointAtLength(p.getTotalLength()/2);const s=new DOMPoint(q.x,q.y).matrixTransform(p.getScreenCTM());return{x:s.x,y:s.y};})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...hitPoint,button:'left',buttons:1,clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...hitPoint,button:'left',buttons:0,clickCount:1});
    await click('', 'button[aria-label="删除选中连线"]');
    await wait(async()=>(await links()).length===1,'selected edge deletion');
    await key('z','KeyZ',2); await wait(async()=>(await links()).length===2,'undo edge deletion');
    check('拖线预览可取消，曲线可点击选中删除并撤销');
    await mouseClick('[data-node-id="edge-source"] [title="拖动标题移动节点"]');
    await key('Delete','Delete');await wait(async()=>(await nodes()).length===1&&(await links()).length===0,'node deletion removes incident links');
    await key('z','KeyZ',2);await wait(async()=>(await nodes()).length===2&&(await links()).length===2,'node and incident links restored together');
    await key('a','KeyA',2);await key('c','KeyC',2);await key('v','KeyV',2);
    await wait(async()=>(await nodes()).length===4&&(await links()).length===4,'copy remaps internal links');
    const pastedIds=(await nodes()).filter(n=>n.selected).map(n=>n.id);
    assert.equal((await links()).filter(l=>pastedIds.includes(l.from)&&pastedIds.includes(l.to)).length,2);
    await key('z','KeyZ',2);await wait(async()=>(await nodes()).length===2&&(await links()).length===2,'undo group copy restores original graph');
    check('删除节点同步删除关联线并可整体撤销，复制节点组保留内部连线');
    await wait(()=>connectionProject.document.connections.length===2,'connections autosave');
    const savedLinks=JSON.stringify(connectionProject.document.connections);
    await cdp('Page.reload',{ignoreCache:true});
    await wait(async()=>(await links()).length===2,'connections restored after full reload');
    assert.equal(JSON.stringify(connectionProject.document.connections),savedLinks);
    await wait(assertAnchors,'reloaded connection geometry');
    await screenshot('10-node-connections');
    check('连线自动保存且整页刷新后恢复');
    await mouseClick('[data-node-id="edge-target"] [title="拖动标题移动节点"]');
    await wait(()=>evaluate(`document.querySelector('[aria-label="节点生成面板"] textarea[aria-label="画布生成提示词"]')?.value==='目标节点'`),'linked target prompt');
    await wait(()=>evaluate(`!!document.querySelector('[aria-label="节点生成面板"] button[aria-label="移除参考图 连线源节点"]')`),'incoming linked image added to generation references');
    await click('', 'button[aria-label="收起节点生成面板"]');
    check('节点生成面板自动带入入边图片作为参考素材');
    state.projects.pop();
    await cdp("Page.navigate", { url: `${origin}/video` });
    await has("去账户补充积分"); await fill("textarea", "冒烟测试：补积分后继续创作");
    await click("去账户补充积分"); await has("立即兑换");
    await fill('input[placeholder="输入兑换码"]', "SMOKE-CREDITS"); await click("兑换"); await has("兑换成功"); await click("返回创作");
    await wait(() => evaluate("document.querySelector('textarea')?.value === '冒烟测试：补积分后继续创作'"), "draft prompt restoration");
    const savedDraft = await evaluate("JSON.parse(sessionStorage.getItem('video-draft:7'))");
    for (const key of ["seconds", "resolution", "ratio", "audio", "watermark", "mode", "references"]) assert.deepEqual(savedDraft[key], draft[key], `Draft ${key} restored`);
    assert(await evaluate("!!document.querySelector('img[alt=参考图片]')")); check("视频草稿提示词、参数、参考图补积分往返保留");
    await click("任务"); await has("生成任务"); await has("跨页后台任务");
    await evaluate("document.querySelector('.ant-drawer-close').click()"); await click("我的资产", "nav a"); await has("我的素材");
    await click("任务"); await has("跨页后台任务"); await evaluate("document.querySelector('.ant-drawer-close').click()");
    Object.assign(state.tasks.find(t => t.taskNo === "T_RUNNING"), { status: "succeeded", progress: 100, file: videoFile("T_RUNNING"), settledCredits: 6 }); state.credits.frozen = 0;
    await evaluate("window.dispatchEvent(new Event('focus'))"); await has("视频任务已完成"); await click("查看任务");
    await wait(() => evaluate("location.pathname === '/video' && new URLSearchParams(location.search).get('task') === 'T_RUNNING'"), "completion navigation");
    await has("生成作品已可在"); assert.equal(await evaluate("document.querySelector('textarea').value"), "冒烟测试：补积分后继续创作");
    check("全局任务跨页可见、完成通知导航且不覆盖编辑草稿"); await screenshot("01-video-result");
    await click("我的资产", "nav a"); await click("生成作品", "[role=tab]"); await has("既有成功作品");
    await click("加入画布"); await has("选择已有画布");
    console.log("STEP 生成作品加入已有画布");
    await mouseClick('.ant-modal [class*="select-selector"], .ant-modal .ant-select, [class*="ant-select-selector"]');
    await mouseClick(".ant-select-dropdown .ant-select-item-option", "已有画布");
    await wait(() => evaluate(`!document.querySelector('input[aria-label="新画布名称"]')`), 'existing canvas selected');
    await click("添加1项"); await has("已添加1项");
    assert.equal(state.projects[0].document.nodes.length, 1); await click("完成");
    await click("加入画布"); await fill('input[aria-label="新画布名称"]', "冒烟新画布"); await click("添加1项"); await has("已添加1项"); assert.equal(state.projects.length, 2); await click("打开画布");
    await has("从作品库添加"); check("生成作品加入已有画布与新建画布并打开");
    await click("从作品库添加"); await has("测试素材文本"); await click("选择", ".ant-checkbox-wrapper"); await click("添加所选1项");
    await has("来自素材库的内容");
    const project = state.projects.at(-1);
    await wait(() => project.document.nodes.some(n => n.content === "来自素材库的内容"), "library content autosave"); check("画布从素材库添加并自动保存");
    await click("生成视频"); await has("用画布素材生成视频"); await fill(".ant-modal textarea", "画布关闭弹窗后后台生成"); await click("开始生成"); await has("后台继续生成");
    const created = state.tasks[0]; assert(created.taskNo.startsWith("T_NEW_")); await click("后台继续生成");
    await click('', 'button[aria-label="创建文本节点"]'); await fill("header input", "编辑未阻塞");
    Object.assign(created, { status: "succeeded", progress: 100, file: videoFile(created.taskNo), settledCredits: 6 });
    await evaluate("window.dispatchEvent(new Event('focus'))"); await has("生成结果已插入画布");
    await wait(() => project.document.nodes.some(n => n.id === `task-${created.taskNo}`) && project.title === "编辑未阻塞", "background canvas result autosave");
    const count = () => project.document.nodes.filter(n => n.id === `task-${created.taskNo}`).length;
    assert.equal(count(), 1); await evaluate("window.dispatchEvent(new Event('focus'))"); await delay(1200); assert.equal(count(), 1);
    await screenshot("02-canvas-background-result");
    await click("我的资产", "nav a"); await click("任务"); await has("画布关闭弹窗后后台生成"); await click("打开画布"); await has("用画布素材生成视频");
    await delay(1200); assert.equal(count(), 1); check("画布运行中关闭弹窗继续编辑、完成自动插入且刷新重访不重复");
    console.log("STEP 整页刷新恢复画布与任务面板");
    await cdp("Page.reload", { ignoreCache: true });
    await has("从作品库添加"); await has("用画布素材生成视频"); await has("画布关闭弹窗后后台生成");
    await wait(() => evaluate("document.querySelector('header input')?.value === '编辑未阻塞'"), "canvas title after page reload");
    await delay(1200); assert.equal(count(), 1); check("真实整页刷新后画布与任务面板恢复、成功任务节点仍只有1个");
    await click('关闭', '.ant-modal button');
    await wait(() => evaluate(`![...document.querySelectorAll('.ant-modal-wrap')].some(${visible})`), 'generation modal fully closed');
    const initialCount = (await nodes()).length;
    await click('', 'button[aria-label="创建文本节点"]');
    await wait(async () => (await nodes()).length === initialCount + 1, 'create node');
    await click('', 'button[aria-label="撤销"]');
    await wait(async () => (await nodes()).length === initialCount, 'undo creation');
    await click('', 'button[aria-label="重做"]');
    await wait(async () => (await nodes()).length === initialCount + 1, 'redo creation');
    check('新增节点可撤销重做');
    await focusCanvas(); await key('a', 'KeyA', 2);
    await wait(async () => (await nodes()).every(n=>n.selected), 'select all');
    await click('', 'button[aria-label="适应全部画布内容"]');
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const beforeDrag = await nodes();
    const dragFrom = await evaluate(`(() => { const e=document.querySelector('[data-node-id]'); const r=e.getBoundingClientRect(); return {x:r.left+25,y:r.top-12}; })()`);
    await drag(dragFrom, {x:dragFrom.x+47,y:dragFrom.y+39});
    await wait(async () => (await nodes()).every((n,i)=>n.x>beforeDrag[i].x&&n.y>beforeDrag[i].y), 'group drag');
    const afterDrag = await nodes();
    const dx=afterDrag[0].x-beforeDrag[0].x, dy=afterDrag[0].y-beforeDrag[0].y;
    afterDrag.forEach((n,i)=>{ assert(Math.abs(n.x-beforeDrag[i].x-dx)<0.01); assert(Math.abs(n.y-beforeDrag[i].y-dy)<0.01); });
    await focusCanvas(); await key('z','KeyZ',2);
    await wait(async()=>JSON.stringify((await nodes()).map(({id,x,y})=>({id,x,y})))===JSON.stringify(beforeDrag.map(({id,x,y})=>({id,x,y}))), 'one-step drag undo');
    await key('Z','KeyZ',10);
    await wait(async()=>Math.abs((await nodes())[0].x-afterDrag[0].x)<0.01,'drag redo');
    check('全选后整组拖动，单步撤销及键盘重做');
    await key('c','KeyC',2); await key('v','KeyV',2);
    await wait(async()=>(await nodes()).length===beforeDrag.length*2,'paste whole group');
    const pasted=(await nodes()).filter(n=>n.selected);
    assert(pasted.every(n=>n.id.startsWith('node-')),'Generated task copies must have fresh node IDs');
    assert.equal(pasted.length,beforeDrag.length);
    await key('Delete','Delete');
    await wait(async()=>(await nodes()).length===beforeDrag.length,'delete selected group');
    await key('z','KeyZ',2);
    await wait(async()=>(await nodes()).length===beforeDrag.length*2,'undo group deletion');
    check('跨节点复制粘贴生成新标识，删除可整组撤销');
    await key('Escape','Escape');
    await click('', 'button[aria-label="适应全部画布内容"]');
    await click('', 'button[aria-label="选择工具"]');
    const canvasRect=await evaluate(`(() => {const r=document.querySelector('[aria-label="无限画布编辑区域"]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    await drag({x:canvasRect.x+4,y:canvasRect.y+4},{x:canvasRect.x+canvasRect.width-4,y:canvasRect.y+canvasRect.height-4});
    await wait(async()=>(await nodes()).every(n=>n.selected),'marquee selection');
    check('选择工具拖动框选多个节点');
    await key('Escape','Escape');
    await click('', 'button[aria-label="切换画布侧栏"]');
    await fill('[aria-label="搜索画布节点"]','来自素材库');
    await click('测试素材文本','[aria-label="画布侧栏"] button');
    await wait(async()=>(await nodes()).filter(n=>n.selected).length===1,'sidebar focus and selection');
    await click('用所选生成');
    await has('用所选素材生成视频');
    assert.equal(await evaluate(`document.querySelector('[aria-label="节点生成面板"] textarea').value`),'来自素材库的内容');
    await fill('[aria-label="搜索画布节点"]','');
    await click('', 'button[aria-label="收起节点生成面板"]');
    check('节点搜索定位并在节点旁带入文本生成');
    await click('素材与作品','[role=tab]'); await has('测试素材文本');
    await click('加入画布','[aria-label="画布侧栏"] button');
    await has('已添加');
    check('左侧紧凑素材库直接添加节点');
    await click('画布节点','[role=tab]');
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const textPoint=await evaluate(`(() => {const r=[...document.querySelectorAll('[data-node-id]')].at(-1).getBoundingClientRect();return{x:r.x+40,y:r.y+14};})()`);
    for (const clickCount of [1,2]) {
        await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...textPoint,button:'left',buttons:1,clickCount});
        await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...textPoint,button:'left',buttons:0,clickCount});
    }
    await has('编辑文本节点'); await fill('.ant-modal textarea','双击编辑后保存'); await click('保存','.ant-modal button');
    await has('双击编辑后保存');
    await wait(() => evaluate(`![...document.querySelectorAll('.ant-modal-wrap')].some(${visible})`), 'text modal closed');
    await click('', 'button[aria-label="撤销"]');
    await wait(() => evaluate(`![...document.querySelectorAll('[data-node-id]')].some(e=>e.textContent.includes('双击编辑后保存'))`),'undo text edit');
    check('文本节点保留真实双击编辑，修改内容可撤销');
    await click('', 'button[aria-label="适应全部画布内容"]');
    await click('', 'button[aria-label="放大画布"]');
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const worldTransform=()=>evaluate(`document.querySelector('[data-node-id]').parentElement.style.transform`);
    const beforeMap=await worldTransform();
    const mapPoint=await evaluate(`(() => {const r=document.querySelector('svg[aria-label^="画布小地图"]').getBoundingClientRect();return{x:r.x+16,y:r.y+16};})()`);
    await drag(mapPoint,mapPoint);
    await wait(async()=>(await worldTransform())!==beforeMap,'minimap click moves viewport');
    const afterMap=await worldTransform();
    await evaluate(`document.querySelector('svg[aria-label^="画布小地图"]').focus()`);
    await key('ArrowRight','ArrowRight');
    await wait(async()=>(await worldTransform())!==afterMap,'minimap keyboard navigation');
    check('小地图真实点击定位与方向键平移');
    await click('', 'button[aria-label="适应全部画布内容"]');
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await screenshot('03-canvas-workbench');
    await cdp('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false});
    await click('', 'button[aria-label="切换画布侧栏"]');
    await screenshot('04-canvas-compact');
    await wait(()=>project.document.nodes.length===beforeDrag.length*2+1,'edited canvas autosave');
    check('导航缩放、小地图、窄窗口折叠及编辑自动保存');

    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await click('', 'button[aria-label="切换画布侧栏"]');
    const toolbarTypes = [['text','文本'],['image','图片'],['video','视频']];
    for (const [type,label] of toolbarTypes) {
        const before=(await nodes()).length;
        await mouseClick(`[aria-label="画布创建栏"] button[aria-label="创建${label}节点"]`);
        await wait(async()=>(await nodes()).length===before+1,`toolbar create ${type}`);
        assert((await nodes()).find(n=>n.selected).id.startsWith(`${type}-`));
        if(type!=='text') await has(`空白${label}节点`);
        if(type==='video') {
            const selector='[aria-label="节点生成面板"] textarea[aria-label="画布生成提示词"]';
            await wait(()=>evaluate(`!!document.querySelector('${selector}')`),'creating video automatically shows prompt composer');
            await fill(selector,'新建视频的提示词验证');
            const videoId=(await nodes()).find(n=>n.selected).id;
            await click('', '[aria-label="节点生成面板"] button[aria-label="收起节点生成面板"]');
            await wait(()=>evaluate(`!document.querySelector('${selector}')`),'prompt composer closes explicitly');
            await mouseClick(`[data-node-id="${videoId}"] [title="拖动标题移动节点"]`);
            await wait(()=>evaluate(`document.querySelector('${selector}')?.value==='新建视频的提示词验证'`),'selecting video reopens editable prompt and preserves draft');
            await screenshot('09-visible-node-prompt');
            check('新建视频直接显示提示词框，收起后点击节点重新展示并保留草稿');
        }
    }
    const afterToolbar=(await nodes()).length;
    await mouseClick('[aria-label="画布工具栏"] button[aria-label="工具栏撤销"]');
    await wait(async()=>(await nodes()).length===afterToolbar-1,'toolbar undo');
    await mouseClick('[aria-label="画布工具栏"] button[aria-label="工具栏重做"]');
    await wait(async()=>(await nodes()).length===afterToolbar,'toolbar redo');
    check('左侧创建栏创建三类空白节点，底部撤销重做可用');

    await click('', 'button[aria-label="放大画布"]');
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const blankPoint=()=>evaluate(`(() => {
        const c=document.querySelector('[aria-label="无限画布编辑区域"]'),r=c.getBoundingClientRect();
        const m=new DOMMatrix(document.querySelector('[data-node-id]').parentElement.style.transform);
        for(const dy of [80,120,200,300,400]) for(const dx of [30,90,180,300,r.width-10]) {
            const x=r.x+dx,y=r.y+dy;
            if(document.elementFromPoint(x,y)?.dataset.canvasBg==='true') return {x,y,worldX:(x-r.x-m.e)/m.a,worldY:(y-r.y-m.f)/m.a};
        }
        return null;
    })()`);
    const openContext=async(point)=>{
        for(const type of ['mouseMoved','mousePressed','mouseReleased']) await cdp('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'right',buttons:type==='mousePressed'?2:0,clickCount:1});
        await wait(()=>evaluate(`!!document.querySelector('[role="menu"][aria-label="画布创建菜单"]')`),'context menu opens');
    };
    const contextIds=[];
    for(const [type,label] of toolbarTypes) {
        const point=await blankPoint(); assert(point,'A blank canvas point is available');
        const before=(await nodes()).length;
        await openContext(point);
        await mouseClick('[role="menu"][aria-label="画布创建菜单"] [role="menuitem"]',`创建${label}`);
        await wait(async()=>(await nodes()).length===before+1,`context create ${type}`);
        const created=(await nodes()).find(n=>n.selected);
        assert(created.id.startsWith(`${type}-`));
        assert(Math.abs(created.x-point.worldX)<=0.51,'Context x uses world coordinates');
        assert(Math.abs(created.y-point.worldY)<=0.51,'Context y uses world coordinates');
        contextIds.push(created.id);
        assert.equal(await evaluate(`!!document.querySelector('[role="menu"][aria-label="画布创建菜单"]')`),false);
    }
    check('真实右键创建三类节点，缩放平移后仍落在点击位置');

    const beforeDismiss=(await nodes()).length;
    await openContext(await blankPoint());
    await key('Escape','Escape');
    await wait(()=>evaluate(`!document.querySelector('[role="menu"][aria-label="画布创建菜单"]')`),'Escape closes creation menu');
    assert.equal((await nodes()).length,beforeDismiss);
    await openContext(await blankPoint());
    await key('ArrowDown','ArrowDown');
    await wait(()=>evaluate(`document.activeElement?.textContent==='创建图片'`),'arrow key focuses image menu item');
    await key('Enter','Enter');
    await wait(async()=>(await nodes()).length===beforeDismiss+1,'keyboard menu creates image');
    assert((await nodes()).find(n=>n.selected).id.startsWith('image-'));
    await focusCanvas(); await key('z','KeyZ',2);
    await wait(async()=>(await nodes()).length===beforeDismiss,'context creation undo');
    check('右键菜单支持 Escape、方向键与回车，创建可撤销');

    await cdp('Page.setInterceptFileChooserDialog',{enabled:true});
    for(const [type,label] of toolbarTypes.filter(([type])=>type!=='text')) {
        const nodeId=contextIds[type==='image'?1:2];
        await click('',`[data-node-id="${nodeId}"] button[aria-label="上传${label}到节点"]`);
        const filename=join(output,type==='image'?'smoke-image.png':'smoke-video.mp4');
        await writeFile(filename,type==='image'?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9HkAAAAASUVORK5CYII=','base64'):Buffer.from('mock video bytes'));
        const {root:dom}=await cdp('DOM.getDocument');
        const {nodeId:inputId}=await cdp('DOM.querySelector',{nodeId:dom.nodeId,selector:type==='image'?'input[type="file"][accept^="image/"]':'input[type="file"][accept^="video/"]'});
        const beforeUpload=await nodes();
        const countBeforeUpload=beforeUpload.length;
        const targetBeforeUpload=beforeUpload.find(node=>node.id===nodeId);
        await cdp('DOM.setFileInputFiles',{nodeId:inputId,files:[filename]});
        await wait(()=>evaluate(`!!document.querySelector('[data-node-id="${nodeId}"] ${type==='image'?'img':'video'}')`),`${type} fills original placeholder`);
        assert.equal((await nodes()).length,countBeforeUpload,'Upload fills the existing node');
        const targetAfterUpload=(await nodes()).find(node=>node.id===nodeId);
        assert.equal(targetAfterUpload.x,targetBeforeUpload.x); assert.equal(targetAfterUpload.y,targetBeforeUpload.y);
        await focusCanvas(); await key('z','KeyZ',2);
        await wait(()=>evaluate(`!!document.querySelector('[data-node-id="${nodeId}"] button')`),'undo upload restores empty node');
        await key('Z','KeyZ',10);
        await wait(()=>evaluate(`!!document.querySelector('[data-node-id="${nodeId}"] ${type==='image'?'img':'video'}')`),'redo upload restores media');
    }
    await cdp('Page.setInterceptFileChooserDialog',{enabled:false});
    check('空白图片视频原位上传，保留节点标识和坐标，上传可撤销重做');
    await wait(()=>contextIds.every(id=>project.document.nodes.some(n=>n.id===id)) && project.document.nodes.some(n=>n.fileNo==='F_UPLOAD_IMAGE') && project.document.nodes.some(n=>n.fileNo==='F_UPLOAD_VIDEO'),'context and upload autosave');
    await cdp('Page.reload',{ignoreCache:true}); await has('从作品库添加');
    await wait(async()=>{const restored=await nodes();return contextIds.every(id=>restored.some(n=>n.id===id));},'created nodes restored');
    check('右键创建和原位上传自动保存，刷新后恢复');
    await has('用画布素材生成视频');
    await click('关闭', '.ant-modal button');
    await wait(() => evaluate(`![...document.querySelectorAll('.ant-modal-wrap')].some(${visible})`), 'restored task modal fully closed');
    await click('', 'button[aria-label="适应全部画布内容"]');
    await screenshot('05-canvas-creation-tools');
    const cornerPoint=await evaluate(`(() => {const r=document.querySelector('[aria-label="无限画布编辑区域"]').getBoundingClientRect();return{x:r.right-4,y:r.bottom-4};})()`);
    await openContext(cornerPoint);
    const menuBounds=await evaluate(`(() => {const r=document.querySelector('[role="menu"][aria-label="画布创建菜单"]').getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};})()`);
    assert(menuBounds.x>=0&&menuBounds.y>=0&&menuBounds.right<=menuBounds.width&&menuBounds.bottom<=menuBounds.height,'Context menu stays inside the viewport');
    await screenshot('06-canvas-context-menu');
    const outside=await blankPoint(); await drag(outside,outside);
    await wait(()=>evaluate(`!document.querySelector('[role="menu"][aria-label="画布创建菜单"]')`),'outside click closes context menu');
    check('右下角菜单保持可见，点击画布空白关闭菜单');

    await click('', 'button[aria-label="切换画布侧栏"]');
    await fill('[aria-label="搜索画布节点"]','smoke-image.png');
    await click('smoke-image.png','[aria-label="画布侧栏"] button');
    await click('', 'button[aria-label="切换画布侧栏"]');
    await mouseClick(`[data-node-id="${contextIds[1]}"] button[aria-label="从节点打开生成面板"]`);
    await has('用所选素材生成视频');
    await fill('[aria-label="节点生成面板"] textarea','节点附近生成测试');
    await mouseClick('button[aria-label="选择生成模型"]');
    await has('实际预估随时长与分辨率变化');
    await mouseClick('.ant-popover button','Smoke Model');
    await mouseClick('button[aria-label="设置生成画面"]');
    await mouseClick('.ant-popover button','1:1');
    await mouseClick('.ant-popover button','1080p');
    await mouseClick('[aria-label="节点生成面板"] textarea');
    await mouseClick('button[aria-label="设置视频时长"]');
    await mouseClick('.ant-popover button','8 秒');
    await mouseClick('button[aria-label="设置参考模式"]');
    await mouseClick('.ant-popover button','参考图片');
    await mouseClick('button[aria-label="移除参考图 smoke-image.png"]');
    await fill('[aria-label="节点生成面板"] textarea','节点附近生成测试@');
    await has('画布图片');
    await mouseClick('input[aria-label="引用图片 smoke-image.png"]');
    await mouseClick('[aria-label="节点生成面板"] textarea');
    assert.equal(await evaluate(`document.querySelector('[aria-label="节点生成面板"] textarea').value`),'节点附近生成测试');
    await wait(()=>evaluate(`(() => {const d=JSON.parse(sessionStorage.getItem('ic_canvas_draft:7:${project.projectNo}'));return d.seconds===8&&d.ratio==='1:1'&&d.resolution==='1080p'&&d.mode==='reference'&&d.sources.includes('${contextIds[1]}');})()`),'composer draft persists');
    check('紧凑面板真实模型和参数选择，@添加及移除参考图，草稿自动保留');
    await wait(()=>evaluate(`![...document.querySelectorAll('.ant-popover')].some(${visible})`),'reference popover closes');
    const nodeLayout=await evaluate(`(() => {const p=document.querySelector('[aria-label="节点生成面板"]').getBoundingClientRect(),n=document.querySelector('[data-node-id="${contextIds[1]}"]').getBoundingClientRect();return {panelTop:p.top,nodeBottom:n.bottom,nodeTop:n.top};})()`);
    assert(nodeLayout.panelTop>=nodeLayout.nodeBottom+8&&nodeLayout.nodeTop>=104,'Opening generation keeps the node visible above its composer');
    await screenshot('07-node-generation-composer');
    if(await evaluate(`!!document.querySelector('[aria-label="画布侧栏"]')`)) await click('', 'button[aria-label="切换画布侧栏"]');
    await cdp('Emulation.setDeviceMetricsOverride',{width:760,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const composerBounds=await evaluate(`(() => {const p=document.querySelector('[aria-label="节点生成面板"]').getBoundingClientRect(),c=document.querySelector('[aria-label="无限画布编辑区域"]').getBoundingClientRect();return {left:p.left,right:p.right,top:p.top,bottom:p.bottom,cl:c.left,cr:c.right,ct:c.top,cb:c.bottom};})()`);
    assert(composerBounds.left>=composerBounds.cl&&composerBounds.right<=composerBounds.cr&&composerBounds.top>=composerBounds.ct&&composerBounds.bottom<=composerBounds.cb,'Node composer stays within narrow canvas');
    await screenshot('08-node-generation-compact');
    check('窄窗口节点生成面板保持可见，创建栏与参数仍可使用');
    await mouseClick('[aria-label="节点生成面板"] button[aria-label="开始生成"]');
    await has('任务已提交');
    assert.equal(state.tasks[0].prompt,'节点附近生成测试');
    assert.deepEqual(state.tasks[0].params,{seconds:8,resolution:'1080p',ratio:'1:1',mode:'reference'});
    assert.deepEqual(state.tasks[0].referenceFileNos,['F_UPLOAD_IMAGE']);
    await wait(()=>evaluate(`document.querySelector('[aria-label="节点生成面板"] button[aria-label="开始生成"]').disabled`),'active task prevents duplicate submission');
    await mouseClick('button[aria-label="收起节点生成面板"]');
    await wait(()=>evaluate(`!document.querySelector('[aria-label="节点生成面板"]')`),'active node composer closes');
    check('节点面板按所选参数和图片提交任务，防止重复提交并允许后台继续');
    assert.deepEqual(state.unexpected, [], "No unexpected mock API requests");
    assert.deepEqual(report.exceptions, [], "No browser runtime exceptions");
    assert.deepEqual(report.console.filter(entry => entry.type === "error"), [], "No console errors");
    check("浏览器无运行时异常及 console.error");
    await cdp("Browser.close").catch(() => {});
} catch (error) {
    report.failure = error.stack;
    console.error(error.stack);
    if (socket?.readyState === WebSocket.OPEN) {
        try { const id = 999999; const screenshot = new Promise(resolve => socket.addEventListener("message", event => { const response = JSON.parse(event.data); if (response.id === id) resolve(response.result); })); socket.send(JSON.stringify({ id, method: "Page.captureScreenshot", params: { format: "png" } })); const result = await Promise.race([screenshot, delay(2000).then(() => null)]); if (result?.data) await writeFile(join(output, "failure.png"), Buffer.from(result.data, "base64")); } catch { /* Preserve the original failure. */ }
    }
    process.exitCode = 1;
} finally {
    report.requests = state.requests;
    report.unexpected = state.unexpected;
    await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(`Artifacts: ${output}`);
    socket?.close();
    chrome.kill();
    await new Promise(resolve => server.close(resolve));
}
