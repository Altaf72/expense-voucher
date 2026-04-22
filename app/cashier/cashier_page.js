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
  if (val===undefined||val===null||val==="") return "0.00";
  const num=parseFloat(val); if(isNaN(num)) return "0.00";
  return num.toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function numberToWords(amount) {
  if(!amount||isNaN(amount)) return "";
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function convert(n){if(n===0)return "";if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?" "+ones[n%10]:"");if(n<1000)return ones[Math.floor(n/100)]+" Hundred"+(n%100?" "+convert(n%100):"");if(n<1000000)return convert(Math.floor(n/1000))+" Thousand"+(n%1000?" "+convert(n%1000):"");return convert(Math.floor(n/1000000))+" Million"+(n%1000000?" "+convert(n%1000000):"");}
  const parts=parseFloat(amount).toFixed(2).split(".");const fils=parseInt(parts[1]),dirhams=parseInt(parts[0]);
  if(dirhams===0&&fils===0)return "";let words=dirhams>0?convert(dirhams)+" Dirhams":"";
  if(fils>0)words+=(words?" and ":"")+convert(fils)+" Fils";return words+" Only";
}
function todayFormatted(){return new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
function todayISO(){return new Date().toISOString().split("T")[0];}
function startOfMonthISO(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split("T")[0];}

function isDuplicate(v,allVouchers){
  const vDate=new Date(v.date);
  return allVouchers.some(other=>{
    if(other.id===v.id||other.status==="rejected") return false;
    const days=Math.abs((vDate-new Date(other.date))/(1000*60*60*24));
    return other.receiverName?.toLowerCase()===v.receiverName?.toLowerCase()&&Math.abs(parseFloat(other.totalAmount)-parseFloat(v.totalAmount))<0.01&&days<=3;
  });
}

function dateInRange(dateStr,from,to){
  if(!dateStr) return true;
  try{
    const p=dateStr.split(" ");
    const mo={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const d=new Date(parseInt(p[2]),mo[p[1]],parseInt(p[0]));
    if(from&&d<new Date(from)) return false;
    if(to&&d>new Date(to)) return false;
    return true;
  }catch{return true;}
}

// ─────────────────────────────────────────────
// VOUCHER VIEW POPUP
// ─────────────────────────────────────────────
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
              <button style={VP.printBtn} onClick={()=>window.open(`/print?ref=${voucher.refNumber}`,"_blank")}>🖨️ Print</button>
              <button style={VP.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>
          {voucher.duplicateFlag&&<div style={VP.dupWarn}>⚠️ Possible duplicate — similar voucher within 3 days</div>}
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
                <div key={i} onClick={()=>setActiveIdx(i)} style={{width:72,border:`2px solid ${i===activeIdx?"#2d6a4f":"#ddd"}`,borderRadius:6,cursor:"pointer",overflow:"hidden",padding:2,backgroundColor:i===activeIdx?"#f0f7f4":"#f8f9fa"}}>
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
              <a href={activeAtt.originalUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#2d6a4f",textDecoration:"none",padding:"3px 10px",backgroundColor:"#f0f7f4",borderRadius:5,flexShrink:0}}>Open ↗</a>
            </div>
            <div style={VP.viewer}>
              {isImg(activeAtt.originalUrl)?<img src={activeAtt.originalUrl} alt={activeAtt.fileName} style={{maxWidth:"100%",maxHeight:"calc(88vh - 80px)",objectFit:"contain",borderRadius:6,display:"block"}}/>:<iframe src={activeAtt.originalUrl} title={activeAtt.fileName} style={{width:"100%",height:"100%",minHeight:500,border:"none",borderRadius:6}}/>}
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
function RejectPopup({voucher,onConfirm,onClose}){
  const [reason,setReason]=useState("");
  return(
    <div style={POP.overlay} onClick={onClose}>
      <div style={POP.box} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:700,color:"#cc0000",marginBottom:6}}>Reject Voucher</div>
        <div style={{fontSize:13,color:"#666",marginBottom:16}}>{voucher.refNumber} — {voucher.receiverName}</div>
        <label style={POP.lbl}>Rejection Reason <span style={{color:"#cc0000"}}>*</span></label>
        <textarea style={{...POP.tinput,minHeight:90,resize:"vertical"}} placeholder="Enter reason for rejection..."
          value={reason} onChange={e=>setReason(e.target.value)} rows={3}/>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button style={POP.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={POP.rejectBtn} onClick={()=>{if(!reason.trim()){alert("Please enter a rejection reason.");return;}onConfirm(reason.trim());}}>Confirm Reject</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DIRECT PAYMENT POPUP
// ─────────────────────────────────────────────
function DirectPaymentPopup({companies,onConfirm,onClose}){
  const [companyId,setCompanyId]=useState("");
  const [date,setDate]=useState(todayFormatted());
  const [paidTo,setPaidTo]=useState("");
  const [description,setDescription]=useState("");
  const [amount,setAmount]=useState("");
  const [authorizedBy,setAuthorizedBy]=useState("");
  function handleSubmit(){
    if(!companyId||!paidTo.trim()||!description.trim()||!amount){alert("Please fill in all required fields.");return;}
    onConfirm({companyId,companyName:companies.find(c=>c.id===companyId)?.name||"",date,paidTo:paidTo.trim(),description:description.trim(),amount:parseFloat(amount),authorizedBy:authorizedBy.trim()});
  }
  return(
    <div style={POP.overlay} onClick={onClose}>
      <div style={{...POP.box,maxWidth:500}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:700,color:"#1a1a2e",marginBottom:4}}>Direct Payment</div>
        <div style={{fontSize:13,color:"#888",marginBottom:20}}>Payment without a voucher — CFO / Manager instruction</div>
        <div style={POP.grid}>
          <div style={POP.fg}><label style={POP.lbl}>Company <span style={{color:"#cc0000"}}>*</span></label><select style={POP.tinput} value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select...</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div style={POP.fg}><label style={POP.lbl}>Date</label><input style={POP.tinput} value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{...POP.fg,gridColumn:"1/-1"}}><label style={POP.lbl}>Paid To <span style={{color:"#cc0000"}}>*</span></label><input style={POP.tinput} placeholder="Receiver / vendor name" value={paidTo} onChange={e=>setPaidTo(e.target.value)}/></div>
          <div style={{...POP.fg,gridColumn:"1/-1"}}><label style={POP.lbl}>Description <span style={{color:"#cc0000"}}>*</span></label><textarea style={{...POP.tinput,resize:"vertical"}} rows={2} placeholder="Purpose" value={description} onChange={e=>setDescription(e.target.value)}/></div>
          <div style={POP.fg}><label style={POP.lbl}>Amount (AED) <span style={{color:"#cc0000"}}>*</span></label><input style={POP.tinput} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
          <div style={POP.fg}><label style={POP.lbl}>Authorized By</label><input style={POP.tinput} placeholder="CFO / Manager" value={authorizedBy} onChange={e=>setAuthorizedBy(e.target.value)}/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button style={POP.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={POP.confirmBtn} onClick={handleSubmit}>Record Payment</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOP-UP POPUP
// ─────────────────────────────────────────────
function TopupPopup({companies,onConfirm,onClose}){
  const [companyId,setCompanyId]=useState("");
  const [date,setDate]=useState(todayFormatted());
  const [description,setDescription]=useState("");
  const [amount,setAmount]=useState("");
  const [receivedFrom,setReceivedFrom]=useState("");
  function handleSubmit(){
    if(!companyId||!amount||!description.trim()){alert("Please fill in Company, Description and Amount.");return;}
    onConfirm({companyId,companyName:companies.find(c=>c.id===companyId)?.name||"",date,description:description.trim(),amount:parseFloat(amount),receivedFrom:receivedFrom.trim()});
  }
  return(
    <div style={POP.overlay} onClick={onClose}>
      <div style={{...POP.box,maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:700,color:"#1a6fa8",marginBottom:4}}>Fund Top-up / Receipt</div>
        <div style={{fontSize:13,color:"#888",marginBottom:20}}>Record cash received — increases company balance</div>
        <div style={POP.grid}>
          <div style={POP.fg}><label style={POP.lbl}>Company <span style={{color:"#cc0000"}}>*</span></label><select style={POP.tinput} value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select...</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div style={POP.fg}><label style={POP.lbl}>Date</label><input style={POP.tinput} value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{...POP.fg,gridColumn:"1/-1"}}><label style={POP.lbl}>Description <span style={{color:"#cc0000"}}>*</span></label><input style={POP.tinput} placeholder="e.g. Cash received from head office" value={description} onChange={e=>setDescription(e.target.value)}/></div>
          <div style={POP.fg}><label style={POP.lbl}>Amount (AED) <span style={{color:"#cc0000"}}>*</span></label><input style={POP.tinput} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
          <div style={POP.fg}><label style={POP.lbl}>Received From</label><input style={POP.tinput} placeholder="Person / department" value={receivedFrom} onChange={e=>setReceivedFrom(e.target.value)}/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button style={POP.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{...POP.confirmBtn,backgroundColor:"#1a6fa8"}} onClick={handleSubmit}>Record Top-up</button>
        </div>
      </div>
    </div>
  );
}

const POP={
  overlay:{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.62)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16},
  box:{backgroundColor:"#fff",borderRadius:12,padding:"24px",maxWidth:440,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,0.22)"},
  badge:{padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700},
  lbl:{fontSize:12,fontWeight:600,color:"#555",display:"block",marginBottom:5},
  tinput:{width:"100%",padding:"9px 11px",borderRadius:8,border:"1px solid #ddd",fontSize:14,color:"#222",outline:"none",boxSizing:"border-box",backgroundColor:"#fff",fontFamily:"sans-serif"},
  grid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14},
  fg:{display:"flex",flexDirection:"column",gap:4},
  cancelBtn:{flex:1,padding:"10px",backgroundColor:"#f0f0f0",color:"#555",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:500},
  rejectBtn:{flex:1,padding:"10px",backgroundColor:"#cc0000",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:600},
  confirmBtn:{flex:1,padding:"10px",backgroundColor:"#2d6a4f",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:600},
};
const VP={
  box:{backgroundColor:"#fff",borderRadius:14,width:"96%",height:"88vh",boxShadow:"0 12px 40px rgba(0,0,0,0.24)",display:"flex",overflow:"hidden"},
  left:{flex:"0 0 420px",minWidth:280,overflowY:"auto",padding:"18px 20px",height:"100%"},
  right:{flex:1,display:"flex",flexDirection:"column",padding:14,minWidth:0,height:"100%"},
  topBar:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,paddingBottom:14,borderBottom:"2px solid #eee"},
  refNum:{fontSize:17,fontWeight:800,color:"#2d6a4f"},
  meta:{fontSize:12,color:"#888",marginTop:3},
  printBtn:{background:"#1a1a2e",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,color:"#fff",flexShrink:0},
  closeBtn:{background:"#f0f0f0",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:13,color:"#555",flexShrink:0},
  dupWarn:{backgroundColor:"#fff3cd",border:"1px solid #ffc107",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#856404",marginBottom:14,fontWeight:500},
  infoGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16},
  iLbl:{fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2},
  iVal:{fontSize:13,color:"#333",fontWeight:500},
  secTitle:{fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.04em",borderTop:"1px solid #eee",paddingTop:12,marginTop:14,marginBottom:8},
  tHead:{display:"flex",gap:8,paddingBottom:5,marginBottom:4,borderBottom:"1px solid #f0f0f0"},
  tHdr:{fontSize:11,fontWeight:700,color:"#ccc",textTransform:"uppercase"},
  tRow:{display:"flex",gap:8,paddingBottom:6,marginBottom:5,borderBottom:"1px solid #f8f8f8"},
  totalRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:"2px solid #eee",marginTop:8},
  wordsRow:{backgroundColor:"#fff8f8",border:"1px solid #ffe0e0",borderRadius:7,padding:"8px 12px",marginBottom:14,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"},
  rejectNote:{backgroundColor:"#fde8e8",border:"1px solid #ffcccc",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#cc0000",marginBottom:10},
  viewerTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexShrink:0},
  viewer:{flex:1,minHeight:0,backgroundColor:"#f0f4f8",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"},
};

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function CashierPage(){
  const router=useRouter();
  const [currentUser,      setCurrentUser]      =useState(null);
  const [companies,        setCompanies]        =useState([]);
  const [vouchers,         setVouchers]         =useState([]);
  const [directPayments,   setDirectPayments]   =useState([]);
  const [topups,           setTopups]           =useState([]);
  const [activeTab,        setActiveTab]        =useState("vouchers");
  const [msgBanner,        setMsgBanner]        =useState({text:"",type:"success"});
  const [viewingVoucher,   setViewingVoucher]   =useState(null);
  const [rejectingVoucher, setRejectingVoucher] =useState(null);
  const [showDirectPayment,setShowDirectPayment]=useState(false);
  const [showTopup,        setShowTopup]        =useState(false);
  const [searchTerm,       setSearchTerm]       =useState("");
  const [filterStatus,     setFilterStatus]     =useState("pending");
  // Ledger filters
  const [ledgerFrom,  setLedgerFrom]  =useState(startOfMonthISO());
  const [ledgerTo,    setLedgerTo]    =useState(todayISO());
  const [ledgerComp,  setLedgerComp]  =useState("all");

  useEffect(()=>{checkAuth();},[]);

  async function checkAuth(){
    const user=await getCurrentUser();
    if(!user||user.role!=="cashier"){router.push("/login");return;}
    setCurrentUser(user); await loadAll(user);
  }

  async function loadAll(user){
    const compSnap=await getDocs(collection(db,"companies"));
    const allC=compSnap.docs.map(d=>({id:d.id,...d.data()}));
    const myC=user.companies?.length?allC.filter(c=>user.companies.includes(c.id)):allC;
    setCompanies(myC); const myIds=myC.map(c=>c.id);

    const vSnap=await getDocs(collection(db,"vouchers"));
    const allV=vSnap.docs.map(d=>({id:d.id,...d.data()}));
    const myV=allV.filter(v=>myIds.includes(v.companyId))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
      .map(v=>({...v,duplicateFlag:v.status==="pending"?isDuplicate(v,allV):(v.duplicateFlag||false)}));
    setVouchers(myV);

    const dpSnap=await getDocs(collection(db,"direct_payments"));
    setDirectPayments(dpSnap.docs.map(d=>({id:d.id,...d.data()})).filter(dp=>myIds.includes(dp.companyId)).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));

    const tuSnap=await getDocs(collection(db,"topups"));
    setTopups(tuSnap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>myIds.includes(t.companyId)).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  }

  function showBanner(text,type="success"){setMsgBanner({text,type});setTimeout(()=>setMsgBanner({text:"",type:"success"}),4500);}

  async function approveVoucher(v){
    const company=companies.find(c=>c.id===v.companyId);
    if(!company){showBanner("Company not found.","error");return;}
    if((company.balance||0)<v.totalAmount){showBanner(`Insufficient balance! Available: AED ${fmtAED(company.balance)}`,"error");return;}
    try{
      const newBal=(company.balance||0)-v.totalAmount;
      await updateDoc(doc(db,"vouchers",v.id),{status:"paid",approvedBy:currentUser.name,approvedAt:serverTimestamp(),paidAt:serverTimestamp()});
      await updateDoc(doc(db,"companies",v.companyId),{balance:newBal});
      await addDoc(collection(db,"transactions"),{type:"voucher_payment",voucherId:v.id,refNumber:v.refNumber,companyId:v.companyId,companyName:v.companyName,amount:v.totalAmount,balanceBefore:company.balance,balanceAfter:newBal,processedBy:currentUser.name,createdAt:serverTimestamp()});
      showBanner(`Voucher ${v.refNumber} approved and paid!`);
      await loadAll(currentUser);
    }catch(e){showBanner("Error: "+e.message,"error");}
  }

  async function rejectVoucher(v,reason){
    try{
      await updateDoc(doc(db,"vouchers",v.id),{status:"rejected",rejectionReason:reason,rejectedBy:currentUser.name,rejectedAt:serverTimestamp()});
      setRejectingVoucher(null); showBanner(`Voucher ${v.refNumber} rejected.`);
      await loadAll(currentUser);
    }catch(e){showBanner("Error: "+e.message,"error");}
  }

  async function recordDirectPayment(data){
    const company=companies.find(c=>c.id===data.companyId);
    if(!company){showBanner("Company not found.","error");return;}
    if((company.balance||0)<data.amount){showBanner(`Insufficient balance! Available: AED ${fmtAED(company.balance)}`,"error");return;}
    try{
      const newBal=(company.balance||0)-data.amount;
      await addDoc(collection(db,"direct_payments"),{...data,recordedBy:currentUser.name,balanceBefore:company.balance,balanceAfter:newBal,createdAt:serverTimestamp()});
      await updateDoc(doc(db,"companies",data.companyId),{balance:newBal});
      await addDoc(collection(db,"transactions"),{type:"direct_payment",companyId:data.companyId,companyName:data.companyName,amount:data.amount,description:data.description,paidTo:data.paidTo,balanceBefore:company.balance,balanceAfter:newBal,processedBy:currentUser.name,authorizedBy:data.authorizedBy||"",createdAt:serverTimestamp()});
      setShowDirectPayment(false); showBanner(`Direct payment of AED ${fmtAED(data.amount)} recorded.`);
      await loadAll(currentUser);
    }catch(e){showBanner("Error: "+e.message,"error");}
  }

  async function recordTopup(data){
    const company=companies.find(c=>c.id===data.companyId);
    if(!company){showBanner("Company not found.","error");return;}
    try{
      const newBal=(company.balance||0)+data.amount;
      await addDoc(collection(db,"topups"),{...data,receivedBy:currentUser.name,balanceBefore:company.balance,balanceAfter:newBal,createdAt:serverTimestamp()});
      await updateDoc(doc(db,"companies",data.companyId),{balance:newBal});
      await addDoc(collection(db,"transactions"),{type:"topup",companyId:data.companyId,companyName:data.companyName,amount:data.amount,description:data.description,receivedFrom:data.receivedFrom||"",balanceBefore:company.balance,balanceAfter:newBal,processedBy:currentUser.name,createdAt:serverTimestamp()});
      setShowTopup(false); showBanner(`Top-up of AED ${fmtAED(data.amount)} recorded. Balance updated.`);
      await loadAll(currentUser);
    }catch(e){showBanner("Error: "+e.message,"error");}
  }

  async function handleLogout(){await logoutUser();router.push("/login");}

  const filteredVouchers=vouchers.filter(v=>{
    const ms=filterStatus==="all"||v.status===filterStatus;
    const q=searchTerm.toLowerCase();
    const mq=!searchTerm||v.refNumber?.toLowerCase().includes(q)||v.receiverName?.toLowerCase().includes(q)||v.companyName?.toLowerCase().includes(q)||v.staffName?.toLowerCase().includes(q);
    return ms&&mq;
  });

  const totalBalance=companies.reduce((s,c)=>s+(parseFloat(c.balance)||0),0);
  const pendingCount=vouchers.filter(v=>v.status==="pending").length;
  const dupCount=vouchers.filter(v=>v.status==="pending"&&v.duplicateFlag).length;

  // ── LEDGER ────────────────────────────────
  function buildLedger(company){
    const myVouchers=vouchers.filter(v=>v.status==="paid"&&v.companyId===company.id&&dateInRange(v.date,ledgerFrom,ledgerTo));
    const myDp=directPayments.filter(dp=>dp.companyId===company.id&&dateInRange(dp.date,ledgerFrom,ledgerTo));
    const myTu=topups.filter(t=>t.companyId===company.id&&dateInRange(t.date,ledgerFrom,ledgerTo));
    const rows=[
      ...myVouchers.map(v=>({date:v.date||"",description:`Voucher ${v.refNumber} — ${v.receiverName}`,by:v.staffName,receipts:0,payments:parseFloat(v.totalAmount)||0,type:"voucher",ts:v.paidAt?.seconds||v.createdAt?.seconds||0})),
      ...myDp.map(dp=>({date:dp.date||"",description:dp.description,by:dp.paidTo,receipts:0,payments:parseFloat(dp.amount)||0,type:"direct",ts:dp.createdAt?.seconds||0})),
      ...myTu.map(t=>({date:t.date||"",description:t.description,by:t.receivedFrom||t.receivedBy,receipts:parseFloat(t.amount)||0,payments:0,type:"topup",ts:t.createdAt?.seconds||0})),
    ].sort((a,b)=>a.ts-b.ts);
    const totalPay=rows.reduce((s,r)=>s+r.payments,0);
    const totalRec=rows.reduce((s,r)=>s+r.receipts,0);
    const openingBal=(company.balance||0)+totalPay-totalRec;
    let bal=openingBal;
    const withBal=rows.map(r=>{bal=bal+r.receipts-r.payments;return{...r,balance:bal};});
    return{rows:withBal,openingBal,totalPay,totalRec};
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return(
    <div style={S.page}>
      {viewingVoucher&&<VoucherViewPopup voucher={viewingVoucher} onClose={()=>setViewingVoucher(null)}/>}
      {rejectingVoucher&&<RejectPopup voucher={rejectingVoucher} onConfirm={reason=>rejectVoucher(rejectingVoucher,reason)} onClose={()=>setRejectingVoucher(null)}/>}
      {showDirectPayment&&<DirectPaymentPopup companies={companies} onConfirm={recordDirectPayment} onClose={()=>setShowDirectPayment(false)}/>}
      {showTopup&&<TopupPopup companies={companies} onConfirm={recordTopup} onClose={()=>setShowTopup(false)}/>}

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.headerTitle}>Cashier Dashboard</h1>
        <div style={S.headerRight}>
          <button style={S.navBtn} onClick={()=>router.push("/print")}>🖨️ Print</button>
          <span style={S.headerUser}>👤 {currentUser?.name}</span>
          <button style={S.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Banner */}
      {msgBanner.text&&(
        <div style={{...S.banner,backgroundColor:msgBanner.type==="error"?"#fde8e8":"#d4edda",color:msgBanner.type==="error"?"#cc0000":"#2d6a4f",borderBottom:`1px solid ${msgBanner.type==="error"?"#ffcccc":"#b8dfc4"}`}}>
          <span>{msgBanner.text}</span>
          <button style={S.bannerClose} onClick={()=>setMsgBanner({text:"",type:"success"})}>✕</button>
        </div>
      )}

      {/* Balance Cards */}
      <div style={S.balBar}>
        {companies.map(c=>(
          <div key={c.id} style={S.balCard}>
            <div style={S.balCo}>{c.name}</div>
            <div style={S.balAmt}>AED {fmtAED(c.balance)}</div>
            <div style={S.balLbl}>Available Balance</div>
          </div>
        ))}
        <div style={{...S.balCard,backgroundColor:"#1a1a2e"}}>
          <div style={{...S.balCo,color:"#aaa"}}>Combined Total</div>
          <div style={{...S.balAmt,color:"#fff",fontSize:20}}>AED {fmtAED(totalBalance)}</div>
          <div style={{...S.balLbl,color:"#777"}}>All Companies</div>
        </div>
      </div>

      {/* Dup warning strip */}
      {dupCount>0&&<div style={S.dupStrip}>⚠️ {dupCount} pending voucher{dupCount>1?"s":""} flagged as possible duplicates — review carefully</div>}

      {/* Tab bar */}
      <div style={S.tabBar}>
        <div style={S.tabs}>
          {[["vouchers","Vouchers"],["direct","Direct Payments"],["topup","Top-up / Receipts"],["ledger","Ledger"]].map(([tab,label])=>(
            <button key={tab} style={activeTab===tab?S.tabOn:S.tabOff} onClick={()=>setActiveTab(tab)}>
              {tab==="vouchers"&&pendingCount>0?<>{label} <span style={S.pendBadge}>{pendingCount}</span></>:label}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,paddingRight:12}}>
          <button style={S.dpBtn} onClick={()=>setShowTopup(true)}>+ Top-up</button>
          <button style={S.dpBtn} onClick={()=>setShowDirectPayment(true)}>+ Direct Payment</button>
        </div>
      </div>

      <div style={S.content}>

        {/* ── VOUCHERS ── */}
        {activeTab==="vouchers"&&(
          <div>
            <div style={S.filterRow}>
              <input style={S.searchInput} placeholder="🔍  Search ref, receiver, company, staff..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
              <select style={S.filterSel} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
              {searchTerm&&<button style={S.clearBtn} onClick={()=>setSearchTerm("")}>✕</button>}
            </div>
            {filteredVouchers.length===0&&<p style={S.empty}>No vouchers found.</p>}
            {filteredVouchers.map(v=>{
              const sc={paid:{bg:"#cce5ff",fg:"#004085"},rejected:{bg:"#fde8e8",fg:"#cc0000"},pending:{bg:"#fff3cd",fg:"#856404"}}[v.status]||{bg:"#f0f0f0",fg:"#555"};
              return(
                <div key={v.id} style={{...S.vCard,borderLeft:v.duplicateFlag?"4px solid #ffc107":"4px solid transparent"}}>
                  {v.duplicateFlag&&<div style={S.dupWarn}>⚠️ Possible duplicate — same receiver &amp; amount within 3 days</div>}
                  <div style={S.vTop}>
                    <span style={S.vRef}>{v.refNumber}</span>
                    <span style={S.vDate}>{v.date}</span>
                    <span style={{...S.badge,backgroundColor:sc.bg,color:sc.fg}}>{v.status?.toUpperCase()}</span>
                  </div>
                  <div style={S.vInfo}>
                    <span style={S.vCo}>🏢 {v.companyName?.slice(0,16)}</span>
                    <span>👤 {v.receiverName}</span>
                    <span style={{color:"#aaa",fontSize:12}}>by {v.staffName}</span>
                    {v.attachments?.length>0&&<span style={S.attBadge}>📎 {v.attachments.length}</span>}
                    <span style={S.vAmt}>AED {fmtAED(v.totalAmount)}</span>
                  </div>
                  <div style={S.vActions}>
                    <button style={{...S.actBtn,color:"#2d6a4f",fontWeight:600}} onClick={()=>setViewingVoucher(v)}>👁 View</button>
                    {v.status==="pending"&&<>
                      <button style={S.approveBtn} onClick={()=>approveVoucher(v)}>✓ Approve &amp; Pay</button>
                      <button style={S.rejectBtn} onClick={()=>setRejectingVoucher(v)}>✕ Reject</button>
                    </>}
                    {v.status==="rejected"&&v.rejectionReason&&<span style={S.rejectReason}>📋 {v.rejectionReason}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DIRECT PAYMENTS ── */}
        {activeTab==="direct"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.secTitle}>Direct Payments</h2>
              <button style={S.dpBtn} onClick={()=>setShowDirectPayment(true)}>+ New</button>
            </div>
            {directPayments.length===0&&<p style={S.empty}>No direct payments recorded yet.</p>}
            {directPayments.map(dp=>(
              <div key={dp.id} style={S.dpCard}>
                <div style={S.vTop}><span style={{...S.vRef,color:"#2d6a4f"}}>{dp.date}</span><span style={S.vCo}>🏢 {dp.companyName}</span><span style={S.vAmt}>AED {fmtAED(dp.amount)}</span></div>
                <div style={{fontSize:14,color:"#333",marginBottom:4}}><strong>To:</strong> {dp.paidTo}</div>
                <div style={{fontSize:13,color:"#666",marginBottom:4}}>{dp.description}</div>
                <div style={{fontSize:12,color:"#999"}}>Recorded by {dp.recordedBy}{dp.authorizedBy?` · Auth by ${dp.authorizedBy}`:""}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── TOP-UP / RECEIPTS ── */}
        {activeTab==="topup"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.secTitle}>Top-up / Fund Receipts</h2>
              <button style={{...S.dpBtn,backgroundColor:"#1a6fa8"}} onClick={()=>setShowTopup(true)}>+ Add Top-up</button>
            </div>
            {topups.length===0&&<p style={S.empty}>No top-ups recorded yet.</p>}
            {topups.map(t=>(
              <div key={t.id} style={{...S.dpCard,borderLeft:"4px solid #1a6fa8"}}>
                <div style={S.vTop}><span style={{...S.vRef,color:"#1a6fa8"}}>{t.date}</span><span style={S.vCo}>🏢 {t.companyName}</span><span style={{fontWeight:800,color:"#2d6a4f",fontSize:14,marginLeft:"auto"}}>+ AED {fmtAED(t.amount)}</span></div>
                <div style={{fontSize:14,color:"#333",marginBottom:4}}>{t.description}</div>
                <div style={{fontSize:12,color:"#999"}}>Received by {t.receivedBy}{t.receivedFrom?` · From: ${t.receivedFrom}`:""}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── LEDGER ── */}
        {activeTab==="ledger"&&(
          <div>
            {/* Controls */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <input type="date" style={S.filterSel} value={ledgerFrom} onChange={e=>setLedgerFrom(e.target.value)}/>
              <input type="date" style={S.filterSel} value={ledgerTo} onChange={e=>setLedgerTo(e.target.value)}/>
              <select style={S.filterSel} value={ledgerComp} onChange={e=>setLedgerComp(e.target.value)}>
                <option value="all">All Companies</option>
                {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button style={{...S.dpBtn,backgroundColor:"#555"}} onClick={()=>{const d=new Date();setLedgerFrom(new Date(d.getFullYear(),d.getMonth(),1).toISOString().split("T")[0]);setLedgerTo(todayISO());}}>This Month</button>
              <button style={{...S.dpBtn,backgroundColor:"#555"}} onClick={()=>{setLedgerFrom(todayISO());setLedgerTo(todayISO());}}>Today</button>
              <button style={S.dpBtn} onClick={()=>window.print()}>🖨️ Print Ledger</button>
            </div>

            {companies.filter(c=>ledgerComp==="all"||c.id===ledgerComp).map(company=>{
              const{rows,openingBal,totalPay,totalRec}=buildLedger(company);
              if(!rows.length) return null;
              return(
                <div key={company.id} style={{marginBottom:28}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#fff",backgroundColor:"#2d6a4f",padding:"8px 14px",borderRadius:"8px 8px 0 0",display:"flex",justifyContent:"space-between"}}>
                    <span>{company.name}</span>
                    <span>Current Balance: AED {fmtAED(company.balance)}</span>
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",backgroundColor:"#fff",fontSize:13}}>
                      <thead>
                        <tr style={{backgroundColor:"#f5f5f5"}}>
                          <th style={LS.th}>Date</th>
                          <th style={LS.th}>Description</th>
                          <th style={LS.th}>Received / Paid By</th>
                          <th style={{...LS.th,textAlign:"right",color:"#2d6a4f"}}>Receipts</th>
                          <th style={{...LS.th,textAlign:"right",color:"#cc0000"}}>Payments</th>
                          <th style={{...LS.th,textAlign:"right"}}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{backgroundColor:"#f0f7f4"}}>
                          <td style={LS.td} colSpan={3}><strong>Opening Balance</strong></td>
                          <td style={{...LS.td,textAlign:"right"}}></td>
                          <td style={{...LS.td,textAlign:"right"}}></td>
                          <td style={{...LS.td,textAlign:"right",fontWeight:700}}>AED {fmtAED(openingBal)}</td>
                        </tr>
                        {rows.map((row,i)=>(
                          <tr key={i} style={{backgroundColor:i%2===0?"#fff":"#fafafa"}}>
                            <td style={{...LS.td,whiteSpace:"nowrap"}}>{row.date}</td>
                            <td style={LS.td}>
                              <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,marginRight:6,backgroundColor:row.type==="topup"?"#d4edda":row.type==="direct"?"#fff3cd":"#cce5ff",color:row.type==="topup"?"#2d6a4f":row.type==="direct"?"#856404":"#004085",fontWeight:600}}>
                                {row.type==="topup"?"Receipt":row.type==="direct"?"Direct":"Voucher"}
                              </span>
                              {row.description}
                            </td>
                            <td style={{...LS.td,color:"#666"}}>{row.by}</td>
                            <td style={{...LS.td,textAlign:"right",color:"#2d6a4f",fontWeight:row.receipts?600:400}}>{row.receipts?`AED ${fmtAED(row.receipts)}`:""}</td>
                            <td style={{...LS.td,textAlign:"right",color:"#cc0000",fontWeight:row.payments?600:400}}>{row.payments?`AED ${fmtAED(row.payments)}`:""}</td>
                            <td style={{...LS.td,textAlign:"right",fontWeight:700,color:row.balance<0?"#cc0000":"#1a1a2e"}}>AED {fmtAED(row.balance)}</td>
                          </tr>
                        ))}
                        <tr style={{backgroundColor:"#1a1a2e"}}>
                          <td style={{...LS.td,color:"#fff",fontWeight:700}} colSpan={3}>Totals</td>
                          <td style={{...LS.td,textAlign:"right",color:"#7fffd4",fontWeight:700}}>AED {fmtAED(totalRec)}</td>
                          <td style={{...LS.td,textAlign:"right",color:"#ffb3b3",fontWeight:700}}>AED {fmtAED(totalPay)}</td>
                          <td style={{...LS.td,textAlign:"right",color:"#fff",fontWeight:700}}>AED {fmtAED(company.balance)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        @media print{
          .screen-only{display:none!important;}
          body{font-family:Arial;font-size:10pt;}
        }
      `}</style>
    </div>
  );
}

const LS={
  th:{padding:"9px 12px",textAlign:"left",fontWeight:700,color:"#555",fontSize:12,borderBottom:"2px solid #eee",whiteSpace:"nowrap"},
  td:{padding:"8px 12px",color:"#333",borderBottom:"1px solid #f0f0f0",fontSize:13},
};

const S={
  page:{minHeight:"100vh",backgroundColor:"#f0f4f8",fontFamily:"sans-serif"},
  header:{backgroundColor:"#2d6a4f",color:"#fff",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  headerTitle:{margin:0,fontSize:17,fontWeight:600},
  headerRight:{display:"flex",alignItems:"center",gap:12},
  headerUser:{fontSize:13,opacity:0.85},
  logoutBtn:{padding:"5px 12px",background:"transparent",border:"1px solid rgba(255,255,255,0.45)",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:12},
  navBtn:{padding:"6px 14px",backgroundColor:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",color:"#fff",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:600},
  banner:{padding:"11px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14},
  bannerClose:{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.7},
  balBar:{display:"flex",gap:12,padding:"14px 20px",backgroundColor:"#fff",borderBottom:"1px solid #eee",flexWrap:"wrap"},
  balCard:{flex:"1 1 150px",backgroundColor:"#f0f7f4",borderRadius:10,padding:"12px 16px",minWidth:130},
  balCo:{fontSize:12,fontWeight:600,color:"#2d6a4f",marginBottom:4},
  balAmt:{fontSize:18,fontWeight:800,color:"#1a1a2e",marginBottom:2},
  balLbl:{fontSize:11,color:"#888"},
  dupStrip:{backgroundColor:"#fff3cd",borderBottom:"1px solid #ffc107",padding:"10px 20px",fontSize:13,color:"#856404",fontWeight:500},
  tabBar:{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid #ddd",backgroundColor:"#fff",paddingLeft:20,paddingRight:0},
  tabs:{display:"flex"},
  tabOff:{padding:"12px 18px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#666",borderBottom:"2px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6},
  tabOn:{padding:"12px 18px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#2d6a4f",fontWeight:600,borderBottom:"2px solid #2d6a4f",marginBottom:-2,display:"flex",alignItems:"center",gap:6},
  pendBadge:{backgroundColor:"#cc0000",color:"#fff",borderRadius:10,fontSize:11,fontWeight:700,padding:"1px 7px"},
  dpBtn:{padding:"8px 16px",backgroundColor:"#2d6a4f",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600},
  content:{padding:"20px 16px",maxWidth:900,margin:"0 auto"},
  filterRow:{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"},
  searchInput:{flex:1,minWidth:200,padding:"9px 14px",borderRadius:8,border:"1px solid #ddd",fontSize:14,color:"#333",outline:"none"},
  filterSel:{padding:"9px 12px",borderRadius:8,border:"1px solid #ddd",fontSize:14,color:"#333",outline:"none",backgroundColor:"#fff"},
  clearBtn:{padding:"8px 12px",background:"#eee",border:"none",borderRadius:8,cursor:"pointer",fontSize:13},
  vCard:{backgroundColor:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 5px rgba(0,0,0,0.07)"},
  dupWarn:{backgroundColor:"#fff3cd",border:"1px solid #ffc107",borderRadius:6,padding:"7px 12px",fontSize:12,color:"#856404",fontWeight:500,marginBottom:10},
  vTop:{display:"flex",alignItems:"center",gap:10,marginBottom:7,flexWrap:"wrap"},
  vRef:{fontSize:13,fontWeight:700,color:"#2d6a4f",flex:1},
  vDate:{fontSize:12,color:"#888"},
  badge:{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,flexShrink:0},
  vInfo:{display:"flex",gap:12,fontSize:13,color:"#555",marginBottom:9,flexWrap:"wrap",alignItems:"center"},
  vCo:{fontWeight:600,color:"#333"},
  vAmt:{fontWeight:800,color:"#cc0000",fontSize:14,marginLeft:"auto"},
  attBadge:{backgroundColor:"#e8f4fd",color:"#1a6fa8",padding:"2px 8px",borderRadius:12,fontSize:12,fontWeight:600},
  vActions:{display:"flex",gap:8,flexWrap:"wrap",paddingTop:8,borderTop:"1px solid #f0f0f0",alignItems:"center"},
  actBtn:{padding:"6px 13px",backgroundColor:"#f5f5f5",border:"1px solid #e0e0e0",borderRadius:6,cursor:"pointer",fontSize:12,color:"#444"},
  approveBtn:{padding:"6px 18px",backgroundColor:"#2d6a4f",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600},
  rejectBtn:{padding:"6px 16px",backgroundColor:"#fde8e8",color:"#cc0000",border:"1px solid #ffcccc",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600},
  rejectReason:{fontSize:12,color:"#856404",fontStyle:"italic",flex:1},
  secTitle:{fontSize:16,fontWeight:700,color:"#1a1a2e",margin:0},
  dpCard:{backgroundColor:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 5px rgba(0,0,0,0.07)",borderLeft:"4px solid #2d6a4f"},
  empty:{color:"#999",fontSize:14,fontStyle:"italic",textAlign:"center",marginTop:40},
};
