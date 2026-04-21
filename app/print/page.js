"use client";
import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
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
  const fils = parseInt(parts[1]), dirhams = parseInt(parts[0]);
  if (dirhams === 0 && fils === 0) return "";
  let words = dirhams > 0 ? convert(dirhams)+" Dirhams" : "";
  if (fils > 0) words += (words ? " and " : "") + convert(fils)+" Fils";
  return words + " Only";
}

function isImageUrl(url) {
  return url && /\.(jpg|jpeg|png|gif|webp)/i.test(url);
}

// ─────────────────────────────────────────────
// A5 VOUCHER — print component
// ─────────────────────────────────────────────
function VoucherA5({ voucher, logo }) {
  const items = voucher.items || [];
  const rows = [...items];
  while (rows.length < 3) rows.push({ category: "", description: "", amount: "" });

  return (
    <div className="voucher-a5">
      {/* Header */}
      <div className="vh-row">
        <div className="vh-logo">
          {logo
            ? <img src={logo} alt="logo" className="vh-logo-img" />
            : <div className="vh-logo-text">{voucher.companyName}</div>
          }
        </div>
        <div className="vh-center">
          <div className="vh-title">Expense Reimbursement Voucher</div>
          <div className="vh-title-ar">فاتورة استرداد المصاريف</div>
        </div>
        <div className="vh-ref">
          <div className="vh-ref-label">Ref No. / المرجع</div>
          <div className="vh-ref-num">{voucher.refNumber}</div>
          <div className="vh-ref-date">{voucher.date}</div>
        </div>
      </div>

      {/* Info grid */}
      <div className="vi-grid">
        <div className="vi-cell">
          <span className="vi-label">Company / الشركة</span>
          <span className="vi-val">{voucher.companyName}</span>
        </div>
        <div className="vi-cell">
          <span className="vi-label">Department / القسم</span>
          <span className="vi-val">{voucher.departmentName}</span>
        </div>
        <div className="vi-cell">
          <span className="vi-label">Prepared By / أعده</span>
          <span className="vi-val">{voucher.staffName}</span>
        </div>
        <div className="vi-cell">
          <span className="vi-label">Receiver / المستلم</span>
          <span className="vi-val vi-bold">{voucher.receiverName}</span>
        </div>
      </div>

      {/* Table */}
      <div className="vt-title">Payment Details / تفاصيل الدفع</div>
      <table className="vt">
        <thead>
          <tr>
            <th className="vt-h" style={{ width: "5%" }}>#</th>
            <th className="vt-h" style={{ width: "28%" }}>Fee Name / اسم الرسوم</th>
            <th className="vt-h" style={{ width: "47%" }}>Purpose / الغرض</th>
            <th className="vt-h" style={{ width: "20%", textAlign: "right" }}>AED</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? "vt-r" : "vt-r vt-alt"}>
              <td className="vt-d">{item.amount ? i + 1 : ""}</td>
              <td className="vt-d">{item.category}</td>
              <td className="vt-d">{item.description}</td>
              <td className="vt-d" style={{ textAlign: "right", fontWeight: item.amount ? 600 : 400 }}>
                {item.amount ? fmtAED(item.amount) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="vb-total">
        <div className="vb-words">
          <span className="vi-label">Amount in Words / المبلغ كتابةً:&nbsp;</span>
          <span className="vb-words-text">{numberToWords(voucher.totalAmount)}</span>
        </div>
        <div className="vb-amount-box">
          <span className="vb-amount-label">Total / المجموع</span>
          <span className="vb-amount">AED {fmtAED(voucher.totalAmount)}</span>
        </div>
      </div>

      {/* Signatures */}
      <div className="vs-row">
        {[["General Manager","المدير العام"],["Department Head","رئيس القسم"],["Finance","المالية"],["Cashier","أمين الصندوق"]].map(([en, ar]) => (
          <div key={en} className="vs-cell">
            <div className="vs-line" />
            <div className="vs-en">{en}</div>
            <div className="vs-ar">{ar}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="vf-row">
        <span className="vf-stamp" style={{
          color: voucher.status === "paid" ? "#2d6a4f" : "#856404",
          borderColor: voucher.status === "paid" ? "#2d6a4f" : "#ffc107",
        }}>
          {voucher.status === "paid" ? "PAID ✓" : voucher.status?.toUpperCase()}
        </span>
        <span className="vf-ref">{voucher.refNumber} · {voucher.companyName}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ATTACHMENT FULL PAGE
// ─────────────────────────────────────────────

function AttachmentPage({ attachment, label }) {
  return (
    <div className="att-page">
      <div className="att-header">
        <span className="att-label">{label}</span>
        <span className="att-filename">{attachment.fileName}</span>
      </div>
      <div className="att-body">
        {isImageUrl(attachment.originalUrl)
          ? <img src={attachment.originalUrl} alt={attachment.fileName} className="att-img" />
          : <iframe
              src={attachment.originalUrl}
              title={attachment.fileName}
              style={{ width: "100%", height: "100%", minHeight: 500, border: "none", borderRadius: 6 }}
            />
        }
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function PrintPage() {
  const router = useRouter();
  const [currentUser,  setCurrentUser]  = useState(null);
  const [vouchers,     setVouchers]     = useState([]);
  const [companies,    setCompanies]    = useState([]);
  const [selectedIds,  setSelectedIds]  = useState([]);
  // skippedAtts: { [voucherId]: Set of attachment originalUrls to skip }
  const [skippedAtts,  setSkippedAtts]  = useState({});
  const [filterStatus, setFilterStatus] = useState("paid");
  const [filterComp,   setFilterComp]   = useState("all");
  const [searchTerm,   setSearchTerm]   = useState("");
  const [msgBanner,    setMsgBanner]    = useState({ text: "", type: "success" });
  const [expandedIds,  setExpandedIds]  = useState(new Set()); // which cards show attachments

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const user = await getCurrentUser();
    if (!user || !["cashier","finance","admin"].includes(user.role)) {
      router.push("/login"); return;
    }
    setCurrentUser(user);
    await loadData(user);
  }

  async function loadData(user) {
    const compSnap = await getDocs(collection(db, "companies"));
    setCompanies(compSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const vSnap = await getDocs(collection(db, "vouchers"));
    let allV = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (user.role === "cashier" && user.companies?.length) {
      allV = allV.filter(v => user.companies.includes(v.companyId));
    }
    setVouchers(allV.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)));
  }

  function showBanner(text, type = "success") {
    setMsgBanner({ text, type });
    setTimeout(() => setMsgBanner({ text: "", type: "success" }), 4000);
  }

  // ── LOGO UPLOAD ───────────────────────────
  async function handleLogoUpload(e, companyId) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showBanner("Logo must be under 2MB.", "error"); return; }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", "expense_voucher");
    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${"dsr4kaupw"}/image/upload`,
        { method: "POST", body: fd }
      );
      const data = await res.json();
      if (data.secure_url) {
        await updateDoc(doc(db, "companies", companyId), { logoUrl: data.secure_url });
        setCompanies(prev => prev.map(c =>
          c.id === companyId ? { ...c, logoUrl: data.secure_url } : c
        ));
        showBanner("Logo uploaded!");
      }
    } catch { showBanner("Logo upload failed.", "error"); }
  }

  // ── SELECTION ─────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    // Auto-expand card when selected to show attachments
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (!selectedIds.includes(id)) next.add(id); else next.delete(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(filteredVouchers.map(v => v.id));
    setExpandedIds(new Set(filteredVouchers.map(v => v.id)));
  }

  function selectUnprinted() {
    const ids = filteredVouchers.filter(v => !v.printed).map(v => v.id);
    setSelectedIds(ids);
    setExpandedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds([]);
    setExpandedIds(new Set());
  }

  function toggleExpand(id, e) {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── ATTACHMENT SKIP ───────────────────────
  function toggleSkipAtt(voucherId, url) {
    setSkippedAtts(prev => {
      const current = new Set(prev[voucherId] || []);
      current.has(url) ? current.delete(url) : current.add(url);
      return { ...prev, [voucherId]: current };
    });
  }

  function isAttSkipped(voucherId, url) {
    return skippedAtts[voucherId]?.has(url) || false;
  }

  // Get active (non-skipped) attachments for a voucher
  function activeAtts(voucher) {
    return (voucher.attachments || []).filter(a => !isAttSkipped(voucher.id, a.originalUrl));
  }

  // ── MARK PRINTED ─────────────────────────
  async function markPrinted(ids) {
    for (const id of ids) {
      await updateDoc(doc(db, "vouchers", id), {
        printed: true,
        printedAt: new Date().toISOString(),
        printedBy: currentUser?.name || "",
      });
    }
    await loadData(currentUser);
    showBanner(`${ids.length} voucher(s) marked as printed.`);
  }

  // ── PRINT ─────────────────────────────────
  function handlePrint() {
    if (!selectedIds.length) { showBanner("Please select at least one voucher to print.", "error"); return; }
    window.print();
    setTimeout(() => markPrinted(selectedIds), 2000);
  }

  async function handleLogout() { await logoutUser(); router.push("/login"); }

  // ── FILTER ────────────────────────────────
  const filteredVouchers = vouchers.filter(v => {
    const ms = filterStatus === "all" || v.status === filterStatus;
    const mc = filterComp   === "all" || v.companyId === filterComp;
    const q  = searchTerm.toLowerCase();
    const mq = !searchTerm ||
      v.refNumber?.toLowerCase().includes(q) ||
      v.receiverName?.toLowerCase().includes(q) ||
      v.companyName?.toLowerCase().includes(q);
    return ms && mc && mq;
  });

  const toPrint    = vouchers.filter(v => selectedIds.includes(v.id));
  const unprinted  = filteredVouchers.filter(v => !v.printed).length;

  function getLogo(companyId) {
    return companies.find(c => c.id === companyId)?.logoUrl || null;
  }

  // ── PRINT PLAN ────────────────────────────
  // Decide layout per voucher:
  // - No active attachments → pair with next no-attachment voucher (2 per page)
  // - Has active attachments → own page: voucher + att1 on same page, att2+ own pages
  function buildPrintPlan() {
    const plan = []; // array of "print units"
    let noAttBuffer = null; // holds one voucher waiting to be paired

    for (const voucher of toPrint) {
      const atts = activeAtts(voucher);
      const logo = getLogo(voucher.companyId);

      if (atts.length === 0) {
        // No attachments — try to pair
        if (noAttBuffer) {
          plan.push({ type: "pair", v1: noAttBuffer, v2: { voucher, logo } });
          noAttBuffer = null;
        } else {
          noAttBuffer = { voucher, logo };
        }
      } else {
        // Has attachments — flush buffer first as solo if needed
        if (noAttBuffer) {
          plan.push({ type: "solo", v1: noAttBuffer });
          noAttBuffer = null;
        }
        plan.push({ type: "with-atts", voucher, logo, atts });
      }
    }
    // Flush remaining buffer
    if (noAttBuffer) plan.push({ type: "solo", v1: noAttBuffer });
    return plan;
  }

  const printPlan = buildPrintPlan();

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <>
      {/* ═══════════ SCREEN UI ═══════════ */}
      <div className="screen-only">

        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Print Vouchers</h1>
            <div style={S.headerSub}>
              2 per page when no attachments · Smart fit with attachments
            </div>
          </div>
          <div style={S.headerRight}>
            <span style={S.headerUser}>👤 {currentUser?.name}</span>
            <button style={S.logoutBtn} onClick={handleLogout}>Logout</button>
          </div>
        </div>

        {msgBanner.text && (
          <div style={{ ...S.banner, backgroundColor: msgBanner.type === "error" ? "#fde8e8" : "#d4edda", color: msgBanner.type === "error" ? "#cc0000" : "#2d6a4f" }}>
            <span>{msgBanner.text}</span>
            <button style={S.bannerClose} onClick={() => setMsgBanner({ text: "", type: "success" })}>✕</button>
          </div>
        )}

        <div style={S.content}>

          {/* Company Logos */}
          <div style={S.section}>
            <div style={S.sectionHead}>
              <span style={S.sectionTitle}>🏢 Company Logos</span>
              <span style={S.sectionSub}>Appears top-left on every printed voucher</span>
            </div>
            <div style={S.logoGrid}>
              {companies.map(c => (
                <div key={c.id} style={S.logoCard}>
                  <div style={S.logoName}>{c.name}</div>
                  {c.logoUrl
                    ? <img src={c.logoUrl} alt="logo" style={S.logoPreview} />
                    : <div style={S.logoEmpty}>No logo</div>
                  }
                  <label style={S.uploadBtn}>
                    {c.logoUrl ? "🔄 Replace" : "📁 Upload Logo"}
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => handleLogoUpload(e, c.id)} />
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={S.section}>
            <div style={S.filterRow}>
              <input style={S.searchInput}
                placeholder="🔍  Search ref, receiver, company..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <select style={S.sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="paid">Paid only</option>
                <option value="pending">Pending</option>
                <option value="all">All statuses</option>
              </select>
              <select style={S.sel} value={filterComp} onChange={e => setFilterComp(e.target.value)}>
                <option value="all">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Print Controls */}
          <div style={S.printControls}>
            <div style={S.ctrlLeft}>
              <button style={S.ctrlBtn} onClick={selectAll}>
                ☑ All ({filteredVouchers.length})
              </button>
              <button style={S.ctrlBtn} onClick={selectUnprinted}>
                ☐ Unprinted ({unprinted})
              </button>
              <button style={S.ctrlBtn} onClick={clearSelection}>✕ Clear</button>
            </div>
            <div style={S.ctrlRight}>
              {selectedIds.length > 0 && (
                <span style={S.selCount}>{selectedIds.length} selected</span>
              )}
              <button
                style={selectedIds.length ? S.printBtn : S.printBtnOff}
                onClick={handlePrint}
                disabled={!selectedIds.length}
              >
                🖨️ Print
              </button>
            </div>
          </div>

          {/* Layout preview hint */}
          {selectedIds.length > 0 && (
            <div style={S.layoutHint}>
              <span>📐 Print layout preview: </span>
              {printPlan.map((unit, i) => {
                if (unit.type === "pair") return <span key={i} style={S.hintChip}>📄+📄 2-per-page</span>;
                if (unit.type === "solo") return <span key={i} style={S.hintChip}>📄 solo</span>;
                return <span key={i} style={{ ...S.hintChip, backgroundColor: "#e8f4fd", color: "#1a6fa8" }}>
                  📄+📎×{unit.atts.length}
                </span>;
              })}
            </div>
          )}

          {/* Voucher List */}
          {filteredVouchers.length === 0 && <p style={S.empty}>No vouchers found.</p>}

          {filteredVouchers.map(v => {
            const sel      = selectedIds.includes(v.id);
            const expanded = expandedIds.has(v.id);
            const atts     = v.attachments || [];
            const activeCount = activeAtts(v).length;
            const sc = {
              paid:    { bg: "#cce5ff", fg: "#004085" },
              pending: { bg: "#fff3cd", fg: "#856404" },
              rejected:{ bg: "#fde8e8", fg: "#cc0000" },
            }[v.status] || { bg: "#f0f0f0", fg: "#555" };

            return (
              <div key={v.id}
                style={{
                  ...S.vCard,
                  borderLeft: sel ? "4px solid #1a6fa8" : "4px solid #eee",
                  backgroundColor: sel ? "#f0f7ff" : "#fff",
                }}
                onClick={() => toggleSelect(v.id)}
              >
                {/* Main row */}
                <div style={S.vTop}>
                  <input type="checkbox" checked={sel}
                    onChange={() => toggleSelect(v.id)}
                    onClick={e => e.stopPropagation()}
                    style={S.checkbox} />
                  <span style={S.vRef}>{v.refNumber}</span>
                  <span style={S.vDate}>{v.date}</span>
                  <span style={{ ...S.badge, backgroundColor: sc.bg, color: sc.fg }}>
                    {v.status?.toUpperCase()}
                  </span>
                  {v.printed && <span style={S.printedBadge}>🖨️ Printed</span>}
                </div>

                <div style={S.vInfo}>
                  <span style={S.vCo}>🏢 {v.companyName}</span>
                  <span>👤 {v.receiverName}</span>
                  <span style={S.vDept}>📁 {v.departmentName}</span>
                  <span style={S.vAmt}>AED {fmtAED(v.totalAmount)}</span>

                  {/* Attachment expand toggle */}
                  {atts.length > 0 && (
                    <button
                      style={{ ...S.attToggleBtn, marginLeft: "auto", backgroundColor: expanded ? "#e8f4fd" : "#f5f5f5" }}
                      onClick={e => toggleExpand(v.id, e)}
                    >
                      📎 {activeCount}/{atts.length} attachment{atts.length > 1 ? "s" : ""}
                      {expanded ? " ▲" : " ▼"}
                    </button>
                  )}
                </div>

                {/* Attachment list — shown when expanded */}
                {expanded && atts.length > 0 && (
                  <div style={S.attList} onClick={e => e.stopPropagation()}>
                    <div style={S.attListTitle}>
                      Attachments — uncheck to skip from print:
                    </div>
                    {atts.map((a, ai) => {
                      const skipped = isAttSkipped(v.id, a.originalUrl);
                      return (
                        <div key={ai} style={{
                          ...S.attRow,
                          opacity: skipped ? 0.45 : 1,
                        }}>
                          <input
                            type="checkbox"
                            checked={!skipped}
                            onChange={() => toggleSkipAtt(v.id, a.originalUrl)}
                            style={S.checkbox}
                          />
                          {/* Thumbnail */}
                          <div style={S.attThumb}>
                            {isImageUrl(a.thumbnailUrl || a.originalUrl)
                              ? <img
                                  src={a.thumbnailUrl || a.originalUrl}
                                  alt={a.fileName}
                                  style={S.thumbImg}
                                />
                              : <div style={S.thumbPdf}>PDF</div>
                            }
                          </div>
                          <div style={S.attInfo}>
                            <div style={{ ...S.attName, textDecoration: skipped ? "line-through" : "none" }}>
                              {a.fileName}
                            </div>
                            <div style={S.attType}>
                              {isImageUrl(a.originalUrl) ? "Image" : "PDF Document"}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, color: skipped ? "#cc0000" : "#2d6a4f", fontWeight: 600 }}>
                            {skipped ? "Skipped" : "Include"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════ PRINT OUTPUT ═══════════
          Rules:
          - "pair"      → 2 vouchers on 1 A4 page, dashed divider
          - "solo"      → 1 voucher top half, blank bottom (no attachments)
          - "with-atts" → voucher + att1 on same page; att2+ own pages
      ════════════════════════════════════ */}
      <div className="print-only">
        {printPlan.map((unit, ui) => {
          if (unit.type === "pair") {
            return (
              <div key={ui} className="p-a4-page">
                <VoucherA5 voucher={unit.v1.voucher} logo={unit.v1.logo} />
                <div className="p-dashed-divider" />
                <VoucherA5 voucher={unit.v2.voucher} logo={unit.v2.logo} />
              </div>
            );
          }

          if (unit.type === "solo") {
            return (
              <div key={ui} className="p-a4-page">
                <VoucherA5 voucher={unit.v1.voucher} logo={unit.v1.logo} />
              </div>
            );
          }

          // "with-atts" — voucher + all active attachments
          const { voucher, logo, atts } = unit;
          const firstAtt  = atts[0];
          const extraAtts = atts.slice(1);
          const totalAtts = atts.length;

          return (
            <div key={ui}>
              {/* Page 1: Voucher + first attachment fills remaining space */}
              <div className="p-a4-page p-has-att">
                <VoucherA5 voucher={voucher} logo={logo} />
                <div className="p-solid-divider" />
                <AttachmentPage
                  attachment={firstAtt}
                  label={`Attachment 1${totalAtts > 1 ? ` of ${totalAtts}` : ""} · ${voucher.refNumber} · ${voucher.receiverName}`}
                />
              </div>

              {/* Extra attachments — one per page */}
              {extraAtts.map((att, ai) => (
                <div key={ai} className="p-a4-page p-att-only">
                  <AttachmentPage
                    attachment={att}
                    label={`Attachment ${ai + 2} of ${totalAtts} · ${voucher.refNumber} · ${voucher.receiverName}`}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ═══════════ CSS ═══════════ */}
      <style>{`

        @media screen {
          .print-only { display: none !important; }
        }

        @media print {
          .screen-only { display: none !important; }
          .print-only  { display: block !important; }

          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }

          body { margin: 0; padding: 0; background: white; }

          /* ── A4 page wrapper ── */
          .p-a4-page {
            width: 100%;
            height: 277mm;
            display: flex;
            flex-direction: column;
            page-break-after: always;
            box-sizing: border-box;
            overflow: hidden;
          }

          /* When page has attachments — voucher gets fixed height, att fills rest */
          .p-has-att .voucher-a5 { flex-shrink: 0; }
          .p-has-att .att-page   { flex: 1; min-height: 0; }

          /* Pure attachment page — fills full A4 */
          .p-att-only .att-page  { flex: 1; height: 277mm; }

          /* Dividers */
          .p-dashed-divider {
            border-top: 1pt dashed #aaa;
            margin: 3mm 0;
            flex-shrink: 0;
          }
          .p-solid-divider {
            border-top: 1.5pt solid #555;
            margin: 3mm 0;
            flex-shrink: 0;
          }

          /* ── Voucher A5 ── */
          .voucher-a5 {
            width: 100%;
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8pt;
            color: #111;
            border: 0.5pt solid #ccc;
            padding: 4mm 5mm;
          }

          .vh-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            border-bottom: 1pt solid #333;
            padding-bottom: 2mm;
            margin-bottom: 2mm;
          }
          .vh-logo     { width: 30mm; display: flex; align-items: center; }
          .vh-logo-img { max-height: 14mm; max-width: 28mm; object-fit: contain; }
          .vh-logo-text{ font-size: 8pt; font-weight: bold; color: #333; }
          .vh-center   { flex: 1; text-align: center; padding: 0 4mm; }
          .vh-title    { font-size: 11pt; font-weight: bold; }
          .vh-title-ar { font-size: 8pt; color: #555; margin-top: 1mm; }
          .vh-ref      { text-align: right; min-width: 32mm; }
          .vh-ref-label{ font-size: 7pt; color: #666; }
          .vh-ref-num  { font-size: 10pt; font-weight: bold; color: #1a1a2e; }
          .vh-ref-date { font-size: 7.5pt; color: #555; }

          .vi-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5mm 4mm;
            margin-bottom: 2mm;
          }
          .vi-cell  { display: flex; flex-direction: column; gap: 0.5mm; }
          .vi-label { font-size: 6.5pt; color: #777; text-transform: uppercase; letter-spacing: 0.02em; }
          .vi-val   { font-size: 8.5pt; font-weight: 500; color: #111; }
          .vi-bold  { font-weight: bold; font-size: 9pt; }

          .vt-title {
            font-size: 7pt; font-weight: bold; text-transform: uppercase;
            letter-spacing: 0.04em; color: #555;
            border-top: 0.5pt solid #bbb;
            padding-top: 1.5mm; margin-bottom: 1mm;
          }
          .vt { width: 100%; border-collapse: collapse; margin-bottom: 2mm; }
          .vt-h {
            background: #f2f2f2; border: 0.5pt solid #bbb;
            padding: 1.5mm 2mm; font-size: 7pt; font-weight: bold; text-align: left;
          }
          .vt-d   { border: 0.5pt solid #ddd; padding: 1.5mm 2mm; font-size: 8pt; vertical-align: top; }
          .vt-alt { background: #fafafa; }

          .vb-total {
            display: flex; justify-content: space-between; align-items: center;
            border-top: 0.5pt solid #bbb; border-bottom: 0.5pt solid #bbb;
            padding: 1.5mm 0; margin-bottom: 2mm;
          }
          .vb-words      { flex: 1; font-size: 7pt; color: #333; }
          .vb-words-text { font-style: italic; font-weight: 500; }
          .vb-amount-box { text-align: right; min-width: 35mm; }
          .vb-amount-label{ font-size: 7pt; color: #666; display: block; }
          .vb-amount     { font-size: 11pt; font-weight: bold; }

          .vs-row  { display: flex; gap: 3mm; margin-bottom: 2mm; }
          .vs-cell { flex: 1; text-align: center; }
          .vs-line { border-top: 0.5pt solid #888; margin-bottom: 1mm; }
          .vs-en   { font-size: 6.5pt; color: #333; }
          .vs-ar   { font-size: 6pt; color: #888; }

          .vf-row   { display: flex; justify-content: space-between; align-items: center; border-top: 0.5pt solid #ddd; padding-top: 1mm; }
          .vf-stamp { font-size: 8pt; font-weight: bold; border: 1pt solid; padding: 0.5mm 2mm; border-radius: 1mm; }
          .vf-ref   { font-size: 7pt; color: #999; }

          /* ── Attachment ── */
          .att-page {
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            border: 0.5pt solid #ccc;
          }
          .att-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1.5mm 3mm; background: #f5f5f5;
            border-bottom: 0.5pt solid #ddd; flex-shrink: 0;
          }
          .att-label    { font-size: 7pt; font-weight: bold; color: #444; text-transform: uppercase; letter-spacing: 0.04em; }
          .att-filename { font-size: 7pt; color: #777; font-style: italic; }
          .att-body {
            flex: 1; overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            padding: 2mm; min-height: 0;
          }
          .att-img    { max-width: 100%; max-height: 100%; object-fit: contain; }
          .att-iframe { width: 100%; height: 100%; min-height: 80mm; border: none; }
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────
// SCREEN STYLES
// ─────────────────────────────────────────────
const S = {
  header:       { backgroundColor: "#1a1a2e", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  headerTitle:  { margin: "0 0 2px", fontSize: 18, fontWeight: 700 },
  headerSub:    { fontSize: 12, opacity: 0.6 },
  headerRight:  { display: "flex", alignItems: "center", gap: 12 },
  headerUser:   { fontSize: 13, opacity: 0.85 },
  logoutBtn:    { padding: "5px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.45)", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  banner:       { padding: "11px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 },
  bannerClose:  { background: "none", border: "none", cursor: "pointer", fontSize: 16 },
  content:      { padding: "20px 16px", maxWidth: 900, margin: "0 auto" },
  section:      { backgroundColor: "#fff", borderRadius: 10, padding: "16px 18px", marginBottom: 14, boxShadow: "0 1px 5px rgba(0,0,0,0.06)" },
  sectionHead:  { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#1a1a2e" },
  sectionSub:   { fontSize: 12, color: "#888" },
  logoGrid:     { display: "flex", gap: 14, flexWrap: "wrap" },
  logoCard:     { border: "1px solid #eee", borderRadius: 8, padding: "14px 16px", textAlign: "center", minWidth: 150 },
  logoName:     { fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 8 },
  logoPreview:  { height: 52, objectFit: "contain", marginBottom: 8, display: "block", margin: "0 auto 8px" },
  logoEmpty:    { height: 52, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", borderRadius: 6, fontSize: 11, color: "#bbb", marginBottom: 8 },
  uploadBtn:    { display: "inline-block", padding: "6px 12px", backgroundColor: "#f0f4f8", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#333", fontWeight: 500 },
  filterRow:    { display: "flex", gap: 10, flexWrap: "wrap" },
  searchInput:  { flex: 1, minWidth: 180, padding: "9px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, color: "#333", outline: "none" },
  sel:          { padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, color: "#333", outline: "none", backgroundColor: "#fff" },
  printControls:{ backgroundColor: "#fff", borderRadius: 10, padding: "14px 18px", marginBottom: 10, boxShadow: "0 1px 5px rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  ctrlLeft:     { display: "flex", gap: 8, flexWrap: "wrap" },
  ctrlRight:    { display: "flex", alignItems: "center", gap: 12 },
  ctrlBtn:      { padding: "7px 14px", backgroundColor: "#f0f4f8", border: "1px solid #ddd", borderRadius: 7, cursor: "pointer", fontSize: 13, color: "#333" },
  selCount:     { fontSize: 13, fontWeight: 600, color: "#1a6fa8" },
  printBtn:     { padding: "10px 24px", backgroundColor: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700 },
  printBtnOff:  { padding: "10px 24px", backgroundColor: "#bbb", color: "#fff", border: "none", borderRadius: 8, cursor: "not-allowed", fontSize: 14, fontWeight: 700 },
  layoutHint:   { backgroundColor: "#f8f9fa", border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  hintChip:     { backgroundColor: "#f0f7f4", color: "#2d6a4f", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  vCard:        { borderRadius: 10, padding: "11px 14px", marginBottom: 8, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  vTop:         { display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" },
  vRef:         { fontSize: 13, fontWeight: 700, color: "#1a1a2e", flex: 1 },
  vDate:        { fontSize: 12, color: "#888" },
  badge:        { padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 },
  printedBadge: { backgroundColor: "#e2d9f3", color: "#5a3e9e", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  vInfo:        { display: "flex", gap: 10, fontSize: 13, color: "#555", flexWrap: "wrap", paddingLeft: 24, alignItems: "center" },
  vCo:          { fontWeight: 600, color: "#333" },
  vDept:        { color: "#888" },
  vAmt:         { fontWeight: 700, color: "#cc0000" },
  attToggleBtn: { padding: "3px 10px", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#1a6fa8", fontWeight: 600 },
  checkbox:     { width: 16, height: 16, cursor: "pointer", flexShrink: 0 },
  attList:      { marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10, paddingLeft: 24 },
  attListTitle: { fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 },
  attRow:       { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f5f5f5", transition: "opacity 0.2s" },
  attThumb:     { width: 48, height: 40, borderRadius: 4, overflow: "hidden", flexShrink: 0, border: "1px solid #ddd", backgroundColor: "#f5f5f5" },
  thumbImg:     { width: "100%", height: "100%", objectFit: "cover" },
  thumbPdf:     { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#cc0000" },
  attInfo:      { flex: 1 },
  attName:      { fontSize: 13, color: "#333", fontWeight: 500 },
  attType:      { fontSize: 11, color: "#999" },
  empty:        { color: "#999", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 40 },
};
