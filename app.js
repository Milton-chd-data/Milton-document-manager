// 1) Replace both values below with your Supabase project details.
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
const BUCKET = "documents";

const $ = (id) => document.getElementById(id);
const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_SUPABASE") &&
  SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE");
let db = null;
let currentUser = null;
let allDocuments = [];

function message(id, text, type = "") {
  const el = $(id);
  el.textContent = text;
  el.className = "message" + (type ? " " + type : "");
}
function setBusy(button, busy, busyText) {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalText;
}
function safeDate(value) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}
function cleanFileName(name) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
}
function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
}
function showSignedIn(user) {
  currentUser = user || null;
  $("authPanel").classList.toggle("hidden", !!user);
  $("appPanel").classList.toggle("hidden", !user);
  if (user) {
    $("userEmail").textContent = user.email || "";
    loadDocuments();
  } else {
    allDocuments = [];
    $("documentRows").replaceChildren();
  }
}
async function loadDocuments() {
  if (!currentUser) return;
  $("loading").classList.remove("hidden");
  $("emptyState").classList.add("hidden");
  try {
    const { data, error } = await db.from("documents")
      .select("id,title,category,document_date,notes,storage_path,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    allDocuments = data || [];
    renderDocuments();
  } catch (err) {
    message("uploadMessage", "Could not load documents: " + err.message, "error");
  } finally {
    $("loading").classList.add("hidden");
  }
}
function renderDocuments() {
  const q = $("search").value.trim().toLowerCase();
  const filtered = allDocuments.filter(d =>
    [d.title, d.category, d.notes, d.document_date].some(v => String(v || "").toLowerCase().includes(q))
  );
  const tbody = $("documentRows");
  tbody.replaceChildren();
  $("emptyState").classList.toggle("hidden", filtered.length !== 0);
  for (const d of filtered) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><div class="doc-name">${escapeText(d.title)}</div>
          ${d.notes ? `<div class="doc-notes">${escapeText(d.notes)}</div>` : ""}</td>
      <td>${escapeText(d.category || "Other")}</td>
      <td>${escapeText(safeDate(d.document_date))}</td>
      <td><div class="actions">
        <button type="button" data-action="open" data-id="${escapeText(d.id)}">Open PDF</button>
        <button type="button" class="secondary" data-action="delete" data-id="${escapeText(d.id)}">Delete</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}
async function uploadDocument(event) {
  event.preventDefault();
  if (!currentUser) return;
  const file = $("pdfFile").files[0];
  if (!file) return message("uploadMessage", "Please choose a PDF file.", "error");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    return message("uploadMessage", "Only PDF files are allowed.", "error");
  if (file.size > 50 * 1024 * 1024)
    return message("uploadMessage", "This file is larger than 50 MB. Choose a smaller PDF.", "error");
  const btn = $("uploadBtn");
  setBusy(btn, true, "Uploading…");
  message("uploadMessage", "");
  const path = `${currentUser.id}/${crypto.randomUUID()}-${cleanFileName(file.name)}`;
  try {
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, {
      contentType: "application/pdf", upsert: false
    });
    if (uploadError) throw uploadError;
    const { error: insertError } = await db.from("documents").insert({
      owner_id: currentUser.id,
      title: $("docTitle").value.trim(),
      category: $("category").value,
      document_date: $("docDate").value || null,
      notes: $("notes").value.trim() || null,
      storage_path: path,
      original_file_name: file.name
    });
    if (insertError) {
      await db.storage.from(BUCKET).remove([path]);
      throw insertError;
    }
    $("uploadForm").reset();
    message("uploadMessage", "PDF uploaded successfully.", "success");
    await loadDocuments();
  } catch (err) {
    message("uploadMessage", "Upload failed: " + err.message, "error");
  } finally {
    setBusy(btn, false);
  }
}
async function openDocument(id) {
  const d = allDocuments.find(item => item.id === id);
  if (!d) return;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 60);
  if (error) return alert("Could not open PDF: " + error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
async function deleteDocument(id) {
  const d = allDocuments.find(item => item.id === id);
  if (!d || !confirm(`Delete "${d.title}" and its PDF? This cannot be undone.`)) return;
  try {
    const { error: fileError } = await db.storage.from(BUCKET).remove([d.storage_path]);
    if (fileError) throw fileError;
    const { error: rowError } = await db.from("documents").delete().eq("id", id);
    if (rowError) throw rowError;
    await loadDocuments();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}

if (!configured || !window.supabase) {
  $("setupNotice").classList.remove("hidden");
  $("authPanel").classList.remove("hidden");
  $("authForm").addEventListener("submit", e => {
    e.preventDefault();
    message("authMessage", "First configure your Supabase URL and publishable key in app.js.", "error");
  });
  $("signUpBtn").addEventListener("click", () =>
    message("authMessage", "First configure your Supabase URL and publishable key in app.js.", "error"));
} else {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("signInBtn"); setBusy(btn, true, "Signing in…");
    message("authMessage", "");
    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: $("email").value.trim(), password: $("password").value
      });
      if (error) throw error;
      showSignedIn(data.user);
    } catch (err) { message("authMessage", err.message, "error"); }
    finally { setBusy(btn, false); }
  });
  $("signUpBtn").addEventListener("click", async () => {
    const btn = $("signUpBtn"); setBusy(btn, true, "Creating…");
    message("authMessage", "");
    try {
      const { data, error } = await db.auth.signUp({
        email: $("email").value.trim(), password: $("password").value
      });
      if (error) throw error;
      if (data.session) showSignedIn(data.user);
      else message("authMessage", "Account request sent. Check your email to confirm, then sign in.", "success");
    } catch (err) { message("authMessage", err.message, "error"); }
    finally { setBusy(btn, false); }
  });
  $("signOutBtn").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();
    if (error) return alert(error.message);
    showSignedIn(null);
  });
  $("uploadForm").addEventListener("submit", uploadDocument);
  $("search").addEventListener("input", renderDocuments);
  $("refreshBtn").addEventListener("click", loadDocuments);
  $("documentRows").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "open") await openDocument(btn.dataset.id);
    if (btn.dataset.action === "delete") await deleteDocument(btn.dataset.id);
  });
  db.auth.getSession().then(({ data }) => showSignedIn(data.session?.user || null));
  db.auth.onAuthStateChange((_event, session) => {
    if ((session?.user?.id || null) !== (currentUser?.id || null))
      showSignedIn(session?.user || null);
  });
}
