import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const publicSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || "https://rolling-paper-plum.vercel.app").replace(/\/$/, "");
const internalAuthDomain = "rolling-paper-admin.app";

function adminIdToEmail(adminId) {
  const raw = String(adminId || "").trim().toLowerCase();
  if (raw.includes("@")) return raw;

  const safeId = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%/g, "x")
    .replace(/[^a-z0-9._-]/g, "x")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64) || "admin";

  return `${safeId}@${internalAuthDomain}`;
}

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const fallback = {
  tracks: [],
  profile: null,
};

function slugify(text) {
  const base = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `item-${Date.now()}`;
}

function uniqueSlug(text) {
  return `${slugify(text)}-${Date.now().toString(36)}`;
}

function safeEncodeRoutePart(value = "") {
  return encodeURIComponent(value);
}

function safeDecodeRoutePart(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getCurrentHash() {
  return window.location.hash.replace("#", "");
}

function isPublicHash(hash = getCurrentHash()) {
  return hash.startsWith("/t/");
}

function isAdminHash(hash = getCurrentHash()) {
  return hash.startsWith("/admin/");
}

const ROLE_ORDER = { 튜터: 0, 매니저: 1, 수강생: 2 };
const ROLE_LABELS = ["튜터", "매니저", "수강생"];
const ROLE_CLASS = { 튜터: "tutor", 매니저: "manager", 수강생: "student" };

function normalizeRole(role) {
  return ROLE_LABELS.includes(role) ? role : "수강생";
}

function roleType(role) {
  return ROLE_CLASS[normalizeRole(role)] || "student";
}

function sortPeople(people = []) {
  return [...people].sort((a, b) => {
    const roleDiff = ROLE_ORDER[normalizeRole(a.role)] - ROLE_ORDER[normalizeRole(b.role)];
    if (roleDiff !== 0) return roleDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR");
  });
}

function parsePeopleInput(raw) {
  let currentRole = "수강생";

  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const cleaned = line.replace(/^[-•\s]+/, "").trim();
      const sectionName = cleaned.replace(/[\[\]():：]/g, "").trim();

      if (ROLE_LABELS.includes(sectionName)) {
        currentRole = sectionName;
        return [];
      }

      const prefixed = cleaned.match(/^(튜터|매니저|수강생)\s*[:：-]?\s+(.+)$/);
      if (prefixed) {
        return [{ name: prefixed[2].trim(), role: normalizeRole(prefixed[1]) }];
      }

      return [{ name: cleaned, role: currentRole }];
    })
    .filter((person) => person.name);
}


function parseRoleNames(raw, role) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      name: line.replace(/^[-•\s]+/, "").trim(),
      role: normalizeRole(role),
    }))
    .filter((person) => person.name);
}

function roleCounts(people = []) {
  return people.reduce(
    (counts, person) => {
      counts[normalizeRole(person.role)] += 1;
      return counts;
    },
    { 튜터: 0, 매니저: 0, 수강생: 0 }
  );
}

function groupPeopleByRole(people = []) {
  const grouped = { 튜터: [], 매니저: [], 수강생: [] };
  sortPeople(people).forEach((person) => {
    grouped[normalizeRole(person.role)].push(person);
  });
  return grouped;
}

function overallBoardTitle(track) {
  const base = String(track?.title || "전체")
    .replace(/롤링페이퍼/g, "")
    .replace(/페이지/g, "")
    .trim();

  return `${base || "전체"} 전체에게 쓰는 편지`;
}

function RoleBadge({ role }) {
  const normalized = normalizeRole(role);
  return <span className={`role-badge role-${roleType(normalized)}`}>{normalized}</span>;
}

function RoleMeta({ people }) {
  const counts = roleCounts(people);
  return (
    <div className="meta">
      {ROLE_LABELS.map((role) => (
        <span className="pill" key={role}>{role} {counts[role]}명</span>
      ))}
    </div>
  );
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard API failed, trying fallback", error);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch (error) {
    console.warn("Fallback copy failed", error);
    return false;
  }
}


function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(fallback.profile);
  const [view, setView] = useState(isPublicHash() ? "publicLoading" : "login");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [studentMode, setStudentMode] = useState("public");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingLetter, setEditingLetter] = useState(null);
  const [editingTrackLetter, setEditingTrackLetter] = useState(null);
  const [nameModal, setNameModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const isConfigured = Boolean(supabase);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 1600);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session && !isPublicHash() && !isAdminHash()) {
        setView("workspace");
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession && !isPublicHash() && !isAdminHash()) setView("workspace");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) return;

    const initPrivateRoute = async () => {
      await loadProfile();
      await loadTracks();

      const hash = getCurrentHash();
      if (isAdminHash(hash)) {
        await openAdminFromHash(hash);
      }
    };

    initPrivateRoute();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!supabase) return;

    const openPublicRoute = () => {
      const hash = getCurrentHash();
      if (!isPublicHash(hash)) return;
      setView("publicLoading");
      openPublicFromHash(hash);
    };

    openPublicRoute();
    window.addEventListener("hashchange", openPublicRoute);
    return () => window.removeEventListener("hashchange", openPublicRoute);
  }, [isConfigured]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      showToast(error.message);
      return;
    }

    if (data) {
      setProfile(data);
      return;
    }

    const meta = session.user.user_metadata || {};
    const fallbackProfile = {
      id: session.user.id,
      manager_name: meta.manager_name || "",
      position: meta.position || "",
      track_name: meta.track_name || "",
      batch_name: meta.batch_name || "",
      phone: meta.phone || "",
      email: session.user.email || meta.email || "",
    };

    const { data: createdProfile, error: insertError } = await supabase
      .from("profiles")
      .insert(fallbackProfile)
      .select()
      .single();

    if (insertError) {
      console.error("Profile auto-create failed", insertError);
      setProfile(fallbackProfile);
      showToast("내 정보가 비어 있습니다. 내 정보에서 저장해주세요.");
      return;
    }

    setProfile(createdProfile);
  }

  async function loadTracks() {
    if (!session?.user?.id) {
      setTracks([]);
      return;
    }

    const { data, error } = await supabase
      .from("tracks")
      .select("*, students(*), letters(*), track_letters(*)")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      showToast(error.message);
      return;
    }

    setTracks(data || []);
  }

  async function openPublicFromHash(hash) {
    const parts = hash.split("/").filter(Boolean);
    const trackKey = safeDecodeRoutePart(parts[1] || "");
    const studentKey = safeDecodeRoutePart(parts[2] || "");

    let track = null;
    let error = null;

    const byId = await supabase
      .from("tracks")
      .select("*, students(*), letters(*), track_letters(*)")
      .eq("id", trackKey)
      .maybeSingle();

    if (byId.data) {
      track = byId.data;
    } else {
      const bySlug = await supabase
        .from("tracks")
        .select("*, students(*), letters(*), track_letters(*)")
        .eq("slug", trackKey)
        .maybeSingle();

      track = bySlug.data;
      error = bySlug.error || byId.error;
    }

    if (error || !track) {
      console.error("Public track load failed", { trackKey, error });
      setCurrentTrack(null);
      setCurrentStudent(null);
      setView("publicError");
      showToast("공개 링크 데이터를 찾을 수 없습니다.");
      return;
    }

    setCurrentTrack(track);
    setCurrentStudent(null);
    setStudentMode("public");
    setView("publicTrack");

    if (studentKey) {
      const student = track.students.find((item) => item.id === studentKey || item.slug === studentKey);
      if (student) {
        setCurrentStudent(student);
        setView("student");
      }
    }
  }

  async function signup(form) {
    if (!supabase) {
      showToast("Supabase 환경변수를 먼저 연결해주세요.");
      return;
    }

    const adminId = form.adminId.trim();
    const email = adminIdToEmail(adminId);
    const password = form.password.trim();
    const managerName = form.managerName.trim();
    const position = form.position.trim();
    const trackName = form.trackName.trim();
    const batchName = form.batchName.trim();

    if (!adminId || !password || !managerName || !position || !trackName || !batchName) {
      showToast("아이디, 비밀번호, 트랙, 기수, 이름, 직급을 모두 입력해주세요.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          admin_id: adminId,
          manager_name: managerName,
          position,
          track_name: trackName,
          batch_name: batchName,
          phone: "",
          email,
        },
      },
    });

    if (error) {
      showToast(error.message);
      return;
    }

    if (data.session) {
      await supabase.from("profiles").upsert({
        id: data.session.user.id,
        manager_name: managerName,
        position,
        track_name: trackName,
        batch_name: batchName,
        phone: "",
        email,
      });
      setAuthNotice("");
      showToast("회원가입이 완료되었습니다.");
      setView("workspace");
      return;
    }

    setAuthNotice("가입 후 바로 이동되지 않는다면 Supabase의 Confirm email 설정이 아직 켜져 있는 상태입니다. Confirm email을 꺼주세요.");
    showToast("Supabase 이메일 인증 설정을 확인해주세요.");
    setView("login");
  }

  async function login(adminId, password) {
    if (!supabase) {
      showToast("Supabase 환경변수를 먼저 연결해주세요.");
      return;
    }

    if (!adminId || !password) {
      showToast("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    const email = adminIdToEmail(adminId);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showToast(error.message);
      return;
    }

    setAuthNotice("");
    setView("workspace");
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setTracks([]);
    setCurrentTrack(null);
    setCurrentStudent(null);
    setStudentMode("public");
    setEditingTrackLetter(null);
    setView("login");
  }

  async function saveProfile(nextProfile) {
    const payload = {
      manager_name: nextProfile.manager_name.trim(),
      position: nextProfile.position.trim(),
      track_name: nextProfile.track_name.trim(),
      batch_name: nextProfile.batch_name.trim(),
    };

    if (!payload.manager_name || !payload.position || !payload.track_name || !payload.batch_name) {
      showToast("담당 트랙, 기수, 이름, 직급을 모두 입력해주세요.");
      return;
    }

    const { error } = await supabase.from("profiles").update(payload).eq("id", session.user.id);
    if (error) {
      showToast(error.message);
      return;
    }

    setProfile({ ...profile, ...payload });
    showToast("저장되었습니다.");
    setView("workspace");
  }

  async function createTrack(form) {
    const title = form.title.trim();
    const description = form.description.trim();
    const people = sortPeople([
      ...parseRoleNames(form.tutors, "튜터"),
      ...parseRoleNames(form.managers, "매니저"),
      ...parseRoleNames(form.students, "수강생"),
    ]);

    if (!title || !people.length) {
      showToast("페이지 제목과 참여자 이름은 필수입니다.");
      return;
    }

    const { data: track, error } = await supabase
      .from("tracks")
      .insert({
        owner_id: session.user.id,
        title,
        description,
        slug: uniqueSlug(title),
      })
      .select()
      .single();

    if (error) {
      showToast(error.message);
      return;
    }

    const students = people.map((person) => ({
      track_id: track.id,
      name: person.name,
      role: normalizeRole(person.role),
      slug: uniqueSlug(`${person.role}-${person.name}`),
    }));

    if (students.length) {
      const { error: studentError } = await supabase.from("students").insert(students);
      if (studentError) {
        showToast(studentError.message);
        return;
      }
    }

    await loadTracks();
    const { data: loaded } = await supabase
      .from("tracks")
      .select("*, students(*), letters(*), track_letters(*)")
      .eq("id", track.id)
      .single();

    setCurrentTrack(loaded);
    setView("adminTrack");
    showToast("롤링페이퍼 페이지가 생성되었습니다.");
  }

  async function deleteTrack(track) {
    const { error } = await supabase.from("tracks").delete().eq("id", track.id);
    if (error) {
      showToast(error.message);
      return;
    }
    setConfirm(null);
    await loadTracks();
    setView("workspace");
    showToast("페이지가 삭제되었습니다.");
  }

  async function refreshCurrentTrack(trackId = currentTrack?.id) {
    if (!trackId) return;
    const { data, error } = await supabase
      .from("tracks")
      .select("*, students(*), letters(*), track_letters(*)")
      .eq("id", trackId)
      .single();

    if (!error && data) {
      setCurrentTrack(data);
      if (currentStudent) {
        const nextStudent = data.students.find((item) => item.id === currentStudent.id);
        setCurrentStudent(nextStudent || null);
      }
    }
  }

  async function addStudent(person) {
    const name = String(person?.name || person || "").trim();
    const role = normalizeRole(person?.role);
    if (!name) {
      showToast("이름을 입력해주세요.");
      return;
    }

    const { error } = await supabase.from("students").insert({
      track_id: currentTrack.id,
      name,
      role,
      slug: uniqueSlug(`${role}-${name}`),
    });

    if (error) {
      showToast(error.message);
      return;
    }

    setNameModal(null);
    await refreshCurrentTrack();
    await loadTracks();
    showToast(`${role}이 추가되었습니다.`);
  }

  async function editStudent(student, person) {
    const name = String(person?.name || person || "").trim();
    const role = normalizeRole(person?.role || student.role);
    if (!name) {
      showToast("이름을 입력해주세요.");
      return;
    }

    const { error } = await supabase
      .from("students")
      .update({ name, role, slug: uniqueSlug(`${role}-${name}`) })
      .eq("id", student.id);

    if (error) {
      showToast(error.message);
      return;
    }

    setNameModal(null);
    await refreshCurrentTrack();
    await loadTracks();
    showToast("이름이 수정되었습니다.");
  }

  async function deleteStudent(student) {
    const { error } = await supabase.from("students").delete().eq("id", student.id);
    if (error) {
      showToast(error.message);
      return;
    }

    setConfirm(null);
    await refreshCurrentTrack();
    await loadTracks();
    showToast("참여자가 삭제되었습니다.");
  }

  async function submitLetter(writerName, content) {
    if (!writerName.trim() || !content.trim()) {
      showToast("이름과 내용을 모두 입력해주세요.");
      return;
    }

    const { error } = await supabase.from("letters").insert({
      track_id: currentTrack.id,
      student_id: currentStudent.id,
      writer_name: writerName.trim(),
      content: content.trim(),
    });

    if (error) {
      showToast(error.message);
      return;
    }

    await refreshCurrentTrack();
    showToast("편지가 남겨졌습니다.");
  }

  async function saveLetterEdit(letter) {
    if (!letter.writer_name.trim() || !letter.content.trim()) {
      showToast("이름과 내용을 모두 입력해주세요.");
      return;
    }

    const { error } = await supabase
      .from("letters")
      .update({
        writer_name: letter.writer_name.trim(),
        content: letter.content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", letter.id);

    if (error) {
      showToast(error.message);
      return;
    }

    setEditingLetter(null);
    await refreshCurrentTrack();
    showToast("편지가 수정되었습니다.");
  }

  async function submitTrackLetter(writerName, content) {
    if (!writerName.trim() || !content.trim()) {
      showToast("이름과 내용을 모두 입력해주세요.");
      return;
    }

    const { error } = await supabase.from("track_letters").insert({
      track_id: currentTrack.id,
      writer_name: writerName.trim(),
      content: content.trim(),
    });

    if (error) {
      showToast(error.message);
      return;
    }

    await refreshCurrentTrack();
    showToast("전체 편지가 남겨졌습니다.");
  }

  async function saveTrackLetterEdit(letter) {
    if (!letter.writer_name.trim() || !letter.content.trim()) {
      showToast("이름과 내용을 모두 입력해주세요.");
      return;
    }

    const { error } = await supabase
      .from("track_letters")
      .update({
        writer_name: letter.writer_name.trim(),
        content: letter.content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", letter.id);

    if (error) {
      showToast(error.message);
      return;
    }

    setEditingTrackLetter(null);
    await refreshCurrentTrack();
    showToast("전체 편지가 수정되었습니다.");
  }

  async function deleteTrackLetter(letter) {
    if (!session?.user) {
      showToast("관리자만 편지를 삭제할 수 있습니다.");
      return;
    }

    const ok = window.confirm(`${letter.writer_name}님의 전체 편지를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`);
    if (!ok) return;

    const { error } = await supabase
      .from("track_letters")
      .delete()
      .eq("id", letter.id);

    if (error) {
      showToast(error.message);
      return;
    }

    await refreshCurrentTrack();
    showToast("전체 편지가 삭제되었습니다.");
  }

  async function deleteLetter(letter) {
    if (!session?.user) {
      showToast("관리자만 편지를 삭제할 수 있습니다.");
      return;
    }

    const ok = window.confirm(`${letter.writer_name}님의 편지를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`);
    if (!ok) return;

    const { error } = await supabase
      .from("letters")
      .delete()
      .eq("id", letter.id);

    if (error) {
      showToast(error.message);
      return;
    }

    await refreshCurrentTrack();
    showToast("편지가 삭제되었습니다.");
  }

  async function openAdminFromHash(hash) {
    if (!session?.user?.id) return;

    const parts = hash.split("/").filter(Boolean);
    const trackKey = safeDecodeRoutePart(parts[1] || "");
    const studentKey = safeDecodeRoutePart(parts[2] || "");

    if (!trackKey) {
      setView("workspace");
      return;
    }

    const { data, error } = await supabase
      .from("tracks")
      .select("*, students(*), letters(*), track_letters(*)")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      showToast(error.message);
      setView("workspace");
      return;
    }

    const nextTrack = (data || []).find((item) => item.id === trackKey || item.slug === trackKey);

    if (!nextTrack) {
      showToast("해당 관리자 페이지를 찾을 수 없습니다.");
      setView("workspace");
      return;
    }

    setCurrentTrack(nextTrack);
    setStudentMode("admin");

    if (studentKey) {
      const nextStudent = (nextTrack.students || []).find((item) => item.id === studentKey || item.slug === studentKey);
      setCurrentStudent(nextStudent || null);
      setView(nextStudent ? "student" : "adminTrack");
      return;
    }

    setCurrentStudent(null);
    setView("adminTrack");
  }

  async function copyPublicLink() {
    if (!currentTrack) return;
    const link = `${publicSiteUrl}/#/t/${safeEncodeRoutePart(currentTrack.id)}`;
    const copied = await copyTextToClipboard(link);

    if (copied) {
      showToast("공개 링크가 복사되었습니다.");
      return;
    }

    window.prompt("자동 복사가 막혔습니다. 아래 링크를 직접 복사하세요.", link);
  }

  function openAdminTrack(track) {
    setCurrentTrack(track);
    setCurrentStudent(null);
    setStudentMode("admin");
    setView("adminTrack");
    history.pushState({ view: "adminTrack", trackId: track.id }, "", `#/admin/${safeEncodeRoutePart(track.id)}`);
  }

  function openStudent(student, mode = "public") {
    setCurrentStudent(student);
    setStudentMode(mode);
    setView("student");
    const prefix = mode === "admin" ? "admin" : "t";
    history.pushState(
      { view: "student", trackId: currentTrack.id, studentId: student.id, mode },
      "",
      `#/${prefix}/${safeEncodeRoutePart(currentTrack.id)}/${safeEncodeRoutePart(student.id)}`
    );
  }

  useEffect(() => {
    const onPop = async () => {
      const hash = getCurrentHash();
      if (hash.startsWith("/t/")) {
        await openPublicFromHash(hash);
      } else if (hash.startsWith("/admin/")) {
        await openAdminFromHash(hash);
      } else if (view === "student") {
        setView(studentMode === "admin" ? "adminTrack" : "publicTrack");
      } else {
        setView("workspace");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [view, currentTrack?.id]);

  if (loading) return <div className="app">불러오는 중...</div>;

  return (
    <>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>

      {confirm && (
        <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
      )}

      {nameModal && (
        <NameModal modal={nameModal} onClose={() => setNameModal(null)} onSave={(value) => {
          if (nameModal.type === "add") addStudent(value);
          if (nameModal.type === "edit") editStudent(nameModal.student, value);
        }} />
      )}

      {editingLetter && (
        <LetterEditModal
          letter={editingLetter}
          onClose={() => setEditingLetter(null)}
          onSave={saveLetterEdit}
        />
      )}

      {editingTrackLetter && (
        <LetterEditModal
          letter={editingTrackLetter}
          onClose={() => setEditingTrackLetter(null)}
          onSave={saveTrackLetterEdit}
        />
      )}

      {previewOpen && currentTrack && (
        <SidePreview
          track={currentTrack}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {view === "publicLoading" && (
        <main className="public-loading">
          <div className="public-loading-card">
            <div className="logo">✦</div>
            <h2>롤링페이퍼를 불러오는 중입니다</h2>
            <p>로그인 없이 공개 페이지로 이동합니다.</p>
          </div>
        </main>
      )}

      {view === "publicError" && (
        <main className="public-loading">
          <div className="public-loading-card">
            <div className="logo">!</div>
            <h2>공개 링크를 찾을 수 없습니다</h2>
            <p>링크가 잘못되었거나 페이지가 삭제되었을 수 있습니다.</p>
          </div>
        </main>
      )}

      {!session && !["publicTrack", "student", "publicLoading", "publicError"].includes(view) && (
        <AuthPage
          view={view}
          setView={setView}
          login={login}
          signup={signup}
          isConfigured={isConfigured}
          authNotice={authNotice}
          setAuthNotice={setAuthNotice}
        />
      )}

      {session && view === "workspace" && (
        <Workspace
          profile={profile}
          tracks={tracks}
          setView={setView}
          logout={logout}
          openAdminTrack={openAdminTrack}
          setConfirm={setConfirm}
          deleteTrack={deleteTrack}
        />
      )}

      {session && view === "profile" && (
        <Profile
          profile={profile}
          saveProfile={saveProfile}
          setView={setView}
        />
      )}

      {session && view === "createTrack" && (
        <CreateTrack
          profile={profile}
          setView={setView}
          createTrack={createTrack}
        />
      )}

      {session && view === "adminTrack" && currentTrack && (
        <AdminTrack
          track={currentTrack}
          copyPublicLink={copyPublicLink}
          setPreviewOpen={setPreviewOpen}
          setView={setView}
          openStudent={(student) => openStudent(student, "admin")}
          setNameModal={setNameModal}
          setConfirm={setConfirm}
          deleteStudent={deleteStudent}
          setEditingTrackLetter={setEditingTrackLetter}
          deleteTrackLetter={deleteTrackLetter}
        />
      )}

      {(view === "publicTrack" || view === "student") && currentTrack && (
        <PublicShell
          view={view}
          track={currentTrack}
          student={currentStudent}
          openStudent={(student) => openStudent(student, "public")}
          back={() => setView(studentMode === "admin" ? "adminTrack" : "publicTrack")}
          submitLetter={submitLetter}
          submitTrackLetter={submitTrackLetter}
          setEditingLetter={setEditingLetter}
          setEditingTrackLetter={setEditingTrackLetter}
          deleteLetter={deleteLetter}
          deleteTrackLetter={deleteTrackLetter}
          isAdmin={studentMode === "admin"}
        />
      )}
    </>
  );
}

function AuthPage({ view, setView, login, signup, isConfigured, authNotice, setAuthNotice }) {
  const [loginAdminId, setLoginAdminId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [form, setForm] = useState({
    trackName: "단기심화",
    batchName: "7기",
    managerName: "이주영",
    position: "학습관리매니저",
    adminId: "",
    password: "",
  });

  return (
    <main className="app">
      <header className="minimal-top">
        <div className="brand" onClick={() => setView("login")}>
          <div className="logo">✦</div>
          <span>롤링페이퍼</span>
        </div>
        <div className="top-actions">
          <button className="btn ghost" onClick={() => { setAuthNotice(""); setView("login"); }}>로그인</button>
          <button className="btn soft" onClick={() => { setAuthNotice(""); setView("signup"); }}>회원가입</button>
        </div>
      </header>

      {!isConfigured && (
        <div className="card" style={{ marginBottom: 18 }}>
          <strong>Supabase 연결 필요</strong>
          <p>.env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 넣어야 로그인과 저장이 작동합니다.</p>
        </div>
      )}

      {authNotice && (
        <div className="auth-notice">
          <strong>가입 설정 확인이 필요합니다.</strong>
          <span>{authNotice}</span>
        </div>
      )}

      {view !== "signup" ? (
        <section className="login-layout">
          <div className="card hero">
            <span className="eyebrow">내일배움캠프 롤링페이퍼</span>
            <h1>수료식 롤링페이퍼를 더 편하게 관리하세요.</h1>
            <p>페이지 생성, 공개 링크 공유, 편지 확인까지 한 번에 관리할 수 있습니다. 이용 중 오류가 발생하면 이주영 학관매에게 연락해주세요.</p>
          </div>
          <div className="card">
            <h2>관리자 로그인</h2>
            <p>아이디와 비밀번호로 로그인합니다.</p>
            <div className="form">
              <label>아이디 <input value={loginAdminId} onChange={(e) => setLoginAdminId(e.target.value)} placeholder="예: jy-manager" /></label>
              <label>비밀번호 <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></label>
              <button className="btn primary" onClick={() => login(loginAdminId, loginPassword)}>로그인</button>
              <button className="btn ghost" onClick={() => { setAuthNotice(""); setView("signup"); }}>회원가입</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="login-layout">
          <div className="card hero">
            <span className="eyebrow">관리자 회원가입</span>
            <h1>담당 트랙 기준의 워크스페이스를 만드세요.</h1>
            <p>트랙별 롤링페이퍼를 만들고, 수강생에게 공개 링크를 공유할 수 있습니다. 수강생은 회원가입 없이 편지를 작성합니다.</p>
          </div>
          <div className="card">
            <h2>회원가입</h2>
            <div className="auth-notice subtle">
              <strong>가입 전 안내</strong>
              <span>아이디와 비밀번호로 관리자 워크스페이스를 만듭니다. 수강생은 공개 링크에서 회원가입 없이 편지를 작성합니다.</span>
            </div>
            <div className="form">
              <label>담당 트랙 <input value={form.trackName} onChange={(e) => setForm({ ...form, trackName: e.target.value })} /></label>
              <label>기수 <input value={form.batchName} onChange={(e) => setForm({ ...form, batchName: e.target.value })} /></label>
              <label>이름 <input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} /></label>
              <label>직급 <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="예: 학습관리매니저, 리드매니저" /></label>
              <label>아이디 <input value={form.adminId} onChange={(e) => setForm({ ...form, adminId: e.target.value })} placeholder="예: jy-manager" /></label>
              <label>비밀번호 <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <button className="btn primary" onClick={() => signup(form)}>가입하고 시작하기</button>
              <button className="btn ghost" onClick={() => { setAuthNotice(""); setView("login"); }}>로그인으로 돌아가기</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Workspace({ profile, tracks, setView, logout, openAdminTrack, setConfirm, deleteTrack }) {
  return (
    <main className="app">
      <header className="minimal-top">
        <div className="brand">
          <div className="logo">✦</div>
          <span>내 롤링페이퍼</span>
        </div>
        <div className="top-actions">
          <button className="btn ghost" onClick={() => setView("profile")}>내 정보</button>
          <button className="btn danger" onClick={logout}>로그아웃</button>
        </div>
      </header>

      <section id="workspaceView">
        <div className="workspace-cover"></div>
        <div className="workspace-title">
          <div className="emoji">📝</div>
          <h1>트랙별 롤링페이퍼 생성</h1>
          <p>{profile?.track_name || "담당 트랙"} {profile?.batch_name || ""} 담당 워크스페이스</p>
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <span className="eyebrow">내 담당 트랙</span>
              <h2>롤링페이퍼 페이지</h2>
              <p>새 페이지를 만들고 공개 링크를 복사해 수강생에게 공유하세요.</p>
            </div>
          </div>
          <div className="grid track-grid">
            <article className="add-card" onClick={() => setView("createTrack")}>
              <div>
                <div className="plus">+</div>
                <h3>새 롤링페이퍼 만들기</h3>
                <p>담당 트랙 안에서 새 페이지를 만듭니다.</p>
              </div>
            </article>

            {tracks.map((track) => (
              <article className="track-card" key={track.id} onClick={() => openAdminTrack(track)}>
                <button className="btn danger delete-track" onClick={(e) => {
                  e.stopPropagation();
                  setConfirm({
                    title: "페이지 삭제 확인",
                    message: `${track.title} 페이지를 진짜 삭제할까요?`,
                    action: () => deleteTrack(track),
                  });
                }}>삭제</button>
                <h3 style={{ paddingRight: 70 }}>{track.title}</h3>
                <p>{track.description}</p>
                <RoleMeta people={track.students || []} />
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Profile({ profile, saveProfile, setView }) {
  const [form, setForm] = useState(profile || {});

  useEffect(() => {
    setForm(profile || {});
  }, [profile?.id, profile?.manager_name, profile?.position, profile?.track_name, profile?.batch_name]);

  return (
    <main className="app">
      <header className="minimal-top">
        <div className="brand"><div className="logo">✦</div><span>내 정보</span></div>
        <button className="btn ghost" onClick={() => setView("workspace")}>워크스페이스로</button>
      </header>
      <div className="card">
        <div className="form">
          <label>담당 트랙 <input value={form.track_name || ""} onChange={(e) => setForm({ ...form, track_name: e.target.value })} /></label>
          <label>기수 <input value={form.batch_name || ""} onChange={(e) => setForm({ ...form, batch_name: e.target.value })} /></label>
          <label>이름 <input value={form.manager_name || ""} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} /></label>
          <label>직급 <input value={form.position || ""} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="예: 학습관리매니저, 리드매니저" /></label>
          <button className="btn primary" onClick={() => saveProfile(form)}>저장하기</button>
        </div>
      </div>
    </main>
  );
}

function CreateTrack({ profile, setView, createTrack }) {
  const [form, setForm] = useState({
    title: `${profile?.track_name || "단기심화"} ${profile?.batch_name || "7기"} 롤링페이퍼`,
    description: "함께한 동료들에게 마지막 인사를 남겨주세요.",
    tutors: "김나현\n박상훈\n이지은",
    managers: "정유진\n최민수",
    students: "김신영\n이다혜\n조아영",
  });

  return (
    <main className="app">
      <header className="minimal-top">
        <div className="brand"><div className="logo">✦</div><span>새 롤링페이퍼</span></div>
        <button className="btn ghost" onClick={() => setView("workspace")}>취소</button>
      </header>
      <div className="card">
        <div className="form">
          <label>페이지 제목 <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>안내 문구 <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="role-input-grid">
            <label>튜터 <textarea value={form.tutors} onChange={(e) => setForm({ ...form, tutors: e.target.value })} placeholder={"김나현\n박상훈\n이지은"} /></label>
            <label>매니저 <textarea value={form.managers} onChange={(e) => setForm({ ...form, managers: e.target.value })} placeholder={"정유진\n최민수"} /></label>
            <label>수강생 <textarea value={form.students} onChange={(e) => setForm({ ...form, students: e.target.value })} placeholder={"김신영\n이다혜\n조아영"} /></label>
          </div>
          <p className="form-help">각 칸에 이름만 한 줄씩 입력하세요. 생성 후에는 튜터 → 매니저 → 수강생 순서로 나오고, 각 그룹 안에서는 가나다순으로 정렬됩니다.</p>
          <button className="btn primary" onClick={() => createTrack(form)}>페이지 만들기</button>
        </div>
      </div>
    </main>
  );
}

function AdminTrack({ track, copyPublicLink, setPreviewOpen, setView, openStudent, setNameModal, setConfirm, deleteStudent, setEditingTrackLetter, deleteTrackLetter }) {
  const groupedPeople = groupPeopleByRole(track.students || []);
  const [adminTab, setAdminTab] = useState("people");

  return (
    <main className="app">
      <header className="minimal-top">
        <div className="brand"><div className="logo">✦</div><span>관리자 보기</span></div>
        <div className="top-actions">
          <button className="btn soft" onClick={copyPublicLink}>공개 링크 복사</button>
          <button className="btn ghost" onClick={() => setPreviewOpen(true)}>미리보기 켜기</button>
          <button className="btn ghost" onClick={() => setView("workspace")}>워크스페이스로</button>
        </div>
      </header>
      <div className="card">
        <span className="eyebrow">관리자 보기</span>
        <h2>{track.title}</h2>
        <p>{track.description}</p>
        <div className="doc-rule"></div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${adminTab === "people" ? "active" : ""}`}
            onClick={() => setAdminTab("people")}
          >
            참여자 관리
          </button>
          <button
            className={`admin-tab ${adminTab === "overall" ? "active" : ""}`}
            onClick={() => setAdminTab("overall")}
          >
            전체 편지 관리
          </button>
        </div>

        {adminTab === "people" ? (
          <section className="admin-tab-panel">
            <h3>참여자 관리</h3>
            <p>튜터, 매니저, 수강생을 추가, 수정, 삭제할 수 있습니다. 이름을 누르면 편지 작성 및 받은 편지 확인 페이지로 이동합니다.</p>

            <div className="grid person-grid add-person-grid" style={{ marginTop: 18 }}>
              <article className="add-card" onClick={() => setNameModal({ type: "add" })}>
                <div><div className="plus">+</div><h3>참여자 추가</h3><p>역할과 이름을 추가하려면 여기를 누르세요.</p></div>
              </article>
            </div>

            <div className="role-section-list">
              {ROLE_LABELS.map((role) => (
                <section className="role-section-block" key={role}>
                  <div className="role-section-head">
                    <div className="role-section-title-wrap">
                      <span className="role-section-title">{role}</span>
                      <span className="role-section-meta">{groupedPeople[role].length}명</span>
                    </div>
                  </div>
                  <div className="role-divider"></div>
                  {groupedPeople[role].length ? (
                    <div className="grid person-grid role-person-grid">
                      {groupedPeople[role].map((student) => (
                        <article className="track-card" key={student.id} onClick={() => openStudent(student)}>
                          <RoleBadge role={student.role} />
                          <h3>{student.name}</h3>
                          <p>클릭하면 작성 폼과 받은 편지를 확인합니다.</p>
                          <div className="student-admin-actions">
                            <button className="btn soft" onClick={(e) => {
                              e.stopPropagation();
                              setNameModal({ type: "edit", student });
                            }}>이름 수정</button>
                            <button className="btn danger" onClick={(e) => {
                              e.stopPropagation();
                              setConfirm({
                                title: "참여자 삭제 확인",
                                message: `${student.name}님을 진짜 삭제할까요?`,
                                action: () => deleteStudent(student),
                              });
                            }}>삭제</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty role-empty">아직 등록된 {role}가 없습니다.</div>
                  )}
                </section>
              ))}
            </div>
          </section>
        ) : (
          <section className="admin-tab-panel admin-overall-letters">
            <div className="section-head">
              <div>
                <span className="eyebrow">전체 편지 관리</span>
                <h3>{overallBoardTitle(track)}</h3>
                <p>공개 링크의 전체 편지 탭에 작성된 글을 확인하고 삭제할 수 있습니다.</p>
              </div>
            </div>
            <div className="card admin-overall-card">
              <h3>전체 편지 모음</h3>
              <p>{track.track_letters?.length || 0}개의 글이 모였습니다.</p>
              <StickyBoard
                letters={track.track_letters || []}
                setEditingLetter={setEditingTrackLetter}
                canDelete={true}
                onDelete={deleteTrackLetter}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}


function PublicPageLayout({ track, student, children }) {
  const counts = roleCounts(track.students || []);

  return (
    <main className="notion-page public-page">
      <section>
        <div className="public-topbar">
          <div className="public-brand">
            <span className="public-brand-icon">✦</span>
            <span>롤링페이퍼</span>
          </div>
          <div className="public-top-meta">
            <span>공개 링크</span>
            <span>{track.title}</span>
          </div>
        </div>

        <div className="notion-cover">
          <div className="cover-toolbar">
            <span>Public rolling paper</span>
            <span>내일배움캠프</span>
          </div>
        </div>

        <article className="notion-doc public-doc">
          <div className="doc-icon">{student ? "💌" : "📎"}</div>
          <div className="doc-kicker">NB Camp Rolling Paper</div>
          <h1 className="doc-title">{student ? `${student.name}님에게 남기는 롤링페이퍼` : track.title}</h1>
          <p className="doc-sub">
            {student
              ? `${track.title} 페이지입니다. 이름과 내용을 입력해 편지를 남겨주세요.`
              : track.description || "함께한 동료에게 마지막 인사를 남겨주세요."}
          </p>
          <div className="doc-rule"></div>
          {children}
        </article>
      </section>
    </main>
  );
}

function PublicShell({
  view,
  track,
  student,
  openStudent,
  back,
  submitLetter,
  submitTrackLetter,
  setEditingLetter,
  setEditingTrackLetter,
  deleteLetter,
  deleteTrackLetter,
  isAdmin = false,
}) {
  const [activeTab, setActiveTab] = useState("people");

  if (view === "student" && student) {
    return (
      <PublicPageLayout track={track} student={student}>
        <StudentLetters
          track={track}
          student={student}
          back={back}
          submitLetter={submitLetter}
          setEditingLetter={setEditingLetter}
          deleteLetter={deleteLetter}
          isAdmin={isAdmin}
        />
      </PublicPageLayout>
    );
  }

  const groupedPeople = groupPeopleByRole(track.students || []);

  return (
    <PublicPageLayout track={track}>
      <div className="public-tabs no-print">
        <button
          className={`public-tab ${activeTab === "people" ? "active" : ""}`}
          onClick={() => setActiveTab("people")}
        >
          개인에게 쓰기
        </button>
        <button
          className={`public-tab ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          {overallBoardTitle(track)}
        </button>
      </div>

      {activeTab === "people" ? (
        <>
          <div className="public-section-head">
            <div>
              <h3>편지를 남길 사람</h3>
              <p>고마웠던 사람들에게 개별 편지를 남겨보세요.</p>
            </div>
          </div>

          <div className="role-section-list public-role-sections">
            {ROLE_LABELS.map((role) => {
              const items = groupedPeople[role];
              if (!items.length) return null;

              return (
                <section className={`role-section-block public-role-block role-block-${roleType(role)}`} key={role}>
                  <div className="role-section-head public-role-head">
                    <div className="role-section-title-wrap">
                      <span className={`role-dot role-dot-${roleType(role)}`}></span>
                      <span className="role-section-title">{role}</span>
                      <span className={`role-section-meta role-meta-${roleType(role)}`}>{items.length}명</span>
                    </div>
                  </div>
                  <div className="grid person-grid role-person-grid public-person-grid">
                    {items.map((item) => (
                      <article className={`person-card public-person-card public-person-${roleType(item.role)}`} key={item.id} onClick={() => openStudent(item)}>
                        <div>
                          <RoleBadge role={item.role} />
                          <div className="person-name">{item.name}</div>
                          <div className="hint">클릭해서 편지 쓰기</div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <OverallLetters
          track={track}
          submitTrackLetter={submitTrackLetter}
          setEditingTrackLetter={setEditingTrackLetter}
          deleteTrackLetter={deleteTrackLetter}
          isAdmin={isAdmin}
        />
      )}
    </PublicPageLayout>
  );
}

function OverallLetters({ track, submitTrackLetter, setEditingTrackLetter, deleteTrackLetter, isAdmin = false }) {
  const [writer, setWriter] = useState("");
  const [content, setContent] = useState("");
  const letters = track.track_letters || [];
  const title = overallBoardTitle(track);

  async function onSubmit() {
    await submitTrackLetter(writer, content);
    setWriter("");
    setContent("");
  }

  function downloadPdf() {
    document.body.classList.add("print-letters-mode", "print-overall-mode");
    const cleanup = () => document.body.classList.remove("print-letters-mode", "print-overall-mode");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => window.print(), 80);
    window.setTimeout(cleanup, 2000);
  }

  return (
    <div className="overall-board">
      <div className="public-section-head">
        <div>
          <h3>{title}</h3>
          <p>함께 달려온 우리 트랙 사람들에게 하고 싶은 말을 남겨보세요.</p>
        </div>
        <div className="top-actions no-print overall-letter-actions">
          <button className="btn soft" onClick={downloadPdf}>PDF 다운</button>
        </div>
      </div>

      <div className="card write-panel overall-write-panel">
        <h3>전체에게 편지 쓰기</h3>
        <p>이름과 내용은 모두 필수입니다.</p>
        <div className="form">
          <label>이름 <input value={writer} onChange={(e) => setWriter(e.target.value)} placeholder="작성자 이름" /></label>
          <label>내용 <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="함께한 모두에게 전하고 싶은 말을 적어주세요." /></label>
          <button className="btn primary" onClick={onSubmit}>전체에게 남기기</button>
        </div>
      </div>

      <div className="card overall-list-card">
        <h3>전체 편지 모음</h3>
        <p>{letters.length}개의 글이 모였습니다.</p>
        <StickyBoard
          letters={letters}
          setEditingLetter={setEditingTrackLetter}
          canDelete={isAdmin}
          onDelete={deleteTrackLetter}
        />
      </div>
    </div>
  );
}

function StudentLetters({ track, student, back, submitLetter, setEditingLetter, deleteLetter, isAdmin = false }) {
  const [writer, setWriter] = useState("");
  const [content, setContent] = useState("");
  const letters = track.letters?.filter((letter) => letter.student_id === student.id) || [];

  async function onSubmit() {
    await submitLetter(writer, content);
    setWriter("");
    setContent("");
  }

  function downloadPdf() {
    document.body.classList.add("print-letters-mode");
    const cleanup = () => document.body.classList.remove("print-letters-mode");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => window.print(), 80);
    window.setTimeout(cleanup, 2000);
  }

  return (
    <div className="split">
      <div className="card write-panel">
        <h3>편지 쓰기</h3>
        <p>이름과 내용은 모두 필수입니다.</p>
        <div className="form">
          <label>이름 <input value={writer} onChange={(e) => setWriter(e.target.value)} placeholder="작성자 이름" /></label>
          <label>내용 <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="전하고 싶은 말을 적어주세요." /></label>
          <button className="btn primary" onClick={onSubmit}>편지 남기기</button>
        </div>
      </div>
      <div>
        <div className="top-actions no-print public-letter-actions">
          <button className="btn soft" onClick={downloadPdf}>PDF 다운</button>
          <button className="btn ghost" onClick={back}>사람 목록으로</button>
        </div>
        <div className="card">
          <h3>받은 편지</h3>
          <p>{student.name}님이 받은 편지 {letters.length}개</p>
          <StickyBoard letters={letters} setEditingLetter={setEditingLetter} canDelete={isAdmin} onDelete={deleteLetter} />
        </div>
      </div>
    </div>
  );
}

function StickyBoard({ letters, setEditingLetter, canDelete = false, onDelete }) {
  const noteColors = ["note-peach", "note-mint", "note-sky", "note-lilac", "note-yellow", "note-pink", "note-teal"];
  const noteTilts = ["tilt-a", "tilt-b", "tilt-c", "tilt-d"];

  if (!letters.length) {
    return (
      <div className="sticky-board-shell">
        <div className="empty">아직 받은 편지가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="sticky-board-shell">
      <div className="sticky-board">
        {letters.map((letter, index) => {
          const textLength = `${letter.writer_name}\n${letter.content}`.length;
          const sizeClass = textLength > 230 ? "note-long" : textLength > 120 ? "note-mid" : "note-short";
          return (
            <article className={`sticky-note ${noteColors[index % noteColors.length]} ${noteTilts[index % noteTilts.length]} ${sizeClass}`} key={letter.id}>
              <div className="sticky-note-writer">{letter.writer_name}</div>
              <div className="sticky-note-content">{letter.content}</div>
              <div className="sticky-note-footer">
                <span className="sticky-note-mark">{letter.updated_at ? "수정됨" : "롤링페이퍼"}</span>
                <div className="sticky-note-actions">
                  <button className="sticky-edit-btn" onClick={() => setEditingLetter(letter)}>편지 수정</button>
                  {canDelete && (
                    <button className="sticky-delete-btn" onClick={() => onDelete?.(letter)}>삭제</button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SidePreview({ track, onClose }) {
  const [activeTab, setActiveTab] = useState("people");
  const groupedPeople = groupPeopleByRole(track.students || []);
  const overallLetters = track.track_letters || [];

  return (
    <>
      <div className="side-preview-backdrop" onClick={onClose}></div>
      <aside className="side-preview">
        <div className="side-preview-top">
          <strong>공개 화면 미리보기</strong>
          <button className="side-preview-close" onClick={onClose}>×</button>
        </div>

        <div className="side-preview-inner preview-current-ui">
          <div className="side-preview-public-top">
            <div className="public-brand">
              <span className="public-brand-icon">✦</span>
              <span>롤링페이퍼</span>
            </div>
            <span className="side-preview-label">공개 링크 화면</span>
          </div>

          <div className="side-preview-cover">
            <div className="cover-toolbar">
              <span>Public rolling paper</span>
              <span>내일배움캠프</span>
            </div>
          </div>

          <article className="side-preview-doc">
            <div className="side-preview-icon">📎</div>
            <div className="doc-kicker">NB Camp Rolling Paper</div>
            <h1 className="side-preview-heading">{track.title}</h1>
            <p className="side-preview-desc">{track.description || "함께한 동료에게 마지막 인사를 남겨주세요."}</p>
            <div className="side-preview-rule"></div>

            <div className="public-tabs preview-tabs">
              <button
                className={`public-tab ${activeTab === "people" ? "active" : ""}`}
                onClick={() => setActiveTab("people")}
              >
                개인에게 쓰기
              </button>
              <button
                className={`public-tab ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                {overallBoardTitle(track)}
              </button>
            </div>

            {activeTab === "people" ? (
              <>
                <div className="public-section-head">
                  <div>
                    <h3>편지를 남길 사람</h3>
                    <p>고마웠던 사람들에게 개별 편지를 남겨보세요.</p>
                  </div>
                </div>

                <div className="role-section-list public-role-sections">
                  {ROLE_LABELS.map((role) => {
                    const items = groupedPeople[role];
                    if (!items.length) return null;

                    return (
                      <section className={`role-section-block public-role-block role-block-${roleType(role)}`} key={role}>
                        <div className="role-section-head public-role-head">
                          <div className="role-section-title-wrap">
                            <span className={`role-dot role-dot-${roleType(role)}`}></span>
                            <span className="role-section-title">{role}</span>
                            <span className={`role-section-meta role-meta-${roleType(role)}`}>{items.length}명</span>
                          </div>
                        </div>
                        <div className="grid person-grid role-person-grid public-person-grid">
                          {items.map((student) => (
                            <article className={`person-card public-person-card public-person-${roleType(student.role)}`} style={{ cursor: "default" }} key={student.id}>
                              <div>
                                <RoleBadge role={student.role} />
                                <div className="person-name">{student.name}</div>
                                <div className="hint">클릭해서 편지 쓰기</div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="overall-board preview-overall-board">
                <div className="public-section-head">
                  <div>
                    <h3>{overallBoardTitle(track)}</h3>
                    <p>함께 달려온 우리 트랙 사람들에게 하고 싶은 말을 남겨보세요.</p>
                  </div>
                </div>

                <div className="preview-write-card">
                  <strong>전체에게 편지 쓰기</strong>
                  <span>이름과 내용을 입력해 전체 편지를 남기는 영역입니다.</span>
                </div>

                <div className="preview-overall-list">
                  <h3>전체 편지 모음</h3>
                  <p>{overallLetters.length}개의 글이 모였습니다.</p>
                  {overallLetters.length ? (
                    <div className="preview-overall-items">
                      {overallLetters.slice(0, 8).map((letter) => (
                        <article className="preview-overall-item" key={letter.id}>
                          <strong>{letter.writer_name}</strong>
                          <p>{letter.content}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">아직 전체 편지가 없습니다.</div>
                  )}
                </div>
              </div>
            )}
          </article>
        </div>
      </aside>
    </>
  );
}

function ConfirmModal({ confirm, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{confirm.title}</h3>
        <p>{confirm.message}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn danger" onClick={confirm.action}>삭제하기</button>
        </div>
      </div>
    </div>
  );
}

function NameModal({ modal, onClose, onSave }) {
  const [value, setValue] = useState(modal.student?.name || "");
  const [role, setRole] = useState(normalizeRole(modal.student?.role));
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{modal.type === "add" ? "참여자 추가" : "참여자 정보 수정"}</h3>
        <p>역할과 이름을 입력해주세요.</p>
        <div className="form" style={{ marginTop: 16 }}>
          <label>역할
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_LABELS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>이름
            <input value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={() => onSave({ name: value, role })}>저장하기</button>
        </div>
      </div>
    </div>
  );
}

function LetterEditModal({ letter, onClose, onSave }) {
  const [form, setForm] = useState({ ...letter });

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>편지 수정</h3>
        <p>이름과 내용은 모두 필수입니다.</p>
        <div className="form">
          <label>이름 <input value={form.writer_name} onChange={(e) => setForm({ ...form, writer_name: e.target.value })} /></label>
          <label>내용 <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={() => onSave(form)}>저장하기</button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
