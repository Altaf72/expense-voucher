"use client";
import { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getCurrentUser, logoutUser } from "../../lib/auth";

function fmtAED(val) {
  if (val===undefined||val===null||val==="") return "0.00";
  const num=parseFloat(val); if(isNaN(num)) return "0.00";
  return num.toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function numberToWords(amount) {
  if(!amount||isNaN(amount)) return "";
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function convert(n){if(n===0)return "";if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?" "+ones[n%10]:"");if(n<1000)return ones[Math.floor(n/100)]+" Hundred"+(n%100?" "+convert(n%100):"");if(n<1000000)return convert(Math.floor(n/1000))+" Thousand"+(n%1000?" "+convert(n%1000):"");return convert(Math.floor(n/1000000))+" Million"+(n%1000000?" "+convert(n%1000000):"");}
  const parts=parseFloat(amount).toFixed(2).split(".");const fils=parseInt(parts[1]);const dirhams=parseInt(parts[0]);
  if(dirhams===0&&fils===0)return "";let words=dirhams>0?convert(dirhams)+" Dirhams":"";
  if(fils>0)words+=(words?" and ":"")+convert(fils)+" Fils";return words+" Only";
}
function formatDate(ts){
  if(!ts)return "—";
  if(ts.seconds)return new Date(ts.seconds*1000).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
  return ts;
}
function todayStr(){return new Date().toISOString().split("T")[0];}
function startOfMonth(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split("T")[0];}
function inRange(v,from,to){
  const raw=v.date||formatDate(v.createdAt);if(!raw||raw==="—")return true;
  try{
    const p=raw.split(" ");const mo={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const d=new Date(parseInt(p[2]),mo[p[1]],parseInt(p[0]));
    const f=from?new Date(from):null;const t=to?new Date(to):null;
    if(f&&d<f)return false;if(t&&d>t)return false;return true;
  }catch{return true;}
}

// ── VOUCHER VIEW POPUP ─────────────────────
function VoucherViewPopup({voucher,onClose}){
  const attachments=voucher.attachments||[];
  const [activeIdx,setActiveIdx]=useState(0);
  const activeAtt=attachments[activeIdx]||null;
  const isImg=(url)=>url&&/\.(jpg|jpeg|png|gif|webp)/i.test(url);
  const hasAtt=attachments.length>0;
  const sc={approved:{bg:"#d4edda",fg:"#2d6a4f"},rejected:{bg:"#fde8e8",fg:"#cc0000"},paid:{bg:"#cce5ff",fg:"#004085"},pending:{bg:"#fff3cd",fg:"#856404"}}[voucher.status]||{bg:"#f0f0f0",fg:"#555"};
  return(
    <div style={POP.overlay} onClick={onClose}>
      <div style={{...VP.box,maxWidth:hasAtt?980:560,flexDirection:hasAtt?"row":"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{...VP.left,borderRight:hasAtt?"1px solid #eee":"none"}}>
          <div style={VP.topBar}>
            <div><div style={VP.refNum}>{voucher.refNumber}</div><div style={VP.meta}>{voucher.date} · {voucher.companyName}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{...POP.badge,backgroundColor:sc.bg,color:sc.fg}}>{voucher.status?.toUpperCase()}</span>
              <button style={VP.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>
          {voucher.duplicateFlag&&<div style={VP.dupWarn}>⚠️ Flagged as possible duplicate</div>}
          <div style={VP.infoGrid}>
            <div><div style={VP.iLbl}>Department</div><div style={VP.iVal}>{voucher.departmentName||"—"}</div></div>
            <div><div style={VP.iLbl}>Staff</div><div style={VP.iVal}>{voucher.staffName||"—"}</div></div>
            <div style={{gridColumn:"1/-1"}}><div style={VP.iLbl}>Receiver / Payee</div><div style={{...VP.iVal,fontWeight:700,fontSize:15,color:"#1a1a2e"}}>{voucher.receiverName||"—"}</div></div>
            {voucher.approvedBy&&<div><div style={VP.iLbl}>Approved By</div><div style={VP.iVal}>{voucher.approvedBy}</div></div>}
            {voucher.rejectedBy&&<div><div style={VP.iLbl}>Rejected By</div><div style={VP.iVal}>{voucher.rejectedBy}</div></div>}
          </div>
          <div style={VP.secTitle}>Payment Details</div>
          <div style={VP.tHead}><span style={{flex:1.3,...VP.tHdr}}>Category</span><span style={{flex:2,...VP.tHdr}}>Description</span><span style={{flex:0.8,...VP.tHdr,textAlign:"right"}}>AED</span></div>
          {(voucher.items||[]).map((item,i)=>(
            <div key={i} style={VP.tRow}><span style={{flex:1.3,fontSize:13,color:"#666"}}>{item.category}</span><span style={{flex:2,fontSize:13,color:"#333"}}>{item.description}</span><span style={{flex:0.8,fontSize:13,fontWeight:600,textAlign:"right"}}>{fmtAED(item.amount)}</span></div>
          ))}
          <div style={VP.totalRow}><span style={{fontSize:13,fontWeight:600,color:"#555"}}>Total Amount</span><span style={{fontSize:20,fontWeight:800,color:"#cc0000"}}>AED {fmtAED(voucher.totalAmount)}</span></div>
          <div style={VP.wordsRow}><span style={{fontSize:11,color:"#999",fontWeight:600}}>In Words: </span><span style={{fontSize:12,color:"#cc0000",fontWeight:600,fontStyle:"italic"}}>{numberToWords(voucher.totalAmount)}</span></div>
          {voucher.rejectionReason&&<div style={VP.rejectNote}><strong>Rejection reason:</strong> {voucher.rejectionReason}</div>}
          {hasAtt&&(<>
            <div style={VP.secTitle}>Attachments ({attachments.length})</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {attachments.map((a,i)=>(
                <div key={i} onClick={()=>setActiveIdx(i)} style={{width:72,border:`2px solid ${i===activeIdx?"#5a3e9e":"#ddd"}`,borderRadius:6,cursor:"pointer",overflow:"hidden",padding:2,backgroundColor:i===activeIdx?"#f3f0fb":"#f8f9fa"}}>
                  {isImg(a.originalUrl)?<img src={a.thumbnailUrl||a.originalUrl} alt={a.fileName} style={{width:"100%",height:48,objectFit:"cover",borderRadius:4,display:"block"}}/>:<div style={{height:48,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>📄</div>}
                  <div style={{fontSize:9,color:"#666",textAlign:"center",padding:"2px 1px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.fileName}</div>
                </div>
              ))}
            </div>
          </>)}
        </div>
        {hasAtt&&activeAtt&&(
          <div style={VP.right}>
            <div style={VP.viewerTop}>
              <span style={{fontSize:12,color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>📎 {activeAtt.fileName}</span>
              <a href={activeAtt.originalUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#5a3e9e",textDecoration:"none",padding:"3px 10px",backgroundColor:"#f3f0fb",borderRadius:5,flexShrink:0}}>Open ↗</a>
            </div>
            <div style={VP.viewer}>
              {isImg(activeAtt.originalUrl)?<img src={`https://docs.google.com/viewer?url=${encodeURIComponent(activeAtt.originalUrl)}&embedded=true`} alt={activeAtt.fileName} style={{maxWidth:"100%",maxHeight:"calc(88vh - 80px)",objectFit:"contain",borderRadius:6,display:"block"}}/>: <iframe
    src={`https://docs.google.com/viewer?url=${encodeURIComponent(activeAtt.originalUrl)}&embedded=true`}
    title={activeAtt.fileName}
    style={{ width: "100%", height: "100%", minHeight: 500, border: "none", borderRadius: 6 }}
  />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const POP={overlay:{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.62)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16},badge:{padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700}};
const VP={box:{backgroundColor:"#fff",borderRadius:14,width:"96%",height:"88vh",boxShadow:"0 12px 40px rgba(0,0,0,0.24)",display:"flex",overflow:"hidden"},left:{flex:"0 0 420px",minWidth:280,overflowY:"auto",padding:"18px 20px",height:"100%"},right:{flex:1,display:"flex",flexDirection:"column",padding:14,minWidth:0,height:"100%"},topBar:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,paddingBottom:14,borderBottom:"2px solid #eee"},refNum:{fontSize:17,fontWeight:800,color:"#5a3e9e"},meta:{fontSize:12,color:"#888",marginTop:3},closeBtn:{background:"#f0f0f0",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:13,color:"#555",flexShrink:0},dupWarn:{backgroundColor:"#fff3cd",border:"1px solid #ffc107",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#856404",marginBottom:14,fontWeight:500},infoGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16},iLbl:{fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2},iVal:{fontSize:13,color:"#333",fontWeight:500},secTitle:{fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.04em",borderTop:"1px solid #eee",paddingTop:12,marginTop:14,marginBottom:8},tHead:{display:"flex",gap:8,paddingBottom:5,marginBottom:4,borderBottom:"1px solid #f0f0f0"},tHdr:{fontSize:11,fontWeight:700,color:"#ccc",textTransform:"uppercase"},tRow:{display:"flex",gap:8,paddingBottom:6,marginBottom:5,borderBottom:"1px solid #f8f8f8"},totalRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:"2px solid #eee",marginTop:8},wordsRow:{backgroundColor:"#fff8f8",border:"1px solid #ffe0e0",borderRadius:7,padding:"8px 12px",marginBottom:14,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"},rejectNote:{backgroundColor:"#fde8e8",border:"1px solid #ffcccc",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#cc0000",marginBottom:10},viewerTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexShrink:0},viewer:{flex:1,minHeight:0,backgroundColor:"#f0f4f8",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}};

// ── CSV EXPORT ──────────────────────────────
function exportCSV(rows,filename){
  if(!rows.length){alert("No data to export.");return;}
  const keys=Object.keys(rows[0]);
  const csv=[keys.join(","),...rows.map(r=>keys.map(k=>`"${String(r[k]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}

// ── STAT CARD ───────────────────────────────
function StatCard({label,value,sub,color}){
  return(
    <div style={{...S.statCard,borderTop:`3px solid ${color||"#5a3e9e"}`}}>
      <div style={S.statValue}>{value}</div>
      <div style={S.statLabel}>{label}</div>
      {sub&&<div style={S.statSub}>{sub}</div>}
    </div>
  );
}

// ── MAIN PAGE ───────────────────────────────
export default function FinancePage(){
  const router=useRouter();
  const [currentUser,setCurrentUser]=useState(null);
  const [companies,setCompanies]=useState([]);
  const [vouchers,setVouchers]=useState([]);
  const [directPayments,setDirectPayments]=useState([]);
  const [transactions,setTransactions]=useState([]);
  const [activeTab,setActiveTab]=useState("dashboard");
  const [dateFrom,setDateFrom]=useState(startOfMonth());
  const [dateTo,setDateTo]=useState(todayStr());
  const [filterComp,setFilterComp]=useState("all");
  const [filterStatus,setFilterStatus]=useState("all");
  const [searchTerm,setSearchTerm]=useState("");
  const [viewingV,setViewingV]=useState(null);

  useEffect(()=>{checkAuth();},[]);

  async function checkAuth(){
    const user=await getCurrentUser();
    if(!user||user.role!=="finance"){router.push("/login");return;}
    setCurrentUser(user);await loadAll();
  }

  async function loadAll(){
    const compSnap=await getDocs(collection(db,"companies"));
    setCompanies(compSnap.docs.map(d=>({id:d.id,...d.data()})));
    const vSnap=await getDocs(collection(db,"vouchers"));
    setVouchers(vSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    const dpSnap=await getDocs(collection(db,"direct_payments"));
    setDirectPayments(dpSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    const txSnap=await getDocs(collection(db,"transactions"));
    setTransactions(txSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }

  async function handleLogout(){await logoutUser();router.push("/login");}

  const rangedV=vouchers.filter(v=>inRange(v,dateFrom,dateTo));
  const rangedDp=directPayments.filter(dp=>inRange(dp,dateFrom,dateTo));
  const totalPaid=rangedV.filter(v=>v.status==="paid").reduce((s,v)=>s+(parseFloat(v.totalAmount)||0),0);
  const totalDirect=rangedDp.reduce((s,dp)=>s+(parseFloat(dp.amount)||0),0);
  const totalBalance=companies.reduce((s,c)=>s+(parseFloat(c.balance)||0),0);
  const totalDupFlags=vouchers.filter(v=>v.duplicateFlag&&v.status==="pending").length;

  const companySummary=companies.map(c=>{
    const cv=rangedV.filter(v=>v.companyId===c.id);
    const cd=rangedDp.filter(dp=>dp.companyId===c.id);
    return{name:c.name,balance:c.balance,paid:cv.filter(v=>v.status==="paid").reduce((s,v)=>s+(parseFloat(v.totalAmount)||0),0),pending:cv.filter(v=>v.status==="pending").length,rejected:cv.filter(v=>v.status==="rejected").length,direct:cd.reduce((s,dp)=>s+(parseFloat(dp.amount)||0),0)};
  });

  const filteredV=vouchers.filter(v=>{
    const mc=filterComp==="all"||v.companyId===filterComp;
    const ms=filterStatus==="all"||v.status===filterStatus;
    const mr=inRange(v,dateFrom,dateTo);
    const q=searchTerm.toLowerCase();
    const mq=!searchTerm||v.refNumber?.toLowerCase().includes(q)||v.receiverName?.toLowerCase().includes(q)||v.staffName?.toLowerCase().includes(q)||v.companyName?.toLowerCase().includes(q);
    return mc&&ms&&mr&&mq;
  });

  function exportVouchers(){
    exportCSV(filteredV.map(v=({"Ref":v.refNumber||"","Date":v.date||"","Company":v.companyName||"","Department":v.departmentName||"","Staff":v.staffName||"","Receiver":v.receiverName||"","Amount AED":v.totalAmount||0,"Status":v.status||"","Approved By":v.approvedBy||"","Rejected By":v.rejectedBy||"","Reject Reason":v.rejectionReason||"","Dup Flag":v.duplicateFlag?"Yes":"No","Attachments":v.attachments?.length||0})),`vouchers_${dateFrom}_to_${dateTo}.csv`);
  }
  function exportDP(){
    exportCSV(rangedDp.map(dp=({"Date":dp.date||"","Company":dp.companyName||"","Paid To":dp.paidTo||"","Description":dp.description||"","Amount AED":dp.amount||0,"Authorized By":dp.authorizedBy||"","Recorded By":dp.recordedBy||""})),`direct_payments_${dateFrom}_to_${dateTo}.csv`);
  }
  function exportTx(){
    exportCSV(transactions.map(t=({"Date":formatDate(t.createdAt),"Type":t.type||"","Company":t.companyName||"","Ref/Desc":t.refNumber||t.description||"","Paid To":t.paidTo||"","Amount AED":t.amount||0,"Balance Before":t.balanceBefore||0,"Balance After":t.balanceAfter||0,"Processed By":t.processedBy||""})),`transactions_${todayStr()}.csv`);
  }

  return(
    <div style={S.page}>
      {viewingV&&<VoucherViewPopup voucher={viewingV} onClose={()=>setViewingV(null)}/>}

      <div style={S.header}>
        <h1 style={S.headerTitle}>Finance Dashboard</h1>
        <div style={S.headerRight}>
          <span style={S.headerUser}>👤 {currentUser?.name}</span>
            <button style={{ padding:"7px 16px", backgroundColor:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.4)", color:"#fff", borderRadius:7, cursor:"pointer", fontSize:13, fontWeight:600 }} onClick={() => router.push("/print")}>
                🖨️ Print
            </button>
          <button style={S.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Date filter bar */}
      <div style={S.filterBar}>
        <div style={S.fg}><label style={S.fLbl}>From</label><input type="date" style={S.fInput} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
        <div style={S.fg}><label style={S.fLbl}>To</label><input type="date" style={S.fInput} value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
        <button style={S.rangeBtn} onClick={()=>{setDateFrom(startOfMonth());setDateTo(todayStr());}}>This Month</button>
        <button style={S.rangeBtn} onClick={()=>{const y=new Date().getFullYear();setDateFrom(`${y}-01-01`);setDateTo(`${y}-12-31`);}}>This Year</button>
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {[["dashboard","Dashboard"],["vouchers","All Vouchers"],["direct","Direct Payments"],["transactions","Transactions"],["balances","Balances"]].map(([tab,label])=>(
          <button key={tab} style={activeTab===tab?S.tabOn:S.tabOff} onClick={()=>setActiveTab(tab)}>{label}</button>
        ))}
      </div>

      <div style={S.content}>

        {/* ── DASHBOARD ── */}
        {activeTab==="dashboard"&&(
          <div>
            <div style={S.statGrid}>
              <StatCard label="Total Paid (Vouchers)" value={`AED ${fmtAED(totalPaid)}`} color="#2d6a4f"/>
              <StatCard label="Direct Payments" value={`AED ${fmtAED(totalDirect)}`} color="#1a6fa8"/>
              <StatCard label="Combined Balance" value={`AED ${fmtAED(totalBalance)}`} color="#5a3e9e"/>
              <StatCard label="Approved Vouchers" value={rangedV.filter(v=>v.status==="paid").length} sub="in selected period" color="#2d6a4f"/>
              <StatCard label="Pending Vouchers" value={rangedV.filter(v=>v.status==="pending").length} sub="awaiting cashier" color="#856404"/>
              <StatCard label="Rejected Vouchers" value={rangedV.filter(v=>v.status==="rejected").length} sub="in selected period" color="#cc0000"/>
              {totalDupFlags>0&&<StatCard label="Duplicate Flags" value={totalDupFlags} sub="pending — review!" color="#ffc107"/>}
            </div>

            <h3 style={S.secTitle}>Company Summary</h3>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr style={S.thead}>
                  <th style={S.th}>Company</th>
                  <th style={{...S.th,textAlign:"right"}}>Balance</th>
                  <th style={{...S.th,textAlign:"right"}}>Paid (Vouchers)</th>
                  <th style={{...S.th,textAlign:"right"}}>Direct Payments</th>
                  <th style={{...S.th,textAlign:"right"}}>Total Spent</th>
                  <th style={{...S.th,textAlign:"center"}}>Pending</th>
                  <th style={{...S.th,textAlign:"center"}}>Rejected</th>
                </tr></thead>
                <tbody>
                  {companySummary.map((c,i)=>(
                    <tr key={i} style={i%2===0?S.trEven:S.trOdd}>
                      <td style={S.td}><strong>{c.name}</strong></td>
                      <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#5a3e9e"}}>AED {fmtAED(c.balance)}</td>
                      <td style={{...S.td,textAlign:"right"}}>AED {fmtAED(c.paid)}</td>
                      <td style={{...S.td,textAlign:"right"}}>AED {fmtAED(c.direct)}</td>
                      <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#cc0000"}}>AED {fmtAED(c.paid+c.direct)}</td>
                      <td style={{...S.td,textAlign:"center"}}><span style={S.pendBadge}>{c.pending}</span></td>
                      <td style={{...S.td,textAlign:"center"}}><span style={S.rejBadge}>{c.rejected}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={S.exportRow}>
              <button style={S.exportBtn} onClick={exportVouchers}>⬇ Export Vouchers CSV</button>
              <button style={S.exportBtn} onClick={exportDP}>⬇ Export Direct Payments CSV</button>
              <button style={S.exportBtn} onClick={exportTx}>⬇ Export Transactions CSV</button>
            </div>
          </div>
        )}

        {/* ── ALL VOUCHERS ── */}
        {activeTab==="vouchers"&&(
          <div>
            <div style={S.toolbar}>
              <input style={S.searchInput} placeholder="🔍  Search ref, receiver, staff, company..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
              <select style={S.sel} value={filterComp} onChange={e=>setFilterComp(e.target.value)}>
                <option value="all">All Companies</option>
                {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select style={S.sel} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
              <button style={S.exportBtn} onClick={exportVouchers}>⬇ CSV</button>
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr style={S.thead}>
                  <th style={S.th}>Ref</th><th style={S.th}>Date</th><th style={S.th}>Company</th>
                  <th style={S.th}>Receiver</th><th style={S.th}>Staff</th>
                  <th style={{...S.th,textAlign:"right"}}>Amount</th>
                  <th style={{...S.th,textAlign:"center"}}>Status</th>
                  <th style={{...S.th,textAlign:"center"}}>Dup</th>
                  <th style={{...S.th,textAlign:"center"}}>View</th>
                </tr></thead>
                <tbody>
                  {filteredV.map((v,i)=>{
                    const sc={paid:{bg:"#cce5ff",fg:"#004085"},rejected:{bg:"#fde8e8",fg:"#cc0000"},pending:{bg:"#fff3cd",fg:"#856404"}}[v.status]||{bg:"#f0f0f0",fg:"#555"};
                    return(
                      <tr key={v.id} style={i%2===0?S.trEven:S.trOdd}>
                        <td style={{...S.td,fontWeight:700,color:"#5a3e9e",whiteSpace:"nowrap"}}>{v.refNumber}</td>
                        <td style={{...S.td,whiteSpace:"nowrap"}}>{v.date}</td>
                        <td style={S.td}>{v.companyName}</td>
                        <td style={S.td}>{v.receiverName}</td>
                        <td style={{...S.td,color:"#888"}}>{v.staffName}</td>
                        <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#cc0000"}}>AED {fmtAED(v.totalAmount)}</td>
                        <td style={{...S.td,textAlign:"center"}}><span style={{...S.badge,backgroundColor:sc.bg,color:sc.fg}}>{v.status?.toUpperCase()}</span></td>
                        <td style={{...S.td,textAlign:"center"}}>{v.duplicateFlag?<span style={{color:"#856404",fontWeight:700}}>⚠️</span>:"—"}</td>
                        <td style={{...S.td,textAlign:"center"}}><button style={S.viewBtn} onClick={()=>setViewingV(v)}>👁</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredV.length===0&&<p style={S.empty}>No vouchers found.</p>}
          </div>
        )}

        {/* ── DIRECT PAYMENTS ── */}
        {activeTab==="direct"&&(
          <div>
            <div style={S.toolbar}>
              <select style={S.sel} value={filterComp} onChange={e=>setFilterComp(e.target.value)}>
                <option value="all">All Companies</option>
                {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button style={S.exportBtn} onClick={exportDP}>⬇ CSV</button>
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr style={S.thead}>
                  <th style={S.th}>Date</th><th style={S.th}>Company</th><th style={S.th}>Paid To</th>
                  <th style={S.th}>Description</th><th style={{...S.th,textAlign:"right"}}>Amount</th>
                  <th style={S.th}>Authorized By</th><th style={S.th}>Recorded By</th>
                </tr></thead>
                <tbody>
                  {rangedDp.filter(dp=>filterComp==="all"||dp.companyId===filterComp).map((dp,i)=>(
                    <tr key={dp.id} style={i%2===0?S.trEven:S.trOdd}>
                      <td style={{...S.td,whiteSpace:"nowrap"}}>{dp.date}</td>
                      <td style={S.td}>{dp.companyName}</td>
                      <td style={{...S.td,fontWeight:600}}>{dp.paidTo}</td>
                      <td style={S.td}>{dp.description}</td>
                      <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#cc0000"}}>AED {fmtAED(dp.amount)}</td>
                      <td style={{...S.td,color:"#888"}}>{dp.authorizedBy||"—"}</td>
                      <td style={{...S.td,color:"#888"}}>{dp.recordedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {activeTab==="transactions"&&(
          <div>
            <div style={S.toolbar}><button style={S.exportBtn} onClick={exportTx}>⬇ Export CSV</button></div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr style={S.thead}>
                  <th style={S.th}>Date</th><th style={S.th}>Type</th><th style={S.th}>Company</th>
                  <th style={S.th}>Reference / Description</th>
                  <th style={{...S.th,textAlign:"right"}}>Amount</th>
                  <th style={{...S.th,textAlign:"right"}}>Balance After</th>
                  <th style={S.th}>Processed By</th>
                </tr></thead>
                <tbody>
                  {transactions.map((t,i)=>(
                    <tr key={t.id} style={i%2===0?S.trEven:S.trOdd}>
                      <td style={{...S.td,whiteSpace:"nowrap"}}>{formatDate(t.createdAt)}</td>
                      <td style={S.td}><span style={{...S.badge,backgroundColor:t.type==="voucher_payment"?"#cce5ff":"#f0f7f4",color:t.type==="voucher_payment"?"#004085":"#2d6a4f",fontSize:11}}>{t.type==="voucher_payment"?"Voucher":"Direct"}</span></td>
                      <td style={S.td}>{t.companyName}</td>
                      <td style={{...S.td,color:"#555"}}>{t.refNumber||t.description||"—"}</td>
                      <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#cc0000"}}>AED {fmtAED(t.amount)}</td>
                      <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#5a3e9e"}}>AED {fmtAED(t.balanceAfter)}</td>
                      <td style={{...S.td,color:"#888"}}>{t.processedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── BALANCES ── */}
        {activeTab==="balances"&&(
          <div>
            <h3 style={S.secTitle}>Current Balances</h3>
            <div style={S.balGrid}>
              {companies.map(c=>(
                <div key={c.id} style={S.balCard}>
                  <div style={S.balName}>{c.name}</div>
                  <div style={S.balAmt}>AED {fmtAED(c.balance)}</div>
                  <div style={S.balSub}>Opening: AED {fmtAED(c.openingBalance)}</div>
                  <div style={S.balSub}>Total Spent: AED {fmtAED((c.openingBalance||0)-(c.balance||0))}</div>
                </div>
              ))}
              <div style={{...S.balCard,backgroundColor:"#1a1a2e"}}>
                <div style={{...S.balName,color:"#aaa"}}>All Companies</div>
                <div style={{...S.balAmt,color:"#fff"}}>AED {fmtAED(totalBalance)}</div>
                <div style={{...S.balSub,color:"#666"}}>Combined Balance</div>
              </div>
            </div>

            <h3 style={{...S.secTitle,marginTop:24}}>Transaction History by Company</h3>
            {companies.map(c=>{
              const cTx=transactions.filter(t=>t.companyId===c.id);
              if(!cTx.length)return null;
              return(
                <div key={c.id} style={{marginBottom:24}}>
                  <div style={S.compHeader}>{c.name}</div>
                  <div style={S.tableWrap}>
                    <table style={S.table}>
                      <thead><tr style={S.thead}>
                        <th style={S.th}>Date</th><th style={S.th}>Type</th><th style={S.th}>Reference</th>
                        <th style={{...S.th,textAlign:"right"}}>Amount</th>
                        <th style={{...S.th,textAlign:"right"}}>Balance After</th>
                      </tr></thead>
                      <tbody>
                        {cTx.map((t,i)=>(
                          <tr key={t.id} style={i%2===0?S.trEven:S.trOdd}>
                            <td style={{...S.td,whiteSpace:"nowrap"}}>{formatDate(t.createdAt)}</td>
                            <td style={S.td}>{t.type==="voucher_payment"?"Voucher":"Direct"}</td>
                            <td style={S.td}>{t.refNumber||t.description||"—"}</td>
                            <td style={{...S.td,textAlign:"right",color:"#cc0000",fontWeight:700}}>AED {fmtAED(t.amount)}</td>
                            <td style={{...S.td,textAlign:"right",color:"#5a3e9e",fontWeight:700}}>AED {fmtAED(t.balanceAfter)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

const S={
  page:{minHeight:"100vh",backgroundColor:"#f0f4f8",fontFamily:"sans-serif"},
  header:{backgroundColor:"#5a3e9e",color:"#fff",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  headerTitle:{margin:0,fontSize:17,fontWeight:600},
  headerRight:{display:"flex",alignItems:"center",gap:12},
  headerUser:{fontSize:13,opacity:0.85},
  logoutBtn:{padding:"5px 12px",background:"transparent",border:"1px solid rgba(255,255,255,0.45)",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:12},
  filterBar:{backgroundColor:"#fff",padding:"12px 20px",borderBottom:"1px solid #eee",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"},
  fg:{display:"flex",alignItems:"center",gap:6},
  fLbl:{fontSize:12,fontWeight:600,color:"#555"},
  fInput:{padding:"7px 10px",borderRadius:7,border:"1px solid #ddd",fontSize:13,outline:"none"},
  rangeBtn:{padding:"7px 14px",backgroundColor:"#f0ecfb",color:"#5a3e9e",border:"1px solid #d4c8f5",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:600},
  tabBar:{display:"flex",borderBottom:"2px solid #ddd",backgroundColor:"#fff",paddingLeft:20,flexWrap:"wrap"},
  tabOff:{padding:"11px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#666",borderBottom:"2px solid transparent",marginBottom:-2},
  tabOn:{padding:"11px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#5a3e9e",fontWeight:700,borderBottom:"2px solid #5a3e9e",marginBottom:-2},
  content:{padding:"20px 16px",maxWidth:1100,margin:"0 auto"},
  secTitle:{fontSize:15,fontWeight:700,color:"#1a1a2e",margin:"0 0 12px"},
  statGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:14,marginBottom:28},
  statCard:{backgroundColor:"#fff",borderRadius:10,padding:"16px 18px",boxShadow:"0 1px 5px rgba(0,0,0,0.07)"},
  statValue:{fontSize:20,fontWeight:800,color:"#1a1a2e",marginBottom:4},
  statLabel:{fontSize:12,fontWeight:600,color:"#666"},
  statSub:{fontSize:11,color:"#aaa",marginTop:2},
  toolbar:{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"},
  searchInput:{flex:1,minWidth:200,padding:"9px 14px",borderRadius:8,border:"1px solid #ddd",fontSize:14,color:"#333",outline:"none"},
  sel:{padding:"9px 12px",borderRadius:8,border:"1px solid #ddd",fontSize:13,color:"#333",outline:"none",backgroundColor:"#fff"},
  exportBtn:{padding:"8px 16px",backgroundColor:"#5a3e9e",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,whiteSpace:"nowrap"},
  exportRow:{display:"flex",gap:10,flexWrap:"wrap",marginTop:20},
  tableWrap:{overflowX:"auto",borderRadius:10,boxShadow:"0 1px 5px rgba(0,0,0,0.07)",marginBottom:16},
  table:{width:"100%",borderCollapse:"collapse",backgroundColor:"#fff",fontSize:13},
  thead:{backgroundColor:"#f8f8f8"},
  th:{padding:"10px 12px",textAlign:"left",fontWeight:700,color:"#555",fontSize:12,borderBottom:"2px solid #eee",whiteSpace:"nowrap"},
  trEven:{backgroundColor:"#fff"},
  trOdd:{backgroundColor:"#fafafa"},
  td:{padding:"10px 12px",color:"#333",borderBottom:"1px solid #f0f0f0",fontSize:13},
  badge:{padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:700},
  viewBtn:{background:"none",border:"none",cursor:"pointer",fontSize:16},
  pendBadge:{backgroundColor:"#fff3cd",color:"#856404",padding:"2px 8px",borderRadius:12,fontSize:12,fontWeight:700},
  rejBadge:{backgroundColor:"#fde8e8",color:"#cc0000",padding:"2px 8px",borderRadius:12,fontSize:12,fontWeight:700},
  empty:{color:"#999",fontSize:14,fontStyle:"italic",textAlign:"center",marginTop:40},
  balGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:28},
  balCard:{backgroundColor:"#f3f0fb",borderRadius:10,padding:"18px 20px"},
  balName:{fontSize:13,fontWeight:700,color:"#5a3e9e",marginBottom:8},
  balAmt:{fontSize:22,fontWeight:800,color:"#1a1a2e",marginBottom:4},
  balSub:{fontSize:12,color:"#888",marginTop:2},
  compHeader:{fontSize:14,fontWeight:700,color:"#1a1a2e",marginBottom:8,padding:"8px 12px",backgroundColor:"#f3f0fb",borderRadius:7},
};