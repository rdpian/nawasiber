const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
function normalize(value, category) {
  let v = String(value || "").trim().toLowerCase();
  if (category === "phone" || category === "account") v = v.replace(/[^\d+]/g, "");
  if (category === "domain" || category === "judol" || category === "phishing") {
    try { v = new URL(v.includes("://") ? v : `https://${v}`).hostname.toLowerCase(); }
    catch { v = v.replace(/^https?:\/\//, "").split("/")[0]; }
  }
  return v.slice(0, 180);
}
function validCategory(c) {
  return ["phone","account","email","domain","judol","phishing","other"].includes(c);
}
function validHttpUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return ["http:","https:"].includes(u.protocol) && !u.username && !u.password;
  } catch { return false; }
}
async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Backend belum dikonfigurasi. Isi environment variables Supabase di Netlify.");
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    const message = data?.message || data?.msg || data?.error_description || `Supabase error ${response.status}`;
    throw new Error(message);
  }
  return data;
}
async function getUser(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}
async function publicStats() {
  const data = await supabase("/rest/v1/reports?select=id,category,severity,created_at&status=eq.verified&order=created_at.desc&limit=1000");
  const byCategory = {};
  const bySeverity = {};
  for (const row of data || []) {
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
  }
  return { verified_total: data.length, by_category: byCategory, by_severity: bySeverity };
}
async function handle(request) {
  if (request.method !== "POST") return reply({ ok:false, error:"Gunakan POST." }, 405);
  let body;
  try { body = await request.json(); } catch { return reply({ok:false,error:"JSON tidak valid."},400); }
  const action = String(body.action || "");

  if (action === "register" || action === "login") {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return reply({ok:false,error:"Supabase Auth belum dikonfigurasi."},503);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
      return reply({ok:false,error:"Email tidak valid atau password kurang dari 8 karakter."},400);
    }
    const endpoint = action === "register" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
    const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
      method:"POST",
      headers:{ apikey:SUPABASE_ANON_KEY, "content-type":"application/json" },
      body:JSON.stringify({email,password}),
      signal:AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return reply({ok:false,error:result.msg || result.message || result.error_description || "Autentikasi gagal."},400);
    return reply({ok:true, session:result, message:action === "register" ? "Pendaftaran berhasil. Periksa email jika verifikasi email diaktifkan." : "Login berhasil."});
  }

  if (action === "submit_report") {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i,"");
    const user = await getUser(token);
    if (!user?.id) return reply({ok:false,error:"Silakan login sebelum mengirim laporan."},401);

    const category = String(body.category || "");
    const identifier = String(body.identifier || "").trim().slice(0,180);
    const title = String(body.title || "").trim().slice(0,120);
    const description = String(body.description || "").trim().slice(0,2500);
    const evidence_url = String(body.evidence_url || "").trim().slice(0,500);
    const source_url = String(body.source_url || "").trim().slice(0,500);

    if (!validCategory(category) || identifier.length < 4 || title.length < 5 || description.length < 15) {
      return reply({ok:false,error:"Lengkapi kategori, identifier, judul (min. 5 karakter), dan kronologi (min. 15 karakter)."},400);
    }
    if (!validHttpUrl(evidence_url) || !validHttpUrl(source_url)) return reply({ok:false,error:"URL bukti/sumber harus berupa HTTP atau HTTPS yang valid."},400);

    const normalized = normalize(identifier, category);
    const inserted = await supabase("/rest/v1/reports", {
      method:"POST",
      headers:{ Prefer:"return=representation" },
      body:JSON.stringify({
        reporter_id:user.id, category, identifier, identifier_normalized:normalized,
        title, description, evidence_url:evidence_url || null, source_url:source_url || null,
        status:"pending", severity:"unassessed"
      })
    });
    return reply({ok:true, report:inserted?.[0] || null, message:"Laporan diterima dan menunggu verifikasi moderator."},201);
  }

  if (action === "check") {
    const category = String(body.category || "");
    const identifier = String(body.identifier || "").trim();
    if (!validCategory(category) || identifier.length < 4 || identifier.length > 180) {
      return reply({ok:false,error:"Kategori atau identifier tidak valid."},400);
    }
    const normalized = normalize(identifier, category);
    const q = `/rest/v1/reports?select=id,category,identifier,title,description,severity,created_at,reviewed_at&identifier_normalized=eq.${encodeURIComponent(normalized)}&status=eq.verified&order=reviewed_at.desc&limit=30`;
    const matches = await supabase(q);
    return reply({
      ok:true, matches:matches || [], match_count:(matches || []).length,
      verdict:matches?.length ? "COMMUNITY_REPORT_FOUND" : "NO_VERIFIED_REPORT",
      note:matches?.length
        ? "Ditemukan laporan komunitas yang telah melalui proses moderasi. Ini bukan putusan hukum atau bukti bahwa pemilik identifier bersalah."
        : "Belum ditemukan laporan komunitas terverifikasi. Tidak berarti identifier ini pasti aman."
    });
  }

  if (action === "stats") {
    const stats = await publicStats();
    return reply({ok:true,stats});
  }

  if (action === "admin_queue" || action === "admin_review") {
    const adminKey = request.headers.get("x-admin-key") || "";
    if (!ADMIN_API_KEY || adminKey.length < 20 || adminKey !== ADMIN_API_KEY) {
      return reply({ok:false,error:"Akses administrator ditolak."},403);
    }
    if (action === "admin_queue") {
      const rows = await supabase("/rest/v1/reports?select=*&status=in.(pending,review)&order=created_at.asc&limit=100");
      return reply({ok:true,reports:rows || []});
    }
    const id = String(body.id || "");
    const status = String(body.status || "");
    const severity = String(body.severity || "unassessed");
    const admin_note = String(body.admin_note || "").trim().slice(0,1000);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["review","verified","rejected"].includes(status) ||
        !["unassessed","low","medium","high"].includes(severity)) {
      return reply({ok:false,error:"Parameter moderasi tidak valid."},400);
    }
    const updated = await supabase(`/rest/v1/reports?id=eq.${id}`, {
      method:"PATCH",
      headers:{Prefer:"return=representation"},
      body:JSON.stringify({
        status, severity, admin_note, reviewed_by:"nawasiber-admin",
        reviewed_at:new Date().toISOString()
      })
    });
    return reply({ok:true,report:updated?.[0] || null,message:"Status laporan diperbarui."});
  }

  return reply({ok:false,error:"Action tidak dikenal."},404);
}

export default async (request) => {
  try { return await handle(request); }
  catch (error) {
    return reply({ok:false,error:error?.message || "Terjadi kesalahan server."},500);
  }
};
