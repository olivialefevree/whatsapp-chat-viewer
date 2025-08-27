/* WhatsApp Chat Viewer - script.js
- Reads WhatsApp exported .zip (with _chat.txt and media)
- Lists .zip files from your GitHub repo's /chats folder (no server code)
- Also opens local .zip without uploading
*/


(function(){
    const $ = sel => document.querySelector(sel);
    const $$ = sel => Array.from(document.querySelectorAll(sel));
    const state = {
        chatsOnSite: [], // {name, url, size}
        tempChats: [], // {name, file}
        current: null, // {name, zip, messages, participants, you}
        you: null,
        flipSides: false
    };

    // ---- Theme ----
    const themeToggle = $("#themeToggle");
    const userPref = localStorage.getItem("wcv.theme");
    if (userPref === "light") document.documentElement.classList.add("light");
    themeToggle.checked = document.documentElement.classList.contains("light");
    themeToggle.addEventListener("change", () => {
        document.documentElement.classList.toggle("light", themeToggle.checked);
        localStorage.setItem("wcv.theme", themeToggle.checked ? "light" : "dark");
    }); // ---- GitHub config ----
    function autoDetectGitHub() {
        const body = document.body;
        let owner = body.dataset.ghOwner || null;
        let repo = body.dataset.ghRepo || null;
        let branch = body.dataset.ghBranch || "main";
        let path = body.dataset.chatsPath || "chats";


        if (!owner || !repo) {
            const { hostname, pathname } = window.location;
            const hostParts = hostname.split(".");
            if (hostParts.length >= 3 && hostParts[1] === "github" && hostParts[2] === "io") {
                owner = hostParts[0];
                // For project pages: /REPO/...
                const seg = pathname.split("/").filter(Boolean);
                if (seg.length > 0) repo = seg[0];
                else repo = owner + ".github.io"; // user/organization page repo
            }
        }
        return { owner, repo, branch, path };
    }


async function fetchGitHubChats({owner, repo, branch="main", path="chats"}){
if(!owner || !repo) return [];
const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
const resp = await fetch(api, { headers: { "Accept": "application/vnd.github+json" }});
if(!resp.ok){
status(`GitHub API error: ${resp.status} ${resp.statusText}`);
return [];
}
const items = await resp.json();
if(!Array.isArray(items)) return [];
return items
.filter(x => x.type === "file" && /\.zip$/i.test(x.name))
.map(x => ({ name: x.name.replace(/\.zip$/i, ""), url: x.download_url, size: x.size }));
}


// ---- UI list rendering ----
function renderChatList(){
const q = $("#searchInput").value.trim().toLowerCase();
const list = $("#chatList");
list.innerHTML = "";
const matched = state.chatsOnSite.filter(c => c.name.toLowerCase().includes(q));
if(matched.length === 0){
list.innerHTML = `<li><div class="name">No chats found</div><div class="meta">Add .zip files to /chats or load local zips.</div></li>`;
return;
}
for(const item of matched){
const li = document.createElement("li");
li.innerHTML = `<div class="name">${escapeHtml(item.name)}</div>
<div class="meta">${(item.size/1024/1024).toFixed(2)} MB • on site</div>`;
li.addEventListener("click", () => openZipFromUrl(item.url, item.name));
list.appendChild(li);
}
}function renderTempList(){
const list = $("#tempList");
list.innerHTML = "";
for(const item of state.tempChats){
const li = document.createElement("li");
li.innerHTML = `<div class="name">${escapeHtml(item.name)}</div>
<div class="meta">local only</div>`;
li.addEventListener("click", () => openZipFromFile(item.file, item.name));
list.appendChild(li);
}
}


$("#searchInput").addEventListener("input", renderChatList);


// ---- Open local zip ----
$("#openLocalBtn").addEventListener("click", () => $("#localZipInput").click());
$("#localZipInput").addEventListener("change", ev => {
const file = ev.target.files[0];
if(file) {
state.tempChats.unshift({ name: stripExt(file.name), file });
renderTempList();
openZipFromFile(file, stripExt(file.name));
ev.target.value = "";
}
});


// Drag & drop to temp list
const dropzone = $("#dropzone");
;["dragenter","dragover"].forEach(evt => dropzone.addEventListener(evt, e=>{e.preventDefault(); dropzone.style.borderColor = "var(--green)";}));
;["dragleave","drop"].forEach(evt => dropzone.addEventListener(evt, e=>{e.preventDefault(); dropzone.style.borderColor = "var(--border)";}));
dropzone.addEventListener("drop", e => {
const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith(".zip"));
for(const f of files){
state.tempChats.unshift({ name: stripExt(f.name), file: f });
}
renderTempList();
if(files[0]) openZipFromFile(files[0], stripExt(files[0].name));
});// ---- GitHub config form ----
$("#saveGhConfig").addEventListener("click", async () => {
const owner = $("#ghOwner").value.trim();
const repo = $("#ghRepo").value.trim();
const branch= $("#ghBranch").value.trim() || "main";
const path = $("#ghPath").value.trim() || "chats";
await loadGitHub({owner, repo, branch, path, persist:true});
});


async function loadGitHub(opts){
const chats = await fetchGitHubChats(opts);
state.chatsOnSite = chats;
renderChatList();
if(chats.length) status(`Loaded ${chats.length} chat zip(s) from GitHub.`);
else status("No .zip found on GitHub /chats. Add some and refresh.");
}


// Try to auto-detect repo
(async function initGitHub(){
const auto = autoDetectGitHub();
// Fill form placeholders
$("#ghOwner").placeholder = auto.owner || "YOURNAME";
$("#ghRepo").placeholder = auto.repo || "your-repo";
$("#ghBranch").placeholder= auto.branch || "main";
$("#ghPath").placeholder = auto.path || "chats";


// Load from auto or from persisted config
const saved = JSON.parse(localStorage.getItem("wcv.gh") || "null");
const cfg = saved || auto;
if(cfg.owner && cfg.repo) await loadGitHub(cfg);
})();


// ---- Viewer controls ----
$("#flipSidesBtn").addEventListener("click", () => {
state.flipSides = !state.flipSides;
if(state.current) renderMessages(state.current.messages);
});


$("#openInNewBtn").addEventListener("click", () => {
const url = new URL(window.location.href);
url.hash = "#viewer";
window.open(url.toString(), "_blank");
});$("#scrollBottomBtn").addEventListener("click", () => {
const el = $("#chatMount");
el.scrollTop = el.scrollHeight;
});


$("#yourNameSelect").addEventListener("change", (e) => {
state.you = e.target.value || null;
if(state.current) renderMessages(state.current.messages);
});


// ---- Open functions ----
async function openZipFromUrl(url, name){
startBusy(`Opening ${name}…`);
try{
const ab = await fetchAsArrayBuffer(url);
const zip = await JSZip.loadAsync(ab);
await openZipCommon(zip, name);
}catch(err){
console.error(err);
status("Failed to open zip from site.");
}finally{
endBusy();
}
}


async function openZipFromFile(file, name){
startBusy(`Opening ${name}…`);
try{
const ab = await file.arrayBuffer();
const zip = await JSZip.loadAsync(ab);
await openZipCommon(zip, name);
}catch(err){
console.error(err);
status("Failed to open local zip.");
}finally{
endBusy();
}
}


async function openZipCommon(zip, name){
const txtEntry = findChatTxtEntry(zip);
if(!txtEntry){
status("No _chat.txt (or similar) found in zip.");
return;
}
const text = await txtEntry.async("string");
const messages = parseWhatsApp(text);
const participants = Array.from(new Set(messages.filter(m=>!m.system).map(m=>m.sender)));
state.current = { name, zip, messages, participants };
// Populate participant selector
const sel = $("#yourNameSelect");
sel.innerHTML = `<option value="">—</option>` + participants.map(p=>`<option>${escapeHtml(p)}</option>`).join("");
sel.disabled = participants.length === 0;
state.you = state.you || guessYou(participants);
if(state.you){
const opt = Array.from(sel.options).find(o => o.value === state.you);
if(opt) sel.value = state.you;
}
$("#roomTitle").textContent = name;
renderMessages(messages);
status(`Loaded ${messages.length} messages. Participants: ${participants.join(", ") || "—"}`);
// Scroll to bottom
requestAnimationFrame(()=> $("#chatMount").scrollTop = $("#chatMount").scrollHeight);
}function findChatTxtEntry(zip){
// Otherwise any .txt in root
const anyTxt = zip.file(/^[^\/]+\.txt$/i)[0];
return anyTxt || null;
}


// ---- Parsing WhatsApp exported text ----
function parseWhatsApp(text){
// Normalize CRLF, strip BOM & invisible LRM chars
text = text.replace(/^\ufeff/, "").replace(/[\u200e\u200f]/g, "");
const lines = text.split(/\r?\n/);
const messages = [];
let cur = null;


// Example line: [8/20/25, 4:44:08 PM] Name: Message
const re = /^\[(\d{1,2}\/\d{1,2}\/\d{2}),\s+(\d{1,2}:\d{2}(?::\d{2})?\s?[AP]M)\]\s([^:]+?):\s([\s\S]*)$/;


for(const rawLine of lines){
const line = rawLine.trimEnd();
const m = line.match(re);
if(m){
if(cur) messages.push(finalize(cur));
const [_, d, t, sender, content] = m;
cur = { date: d, time: t, sender: sender.trim(), text: content || "", system: false };
}else{
// Continuation line (part of previous message) or empty
if(cur) cur.text += (cur.text ? "\n" : "") + line;
}
}
if(cur) messages.push(finalize(cur));
return messages;
}


function finalize(msg){
// Extract attachments like <attached: filename>
const attachRe = /<attached:\s*([^>]+?)>/gi;
const editedRe = /<This message was edited>/i;
msg.attachments = [];
let match;
while((match = attachRe.exec(msg.text))){
const fname = match[1].trim();
msg.attachments.push(fname);
}
msg.edited = editedRe.test(msg.text);
// Clean text by removing the <attached:...> bits
msg.text = msg.text.replace(attachRe, "").replace(/\s+$/,"%");
msg.text = msg.text.replace(/%$/, "");
return msg;
}// ---- Rendering ----


for(const m of messages){
if(m.date !== lastDate){
lastDate = m.date;
const sep = document.createElement("div");
sep.className = "date-sep";
sep.textContent = lastDate;
mount.appendChild(sep);
}
const sideRight = (you && m.sender === you) ^ state.flipSides;
const msgEl = document.createElement("div");
msgEl.className = "msg " + (sideRight ? "right" : "left");


// Author (hide for me? Keep small)
const author = document.createElement("div");
author.className = "author";
author.textContent = m.sender;
msgEl.appendChild(author);


// Text
if(m.text){
const txt = document.createElement("div");
txt.className = "text";
txt.innerHTML = linkify(escapeHtml(m.text));
msgEl.appendChild(txt);
}


// Attachments
if(m.attachments && m.attachments.length){
for(const a of m.attachments){
const wrap = document.createElement("div");
wrap.className = "attachment";
// try to resolve in zip
injectAttachment(wrap, a).catch(()=>{
wrap.textContent = `Attachment missing: ${a}`;
});
msgEl.appendChild(wrap);
}
}


// Time
const time = document.createElement("div");
time.className = "time";
time.textContent = m.time + (m.edited ? " • edited" : "");
msgEl.appendChild(time);


mount.appendChild(msgEl);
}


async function injectAttachment(container, filename){
const z = state.current?.zip;
if(!z) throw new Error("No zip");
const entry = z.file(new RegExp(`(^|/)${escapeRegex(filename)}$`))[0];
if(!entry) throw new Error("Not found in zip: " + filename);
const blob = await entry.async("blob");
const url = URL.createObjectURL(blob);
const ext = filename.split(".").pop().toLowerCase();
if(["jpg","jpeg","png","gif","webp","bmp"].includes(ext)){
const img = document.createElement("img");
img.alt = filename;
img.src = url;
container.appendChild(img);
}else if(["mp4","webm","mov","m4v"].includes(ext)){
const vid = document.createElement("video");
vid.controls = true;
vid.src = url;
container.appendChild(vid);
}else{
const a = document.createElement("a");
a.href = url; a.download = filename; a.textContent = "Download " + filename;
container.appendChild(a);
}
}// ---- Utils ----
function fetchAsArrayBuffer(url){
return fetch(url).then(r=>{
if(!r.ok) throw new Error("HTTP " + r.status);
return r.arrayBuffer();
});
}


function stripExt(name){ return name.replace(/\.zip$/i,""); }
function escapeHtml(s){
return s.replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function linkify(text){
return text.replace(/(https?:\/\/[\w\-._~:\/?#[\]@!$&'()*+,;=%]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function status(msg){ $("#statusbar").textContent = msg; }


let busyCount = 0;
function startBusy(msg){ busyCount++; status(msg || "Working…"); document.body.style.cursor = "progress"; }
function endBusy(){ busyCount = Math.max(0, busyCount-1); if(busyCount===0){ status("Ready."); document.body.style.cursor="default"; }}


function guessYou(participants){
// Heuristic: if exactly 2 people, pick the one whose name includes "❤" or "💕" as "you"; otherwise leave unset
if(participants.length === 2){
const p = participants.find(n => /❤|💕|💖|💘/.test(n));
return p || null;
}
return null;
}


// Load saved GH config
(function initSavedGH(){
const saved = JSON.parse(localStorage.getItem("wcv.gh") || "null");
if(saved){
$("#ghOwner").value = saved.owner || "";
$("#ghRepo").value = saved.repo || "";
$("#ghBranch").value= saved.branch || "";
$("#ghPath").value = saved.path || "";
}
})();


// Persist config on loadGitHub
const _loadGitHub = loadGitHub;
loadGitHub = async function(opts){
localStorage.setItem("wcv.gh", JSON.stringify(opts));
await _loadGitHub(opts);
};


})();