"use client";
import { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import {
  collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getCurrentUser, logoutUser } from "../../lib/auth";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
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

function generateRef(companyName, count) {
  const prefix = companyName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,4);
  return `${prefix}-EXP-${String(count + 1).padStart(6, "0")}`;
}

function todayFormatted() {
  return new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes+"B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1)+"KB";
  return (bytes/(1024*1024)).toFixed(1)+"MB";
}

function fmtAED(val) {
  if (val===undefined||val===null||val==="") return "";
  const num = parseFloat(val);
  if (isNaN(num)) return "";
  return num.toLocaleString("en-AE", { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtDateTime(ts) {
  if (!ts?.seconds) return "";
  return new Date(ts.seconds*1000).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
}

const DEFAULT_CATEGORIES = [
  "Travel","Accommodation","Meals","Office Supplies",
  "Utilities","Maintenance","Medical","Training","Miscellaneous",
];
const EMPTY_ITEM = () => ({ category:"", description:"", amount:"" });

// ─────────────────────────────────────────────
// COMBOBOX
// ─────────────────────────────────────────────
function ComboBox({ value, onChange, options, placeholder, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value||"");
  const [hi, setHi] = useState(-1);
  const wrapRef = useRef();
  const listRef = useRef();

  useEffect(() => { setSearch(value||""); }, [value]);
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setHi(-1); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes((search||"").toLowerCase()));
  const showAdd = search && !options.find(o => o.toLowerCase()===search.toLowerCase());
  const allOpts = showAdd ? [...filtered, `__add__${search}`] : filtered;

  function pick(opt) {
    if (opt.startsWith("__add__")) {
      const val = opt.slice(7);
      onAddNew && onAddNew(val);
      onChange(val); setSearch(val);
    } else { onChange(opt); setSearch(opt); }
    setOpen(false); setHi(-1);
  }

  function onKey(e) {
    if (!open && !["Escape","Tab"].includes(e.key)) setOpen(true);
    if (e.key==="ArrowDown") { e.preventDefault(); setHi(h=>Math.min(h+1,allOpts.length-1)); }
    else if (e.key==="ArrowUp") { e.preventDefault(); setHi(h=>Math.max(h-1,0)); }
    else if (e.key==="Enter") {
      e.preventDefault();
      if (hi>=0&&allOpts[hi]) pick(allOpts[hi]);
      else if (search) { onAddNew&&onAddNew(search); onChange(search); setOpen(false); }
    } else if (e.key==="Escape") { setOpen(false); setHi(-1); }
    else if (e.key==="Tab") { setOpen(false); }
  }

  useEffect(() => {
    if (hi>=0&&listRef.current) { const el=listRef.current.children[hi]; el&&el.scrollIntoView({block:"nearest"}); }
  }, [hi]);

  return (
    <div ref={wrapRef} style={{ position:"relative", width:"100%" }}>
      <input style={CB.input} placeholder={placeholder} value={search}
        onChange={e=>{ setSearch(e.target.value); onChange(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={()=>{ setOpen(true); setHi(-1); }} onKeyDown={onKey} autoComplete="off" />
      {open && allOpts.length>0 && (
        <div ref={listRef} style={CB.list}>
          {allOpts.map((o,i)=>{
            const isAdd=o.startsWith("__add__");
            return (
              <div key={i} style={{ ...CB.item, backgroundColor:i===hi?"#e8f4fd":"transparent", color:isAdd?"#1a6fa8":"#222", fontWeight:isAdd?600:400 }}
                onMouseDown={e=>{ e.preventDefault(); pick(o); }} onMouseEnter={()=>setHi(i)}>
                {isAdd?`+ Add "${o.slice(7)}"`:o}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
const CB = {
  input: { padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, color:"#222", outline:"none", width:"100%", boxSizing:"border-box", backgroundColor:"#fff" },
  list: { position:"absolute", top:"calc(100% + 2px)", left:0, right:0, backgroundColor:"#fff", border:"1px solid #d0d7de", borderRadius:8, boxShadow:"0 6px 18px rgba(0,0,0,0.12)", zIndex:9999, maxHeight:220, overflowY:"auto" },
  item: { padding:"9px 13px", cursor:"pointer", fontSize:14, borderBottom:"1px solid #f3f3f3" },
};

// ─────────────────────────────────────────────
// VALIDATION POPUP
// ─────────────────────────────────────────────
function ValidationPopup({ items, onClose }) {
  return (
    <div style={POP.overlay} onClick={onClose}>
      <div style={POP.box} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:17, fontWeight:700, color:"#cc0000", marginBottom:16 }}>⚠️ Please complete the following</div>
        <ul style={{ margin:"0 0 20px 18px", padding:0 }}>
          {items.map((msg,i)=><li key={i} style={{ fontSize:14, color:"#333", marginBottom:8, lineHeight:1.5 }}>{msg}</li>)}
        </ul>
        <button style={POP.btn} onClick={onClose}>OK, let me fix it</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// VOUCHER VIEW POPUP
// ─────────────────────────────────────────────
function VoucherViewPopup({ voucher, onClose }) {
  const attachments = voucher.attachments||[];
  const [activeIdx, setActiveIdx] = useState(0);
  const activeAtt = attachments[activeIdx]||null;
  const isImg = (url) => url&&/\.(jpg|jpeg|png|gif|webp)/i.test(url);
  const hasAtt = attachments.length>0;
  const sc = {
    approved:{ bg:"#d4edda", fg:"#2d6a4f" },
    rejected: { bg:"#fde8e8", fg:"#cc0000" },
    paid:     { bg:"#cce5ff", fg:"#004085" },
    pending:  { bg:"#fff3cd", fg:"#856404" },
  }[voucher.status]||{ bg:"#f0f0f0", fg:"#555" };

  return (
    <div style={POP.overlay} onClick={onClose}>
      <div style={{ ...VP.box, maxWidth:hasAtt?980:560, flexDirection:hasAtt?"row":"column" }} onClick={e=>e.stopPropagation()}>
        <div style={{ ...VP.left, borderRight:hasAtt?"1px solid #eee":"none" }}>
          <div style={VP.topBar}>
            <div>
              <div style={VP.refNum}>{voucher.refNumber}</div>
              <div style={VP.meta}>{voucher.date} · {voucher.companyName}</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ ...POP.badge, backgroundColor:sc.bg, color:sc.fg }}>{voucher.status?.toUpperCase()}</span>
              <button style={VP.printBtn} onClick={()=>window.open(`/print?ref=${voucher.refNumber}`,"_blank")}>🖨️ Print</button>
              <button style={VP.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>
          {voucher.duplicateFlag&&<div style={VP.dupWarn}>⚠️ Flagged as possible duplicate</div>}
          <div style={VP.infoGrid}>
            <div><div style={VP.iLbl}>Department</div><div style={VP.iVal}>{voucher.departmentName||"—"}</div></div>
            <div><div style={VP.iLbl}>Staff</div><div style={VP.iVal}>{voucher.staffName||"—"}</div></div>
            <div style={{ gridColumn:"1/-1" }}><div style={VP.iLbl}>Receiver / Payee</div><div style={{ ...VP.iVal, fontWeight:700, fontSize:15, color:"#1a1a2e" }}>{voucher.receiverName||"—"}</div></div>
          </div>
          <div style={VP.secTitle}>Payment Details</div>
          <div style={VP.tHead}>
            <span style={{ flex:1.3, ...VP.tHdr }}>Category</span>
            <span style={{ flex:2, ...VP.tHdr }}>Description</span>
            <span style={{ flex:0.8, ...VP.tHdr, textAlign:"right" }}>AED</span>
          </div>
          {(voucher.items||[]).map((item,i)=>(
            <div key={i} style={VP.tRow}>
              <span style={{ flex:1.3, fontSize:13, color:"#666" }}>{item.category}</span>
              <span style={{ flex:2, fontSize:13, color:"#333" }}>{item.description}</span>
              <span style={{ flex:0.8, fontSize:13, fontWeight:600, textAlign:"right" }}>{fmtAED(item.amount)}</span>
            </div>
          ))}
          <div style={VP.totalRow}>
            <span style={{ fontSize:13, fontWeight:600, color:"#555" }}>Total Amount</span>
            <span style={{ fontSize:20, fontWeight:800, color:"#cc0000" }}>AED {fmtAED(voucher.totalAmount)}</span>
          </div>
          <div style={VP.wordsRow}>
            <span style={{ fontSize:11, color:"#999", fontWeight:600 }}>In Words: </span>
            <span style={{ fontSize:12, color:"#cc0000", fontWeight:600, fontStyle:"italic" }}>{numberToWords(voucher.totalAmount)}</span>
          </div>
          {voucher.rejectionReason&&<div style={VP.rejectNote}><strong>Rejection reason:</strong> {voucher.rejectionReason}</div>}
          {hasAtt&&(<>
            <div style={VP.secTitle}>Attachments ({attachments.length})</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {attachments.map((a,i)=>(
                <div key={i} onClick={()=>setActiveIdx(i)}
                  style={{ width:72, border:`2px solid ${i===activeIdx?"#1a6fa8":"#ddd"}`, borderRadius:6, cursor:"pointer", overflow:"hidden", padding:2, backgroundColor:i===activeIdx?"#e8f4fd":"#f8f9fa" }}>
                  {isImg(a.originalUrl)?<img src={a.thumbnailUrl||a.originalUrl} alt={a.fileName} style={{ width:"100%", height:48, objectFit:"cover", borderRadius:4, display:"block" }}/>:<div style={{ height:48, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>📄</div>}
                  <div style={{ fontSize:9, color:"#666", textAlign:"center", padding:"2px 1px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.fileName}</div>
                </div>
              ))}
            </div>
          </>)}
        </div>
        {hasAtt&&activeAtt&&(
          <div style={VP.right}>
            <div style={VP.viewerTop}>
              <span style={{ fontSize:12, color:"#555", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>📎 {activeAtt.fileName}</span>
              <a href={activeAtt.originalUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:12, color:"#1a6fa8", textDecoration:"none", padding:"3px 10px", backgroundColor:"#e8f4fd", borderRadius:5, flexShrink:0 }}>Open ↗</a>
            </div>
            <div style={VP.viewer}>
              {isImg(activeAtt.originalUrl)
                ?<img src={activeAtt.originalUrl} alt={activeAtt.fileName} style={{ maxWidth:"100%", maxHeight:"calc(88vh - 80px)", objectFit:"contain", borderRadius:6, display:"block" }}/>
                :<iframe src={activeAtt.originalUrl} title={activeAtt.fileName} style={{ width:"100%", height:"100%", minHeight:500, border:"none", borderRadius:6 }}/>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const POP = {
  overlay: { position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.62)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  box: { backgroundColor:"#fff", borderRadius:12, padding:"26px 26px 22px", maxWidth:440, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.22)" },
  btn: { width:"100%", padding:11, backgroundColor:"#1a6fa8", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor:"pointer" },
  badge: { padding:"3px 12px", borderRadius:20, fontSize:12, fontWeight:700 },
};
const VP = {
  box: { backgroundColor:"#fff", borderRadius:14, width:"96%", height:"88vh", boxShadow:"0 12px 40px rgba(0,0,0,0.24)", display:"flex", overflow:"hidden" },
  left: { flex:"0 0 420px", minWidth:280, overflowY:"auto", padding:"18px 20px", height:"100%" },
  right: { flex:1, display:"flex", flexDirection:"column", padding:14, minWidth:0, height:"100%" },
  topBar: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:14, borderBottom:"2px solid #eee" },
  refNum: { fontSize:17, fontWeight:800, color:"#1a6fa8" },
  meta: { fontSize:12, color:"#888", marginTop:3 },
  printBtn: { background:"#1a1a2e", border:"none", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, color:"#fff", flexShrink:0 },
  closeBtn: { background:"#f0f0f0", border:"none", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:13, color:"#555", flexShrink:0 },
  dupWarn: { backgroundColor:"#fff3cd", border:"1px solid #ffc107", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#856404", marginBottom:14, fontWeight:500 },
  infoGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 },
  iLbl: { fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:2 },
  iVal: { fontSize:13, color:"#333", fontWeight:500 },
  secTitle: { fontSize:11, fontWeight:700, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.04em", borderTop:"1px solid #eee", paddingTop:12, marginTop:14, marginBottom:8 },
  tHead: { display:"flex", gap:8, paddingBottom:5, marginBottom:4, borderBottom:"1px solid #f0f0f0" },
  tHdr: { fontSize:11, fontWeight:700, color:"#ccc", textTransform:"uppercase" },
  tRow: { display:"flex", gap:8, paddingBottom:6, marginBottom:5, borderBottom:"1px solid #f8f8f8" },
  totalRow: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderTop:"2px solid #eee", marginTop:8 },
  wordsRow: { backgroundColor:"#fff8f8", border:"1px solid #ffe0e0", borderRadius:7, padding:"8px 12px", marginBottom:14, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" },
  rejectNote: { backgroundColor:"#fde8e8", border:"1px solid #ffcccc", borderRadius:7, padding:"8px 12px", fontSize:13, color:"#cc0000", marginBottom:10 },
  viewerTop: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, gap:8, flexShrink:0 },
  viewer: { flex:1, minHeight:0, backgroundColor:"#f0f4f8", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" },
};

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function StaffPage() {
  const router = useRouter();
  const [currentUser,     setCurrentUser]     = useState(null);
  const [companies,       setCompanies]       = useState([]);
  const [departments,     setDepartments]     = useState([]);
  const [filteredDepts,   setFilteredDepts]   = useState([]);
  const [receivers,       setReceivers]       = useState([]);
  const [categories,      setCategories]      = useState(DEFAULT_CATEGORIES);
  const [myVouchers,      setMyVouchers]      = useState([]);
  const [activeTab,       setActiveTab]       = useState("create");
  const [msgBanner,       setMsgBanner]       = useState({ text:"", type:"success" });
  const [validationErrors,setValidationErrors]= useState([]);
  const [viewingVoucher,  setViewingVoucher]  = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [uploading,       setUploading]       = useState(false);
  const [searchTerm,      setSearchTerm]      = useState("");
  const [editingId,       setEditingId]       = useState(null);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedDept,    setSelectedDept]    = useState("");
  const [deptName,        setDeptName]        = useState("");
  const [receiverName,    setReceiverName]    = useState("");
  const [voucherDate,     setVoucherDate]     = useState(todayFormatted());
  const [items,           setItems]           = useState([EMPTY_ITEM(),EMPTY_ITEM(),EMPTY_ITEM()]);
  const [savedAttachments,setSavedAttachments]= useState([]);
  const [newFiles,        setNewFiles]        = useState([]);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const user = await getCurrentUser();
    if (!user||user.role!=="staff") { router.push("/login"); return; }
    setCurrentUser(user);
    await loadAll(user);
  }

  async function loadAll(user) {
    const compSnap = await getDocs(collection(db,"companies"));
    const allC = compSnap.docs.map(d=>({ id:d.id,...d.data() }));
    const myC = user.companies?.length ? allC.filter(c=>user.companies.includes(c.id)) : allC;
    setCompanies(myC);
    const deptSnap = await getDocs(collection(db,"departments"));
    setDepartments(deptSnap.docs.map(d=>({ id:d.id,...d.data() })));
    const vSnap = await getDocs(collection(db,"vouchers"));
    const allV = vSnap.docs.map(d=>({ id:d.id,...d.data() }));
    setReceivers([...new Set(allV.map(v=>v.receiverName).filter(Boolean))]);
    setMyVouchers(allV.filter(v=>v.createdBy===user.uid).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    const catSnap = await getDocs(collection(db,"categories"));
    if (!catSnap.empty) {
      const saved = catSnap.docs.map(d=>d.data().name).filter(Boolean);
      setCategories([...new Set([...DEFAULT_CATEGORIES,...saved])]);
    }
  }

  function handleCompanyChange(compId) {
    setSelectedCompany(compId);
    const depts = departments.filter(d=>d.companyId===compId);
    setFilteredDepts(depts); setSelectedDept(""); setDeptName("");
  }

  function handleDeptSelect(val) {
    setDeptName(val);
    const found = filteredDepts.find(d=>d.name.toLowerCase()===val.toLowerCase());
    setSelectedDept(found?found.id:"");
  }

  async function handleAddDept(name) {
    if (!selectedCompany) { showBanner("Select a company first.","error"); return; }
    try {
      const ref = await addDoc(collection(db,"departments"),{ name, companyId:selectedCompany, createdAt:serverTimestamp() });
      const newD = { id:ref.id, name, companyId:selectedCompany };
      setDepartments(prev=>[...prev,newD]);
      setFilteredDepts(prev=>[...prev,newD]);
      setSelectedDept(ref.id); setDeptName(name);
      showBanner(`Department "${name}" added!`);
    } catch(e) { showBanner("Failed: "+e.message,"error"); }
  }

  function handleReceiverSelect(val) {
    setReceiverName(val);
    if (val&&!receivers.includes(val)) setReceivers(prev=>[...new Set([...prev,val])]);
  }

  async function handleAddCategory(name) {
    try {
      await addDoc(collection(db,"categories"),{ name, createdAt:serverTimestamp() });
      setCategories(prev=>[...new Set([...prev,name])]);
    } catch(e) { showBanner("Failed: "+e.message,"error"); }
  }

  function updateItem(i,field,value) {
    setItems(prev=>{ const n=[...prev]; n[i]={ ...n[i],[field]:value }; return n; });
  }

  const total = items.reduce((sum,it)=>sum+(parseFloat(it.amount)||0),0);

  function handleFileSelect(e) {
    setNewFiles(prev=>[...prev,...Array.from(e.target.files)]);
    e.target.value = null;
  }

  async function uploadNewFiles() {
    if (!newFiles.length) return [];
    setUploading(true);
    const uploaded = [];
    for (const file of newFiles) {
      if (file.size>5*1024*1024) { showBanner(`"${file.name}" exceeds 5MB — skipped.`,"error"); continue; }
      const fd = new FormData();
      fd.append("file",file);
      fd.append("upload_preset","expense_voucher");
      const isPdf = file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/dsr4kaupw/image/upload`,{ method:"POST", body:fd });
        const data = await res.json();
        if (data.error) { showBanner(`Upload failed for "${file.name}": ${data.error.message}`,"error"); continue; }
        if (data.secure_url) {
          uploaded.push({
            originalUrl: data.secure_url,
            thumbnailUrl: isPdf ? data.secure_url : data.secure_url.replace("/upload/","/upload/w_300,q_60,f_auto/"),
            fileName: file.name, fileType: file.type, publicId: data.public_id, isPdf,
          });
        }
      } catch(e) { showBanner(`Upload error for "${file.name}".`,"error"); }
    }
    setUploading(false);
    return uploaded;
  }

  function showBanner(text,type="success") {
    setMsgBanner({ text,type });
    setTimeout(()=>setMsgBanner({ text:"",type:"success" }),4500);
  }

  function resetForm() {
    setSelectedCompany(""); setSelectedDept(""); setDeptName("");
    setReceiverName(""); setVoucherDate(todayFormatted());
    setItems([EMPTY_ITEM(),EMPTY_ITEM(),EMPTY_ITEM()]);
    setSavedAttachments([]); setNewFiles([]); setEditingId(null);
  }

  async function submitVoucher() {
    const errors = [];
    if (!selectedCompany) errors.push("Company is required");
    if (!selectedDept) errors.push("Department is required");
    if (!receiverName.trim()) errors.push("Receiver Name is required");
    const filledItems = items.filter(it=>it.category&&it.description&&it.amount);
    if (!filledItems.length) errors.push("At least one complete Payment line required");
    if (errors.length) { setValidationErrors(errors); return; }
    setLoading(true);
    try {
      const freshUploads = await uploadNewFiles();
      const allAttachments = [...savedAttachments,...freshUploads];
      const company = companies.find(c=>c.id===selectedCompany);
      const dept = departments.find(d=>d.id===selectedDept);
      if (editingId) {
        await updateDoc(doc(db,"vouchers",editingId),{
          companyId:selectedCompany, companyName:company?.name||"",
          departmentId:selectedDept, departmentName:dept?.name||"",
          receiverName:receiverName.trim(), date:voucherDate,
          items:filledItems, totalAmount:total, attachments:allAttachments,
          updatedAt:serverTimestamp(),
        });
        showBanner("Voucher updated successfully!");
      } else {
        const allSnap = await getDocs(collection(db,"vouchers"));
        const refNumber = generateRef(company?.name||"EXP",allSnap.size);
        await addDoc(collection(db,"vouchers"),{
          refNumber, companyId:selectedCompany, companyName:company?.name||"",
          departmentId:selectedDept, departmentName:dept?.name||"",
          staffName:currentUser.name, createdBy:currentUser.uid,
          receiverName:receiverName.trim(), date:voucherDate,
          items:filledItems, totalAmount:total, status:"pending",
          attachments:allAttachments, duplicateFlag:false, printed:false,
          createdAt:serverTimestamp(),
        });
        showBanner("Voucher submitted successfully!");
      }
      await loadAll(currentUser);
      resetForm();
      setActiveTab("history");
    } catch(e) { showBanner("Error: "+e.message,"error"); console.error("Submit error full:",e); }
    setLoading(false);
  }

  function loadForEdit(v) {
    if (v.status!=="pending") { showBanner("Only pending vouchers can be edited.","error"); return; }
    setEditingId(v.id);
    setSelectedCompany(v.companyId||"");
    setFilteredDepts(departments.filter(d=>d.companyId===v.companyId));
    setSelectedDept(v.departmentId||""); setDeptName(v.departmentName||"");
    setReceiverName(v.receiverName||""); setVoucherDate(v.date||todayFormatted());
    setItems([...(v.items||[]),EMPTY_ITEM(),EMPTY_ITEM(),EMPTY_ITEM()].slice(0,3));
    setSavedAttachments(v.attachments||[]); setNewFiles([]);
    setActiveTab("create"); window.scrollTo({ top:0, behavior:"smooth" });
  }

  function copyVoucher(v) {
    setEditingId(null);
    setSelectedCompany(v.companyId||"");
    setFilteredDepts(departments.filter(d=>d.companyId===v.companyId));
    setSelectedDept(v.departmentId||""); setDeptName(v.departmentName||"");
    setReceiverName(v.receiverName||""); setVoucherDate(todayFormatted());
    setItems([...(v.items||[]),EMPTY_ITEM(),EMPTY_ITEM(),EMPTY_ITEM()].slice(0,3));
    setSavedAttachments([]); setNewFiles([]);
    setActiveTab("create"); showBanner("Voucher copied — review and submit as new.");
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  async function withdrawVoucher(v) {
    if (v.status!=="pending") { showBanner("Only pending vouchers can be withdrawn.","error"); return; }
    if (!window.confirm(`Withdraw voucher ${v.refNumber}?\nThis cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db,"vouchers",v.id));
      showBanner("Voucher withdrawn."); await loadAll(currentUser);
    } catch(e) { showBanner("Error: "+e.message,"error"); }
  }

  async function handleLogout() { await logoutUser(); router.push("/login"); }

  const filteredVouchers = myVouchers.filter(v=>{
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return v.refNumber?.toLowerCase().includes(q)||v.receiverName?.toLowerCase().includes(q)||v.companyName?.toLowerCase().includes(q)||v.departmentName?.toLowerCase().includes(q);
  });

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div style={S.page}>
      {validationErrors.length>0&&<ValidationPopup items={validationErrors} onClose={()=>setValidationErrors([])}/>}
      {viewingVoucher&&<VoucherViewPopup voucher={viewingVoucher} onClose={()=>setViewingVoucher(null)}/>}

      <div style={S.header}>
        <h1 style={S.headerTitle}>{editingId?"✏️ Editing Voucher":"Staff Portal"}</h1>
        <div style={S.headerRight}>
          <span style={S.headerUser}>👤 {currentUser?.name}</span>
          <button style={S.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {msgBanner.text&&(
        <div style={{ ...S.banner, backgroundColor:msgBanner.type==="error"?"#fde8e8":"#d4edda", color:msgBanner.type==="error"?"#cc0000":"#2d6a4f", borderBottom:`1px solid ${msgBanner.type==="error"?"#ffcccc":"#b8dfc4"}` }}>
          <span>{msgBanner.text}</span>
          <button style={S.bannerClose} onClick={()=>setMsgBanner({ text:"",type:"success" })}>✕</button>
        </div>
      )}

      <div style={S.tabs}>
        {[["create",editingId?"✏️ Edit Voucher":"Create Voucher"],["history","My Vouchers"]].map(([tab,label])=>(
          <button key={tab} style={activeTab===tab?S.tabOn:S.tabOff}
            onClick={()=>{ if(tab==="history"&&activeTab==="create") resetForm(); setActiveTab(tab); }}>
            {label}
          </button>
        ))}
      </div>

      <div style={S.content}>

        {/* ── CREATE / EDIT ── */}
        {activeTab==="create"&&(
          <div style={S.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
              <h2 style={S.cardTitle}>{editingId?"Edit Voucher":"New Expense Voucher"}</h2>
              {editingId&&<button style={S.cancelBtn} onClick={()=>{ resetForm(); setActiveTab("history"); }}>Cancel Edit</button>}
            </div>

            <div style={S.grid2}>
              <div style={S.fg}>
                <label style={S.lbl}>Company <span style={S.req}>*</span></label>
                <select style={S.sel} value={selectedCompany} onChange={e=>handleCompanyChange(e.target.value)}>
                  <option value="">Select company...</option>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Date</label>
                <input style={S.sel} value={voucherDate} onChange={e=>setVoucherDate(e.target.value)}/>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Department <span style={S.req}>*</span></label>
                <ComboBox value={deptName} onChange={handleDeptSelect}
                  options={filteredDepts.map(d=>d.name)}
                  placeholder={selectedCompany?"Select or type to add...":"Select company first"}
                  onAddNew={handleAddDept}/>
              </div>
              <div style={S.fg}>
                <label style={S.lbl}>Staff Name</label>
                <input style={{ ...S.sel, backgroundColor:"#f5f5f5", color:"#666" }} value={currentUser?.name||""} readOnly/>
              </div>
              <div style={{ ...S.fg, gridColumn:"1/-1" }}>
                <label style={S.lbl}>Receiver Name <span style={S.req}>*</span></label>
                <ComboBox value={receiverName} onChange={handleReceiverSelect} options={receivers} placeholder="Who receives the payment..."/>
              </div>
            </div>

            <h3 style={S.subTitle}>Payment Details</h3>
            <div style={S.tHead}>
              <span style={{ flex:1.5, ...S.tHdr }}>Category</span>
              <span style={{ flex:2.2, ...S.tHdr }}>Description / Purpose</span>
              <span style={{ flex:0.8, ...S.tHdr, textAlign:"right" }}>Amount (AED)</span>
            </div>
            {items.map((item,i)=>(
              <div key={i} style={S.tRow}>
                <div style={{ flex:1.5 }}>
                  <ComboBox value={item.category} onChange={val=>updateItem(i,"category",val)}
                    options={categories} placeholder="Category..." onAddNew={handleAddCategory}/>
                </div>
                <input style={{ ...CB.input, flex:2.2 }} placeholder="Description / purpose"
                  value={item.description} onChange={e=>updateItem(i,"description",e.target.value)}/>
                <input style={{ ...CB.input, flex:0.8, textAlign:"right", WebkitAppearance:"none", MozAppearance:"textfield" }}
                  type="number" placeholder="0.00" value={item.amount}
                  onChange={e=>updateItem(i,"amount",e.target.value)} onWheel={e=>e.target.blur()}/>
              </div>
            ))}

            <div style={S.totalRow}>
              <span style={S.totalLbl}>Total Amount</span>
              <span style={S.totalAmt}>AED {fmtAED(total)}</span>
            </div>
            <div style={S.wordsRow}>
              <span style={S.wordsLbl}>In Words:</span>
              <span style={S.words}>{total>0?numberToWords(total):"—"}</span>
            </div>

            <h3 style={S.subTitle}>Attachments</h3>
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <label style={S.uploadBtn}>
                📎 Choose Files
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple
                  onChange={handleFileSelect} style={{ display:"none" }} key={newFiles.length}/>
              </label>
              <span style={{ fontSize:12, color:"#999" }}>PDF, JPG, PNG — max 5MB each</span>
            </div>

            {newFiles.length>0&&(
              <div style={S.fileList}>
                <div style={S.fileListHdr}>New files to upload ({newFiles.length})</div>
                {newFiles.map((f,i)=>(
                  <div key={i} style={S.fileRow}>
                    <span style={S.fileIcon}>📄</span>
                    <span style={S.fileName}>{f.name}</span>
                    <span style={S.fileSize}>{formatBytes(f.size)}</span>
                    <button style={S.fileRm} onClick={()=>setNewFiles(p=>p.filter((_,j)=>j!==i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {savedAttachments.length>0&&(
              <div style={S.fileList}>
                <div style={S.fileListHdr}>Saved attachments ({savedAttachments.length})</div>
                {savedAttachments.map((a,i)=>(
                  <div key={i} style={S.fileRow}>
                    <span style={S.fileIcon}>📎</span>
                    <span style={S.fileName}>{a.fileName}</span>
                    <button style={S.fileRm} onClick={()=>setSavedAttachments(p=>p.filter((_,j)=>j!==i))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <button style={loading||uploading?S.btnOff:S.btn} onClick={submitVoucher} disabled={loading||uploading}>
              {uploading?"⏫ Uploading...":loading?"Submitting...":editingId?"Update Voucher":"Submit Voucher"}
            </button>
          </div>
        )}

        {/* ── MY VOUCHERS ── */}
        {activeTab==="history"&&(
          <div>
            <div style={S.searchRow}>
              <input style={S.searchInput} placeholder="🔍  Search by ref, receiver, company, department..."
                value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
              {searchTerm&&<button style={S.clearBtn} onClick={()=>setSearchTerm("")}>✕ Clear</button>}
            </div>

            {filteredVouchers.length===0&&(
              <p style={S.empty}>{searchTerm?"No vouchers match your search.":"No vouchers submitted yet."}</p>
            )}

            {/* Table header */}
            {filteredVouchers.length>0&&(
              <div style={S.listHeader}>
                <span style={{ minWidth:16 }}></span>
                <span style={{ flex:1.2 }}>Ref #</span>
                <span style={{ flex:1.4 }}>Company</span>
                <span style={{ flex:0.8 }}>Dept</span>
                <span style={{ flex:1 }}>Receiver</span>
                <span style={{ flex:0.7 }}>Category</span>
                <span style={{ flex:0.8, textAlign:"right" }}>Amount</span>
                <span style={{ flex:1 }}>Date / Time</span>
                <span style={{ flex:0.6, textAlign:"center" }}>Status</span>
                <span style={{ flex:0.7 }}>Actions</span>
              </div>
            )}

            {filteredVouchers.map(v=>{
              const sc = {
                approved:{ bg:"#d4edda", fg:"#2d6a4f" },
                rejected: { bg:"#fde8e8", fg:"#cc0000" },
                paid:     { bg:"#cce5ff", fg:"#004085" },
                printed:  { bg:"#e2d9f3", fg:"#5a3e9e" },
                pending:  { bg:"#fff3cd", fg:"#856404" },
              }[v.status]||{ bg:"#f0f0f0", fg:"#555" };

              return (
                <div key={v.id} style={S.vRow}>
                  <span style={{ minWidth:16 }}>
                    {v.attachments?.length>0&&<span style={S.attDot} title={`${v.attachments.length} attachment(s)`}>📎</span>}
                  </span>
                  <span style={{ flex:1.2, fontSize:12, fontWeight:700, color:"#1a6fa8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.refNumber}</span>
                  <span style={{ flex:1.4, fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:600, color:"#333" }}>{v.companyName?.slice(0,14)}</span>
                  <span style={{ flex:0.8, fontSize:12, color:"#888", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.departmentName}</span>
                  <span style={{ flex:1, fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.receiverName}</span>
                  <span style={{ flex:0.7, fontSize:12, color:"#888", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.items?.[0]?.category||"—"}</span>
                  <span style={{ flex:0.8, fontSize:13, fontWeight:800, color:"#cc0000", textAlign:"right", whiteSpace:"nowrap" }}>AED {fmtAED(v.totalAmount)}</span>
                  <span style={{ flex:1, fontSize:11, color:"#888", whiteSpace:"nowrap" }}>{v.date}{v.createdAt?.seconds?` · ${fmtDateTime(v.createdAt)}`:""}</span>
                  <span style={{ flex:0.6, textAlign:"center" }}>
                    <span style={{ ...S.badge, backgroundColor:sc.bg, color:sc.fg, fontSize:10 }}>{v.status?.toUpperCase()}</span>
                  </span>
                  <div style={{ flex:0.7, display:"flex", gap:4 }}>
                    <button style={S.iconBtn} onClick={()=>setViewingVoucher(v)} title="View">👁</button>
                    {v.status==="pending"&&<>
                      <button style={S.iconBtn} onClick={()=>loadForEdit(v)} title="Edit">✏️</button>
                      <button style={S.iconBtn} onClick={()=>copyVoucher(v)} title="Copy">📋</button>
                      <button style={{ ...S.iconBtn, color:"#cc0000" }} onClick={()=>withdrawVoucher(v)} title="Withdraw">🗑</button>
                    </>}
                    {v.status!=="pending"&&<button style={{ ...S.iconBtn, color:"#856404" }} onClick={()=>copyVoucher(v)} title="Copy as New">📋</button>}
                  </div>
                </div>
              );
            })}
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
  page:        { minHeight:"100vh", backgroundColor:"#f0f4f8", fontFamily:"sans-serif" },
  header:      { backgroundColor:"#1a6fa8", color:"#fff", padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  headerTitle: { margin:0, fontSize:17, fontWeight:600 },
  headerRight: { display:"flex", alignItems:"center", gap:12 },
  headerUser:  { fontSize:13, opacity:0.85 },
  logoutBtn:   { padding:"5px 12px", background:"transparent", border:"1px solid rgba(255,255,255,0.45)", color:"#fff", borderRadius:6, cursor:"pointer", fontSize:12 },
  banner:      { padding:"11px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:14 },
  bannerClose: { background:"none", border:"none", cursor:"pointer", fontSize:16, opacity:0.7 },
  tabs:        { display:"flex", borderBottom:"2px solid #ddd", backgroundColor:"#fff", paddingLeft:20 },
  tabOff:      { padding:"12px 22px", border:"none", background:"none", cursor:"pointer", fontSize:14, color:"#666", borderBottom:"2px solid transparent", marginBottom:-2 },
  tabOn:       { padding:"12px 22px", border:"none", background:"none", cursor:"pointer", fontSize:14, color:"#1a6fa8", fontWeight:600, borderBottom:"2px solid #1a6fa8", marginBottom:-2 },
  content:     { padding:"20px 16px", maxWidth:1000, margin:"0 auto" },
  card:        { backgroundColor:"#fff", borderRadius:12, padding:"22px 20px", boxShadow:"0 2px 10px rgba(0,0,0,0.07)" },
  cardTitle:   { fontSize:17, fontWeight:700, color:"#1a1a2e", margin:0 },
  cancelBtn:   { padding:"6px 14px", backgroundColor:"#fde8e8", color:"#cc0000", border:"1px solid #ffcccc", borderRadius:6, cursor:"pointer", fontSize:13 },
  grid2:       { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 },
  fg:          { display:"flex", flexDirection:"column", gap:5 },
  lbl:         { fontSize:12, fontWeight:600, color:"#555", letterSpacing:"0.02em" },
  req:         { color:"#cc0000" },
  sel:         { padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, color:"#222", outline:"none", width:"100%", boxSizing:"border-box", backgroundColor:"#fff" },
  subTitle:    { fontSize:14, fontWeight:700, color:"#1a1a2e", margin:"20px 0 8px", borderTop:"1px solid #eee", paddingTop:16 },
  tHead:       { display:"flex", gap:8, paddingBottom:6, borderBottom:"1px solid #eee", marginBottom:6 },
  tHdr:        { fontSize:11, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:"0.04em" },
  tRow:        { display:"flex", gap:8, marginBottom:7, alignItems:"center" },
  totalRow:    { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 0", borderTop:"2px solid #eee", marginTop:8 },
  totalLbl:    { fontSize:14, fontWeight:600, color:"#333" },
  totalAmt:    { fontSize:22, fontWeight:800, color:"#cc0000" },
  wordsRow:    { backgroundColor:"#fff8f8", border:"1px solid #ffe0e0", borderRadius:8, padding:"9px 13px", marginBottom:18, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" },
  wordsLbl:    { fontSize:11, color:"#999", fontWeight:600, textTransform:"uppercase" },
  words:       { fontSize:13, color:"#cc0000", fontWeight:600, fontStyle:"italic" },
  uploadBtn:   { display:"inline-block", padding:"8px 16px", backgroundColor:"#f0f4f8", border:"1px solid #d0d7de", borderRadius:8, cursor:"pointer", fontSize:13, color:"#333", fontWeight:500, marginTop:10 },
  fileList:    { marginTop:10, border:"1px solid #eee", borderRadius:8, overflow:"hidden", marginBottom:4 },
  fileListHdr: { backgroundColor:"#f8f9fa", padding:"6px 12px", fontSize:11, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:"0.04em", borderBottom:"1px solid #eee" },
  fileRow:     { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderBottom:"1px solid #f5f5f5", fontSize:13 },
  fileIcon:    { fontSize:16, flexShrink:0 },
  fileName:    { flex:1, color:"#333", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  fileSize:    { color:"#999", fontSize:12, flexShrink:0 },
  fileRm:      { background:"none", border:"none", color:"#cc0000", cursor:"pointer", fontSize:15, padding:"0 4px", flexShrink:0 },
  btn:         { width:"100%", padding:13, backgroundColor:"#1a6fa8", color:"#fff", border:"none", borderRadius:8, fontSize:15, fontWeight:700, cursor:"pointer", marginTop:14 },
  btnOff:      { width:"100%", padding:13, backgroundColor:"#aaa", color:"#fff", border:"none", borderRadius:8, fontSize:15, fontWeight:700, cursor:"not-allowed", marginTop:14 },
  searchRow:   { display:"flex", alignItems:"center", gap:10, marginBottom:12 },
  searchInput: { flex:1, padding:"10px 14px", borderRadius:8, border:"1px solid #ddd", fontSize:14, color:"#333", outline:"none" },
  clearBtn:    { padding:"8px 14px", background:"#eee", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, color:"#555", whiteSpace:"nowrap" },
  listHeader:  { display:"flex", gap:8, padding:"6px 12px", fontSize:11, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:"0.04em", borderBottom:"2px solid #eee", marginBottom:4, alignItems:"center" },
  vRow:        { display:"flex", alignItems:"center", gap:8, backgroundColor:"#fff", borderRadius:8, padding:"9px 12px", marginBottom:5, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", overflow:"hidden" },
  badge:       { padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:700, flexShrink:0, whiteSpace:"nowrap" },
  attDot:      { fontSize:12 },
  iconBtn:     { background:"none", border:"none", cursor:"pointer", fontSize:14, padding:"2px 4px", color:"#555" },
  empty:       { color:"#999", fontSize:14, fontStyle:"italic", textAlign:"center", marginTop:40 },
};
