const SUPABASE_URL = "https://yagfecxodwsmkwayqsbe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vGBjV-Gag4mgQyYElUrypQ_1D7FG-er";
const BUCKET = "documents";
const ADMIN_EMAIL = "sourav.miltonlifecare@gmail.com";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const $ = id => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let allDocuments = [];
let pendingUsers = [];
let sessionCheckInProgress = false;

const isAdmin = () =>
  (currentUser?.email || "").toLowerCase() === ADMIN_EMAIL;

const DRIVE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-drive-storage`;

async function driveRequest(action, { method = "GET", id = "", body = null } = {}) {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your login session has expired. Please sign in again.");

  const url = new URL(DRIVE_FUNCTION_URL);
  url.searchParams.set("action", action);
  if (id) url.searchParams.set("id", id);

  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`
  };
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined)
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const result = await response.json();
      detail = result.error || result.message || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return response;
}

function isLegacyStoragePath(path) {
  return String(path || "").includes("/");
}

function message(id, text, type = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = "message" + (type ? " " + type : "");
}

function busy(btn, value, text = "Please wait…") {
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
  btn.disabled = value;
  btn.textContent = value ? text : btn.dataset.originalText;
}

function safeDate(value) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? value + "T00:00:00" : value);
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

function setSignedOutUI() {
  currentUser = null;
  allDocuments = [];
  pendingUsers = [];
  $("authPanel").classList.remove("hidden");
  $("appPanel").classList.add("hidden");
  $("adminPanel")?.classList.add("hidden");
  $("documentRows").replaceChildren();
  $("pendingUserRows")?.replaceChildren();
}

async function activateSession(user) {
  if (!user || sessionCheckInProgress) return;
  sessionCheckInProgress = true;
  try {
    const email = (user.email || "").toLowerCase();
    const admin = email === ADMIN_EMAIL;

    const { data: profile, error } = await db
      .from("user_profiles")
      .select("user_id,email,approved,status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      await db.auth.signOut();
      setSignedOutUI();
      message("authMessage", "Could not verify account approval. Please contact the admin. Details: " + error.message, "error");
      return;
    }

    if (!admin && (!profile || profile.approved !== true || profile.status === "rejected")) {
      await db.auth.signOut();
      setSignedOutUI();
      const text = profile?.status === "rejected"
        ? "Your registration was rejected. Please contact the administrator."
        : "Your account is waiting for admin approval. You can sign in after the admin approves it.";
      message("authMessage", text, "error");
      return;
    }

    if (admin && !profile) {
      // Admin access is still restricted to the exact configured admin email.
      // The profile should normally exist because the admin record was added earlier.
      message("authMessage", "Admin profile is missing in user_profiles. Ask the project admin to restore it.", "error");
      await db.auth.signOut();
      setSignedOutUI();
      return;
    }

    showSignedIn(user);
  } finally {
    sessionCheckInProgress = false;
  }
}

function showSignedIn(user) {
  currentUser = user || null;
  $("authPanel").classList.toggle("hidden", !!user);
  $("appPanel").classList.toggle("hidden", !user);

  if (!user) {
    allDocuments = [];
    $("documentRows").replaceChildren();
    $("adminPanel")?.classList.add("hidden");
    return;
  }

  $("userEmail").textContent =
    user.email + (isAdmin() ? " · Admin" : " · Employee");

  $("uploadPanel").classList.remove("hidden");
  $("uploadForm").querySelector("button[type=submit]").textContent = "Upload document";

  if (isAdmin()) {
    $("adminPanel")?.classList.remove("hidden");
    addDriveConnectButton();
    loadPendingUsers();
  } else {
    $("adminPanel")?.classList.add("hidden");
  }
  loadDocuments();
}

function addDriveConnectButton() {
  const panel = $("adminPanel");
  if (!panel || $("connectDriveBtn")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "connectDriveBtn";
  button.textContent = "Connect Google Drive";
  button.style.marginBottom = "12px";
  button.addEventListener("click", connectGoogleDrive);
  panel.prepend(button);
}

async function connectGoogleDrive() {
  const button = $("connectDriveBtn");
  busy(button, true, "Connecting…");
  try {
    const response = await driveRequest("authorize");
    const result = await response.json();
    if (!result.authorization_url) throw new Error(result.error || "Authorization link was not returned.");
    window.location.href = result.authorization_url;
  } catch (err) {
    alert("Could not connect Google Drive: " + err.message);
    busy(button, false);
  }
}

async function loadDocuments() {
  if (!currentUser) return;
  $("loading").classList.remove("hidden");
  message("uploadMessage", "");

  try {
    const response = await driveRequest("list");
    const result = await response.json();
    allDocuments = result.documents || [];
    renderDocuments();
  } catch (err) {
    message("uploadMessage", "Could not load documents: " + err.message, "error");
  } finally {
    $("loading").classList.add("hidden");
  }
}

async function loadPendingUsers() {
  if (!isAdmin()) return;
  const statusEl = $("approvalMessage");
  if (statusEl) message("approvalMessage", "Loading pending registrations…");
  try {
    const { data, error } = await db.from("user_profiles")
      .select("user_id,email,approved,status,created_at")
      .eq("approved", false)
      .neq("status", "rejected")
      .order("created_at", { ascending: true });
    if (error) throw error;
    pendingUsers = (data || []).filter(u => (u.email || "").toLowerCase() !== ADMIN_EMAIL);
    renderPendingUsers();
    message("approvalMessage", pendingUsers.length
      ? `${pendingUsers.length} account(s) waiting for approval.`
      : "No pending registrations.", "success");
  } catch (err) {
    message("approvalMessage", "Could not load pending users: " + err.message, "error");
  }
}

function renderPendingUsers() {
  const tbody = $("pendingUserRows");
  if (!tbody) return;
  tbody.replaceChildren();
  $("noPendingUsers")?.classList.toggle("hidden", pendingUsers.length > 0);

  for (const u of pendingUsers) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeText(u.email || "(no email)")}</td>
      <td>${escapeText(safeDate(u.created_at))}</td>
      <td><div class="actions">
        <button type="button" data-user-action="approve" data-user-id="${escapeText(u.user_id)}">Approve</button>
        <button type="button" class="secondary" data-user-action="reject" data-user-id="${escapeText(u.user_id)}">Reject</button>
      </div></td>`;
    tbody.appendChild(tr);
  }
}

async function updateUserApproval(userId, action) {
  if (!isAdmin()) return alert("Only the Admin can approve or reject registrations.");
  const user = pendingUsers.find(u => u.user_id === userId);
  if (!user) return;
  if (action === "reject" && !confirm(`Reject registration for ${user.email}?`)) return;

  const approve = action === "approve";
  const { error } = await db.from("user_profiles")
    .update({ approved: approve, status: approve ? "approved" : "rejected" })
    .eq("user_id", userId);

  if (error) {
    alert("Could not update approval: " + error.message);
    return;
  }
  await loadPendingUsers();
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
        <button type="button" data-action="open" data-id="${escapeText(d.id)}">Open / Download</button>
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

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", $("docTitle").value.trim());
    formData.append("category", $("category").value);
    formData.append("document_date", $("docDate").value || "");
    formData.append("notes", $("notes").value.trim());

    const response = await driveRequest("upload", { method: "POST", body: formData });
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    $("uploadForm").reset();
    message("uploadMessage", "Document uploaded successfully to Google Drive.", "success");
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

  try {
    if (isLegacyStoragePath(d.storage_path)) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const response = await driveRequest("download", { id: d.storage_path });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, "_blank");
    if (!opened) {
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = d.original_file_name || d.title || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (err) {
    alert("Could not open file: " + err.message);
  }
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

  try {
    if (isLegacyStoragePath(d.storage_path)) {
      const { error } = await db.from("documents").update({
        title: title.trim(),
        notes: notes.trim() || null
      }).eq("id", id);
      if (error) throw error;
    } else {
      const response = await driveRequest("update", {
        method: "PATCH",
        id: d.storage_path,
        body: { title: title.trim(), notes: notes.trim() || null }
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
    }
    await loadDocuments();
  } catch (err) {
    alert("Edit failed: " + err.message);
  }
}

async function deleteDocument(id) {
  if (!isAdmin()) return alert("Only the Admin can delete documents.");
  const d = allDocuments.find(x => x.id === id);
  if (!d || !confirm(`Delete "${d.title}" and its file? This cannot be undone.`)) return;

  try {
    if (isLegacyStoragePath(d.storage_path)) {
      const { error: fileError } = await db.storage.from(BUCKET).remove([d.storage_path]);
      if (fileError) throw fileError;
      const { error: rowError } = await db.from("documents").delete().eq("id", id);
      if (rowError) throw rowError;
    } else {
      const response = await driveRequest("delete", { method: "DELETE", id: d.storage_path });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
    }
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
    await activateSession(data.user);
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
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || password.length < 6) {
      message("authMessage", "Enter a valid email and a password of at least 6 characters.", "error");
      return;
    }
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;

    // The database trigger creates the pending profile automatically.
    message("authMessage",
      data.session
        ? "Account created. It must be approved by the admin before you can sign in."
        : "Registration submitted. Confirm your email if requested. The admin must approve your account before login.",
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
  setSignedOutUI();
});

$("uploadForm").addEventListener("submit", uploadDocument);
$("search").addEventListener("input", renderDocuments);
$("refreshBtn").addEventListener("click", loadDocuments);
$("refreshPendingBtn")?.addEventListener("click", loadPendingUsers);

$("pendingUserRows")?.addEventListener("click", async e => {
  const btn = e.target.closest("button[data-user-action]");
  if (!btn) return;
  await updateUserApproval(btn.dataset.userId, btn.dataset.userAction);
});

$("documentRows").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "open") await openDocument(btn.dataset.id);
  if (btn.dataset.action === "edit") await editDocument(btn.dataset.id);
  if (btn.dataset.action === "delete") await deleteDocument(btn.dataset.id);
});

db.auth.getSession().then(({ data, error }) => {
  if (error) {
    message("authMessage", "Could not restore session: " + error.message, "error");
    return;
  }
  if (data.session?.user) activateSession(data.session.user);
});
db.auth.onAuthStateChange((_event, session) => {
  if (!session?.user) {
    setSignedOutUI();
  } else if ((session.user.id || null) !== (currentUser?.id || null)) {
    setTimeout(() => activateSession(session.user), 0);
  }
});
