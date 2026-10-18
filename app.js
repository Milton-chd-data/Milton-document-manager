
const SUPABASE_URL = "https://yagfecxodwsmkwayqsbe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vGBjV-Gag4mgQyYElUrypQ_1D7FG-er";
const BUCKET = "documents";
const ADMIN_EMAIL = "sourav.miltonlifecare@gmail.com";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const $ = id => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let allDocuments = [];

const isAdmin = () =>
  (currentUser?.email || "").toLowerCase() === ADMIN_EMAIL;

function message(id, text, type = "") {
  const el = $(id);
  el.textContent = text;
  el.className = "message" + (type ? " " + type : "");
}

function busy(btn, value, text = "Please wait…") {
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
  btn.disabled = value;
  btn.textContent = value ? text : btn.dataset.originalText;
}

function safeDate(value) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function cleanName(name) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function showSignedIn(user) {
  currentUser = user || null;
  $("authPanel").classList.toggle("hidden", !!user);
  $("appPanel").classList.toggle("hidden", !user);

  if (!user) {
    allDocuments = [];
    $("documentRows").replaceChildren();
    return;
  }

  $("userEmail").textContent =
    user.email + (isAdmin() ? " · Admin" : " · Employee");

  $("uploadPanel").classList.remove("hidden");
  $("uploadForm").querySelector("button[type=submit]").textContent =
    "Upload document";

  loadDocuments();
}

async function loadDocuments() {
  if (!currentUser) return;

  $("loading").classList.remove("hidden");
  message("uploadMessage", "");

  try {
    const { data, error } = await db.from("documents")
      .select("id,title,category,document_date,notes,storage_path,original_file_name,owner_id,created_at")
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
    [d.title, d.category, d.notes, d.document_date, d.original_file_name]
      .some(v => String(v || "").toLowerCase().includes(q))
  );

  const tbody = $("documentRows");
  tbody.replaceChildren();
  $("emptyState").classList.toggle("hidden", filtered.length > 0);

  for (const d of filtered) {
    const tr = document.createElement("tr");
    const fileName = d.original_file_name || "Document";
    const adminButtons = isAdmin()
      ? `<button type="button" class="secondary" data-action="edit" data-id="${escapeText(d.id)}">Edit</button>
         <button type="button" class="secondary" data-action="delete" data-id="${escapeText(d.id)}">Delete</button>`
      : "";

    tr.innerHTML = `
      <td>
        <div class="doc-name">${escapeText(d.title)}</div>
        <div class="doc-notes">${escapeText(fileName)}</div>
        ${d.notes ? `<div class="doc-notes">${escapeText(d.notes)}</div>` : ""}
      </td>
      <td>${escapeText(d.category || "Other")}</td>
      <td>${escapeText(safeDate(d.document_date))}</td>
      <td><div class="actions">
        <button type="button" data-action="open" data-id="${escapeText(d.id)}">Open</button>
        ${adminButtons}
      </div></td>`;
    tbody.appendChild(tr);
  }
}

async function uploadDocument(event) {
  event.preventDefault();
  if (!currentUser) return;

  const file = $("uploadFile").files[0];
  if (!file) return message("uploadMessage", "Choose a photo or PDF first.", "error");

  const allowedTypes = [
    "application/pdf", "image/jpeg", "image/png",
    "image/webp", "image/heic", "image/heif"
  ];
  if (!allowedTypes.includes(file.type)) {
    return message("uploadMessage", "Only PDF, JPG, PNG, WEBP or HEIC photos are allowed.", "error");
  }

  if (file.size > MAX_FILE_SIZE) {
    return message("uploadMessage", "File is larger than 50 MB.", "error");
  }

  const btn = $("uploadBtn");
  busy(btn, true, "Uploading…");
  message("uploadMessage", "");

  const path = `${currentUser.id}/${crypto.randomUUID()}-${cleanName(file.name)}`;

  try {
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false
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
    message("uploadMessage", "Document uploaded successfully.", "success");
    await loadDocuments();
  } catch (err) {
    message("uploadMessage", "Upload failed: " + err.message, "error");
  } finally {
    busy(btn, false);
  }
}

async function openDocument(id) {
  const d = allDocuments.find(x => x.id === id);
  if (!d) return;

  const { data, error } = await db.storage.from(BUCKET)
    .createSignedUrl(d.storage_path, 60);

  if (error) return alert("Could not open file: " + error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function editDocument(id) {
  if (!isAdmin()) return alert("Only the Admin can edit documents.");

  const d = allDocuments.find(x => x.id === id);
  if (!d) return;

  const title = prompt("Document name:", d.title);
  if (title === null) return;
  if (!title.trim() || title.trim().length > 120) {
    return alert("Name must be between 1 and 120 characters.");
  }

  const notes = prompt("Notes:", d.notes || "");
  if (notes === null) return;

  const { error } = await db.from("documents").update({
    title: title.trim(),
    notes: notes.trim() || null
  }).eq("id", id);

  if (error) return alert("Edit failed: " + error.message);
  await loadDocuments();
}

async function deleteDocument(id) {
  if (!isAdmin()) return alert("Only the Admin can delete documents.");

  const d = allDocuments.find(x => x.id === id);
  if (!d || !confirm(`Delete "${d.title}" and its file? This cannot be undone.`)) return;

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

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("signInBtn");
  busy(btn, true, "Signing in…");
  message("authMessage", "");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });
    if (error) throw error;
    showSignedIn(data.user);
  } catch (err) {
    message("authMessage", err.message, "error");
  } finally {
    busy(btn, false);
  }
});

$("signUpBtn").addEventListener("click", async () => {
  const btn = $("signUpBtn");
  busy(btn, true, "Creating…");
  message("authMessage", "");

  try {
    const { data, error } = await db.auth.signUp({
      email: $("email").value.trim(),
      password: $("password").value
    });
    if (error) throw error;

    message("authMessage",
      data.session
        ? "Account created. You can now sign in."
        : "Check your email to confirm your account, then sign in.",
      "success");
  } catch (err) {
    message("authMessage", err.message, "error");
  } finally {
    busy(btn, false);
  }
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
  if (btn.dataset.action === "edit") await editDocument(btn.dataset.id);
  if (btn.dataset.action === "delete") await deleteDocument(btn.dataset.id);
});

db.auth.getSession().then(({ data }) => showSignedIn(data.session?.user || null));
db.auth.onAuthStateChange((_event, session) => {
  if ((session?.user?.id || null) !== (currentUser?.id || null)) {
    showSignedIn(session?.user || null);
  }
});
