"use client";
import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { auth } from "../../lib/firebase";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getCurrentUser, logoutUser } from "../../lib/auth";

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("companies");
  const [currentUser, setCurrentUser] = useState(null);

  // Data lists
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);

  // Company form
  const [companyName, setCompanyName] = useState("");
  const [companyBalance, setCompanyBalance] = useState("");

  // Department form
  const [deptName, setDeptName] = useState("");
  const [deptCompany, setDeptCompany] = useState("");

  // User form
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("staff");
  const [userCompanies, setUserCompanies] = useState([]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
    loadCompanies();
    loadDepartments();
    loadUsers();
  }, []);

  async function checkAuth() {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      router.push("/login");
    } else {
      setCurrentUser(user);
    }
  }

  // ── LOAD DATA ──────────────────────────────────────────
  async function loadCompanies() {
    const snap = await getDocs(collection(db, "companies"));
    setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadDepartments() {
    const snap = await getDocs(collection(db, "departments"));
    setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadUsers() {
    const snap = await getDocs(collection(db, "users"));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // ── COMPANIES ──────────────────────────────────────────
  async function addCompany() {
    if (!companyName || !companyBalance) {
      setMessage("Please enter company name and opening balance.");
      return;
    }
    setLoading(true);
    await addDoc(collection(db, "companies"), {
      name: companyName,
      balance: parseFloat(companyBalance),
      openingBalance: parseFloat(companyBalance),
      createdAt: serverTimestamp(),
    });
    setMessage(`Company "${companyName}" added successfully!`);
    setCompanyName("");
    setCompanyBalance("");
    loadCompanies();
    setLoading(false);
  }

  // ── DEPARTMENTS ────────────────────────────────────────
  async function addDepartment() {
    if (!deptName || !deptCompany) {
      setMessage("Please enter department name and select a company.");
      return;
    }
    setLoading(true);
    await addDoc(collection(db, "departments"), {
      name: deptName,
      companyId: deptCompany,
      createdAt: serverTimestamp(),
    });
    setMessage(`Department "${deptName}" added successfully!`);
    setDeptName("");
    setDeptCompany("");
    loadDepartments();
    setLoading(false);
  }

  // ── USERS ──────────────────────────────────────────────
 async function addUser() {
    if (!userName || !userEmail || !userPassword || !userRole) {
      setMessage("Please fill in all user fields.");
      return;
    }
    setLoading(true);
    try {
      // Save to Firestore directly - admin creates profile only
      // Firebase Auth user will be created on first login
      const { initializeApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");

      // Use a secondary app instance so admin stays logged in
      const secondaryApp = initializeApp(
        {
          apiKey: "AIzaSyDNeJ1qI-u1gKNK7_8IxTn6phGDJ0wjEhc",
          authDomain: "expense-voucher-bcad9.firebaseapp.com",
          projectId: "expense-voucher-bcad9",
          messagingSenderId: "497690580363",
          appId: "1:497690580363:web:a97569cfd04e671ebdcb8e",
        },
        "secondary"
      );
      const secondaryAuth = getAuth(secondaryApp);
      const result = await createUserWithEmailAndPassword(
        secondaryAuth, userEmail, userPassword
      );

      // Save profile in Firestore using the new user's UID as document ID
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        name: userName,
        email: userEmail,
        role: userRole,
        companies: userCompanies,
        createdAt: serverTimestamp(),
      });

      await secondaryApp.delete();
      setMessage(`✅ User "${userName}" created successfully!`);
      setUserName("");
      setUserEmail("");
      setUserPassword("");
      setUserRole("staff");
      setUserCompanies([]);
      loadUsers();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
    setLoading(false);
  }
  function toggleCompanyForUser(companyId) {
    setUserCompanies((prev) =>
      prev.includes(companyId)
        ? prev.filter((c) => c !== companyId)
        : [...prev, companyId]
    );
  }

  async function handleLogout() {
    await logoutUser();
    router.push("/login");
  }

  // ── UI ─────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.headerTitle}>Admin Panel</h1>
        <div style={s.headerRight}>
          <span style={s.headerUser}>👤 {currentUser?.name}</span>
            <button style={{ padding:"7px 16px", backgroundColor:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", color:"#fff", borderRadius:7, cursor:"pointer", fontSize:13, fontWeight:600 }} onClick={() => router.push("/print")}>
                🖨️ Print
            </button> 
          <button style={s.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={s.messageBanner}>
          {message}
          <button style={s.closeMsg} onClick={() => setMessage("")}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        {["companies", "departments", "users"].map((tab) => (
          <button
            key={tab}
            style={activeTab === tab ? s.tabActive : s.tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div style={s.content}>

        {/* ── COMPANIES TAB ── */}
        {activeTab === "companies" && (
          <div>
            <h2 style={s.sectionTitle}>Add New Company</h2>
            <div style={s.formRow}>
              <input
                style={s.input}
                placeholder="Company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <input
                style={s.input}
                placeholder="Opening balance (AED)"
                type="number"
                value={companyBalance}
                onChange={(e) => setCompanyBalance(e.target.value)}
              />
              <button style={s.addBtn} onClick={addCompany} disabled={loading}>
                {loading ? "Adding..." : "+ Add Company"}
              </button>
            </div>

            <h2 style={s.sectionTitle}>Companies</h2>
            {companies.length === 0 && <p style={s.empty}>No companies yet.</p>}
            {companies.map((c) => (
              <div key={c.id} style={s.listItem}>
                <span style={s.listName}>🏢 {c.name}</span>
                <span style={s.listBadge}>AED {c.balance?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── DEPARTMENTS TAB ── */}
        {activeTab === "departments" && (
          <div>
            <h2 style={s.sectionTitle}>Add New Department</h2>
            <div style={s.formRow}>
              <input
                style={s.input}
                placeholder="Department name"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
              />
              <select
                style={s.input}
                value={deptCompany}
                onChange={(e) => setDeptCompany(e.target.value)}
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button style={s.addBtn} onClick={addDepartment} disabled={loading}>
                {loading ? "Adding..." : "+ Add Department"}
              </button>
            </div>

            <h2 style={s.sectionTitle}>Departments</h2>
            {departments.length === 0 && <p style={s.empty}>No departments yet.</p>}
            {departments.map((d) => (
              <div key={d.id} style={s.listItem}>
                <span style={s.listName}>🏬 {d.name}</span>
                <span style={s.listBadge}>
                  {companies.find((c) => c.id === d.companyId)?.name || "Unknown"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <div>
            <h2 style={s.sectionTitle}>Add New User</h2>
            <div style={s.formCol}>
              <input
                style={s.input}
                placeholder="Full name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <input
                style={s.input}
                placeholder="Email address"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
              />
              <input
                style={s.input}
                placeholder="Password"
                type="password"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
              />
              <select
                style={s.input}
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
              >
                <option value="staff">Staff</option>
                <option value="cashier">Cashier</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
              </select>

              {/* Assign companies */}
              <div style={s.companyCheck}>
                <p style={s.label}>Assign to companies:</p>
                {companies.map((c) => (
                  <label key={c.id} style={s.checkLabel}>
                    <input
                      type="checkbox"
                      checked={userCompanies.includes(c.id)}
                      onChange={() => toggleCompanyForUser(c.id)}
                    />
                    {" "}{c.name}
                  </label>
                ))}
              </div>

              <button style={s.addBtn} onClick={addUser} disabled={loading}>
                {loading ? "Creating..." : "+ Create User"}
              </button>
            </div>

            <h2 style={s.sectionTitle}>All Users</h2>
            {users.length === 0 && <p style={s.empty}>No users yet.</p>}
            {users.map((u) => (
              <div key={u.id} style={s.listItem}>
                <span style={s.listName}>👤 {u.name}</span>
                <span style={s.listBadge}>{u.role}</span>
                <span style={s.listEmail}>{u.email}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── STYLES ─────────────────────────────────────────────────
const s = {
  page: { minHeight: "100vh", backgroundColor: "#f0f4f8", fontFamily: "sans-serif" },
  header: { backgroundColor: "#1a1a2e", color: "#fff", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { margin: 0, fontSize: "18px", fontWeight: "600" },
  headerRight: { display: "flex", alignItems: "center", gap: "16px" },
  headerUser: { fontSize: "14px", opacity: 0.8 },
  logoutBtn: { padding: "6px 14px", backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  messageBanner: { backgroundColor: "#d4edda", border: "1px solid #b8dfc4", color: "#2d6a4f", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" },
  closeMsg: { background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#2d6a4f" },
  tabs: { display: "flex", gap: "0", borderBottom: "2px solid #ddd", backgroundColor: "#fff", paddingLeft: "24px" },
  tab: { padding: "14px 24px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", color: "#666", borderBottom: "2px solid transparent", marginBottom: "-2px" },
  tabActive: { padding: "14px 24px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", color: "#1a1a2e", fontWeight: "600", borderBottom: "2px solid #1a1a2e", marginBottom: "-2px" },
  content: { padding: "24px", maxWidth: "800px", margin: "0 auto" },
  sectionTitle: { fontSize: "16px", fontWeight: "600", color: "#1a1a2e", marginBottom: "14px", marginTop: "24px" },
  formRow: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" },
  formCol: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px", marginBottom: "24px" },
  input: { padding: "10px 14px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px", color: "#333", outline: "none", flex: 1, minWidth: "180px" },
  addBtn: { padding: "10px 20px", backgroundColor: "#1a1a2e", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap" },
  listItem: { backgroundColor: "#fff", borderRadius: "8px", padding: "14px 18px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  listName: { flex: 1, fontSize: "14px", color: "#333", fontWeight: "500" },
  listBadge: { backgroundColor: "#e8f4fd", color: "#1a6fa8", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "500" },
  listEmail: { fontSize: "12px", color: "#999" },
  empty: { color: "#999", fontSize: "14px", fontStyle: "italic" },
  companyCheck: { backgroundColor: "#f8f8f8", borderRadius: "8px", padding: "12px", border: "1px solid #eee" },
  label: { fontSize: "13px", color: "#555", marginBottom: "8px", fontWeight: "500" },
  checkLabel: { display: "block", fontSize: "14px", color: "#333", marginBottom: "6px", cursor: "pointer" },
};