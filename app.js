/* BTX Clinic Offline - single-file app.js
   - Local-only storage (localStorage)
   - Backup/export import
   - Simple PIN gate
*/
(function(){
  const KEY = "btx_offline_v1";
  const PIN_KEY = "btx_pin_v1";
  const PROFILE_KEY = "btx_profile_v1";

  const $ = (id)=>document.getElementById(id);

  // ---------- Data ----------
  const nowISO = ()=> new Date().toISOString();
  const today = ()=> new Date().toISOString().slice(0,10);

  const emptyState = ()=>({
    meta:{ createdAt: nowISO(), updatedAt: nowISO(), version:"0.1" },
    patients: [], // {id, name, phone, birth, doc, notes, createdAt, updatedAt}
    appts: [],    // {id, date, time, patientId, reason, status, createdAt, updatedAt}
    notes: []     // {id, title, body, createdAt, updatedAt}
  });

  function loadState(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return emptyState();
      const st = JSON.parse(raw);
      // basic guard
      if(!st || typeof st !== "object") return emptyState();
      st.patients ??= [];
      st.appts ??= [];
      st.notes ??= [];
      st.meta ??= { createdAt: nowISO(), updatedAt: nowISO(), version:"0.1" };
      return st;
    }catch(e){
      console.warn("loadState error", e);
      return emptyState();
    }
  }

  function saveState(){
    state.meta.updatedAt = nowISO();
    localStorage.setItem(KEY, JSON.stringify(state));
    refreshBadges();
  }

  const uid = ()=> Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  let state = loadState();

  // ---------- PIN ----------
  function getPin(){
    return localStorage.getItem(PIN_KEY) || "1212";
  }
  function setPin(pin){
    localStorage.setItem(PIN_KEY, pin);
  }

  // ---------- UI: install ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    const b = $("btnInstall");
    if(b) b.hidden = false;
  });

  $("btnInstall")?.addEventListener("click", async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("btnInstall").hidden = true;
  });

  // ---------- Service Worker ----------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("sw.js").catch(console.warn);
    });
  }

  // ---------- Navigation / Views ----------
  const landing = $("landing");
  const priv = $("private");
  const btnLock = $("btnLock");

  const navButtons = Array.from(document.querySelectorAll(".navItem"));
  const views = {
    dashboard: $("view-dashboard"),
    patients: $("view-patients"),
    agenda: $("view-agenda"),
    notes: $("view-notes"),
    backup: $("view-backup"),
    settings: $("view-settings"),
  };

  function showView(name){
    navButtons.forEach(b=>b.classList.toggle("active", b.dataset.view===name));
    Object.entries(views).forEach(([k,v])=> v.hidden = (k!==name));
    if(name==="dashboard") renderDashboard();
    if(name==="patients") renderPatients();
    if(name==="agenda") renderAgenda();
    if(name==="notes") renderNotes();
    if(name==="settings") loadProfileUI();
  }

  navButtons.forEach(b=> b.addEventListener("click", ()=> showView(b.dataset.view)));

  // ---------- Login / Lock ----------
  function enterApp(){
    landing.hidden = true;
    priv.hidden = false;
    btnLock.hidden = false;
    showView("dashboard");
  }

  function lockApp(){
    landing.hidden = false;
    priv.hidden = true;
    btnLock.hidden = true;
    $("pinInput").value = "";
    $("loginMsg").textContent = "";
  }

  $("btnLogin")?.addEventListener("click", ()=>{
    const pin = $("pinInput").value.trim();
    if(pin === getPin()){
      $("loginMsg").textContent = "";
      enterApp();
    }else{
      $("loginMsg").textContent = "PIN incorreto.";
    }
  });

  btnLock?.addEventListener("click", lockApp);

  // Enter by pressing Enter
  $("pinInput")?.addEventListener("keydown", (e)=>{
    if(e.key==="Enter") $("btnLogin").click();
  });

  // ---------- Dashboard ----------
  function refreshBadges(){
    $("statPatients").textContent = String(state.patients.length);
    const d = $("agendaDate")?.value || today();
    const t = today();
    $("statToday").textContent = String(state.appts.filter(a=>a.date===t).length);
    $("statNotes").textContent = String(state.notes.length);
  }

  function renderDashboard(){
    refreshBadges();
    const t = today();
    const todayAppts = state.appts
      .filter(a=>a.date===t)
      .sort((a,b)=> (a.time||"").localeCompare(b.time||""))
      .slice(0,6);

    $("todayList").innerHTML = todayAppts.length
      ? todayAppts.map(a=>{
          const p = state.patients.find(x=>x.id===a.patientId);
          return `<div class="miniItem"><b>${escapeHtml(a.time||"--:--")}</b> • ${escapeHtml(p?.name || "Paciente")} <div class="small muted">${escapeHtml(a.reason||"")}</div></div>`;
        }).join("")
      : `<div class="miniItem muted">Nada marcado pra hoje.</div>`;

    const recent = [...state.patients]
      .sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""))
      .slice(0,6);

    $("recentPatients").innerHTML = recent.length
      ? recent.map(p=> `<div class="miniItem"><b>${escapeHtml(p.name||"")}</b><div class="small muted">${escapeHtml(p.phone||"")}</div></div>`).join("")
      : `<div class="miniItem muted">Nenhum paciente cadastrado ainda.</div>`;
  }

  $("goAgenda")?.addEventListener("click", ()=> showView("agenda"));
  $("goPatients")?.addEventListener("click", ()=> showView("patients"));

  // ---------- Patients ----------
  let editingPatientId = null;

  function renderPatients(){
    const q = ($("patientSearch").value||"").trim().toLowerCase();
    const list = state.patients
      .filter(p=> !q || (p.name||"").toLowerCase().includes(q) || (p.phone||"").toLowerCase().includes(q))
      .sort((a,b)=> (a.name||"").localeCompare(b.name||""));

    $("patientsList").innerHTML = list.length
      ? list.map(p=> row([
          `<div class="cell"><b>${escapeHtml(p.name||"")}</b><div class="small m">${escapeHtml(p.phone||"")}</div></div>`,
          `<div class="cell m">${escapeHtml(p.doc||"")}</div>`,
          `<div class="cell m">${escapeHtml(p.birth||"")}</div>`,
          `<div class="cell actions">
              <button class="btn" data-edit-p="${p.id}">Editar</button>
            </div>`
        ])).join("")
      : `<div class="miniItem muted">Sem pacientes. Clique em “Novo”.</div>`;

    document.querySelectorAll("[data-edit-p]").forEach(btn=>{
      btn.addEventListener("click", ()=> openPatientForm(btn.getAttribute("data-edit-p")));
    });

    refreshBadges();
    fillPatientSelect();
  }

  $("patientSearch")?.addEventListener("input", renderPatients);

  function openPatientForm(id=null){
    editingPatientId = id;
    $("patientForm").hidden = false;
    $("patientMsg").textContent = "";
    const isEdit = !!id;
    $("patientFormTitle").textContent = isEdit ? "Editar paciente" : "Novo paciente";
    $("btnDeletePatient").hidden = !isEdit;

    const p = isEdit ? state.patients.find(x=>x.id===id) : null;
    $("p_name").value = p?.name || "";
    $("p_phone").value = p?.phone || "";
    $("p_birth").value = p?.birth || "";
    $("p_doc").value = p?.doc || "";
    $("p_notes").value = p?.notes || "";
  }

  function closePatientForm(){
    $("patientForm").hidden = true;
    editingPatientId = null;
  }

  $("btnNewPatient")?.addEventListener("click", ()=> openPatientForm(null));
  $("btnClosePatientForm")?.addEventListener("click", closePatientForm);

  $("btnSavePatient")?.addEventListener("click", ()=>{
    const name = $("p_name").value.trim();
    if(!name){
      $("patientMsg").textContent = "Nome é obrigatório.";
      return;
    }
    const payload = {
      name,
      phone: $("p_phone").value.trim(),
      birth: $("p_birth").value,
      doc: $("p_doc").value.trim(),
      notes: $("p_notes").value.trim(),
    };
    if(editingPatientId){
      const idx = state.patients.findIndex(x=>x.id===editingPatientId);
      if(idx>=0){
        state.patients[idx] = { ...state.patients[idx], ...payload, updatedAt: nowISO() };
      }
    }else{
      state.patients.push({ id: uid(), ...payload, createdAt: nowISO(), updatedAt: nowISO() });
    }
    saveState();
    renderPatients();
    closePatientForm();
  });

  $("btnDeletePatient")?.addEventListener("click", ()=>{
    if(!editingPatientId) return;
    // delete patient + detach from appointments
    state.patients = state.patients.filter(p=>p.id!==editingPatientId);
    state.appts = state.appts.filter(a=>a.patientId!==editingPatientId);
    saveState();
    renderPatients();
    closePatientForm();
  });

  // ---------- Agenda ----------
  let editingApptId = null;

  function fillPatientSelect(){
    const sel = $("a_patient");
    if(!sel) return;
    const options = state.patients
      .slice()
      .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
      .map(p=> `<option value="${p.id}">${escapeHtml(p.name||"")}</option>`)
      .join("");
    sel.innerHTML = options || `<option value="">(cadastre um paciente)</option>`;
  }

  function renderAgenda(){
    $("agendaDate").value ||= today();
    const d = $("agendaDate").value;
    const list = state.appts
      .filter(a=>a.date===d)
      .sort((a,b)=> (a.time||"").localeCompare(b.time||""));

    $("agendaList").innerHTML = list.length
      ? list.map(a=>{
          const p = state.patients.find(x=>x.id===a.patientId);
          return row([
            `<div class="cell"><b>${escapeHtml(a.time||"--:--")}</b> • ${escapeHtml(p?.name||"Paciente")}<div class="small m">${escapeHtml(a.reason||"")}</div></div>`,
            `<div class="cell m">${escapeHtml(a.status||"")}</div>`,
            `<div class="cell m">${escapeHtml(a.date||"")}</div>`,
            `<div class="cell actions">
              <button class="btn" data-edit-a="${a.id}">Editar</button>
            </div>`
          ]);
        }).join("")
      : `<div class="miniItem muted">Sem horários pra este dia. Clique em “Novo”.</div>`;

    document.querySelectorAll("[data-edit-a]").forEach(btn=>{
      btn.addEventListener("click", ()=> openApptForm(btn.getAttribute("data-edit-a")));
    });

    fillPatientSelect();
    refreshBadges();
  }

  $("agendaDate")?.addEventListener("change", renderAgenda);

  function openApptForm(id=null){
    editingApptId = id;
    $("apptForm").hidden = false;
    $("apptMsg").textContent = "";
    const isEdit = !!id;
    $("apptFormTitle").textContent = isEdit ? "Editar agendamento" : "Novo agendamento";
    $("btnDeleteAppt").hidden = !isEdit;

    fillPatientSelect();

    const a = isEdit ? state.appts.find(x=>x.id===id) : null;
    $("a_time").value = a?.time || "08:00";
    $("a_patient").value = a?.patientId || (state.patients[0]?.id || "");
    $("a_reason").value = a?.reason || "";
    $("a_status").value = a?.status || "Confirmado";
  }

  function closeApptForm(){
    $("apptForm").hidden = true;
    editingApptId = null;
  }

  $("btnNewAppt")?.addEventListener("click", ()=> openApptForm(null));
  $("btnCloseApptForm")?.addEventListener("click", closeApptForm);

  $("btnSaveAppt")?.addEventListener("click", ()=>{
    const date = $("agendaDate").value || today();
    const patientId = $("a_patient").value;
    if(!patientId){
      $("apptMsg").textContent = "Cadastre um paciente antes.";
      return;
    }
    const payload = {
      date,
      time: $("a_time").value,
      patientId,
      reason: $("a_reason").value.trim(),
      status: $("a_status").value,
    };
    if(editingApptId){
      const idx = state.appts.findIndex(x=>x.id===editingApptId);
      if(idx>=0) state.appts[idx] = { ...state.appts[idx], ...payload, updatedAt: nowISO() };
    }else{
      state.appts.push({ id: uid(), ...payload, createdAt: nowISO(), updatedAt: nowISO() });
    }
    saveState();
    renderAgenda();
    closeApptForm();
  });

  $("btnDeleteAppt")?.addEventListener("click", ()=>{
    if(!editingApptId) return;
    state.appts = state.appts.filter(a=>a.id!==editingApptId);
    saveState();
    renderAgenda();
    closeApptForm();
  });

  // ---------- Notes ----------
  let editingNoteId = null;

  function renderNotes(){
    const list = [...state.notes].sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""));
    $("notesList").innerHTML = list.length
      ? list.map(n=> row([
          `<div class="cell"><b>${escapeHtml(n.title||"Sem título")}</b><div class="small m">${escapeHtml((n.body||"").slice(0,60))}${(n.body||"").length>60?"…":""}</div></div>`,
          `<div class="cell m">${escapeHtml((n.updatedAt||"").slice(0,10))}</div>`,
          `<div class="cell m">—</div>`,
          `<div class="cell actions"><button class="btn" data-edit-n="${n.id}">Editar</button></div>`
        ])).join("")
      : `<div class="miniItem muted">Sem notas. Clique em “Nova”.</div>`;

    document.querySelectorAll("[data-edit-n]").forEach(btn=>{
      btn.addEventListener("click", ()=> openNoteForm(btn.getAttribute("data-edit-n")));
    });

    refreshBadges();
  }

  function openNoteForm(id=null){
    editingNoteId = id;
    $("noteForm").hidden = false;
    $("noteMsg").textContent = "";
    const isEdit = !!id;
    $("noteFormTitle").textContent = isEdit ? "Editar nota" : "Nova nota";
    $("btnDeleteNote").hidden = !isEdit;

    const n = isEdit ? state.notes.find(x=>x.id===id) : null;
    $("n_title").value = n?.title || "";
    $("n_body").value = n?.body || "";
  }

  function closeNoteForm(){
    $("noteForm").hidden = true;
    editingNoteId = null;
  }

  $("btnNewNote")?.addEventListener("click", ()=> openNoteForm(null));
  $("btnCloseNoteForm")?.addEventListener("click", closeNoteForm);

  $("btnSaveNote")?.addEventListener("click", ()=>{
    const title = $("n_title").value.trim() || "Sem título";
    const body = $("n_body").value.trim();
    const payload = { title, body };
    if(editingNoteId){
      const idx = state.notes.findIndex(x=>x.id===editingNoteId);
      if(idx>=0) state.notes[idx] = { ...state.notes[idx], ...payload, updatedAt: nowISO() };
    }else{
      state.notes.push({ id: uid(), ...payload, createdAt: nowISO(), updatedAt: nowISO() });
    }
    saveState();
    renderNotes();
    closeNoteForm();
  });

  $("btnDeleteNote")?.addEventListener("click", ()=>{
    if(!editingNoteId) return;
    state.notes = state.notes.filter(n=>n.id!==editingNoteId);
    saveState();
    renderNotes();
    closeNoteForm();
  });

  // ---------- Backup ----------
  $("btnExport")?.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    a.href = URL.createObjectURL(blob);
    a.download = `BTX-Backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    $("backupMsg").textContent = "Backup exportado.";
  });

  $("importFile")?.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      // minimal validation
      if(!obj || typeof obj !== "object" || !Array.isArray(obj.patients) || !Array.isArray(obj.appts) || !Array.isArray(obj.notes)){
        throw new Error("Arquivo inválido.");
      }
      state = obj;
      saveState();
      renderDashboard();
      $("backupMsg").textContent = "Backup importado com sucesso.";
      // reset input
      e.target.value = "";
    }catch(err){
      $("backupMsg").textContent = "Falha ao importar: " + (err?.message || "erro");
    }
  });

  $("btnWipe")?.addEventListener("click", ()=>{
    if(!confirm("Apagar TODOS os dados locais? Isso não tem volta.")) return;
    localStorage.removeItem(KEY);
    state = emptyState();
    saveState();
    renderDashboard();
    $("backupMsg").textContent = "Dados apagados.";
  });

  // ---------- Settings / Profile ----------
  function loadProfile(){
    try{
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : { name:"", reg:"", phone:"", email:"", addr:"" };
    }catch{ return { name:"", reg:"", phone:"", email:"", addr:"" }; }
  }
  function saveProfile(p){
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }

  function loadProfileUI(){
    const p = loadProfile();
    $("s_prof_name").value = p.name || "";
    $("s_prof_reg").value = p.reg || "";
    $("s_prof_phone").value = p.phone || "";
    $("s_prof_email").value = p.email || "";
    $("s_prof_addr").value = p.addr || "";
  }

  $("btnSaveProfile")?.addEventListener("click", ()=>{
    const p = {
      name: $("s_prof_name").value.trim(),
      reg: $("s_prof_reg").value.trim(),
      phone: $("s_prof_phone").value.trim(),
      email: $("s_prof_email").value.trim(),
      addr: $("s_prof_addr").value.trim(),
    };
    saveProfile(p);
    $("profileMsg").textContent = "Perfil salvo.";
    setTimeout(()=> $("profileMsg").textContent="", 1500);
  });

  $("btnChangePin")?.addEventListener("click", ()=>{
    const oldPin = $("s_pin_old").value.trim();
    const newPin = $("s_pin_new").value.trim();
    if(oldPin !== getPin()){
      $("settingsMsg").textContent = "PIN atual incorreto.";
      return;
    }
    if(newPin.length < 4){
      $("settingsMsg").textContent = "Use um PIN com pelo menos 4 dígitos.";
      return;
    }
    setPin(newPin);
    $("s_pin_old").value = "";
    $("s_pin_new").value = "";
    $("settingsMsg").textContent = "PIN atualizado.";
    setTimeout(()=> $("settingsMsg").textContent="", 1500);
  });

  // ---------- Helpers ----------
  function row(cells){
    return `<div class="tr">${cells.join("")}</div>`;
  }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m=>({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
    }[m]));
  }

  // ---------- Init ----------
  // default agenda date
  const ad = $("agendaDate");
  if(ad) ad.value = today();

  // pre-render landing stats not needed
  // if user already "logged" we keep locked for simplicity.

})();
