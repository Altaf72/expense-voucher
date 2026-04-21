"use client";
import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import {
  collection, addDoc, getDocs, doc,
  updateDoc, serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getCurrentUser, logoutUser } from "../../lib/auth";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmtAED(val) {
  if (val === undefined || val === null || val === "") return "0.00";
  const num = parseFloat(val);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(amount) {
  if (!amount || isNaN(amount)) return "";
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
    "Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function convert(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
    if (n < 1000) return ones[Math.floor(n/100)]+" Hundred"+(n%100 ? " "+convert(n%100) : "");
    if (n < 1000000) return convert(Math.floor(n/1000))+" Thousand"+(n%1000 ? " "+convert(n%1000) : "");
    return convert(Math.floor(n/1000000))+" Million"+(n%1000000 ? " "+convert(n%1000000) : "");
  }
  const parts = parseFloat(amount).toFixed(2).split(".");
  const fils = parseInt(parts[1]);
  const dirhams = parseInt(parts[0]);
  if (dirhams === 0 && fils === 0) return "";
  let words = dirhams > 0 ? convert(dirhams)+" Dirhams" : "";
  if (fils > 0) words += (words ? " and " : "") + convert(fils)+" Fils";
  return words + " Only";
}

function todayFormatted() {
  return new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function isDuplicate(v, allVouchers) {
  const vDate = new Date(v.date);
  return allVouchers.some(other => {
    if (other.id === v.id) return false;
    if (other.status === "rejected") return false;
    const daysDiff = Math.abs((vDate - new Date(other.date)) / (1000 * 60 * 60 * 24));
    const sameReceiver = other.receiverName?.toLowerCase() === v.receiverName?.toLowerCase();
    const sameAmount = Math.abs(parseFloat(other.totalAmount) - parseFloat(v.totalAmount)) < 0.01;
    return sameReceiver && sameAmount && daysDiff <= 3;
  });
}

// ─────────────────────────────────────────────
// VOUCHER VIEW POPUP
// ─────────────────────────────────────────────
function VoucherViewPopup({ voucher, onClose }) {
  const attachments = voucher.attachments || [];
  const [activeIdx, setActiveIdx] = useState(0);
  const activeAtt = attachments[activeIdx] || null;
  const isImg = (url) => url && /\.(jpg|jpeg|png|gif|webp)/i.test(url);
  const hasAtt = attachments.length > 0;
  const sc = {
    approved: { bg: "#d4edda", fg: "#2d6a4f" },
    rejected:  { bg: "#fde8e8", fg: "#cc0000" },
    paid:      { bg: "#cce5ff", fg: "#004085" },
    pending:   { bg: "#fff3cd", fg: "#856404" },
  }[voucher.status] || { bg: "#f0f0f0", fg: "#555" };

  return (
    <div style={POP.overlay} onClick={onClose}>
      <div
        style={{ ...VP.box, maxWidth: hasAtt ? 980 : 560, flexDirection: hasAtt ? "row" : "column" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left — voucher details */}
        <div style={{ ...VP.left, borderRight: hasAtt ? "1px solid #eee" : "none" }}>
          <div style={VP.topBar}>
            <div>
              <div style={VP.refNum}>{voucher.refNumber}</div>
              <div style={VP.meta}>{voucher.date} · {voucher.companyName}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ ...POP.badge, backgroundColor: sc.bg, color: sc.fg }}>
                {voucher.status?.toUpperCase()}
              </span>
              <button style={VP.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>

          {voucher.duplicateFlag && (
            <div style={VP.dupWarn}>
              ⚠️ Possible duplicate — similar voucher found within 3 days
            </div>
          )}

          <div style={VP.infoGrid}>
            <div>
              <div style={VP.iLbl}>Department</div>
              <div style={VP.iVal}>{voucher.departmentName || "—"}</div>
            </div>
            <div>
              <div style={VP.iLbl}>Staff</div>
              <div style={VP.iVal}>{voucher.staffName || "—"}</div>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <div style={VP.iLbl}>Receiver / Payee</div>
              <div style={{ ...VP.iVal, fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>
                {voucher.receiverName || "—"}
              </div>
            </div>
          </div>

          <div style={VP.secTitle}>Payment Details</div>
          <div style={VP.tHead}>
            <span style={{ flex: 1.3, ...VP.tHdr }}>Category</span>
            <span style={{ flex: 2,   ...VP.tHdr }}>Description</span>
            <span style={{ flex: 0.8, ...VP.tHdr, textAlign: "right" }}>AED</span>
          </div>
          {(voucher.items || []).map((item, i) => (
            <div key={i} style={VP.tRow}>
              <span style={{ flex: 1.3, fontSize: 13, color: "#666" }}>{item.category}</span>
              <span style={{ flex: 2,   fontSize: 13, color: "#333" }}>{item.description}</span>
              <span style={{ flex: 0.8, fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                {fmtAED(item.amount)}
              </span>
            </div>
          ))}

          <div style={VP.totalRow}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Total Amount</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#cc0000" }}>
              AED {fmtAED(voucher.totalAmount)}
            </span>
          </div>
          <div style={VP.wordsRow}>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>In Words: </span>
            <span style={{ fontSize: 12, color: "#cc0000", fontWeight: 600, fontStyle: "italic" }}>
              {numberToWords(voucher.totalAmount)}
            </span>
          </div>

          {voucher.rejectionReason && (
            <div style={VP.rejectNote}>
              <span style={{ fontWeight: 600 }}>Rejection reason:</span> {voucher.rejectionReason}
            </div>
          )}

          {hasAtt && (
            <>
              <div style={VP.secTitle}>Attachments ({attachments.length})</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {attachments.map((a, i) => (
                  <div key={i} onClick={() => setActiveIdx(i)}
                    style={{
                      width: 72, border: `2px solid ${i === activeIdx ? "#2d6a4f" : "#ddd"}`,
                      borderRadius: 6, cursor: "pointer", overflow: "hidden", padding: 2,
                      backgroundColor: i === activeIdx ? "#f0f7f4" : "#f8f9fa",
                    }}>
                    {isImg(a.originalUrl)
                      ? <img src={a.thumbnailUrl || a.originalUrl} alt={a.fileName}
                          style={{ width: "100%", height: 48, objectFit: "cover", borderRadius: 4, display: "block" }} />
                      : <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📄</div>
                    }
                    <div style={{ fontSize: 9, color: "#666", textAlign: "center", padding: "2px 1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.fileName}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right — attachment viewer */}
        {hasAtt && activeAtt && (
          <div style={VP.right}>
            <div style={VP.viewerTop}>
              <span style={{ fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                📎 {activeAtt.fileName}
              </span>
              <a href={activeAtt.originalUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#2d6a4f", textDecoration: "none", padding: "3px 10px", backgroundColor: "#f0f7f4", borderRadius: 5, flexShrink: 0 }}>
                Open ↗
              </a>
            </div>
            <div style={VP.viewer}>
              {isImg(activeAtt.originalUrl)
                ? <img src={`https://docs.google.com/viewer?url=${encodeURIComponent(activeAtt.originalUrl)}&embedded=true`} alt={activeAtt.fileName}
                    style={{ maxWidth: "100%", maxHeight: "calc(88vh - 80px)", objectFit: "contain", borderRadius: 6, display: "block" }} />
                : <iframe
    src={`https://docs.google.com/viewer?url=${encodeURIComponent(activeAtt.originalUrl)}&embedded=true`}
    title={activeAtt.fileName}
    style={{ width: "100%", height: "100%", minHeight: 500, border: "none", borderRadius: 6 }}
  />
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// REJECT POPUP
// ─────────────────────────────────────────────
function RejectPopup({ voucher, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <div style={POP.overlay} onClick={onClose}>
      <div style={POP.box} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#cc0000", marginBottom: 6 }}>
          Reject Voucher
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          {voucher.refNumber} — {voucher.receiverName}
        </div>
        <label style={POP.lbl}>
          Rejection Reason <span style={{ color: "#cc0000" }}>*</span>
        </label>
        <textarea
          style={{ ...POP.tinput, minHeight: 90, resize: "vertical" }}
          placeholder="Enter reason for rejection..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button style={POP.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={POP.rejectBtn} onClick={() => {
            if (!reason.trim()) { alert("Please enter a rejection reason."); return; }
            onConfirm(reason.trim());
          }}>
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DIRECT PAYMENT POPUP
// ─────────────────────────────────────────────
function DirectPaymentPopup({ companies, onConfirm, onClose }) {
  const [companyId,    setCompanyId]    = useState("");
  const [date,         setDate]         = useState(todayFormatted());
  const [paidTo,       setPaidTo]       = useState("");
  const [description,  setDescription]  = useState("");
  const [amount,       setAmount]       = useState("");
  const [authorizedBy, setAuthorizedBy] = useState("");

  function handleSubmit() {
    if (!companyId || !paidTo.trim() || !description.trim() || !amount) {
      alert("Please fill in all required fields: Company, Paid To, Description, Amount.");
      return;
    }
    onConfirm({
      companyId,
      companyName: companies.find(c => c.id === companyId)?.name || "",
      date,
      paidTo:       paidTo.trim(),
      description:  description.trim(),
      amount:       parseFloat(amount),
      authorizedBy: authorizedBy.trim(),
    });
  }

  return (
    <div style={POP.overlay} onClick={onClose}>
      <div style={{ ...POP.box, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
          Direct Payment
        </div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          Payment without a voucher — CFO / Manager instruction
        </div>

        <div style={POP.grid}>
          <div style={POP.fg}>
            <label style={POP.lbl}>Company <span style={{ color: "#cc0000" }}>*</span></label>
            <select style={POP.tinput} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">Select company...</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={POP.fg}>
            <label style={POP.lbl}>Date</label>
            <input style={POP.tinput} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div style={{ ...POP.fg, gridColumn: "1/-1" }}>
            <label style={POP.lbl}>Paid To <span style={{ color: "#cc0000" }}>*</span></label>
            <input style={POP.tinput} placeholder="Receiver / vendor name"
              value={paidTo} onChange={e => setPaidTo(e.target.value)} />
          </div>
          <div style={{ ...POP.fg, gridColumn: "1/-1" }}>
            <label style={POP.lbl}>Description / Purpose <span style={{ color: "#cc0000" }}>*</span></label>
            <textarea style={{ ...POP.tinput, resize: "vertical" }} rows={2}
              placeholder="What is this payment for?"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div style={POP.fg}>
            <label style={POP.lbl}>Amount (AED) <span style={{ color: "#cc0000" }}>*</span></label>
            <input style={POP.tinput} type="number" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div style={POP.fg}>
            <label style={POP.lbl}>Authorized By</label>
            <input style={POP.tinput} placeholder="CFO / Manager name"
              value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button style={POP.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={POP.confirmBtn} onClick={handleSubmit}>Record Payment</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED POPUP STYLES
// ─────────────────────────────────────────────
const POP = {
  overlay:    { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.62)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  box:        { backgroundColor: "#fff", borderRadius: 12, padding: "24px", maxWidth: 440, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.22)" },
  badge:      { padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  lbl:        { fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 },
  tinput:     { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, color: "#222", outline: "none", boxSizing: "border-box", backgroundColor: "#fff", fontFamily: "sans-serif" },
  grid:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  fg:         { display: "flex", flexDirection: "column", gap: 4 },
  cancelBtn:  { flex: 1, padding: "10px", backgroundColor: "#f0f0f0", color: "#555", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 },
  rejectBtn:  { flex: 1, padding: "10px", backgroundColor: "#cc0000", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 },
  confirmBtn: { flex: 1, padding: "10px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 },
};

// ─────────────────────────────────────────────
// VOUCHER VIEW POPUP STYLES
// ─────────────────────────────────────────────
const VP = {
  box:       { backgroundColor: "#fff", borderRadius: 14, width: "96%", height: "88vh", boxShadow: "0 12px 40px rgba(0,0,0,0.24)", display: "flex", overflow: "hidden" },
  left:      { flex: "0 0 420px", minWidth: 280, overflowY: "auto", padding: "18px 20px", height: "100%" },
  right:     { flex: 1, display: "flex", flexDirection: "column", padding: 14, minWidth: 0, height: "100%" },
  topBar:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "2px solid #eee" },
  refNum:    { fontSize: 17, fontWeight: 800, color: "#2d6a4f" },
  meta:      { fontSize: 12, color: "#888", marginTop: 3 },
  closeBtn:  { background: "#f0f0f0", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 13, color: "#555", flexShrink: 0 },
  dupWarn:   { backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#856404", marginBottom: 14, fontWeight: 500 },
  infoGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
  iLbl:      { fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 },
  iVal:      { fontSize: 13, color: "#333", fontWeight: 500 },
  secTitle:  { fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.04em", borderTop: "1px solid #eee", paddingTop: 12, marginTop: 14, marginBottom: 8 },
  tHead:     { display: "flex", gap: 8, paddingBottom: 5, marginBottom: 4, borderBottom: "1px solid #f0f0f0" },
  tHdr:      { fontSize: 11, fontWeight: 700, color: "#ccc", textTransform: "uppercase" },
  tRow:      { display: "flex", gap: 8, paddingBottom: 6, marginBottom: 5, borderBottom: "1px solid #f8f8f8" },
  totalRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "2px solid #eee", marginTop: 8 },
  wordsRow:  { backgroundColor: "#fff8f8", border: "1px solid #ffe0e0", borderRadius: 7, padding: "8px 12px", marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  rejectNote:{ backgroundColor: "#fde8e8", border: "1px solid #ffcccc", borderRadius: 7, padding: "8px 12px", fontSize: 13, color: "#cc0000", marginBottom: 10 },
  viewerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexShrink: 0 },
  viewer:    { flex: 1, minHeight: 0, backgroundColor: "#f0f4f8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
};

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function CashierPage() {
  const router = useRouter();
  const [currentUser,    setCurrentUser]    = useState(null);
  const [companies,      setCompanies]      = useState([]);
  const [vouchers,       setVouchers]       = useState([]);
  const [directPayments, setDirectPayments] = useState([]);

  const [activeTab,         setActiveTab]         = useState("vouchers");
  const [msgBanner,         setMsgBanner]         = useState({ text: "", type: "success" });
  const [viewingVoucher,    setViewingVoucher]    = useState(null);
  const [rejectingVoucher,  setRejectingVoucher]  = useState(null);
  const [showDirectPayment, setShowDirectPayment] = useState(false);
  const [searchTerm,        setSearchTerm]        = useState("");
  const [filterStatus,      setFilterStatus]      = useState("pending");

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const user = await getCurrentUser();
    if (!user || user.role !== "cashier") { router.push("/login"); return; }
    setCurrentUser(user);
    await loadAll(user);
  }

  async function loadAll(user) {
    // Companies assigned to this cashier
    const compSnap = await getDocs(collection(db, "companies"));
    const allC = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const myC  = user.companies?.length ? allC.filter(c => user.companies.includes(c.id)) : allC;
    setCompanies(myC);
    const myIds = myC.map(c => c.id);

    // All vouchers — needed for duplicate detection
    const vSnap = await getDocs(collection(db, "vouchers"));
    const allV  = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter to my companies, flag duplicates, sort newest first
    const myV = allV
      .filter(v => myIds.includes(v.companyId))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .map(v => ({
        ...v,
        duplicateFlag: v.status === "pending" ? isDuplicate(v, allV) : (v.duplicateFlag || false),
      }));
    setVouchers(myV);

    // Direct payments for my companies
    const dpSnap = await getDocs(collection(db, "direct_payments"));
    const myDp = dpSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(dp => myIds.includes(dp.companyId))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setDirectPayments(myDp);
  }

  function showBanner(text, type = "success") {
    setMsgBanner({ text, type });
    setTimeout(() => setMsgBanner({ text: "", type: "success" }), 4500);
  }

  // ── APPROVE & PAY ─────────────────────────
  async function approveVoucher(v) {
    const company = companies.find(c => c.id === v.companyId);
    if (!company) { showBanner("Company not found.", "error"); return; }
    if ((company.balance || 0) < v.totalAmount) {
      showBanner(`Insufficient balance! Available: AED ${fmtAED(company.balance)}`, "error");
      return;
    }
    try {
      const newBal = (company.balance || 0) - v.totalAmount;
      await updateDoc(doc(db, "vouchers", v.id), {
        status: "paid",
        approvedBy: currentUser.name,
        approvedAt: serverTimestamp(),
        paidAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "companies", v.companyId), { balance: newBal });
      await addDoc(collection(db, "transactions"), {
        type: "voucher_payment",
        voucherId: v.id,
        refNumber: v.refNumber,
        companyId: v.companyId,
        companyName: v.companyName,
        amount: v.totalAmount,
        balanceBefore: company.balance,
        balanceAfter: newBal,
        processedBy: currentUser.name,
        createdAt: serverTimestamp(),
      });
      showBanner(`Voucher ${v.refNumber} approved and paid! Balance updated.`);
      await loadAll(currentUser);
    } catch (e) { showBanner("Error: " + e.message, "error"); }
  }

  // ── REJECT ────────────────────────────────
  async function rejectVoucher(v, reason) {
    try {
      await updateDoc(doc(db, "vouchers", v.id), {
        status: "rejected",
        rejectionReason: reason,
        rejectedBy: currentUser.name,
        rejectedAt: serverTimestamp(),
      });
      setRejectingVoucher(null);
      showBanner(`Voucher ${v.refNumber} rejected.`);
      await loadAll(currentUser);
    } catch (e) { showBanner("Error: " + e.message, "error"); }
  }

  // ── DIRECT PAYMENT ────────────────────────
  async function recordDirectPayment(data) {
    const company = companies.find(c => c.id === data.companyId);
    if (!company) { showBanner("Company not found.", "error"); return; }
    if ((company.balance || 0) < data.amount) {
      showBanner(`Insufficient balance! Available: AED ${fmtAED(company.balance)}`, "error");
      return;
    }
    try {
      const newBal = (company.balance || 0) - data.amount;
      await addDoc(collection(db, "direct_payments"), {
        ...data,
        recordedBy: currentUser.name,
        balanceBefore: company.balance,
        balanceAfter: newBal,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "companies", data.companyId), { balance: newBal });
      await addDoc(collection(db, "transactions"), {
        type: "direct_payment",
        companyId: data.companyId,
        companyName: data.companyName,
        amount: data.amount,
        description: data.description,
        paidTo: data.paidTo,
        balanceBefore: company.balance,
        balanceAfter: newBal,
        processedBy: currentUser.name,
        authorizedBy: data.authorizedBy || "",
        createdAt: serverTimestamp(),
      });
      setShowDirectPayment(false);
      showBanner(`Direct payment of AED ${fmtAED(data.amount)} to ${data.paidTo} recorded.`);
      await loadAll(currentUser);
    } catch (e) { showBanner("Error: " + e.message, "error"); }
  }

  async function handleLogout() { await logoutUser(); router.push("/login"); }

  // ── FILTERED VOUCHERS ─────────────────────
  const filteredVouchers = vouchers.filter(v => {
    const matchStatus = filterStatus === "all" || v.status === filterStatus;
    const q = searchTerm.toLowerCase();
    const matchSearch = !searchTerm ||
      v.refNumber?.toLowerCase().includes(q) ||
      v.receiverName?.toLowerCase().includes(q) ||
      v.companyName?.toLowerCase().includes(q) ||
      v.staffName?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const totalBalance = companies.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);

  // pending count for badge
  const pendingCount = vouchers.filter(v => v.status === "pending").length;
  const dupCount     = vouchers.filter(v => v.status === "pending" && v.duplicateFlag).length;

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* Popups */}
      {viewingVoucher && (
        <VoucherViewPopup voucher={viewingVoucher} onClose={() => setViewingVoucher(null)} />
      )}
      {rejectingVoucher && (
        <RejectPopup
          voucher={rejectingVoucher}
          onConfirm={reason => rejectVoucher(rejectingVoucher, reason)}
          onClose={() => setRejectingVoucher(null)}
        />
      )}
      {showDirectPayment && (
        <DirectPaymentPopup
          companies={companies}
          onConfirm={recordDirectPayment}
          onClose={() => setShowDirectPayment(false)}
        />
      )}

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.headerTitle}>Cashier Dashboard</h1>
        <div style={S.headerRight}>
            <button style={{ padding:"7px 16px", backgroundColor:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", color:"#fff", borderRadius:7, cursor:"pointer", fontSize:13, fontWeight:600 }} onClick={() => router.push("/print")}>
                🖨️ Print
            </button>
          <span style={S.headerUser}>👤 {currentUser?.name}</span>
          <button style={S.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Banner */}
      {msgBanner.text && (
        <div style={{
          ...S.banner,
          backgroundColor: msgBanner.type === "error" ? "#fde8e8" : "#d4edda",
          color: msgBanner.type === "error" ? "#cc0000" : "#2d6a4f",
          borderBottom: `1px solid ${msgBanner.type === "error" ? "#ffcccc" : "#b8dfc4"}`,
        }}>
          <span>{msgBanner.text}</span>
          <button style={S.bannerClose} onClick={() => setMsgBanner({ text: "", type: "success" })}>✕</button>
        </div>
      )}

      {/* Balance Cards */}
      <div style={S.balBar}>
        {companies.map(c => (
          <div key={c.id} style={S.balCard}>
            <div style={S.balCo}>{c.name}</div>
            <div style={S.balAmt}>AED {fmtAED(c.balance)}</div>
            <div style={S.balLbl}>Available Balance</div>
          </div>
        ))}
        <div style={{ ...S.balCard, backgroundColor: "#1a1a2e" }}>
          <div style={{ ...S.balCo, color: "#aaa" }}>Combined Total</div>
          <div style={{ ...S.balAmt, color: "#fff", fontSize: 20 }}>AED {fmtAED(totalBalance)}</div>
          <div style={{ ...S.balLbl, color: "#777" }}>All Companies</div>
        </div>
      </div>

      {/* Alert strip — duplicate warnings */}
      {dupCount > 0 && (
        <div style={S.dupStrip}>
          ⚠️ {dupCount} pending voucher{dupCount > 1 ? "s" : ""} flagged as possible duplicates — review carefully before approving
        </div>
      )}

      {/* Tab bar */}
      <div style={S.tabBar}>
        <div style={S.tabs}>
          <button style={activeTab === "vouchers" ? S.tabOn : S.tabOff} onClick={() => setActiveTab("vouchers")}>
            Vouchers
            {pendingCount > 0 && <span style={S.pendingBadge}>{pendingCount}</span>}
          </button>
          <button style={activeTab === "direct" ? S.tabOn : S.tabOff} onClick={() => setActiveTab("direct")}>
            Direct Payments
          </button>
        </div>
        <button style={S.dpBtn} onClick={() => setShowDirectPayment(true)}>
          + Direct Payment
        </button>
      </div>

      <div style={S.content}>

        {/* ══════════ VOUCHERS TAB ══════════ */}
        {activeTab === "vouchers" && (
          <div>
            {/* Filters */}
            <div style={S.filterRow}>
              <input
                style={S.searchInput}
                placeholder="🔍  Search ref, receiver, company, staff..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <select style={S.filterSel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
              {searchTerm && (
                <button style={S.clearBtn} onClick={() => setSearchTerm("")}>✕</button>
              )}
            </div>

            {filteredVouchers.length === 0 && (
              <p style={S.empty}>No vouchers found.</p>
            )}

            {filteredVouchers.map(v => {
              const sc = {
                paid:     { bg: "#cce5ff", fg: "#004085" },
                rejected: { bg: "#fde8e8", fg: "#cc0000" },
                pending:  { bg: "#fff3cd", fg: "#856404" },
              }[v.status] || { bg: "#f0f0f0", fg: "#555" };

              return (
                <div key={v.id} style={{
                  ...S.vCard,
                  borderLeft: v.duplicateFlag ? "4px solid #ffc107" : "4px solid transparent",
                }}>
                  {/* Duplicate warning */}
                  {v.duplicateFlag && (
                    <div style={S.dupWarn}>
                      ⚠️ Possible duplicate — same receiver &amp; amount found within 3 days
                    </div>
                  )}

                  {/* Row 1 — ref + date + status */}
                  <div style={S.vTop}>
                    <span style={S.vRef}>{v.refNumber}</span>
                    <span style={S.vDate}>{v.date}</span>
                    <span style={{ ...S.badge, backgroundColor: sc.bg, color: sc.fg }}>
                      {v.status?.toUpperCase()}
                    </span>
                  </div>

                  {/* Row 2 — info */}
                  <div style={S.vInfo}>
                    <span style={S.vCo}>🏢 {v.companyName?.slice(0, 16)}</span>
                    <span>👤 {v.receiverName}</span>
                    <span style={{ color: "#aaa", fontSize: 12 }}>by {v.staffName}</span>
                    {v.attachments?.length > 0 && (
                      <span style={S.attBadge}>📎 {v.attachments.length}</span>
                    )}
                    <span style={S.vAmt}>AED {fmtAED(v.totalAmount)}</span>
                  </div>

                  {/* Row 3 — actions */}
                  <div style={S.vActions}>
                    <button
                      style={{ ...S.actBtn, color: "#2d6a4f", fontWeight: 600 }}
                      onClick={() => setViewingVoucher(v)}
                    >
                      👁 View
                    </button>

                    {v.status === "pending" && (
                      <>
                        <button style={S.approveBtn} onClick={() => approveVoucher(v)}>
                          ✓ Approve &amp; Pay
                        </button>
                        <button style={S.rejectBtn} onClick={() => setRejectingVoucher(v)}>
                          ✕ Reject
                        </button>
                      </>
                    )}

                    {v.status === "rejected" && v.rejectionReason && (
                      <span style={S.rejectReason}>📋 {v.rejectionReason}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════ DIRECT PAYMENTS TAB ══════════ */}
        {activeTab === "direct" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={S.secTitle}>Direct Payments</h2>
              <button style={S.dpBtn} onClick={() => setShowDirectPayment(true)}>+ New</button>
            </div>

            {directPayments.length === 0 && (
              <p style={S.empty}>No direct payments recorded yet.</p>
            )}

            {directPayments.map(dp => (
              <div key={dp.id} style={S.dpCard}>
                <div style={S.vTop}>
                  <span style={{ ...S.vRef, color: "#2d6a4f" }}>{dp.date}</span>
                  <span style={S.vCo}>🏢 {dp.companyName}</span>
                  <span style={S.vAmt}>AED {fmtAED(dp.amount)}</span>
                </div>
                <div style={{ fontSize: 14, color: "#333", marginBottom: 4 }}>
                  <strong>To:</strong> {dp.paidTo}
                </div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>{dp.description}</div>
                <div style={{ fontSize: 12, color: "#999" }}>
                  Recorded by {dp.recordedBy}
                  {dp.authorizedBy ? ` · Authorized by ${dp.authorizedBy}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const S = {
  page:        { minHeight: "100vh", backgroundColor: "#f0f4f8", fontFamily: "sans-serif" },

  header:      { backgroundColor: "#2d6a4f", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { margin: 0, fontSize: 17, fontWeight: 600 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  headerUser:  { fontSize: 13, opacity: 0.85 },
  logoutBtn:   { padding: "5px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.45)", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 12 },

  banner:      { padding: "11px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 },
  bannerClose: { background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.7 },

  balBar:   { display: "flex", gap: 12, padding: "14px 20px", backgroundColor: "#fff", borderBottom: "1px solid #eee", flexWrap: "wrap" },
  balCard:  { flex: "1 1 150px", backgroundColor: "#f0f7f4", borderRadius: 10, padding: "12px 16px", minWidth: 130 },
  balCo:    { fontSize: 12, fontWeight: 600, color: "#2d6a4f", marginBottom: 4 },
  balAmt:   { fontSize: 18, fontWeight: 800, color: "#1a1a2e", marginBottom: 2 },
  balLbl:   { fontSize: 11, color: "#888" },

  dupStrip: { backgroundColor: "#fff3cd", borderBottom: "1px solid #ffc107", padding: "10px 20px", fontSize: 13, color: "#856404", fontWeight: 500 },

  tabBar:       { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #ddd", backgroundColor: "#fff", paddingLeft: 20, paddingRight: 16 },
  tabs:         { display: "flex" },
  tabOff:       { padding: "12px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#666", borderBottom: "2px solid transparent", marginBottom: -2, display: "flex", alignItems: "center", gap: 6 },
  tabOn:        { padding: "12px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#2d6a4f", fontWeight: 600, borderBottom: "2px solid #2d6a4f", marginBottom: -2, display: "flex", alignItems: "center", gap: 6 },
  pendingBadge: { backgroundColor: "#cc0000", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 700, padding: "1px 7px" },
  dpBtn:        { padding: "8px 16px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  content:    { padding: "20px 16px", maxWidth: 860, margin: "0 auto" },
  filterRow:  { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  searchInput:{ flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, color: "#333", outline: "none" },
  filterSel:  { padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, color: "#333", outline: "none", backgroundColor: "#fff" },
  clearBtn:   { padding: "8px 12px", background: "#eee", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 },

  vCard:      { backgroundColor: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 10, boxShadow: "0 1px 5px rgba(0,0,0,0.07)" },
  dupWarn:    { backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "7px 12px", fontSize: 12, color: "#856404", fontWeight: 500, marginBottom: 10 },
  vTop:       { display: "flex", alignItems: "center", gap: 10, marginBottom: 7, flexWrap: "wrap" },
  vRef:       { fontSize: 13, fontWeight: 700, color: "#2d6a4f", flex: 1 },
  vDate:      { fontSize: 12, color: "#888" },
  badge:      { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, flexShrink: 0 },
  vInfo:      { display: "flex", gap: 12, fontSize: 13, color: "#555", marginBottom: 9, flexWrap: "wrap", alignItems: "center" },
  vCo:        { fontWeight: 600, color: "#333" },
  vAmt:       { fontWeight: 800, color: "#cc0000", fontSize: 14, marginLeft: "auto" },
  attBadge:   { backgroundColor: "#e8f4fd", color: "#1a6fa8", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  vActions:   { display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #f0f0f0", alignItems: "center" },
  actBtn:     { padding: "6px 13px", backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#444" },
  approveBtn: { padding: "6px 18px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  rejectBtn:  { padding: "6px 16px", backgroundColor: "#fde8e8", color: "#cc0000", border: "1px solid #ffcccc", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  rejectReason: { fontSize: 12, color: "#856404", fontStyle: "italic", flex: 1 },

  secTitle: { fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: 0 },
  dpCard:   { backgroundColor: "#fff", borderRadius: 10, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 5px rgba(0,0,0,0.07)", borderLeft: "4px solid #2d6a4f" },
  empty:    { color: "#999", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 40 },
};
