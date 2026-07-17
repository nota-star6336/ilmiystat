// API base: /api при размещении в корне; /путь/api при подпапке
const API = (() => {
  const base = window.ILMIYSTAT_API_BASE;
  if(base) return base.replace(/\/$/, '');
  const p = window.location.pathname;
  const b = p.includes('/') ? p.replace(/\/[^/]*$/, '') : '';
  return (b || '') + '/api';
})();
const departmentIdFromUrl = new URLSearchParams(location.search).get('departmentId');
let departmentId = departmentIdFromUrl; // Для министерства перезаписывается при выборе в шапке
let currentUser = null;
let teachers = [], plans = [], works = [];
let worksFocusActive = false;
let worksFocusTeacherId = null;
let worksFocusHighlightIds = new Set();
let worksFocusHighlightTitles = new Set();
let allPlans = []; // Все планы без фильтров (для модального окна работ)
let editingPlanId = null, editingWorkId = null;
let wmPdfPendingArray = []; // [{file:File, displayName:string}]
let teacherProfileLinksArray = []; // [{platform:string, name?:string, url:string}] — для модального окна педагога
let grantParticipantOtherNamesArray = []; // [string] — Ф.И.О. участников гранта (прочие, не из списка педагогов)
let editingTeacherId = null;
// Текущий язык интерфейса: 'ru' или 'uz'
let currentLang = (()=>{ try{ const v=localStorage.getItem('cabinetLang'); return v==='uz'?'uz':'ru'; }catch(_e){ return 'ru'; }})();
let statsAssistantBusy = false;
let statsAssistantMessages = [];
let statsAssistantCollapsed = false;
const DEMO_TEACHER_LIMIT = 4;
// Данные кафедры (загружаются при инициализации)
let departmentData = null; // {name, nameUz}

// Коды показателей (переводы — в cabinet-i18n.js)
const INDICATORS = ['ARTICLE_TYPE','TEXTBOOK','TUTORIAL','METHOD_GUIDELINES','METHODICAL_MANUAL','UMK','E_TEXTBOOK','MONOGRAPH','PATENTS','CITATIONS','TOP1000_TRAINING','GRANT_PROJECTS','DSC_PROFESSOR_UNVON','PHD_DOTSENT_UNVON','XORIJIY_TIL_MASHGULOT','XORIJIY_TIL_SERTIFIKAT'];
// Коды типов статьи (переводы — в cabinet-i18n.js)
const ARTICLE_TYPES = ['INTL_ARTICLE','VAK','INTL_CONF','REP_CONF','WOS_SCOPUS'];
const COUNCIL_INDICATORS = new Set(['TEXTBOOK','TUTORIAL','METHOD_GUIDELINES','METHODICAL_MANUAL','UMK','E_TEXTBOOK','MONOGRAPH']);
// Столбцы таблицы научных работ по показателям (при выборе фильтра показываются только релевантные)
const INDICATOR_WORKS_COLUMNS = {
  ARTICLE_TYPE: ['id','source','indicator','artType','title','publisher','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  TEXTBOOK: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  TUTORIAL: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  METHOD_GUIDELINES: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  METHODICAL_MANUAL: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  UMK: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  E_TEXTBOOK: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  MONOGRAPH: ['id','source','indicator','title','publisher','council','certNo','certDate','siteUrl','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  PATENTS: ['id','source','indicator','patentNo','patentDate','patentIssued','title','fileUrl','month','year','planned','pdf','status','actions'],
  CITATIONS: ['id','source','indicator','citations','hIndex','profile','title','siteUrl','fileUrl','month','year','planned','pdf','status','actions'],
  TOP1000_TRAINING: ['id','source','indicator','receivingOrg','publisher','fileUrl','month','year','coAuthorsCount','coAuthorNames','planned','pdf','status','actions'],
  GRANT_PROJECTS: ['id','source','indicator','grantName','grantDuration','grantPartner','grantParticipantsDept','grantParticipantsOther','grantAmount','month','year','planned','status','actions'],
  DSC_PROFESSOR_UNVON: ['id','source','indicator','ilmiyDaraja','ilmiyUnvon','educationDirection','specialtyCode','diplomRaqami','degreeDate','title','publisher','fileUrl','month','year','planned','pdf','status','actions'],
  PHD_DOTSENT_UNVON: ['id','source','indicator','ilmiyDaraja','ilmiyUnvon','educationDirection','specialtyCode','diplomRaqami','degreeDate','title','publisher','fileUrl','month','year','planned','pdf','status','actions'],
  XORIJIY_TIL_MASHGULOT: ['id','source','indicator','fanNomi','fanYonalish','mashgulotTuri','xorijiyTil','mashgulotSoati','month','year','planned','fileUrl','pdf','status','actions'],
  XORIJIY_TIL_SERTIFIKAT: ['id','source','indicator','certForeignLang','certDarajasi','certUmumiyBali','council','certNo','certDate','title','fileUrl','month','year','planned','pdf','status','actions']
};
const ACADEMIC_MONTH_ORDER = [8,9,10,11,12,1,2,3,4,5,6,7];
const PROFILE_PLATFORMS = [{code:'GOOGLE_SCHOLAR',key:'profilePlatformGoogleScholar'},{code:'SCOPUS',key:'profilePlatformScopus'},{code:'RESEARCH_GATE',key:'profilePlatformResearchGate'},{code:'WEB_OF_SCIENCE',key:'profilePlatformWebOfScience'},{code:'RINC',key:'profilePlatformRinc'},{code:'LINKEDIN',key:'profilePlatformLinkedin'},{code:'ORCID',key:'profilePlatformOrcid'},{code:'OTHER',key:'profilePlatformOther'}];

const $ = id => document.getElementById(id);
const esc = s => String(s != null ? s : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ===== i18n helpers (CAB_I18N from cabinet-i18n.js) =====
const getDeep=(obj, path)=>String(path||'').split('.').reduce((o,k)=> (o && Object.prototype.hasOwnProperty.call(o,k)) ? o[k] : undefined, obj);
const dict=(lang)=> (window.CAB_I18N && CAB_I18N[lang]) ? CAB_I18N[lang] : ((CAB_I18N && CAB_I18N.ru)||{});
function t(path){
  const v=getDeep(dict(currentLang),path);
  if(v!==undefined) return v;
  const fb=getDeep(dict('ru'),path);
  return (fb!==undefined) ? fb : path;
}
function colLabel(colKey){
  return t(`cols.${colKey}`);
}
function colHint(colKey){
  return t(`colHints.${colKey}`)||'';
}

function monthText(m){
  const d=dict(currentLang), dr=dict('ru');
  const arr=(d && d.meta && d.meta.months) || (dr && dr.meta && dr.meta.months) || [];
  return arr[Number(m)||0] || '';
}
function formatApprovalDate(d){
  if(!d)return '';
  try{ const dt=new Date(d); if(isNaN(dt.getTime()))return ''; return dt.toLocaleDateString(currentLang==='uz'?'uz-UZ':'ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){return '';}
}
function getLastApprovalChangeDate(p){
  const dates=[p.approvedAt,p.approvedConfirmedAt,p.unapprovalRequestedAt,p.unapprovalConfirmedAt,p.updatedAt].filter(Boolean);
  if(!dates.length)return null;
  return dates.reduce((a,b)=>new Date(a)>new Date(b)?a:b);
}
function isPlanFieldChangedByInstitute(p, field){
  const dp=p.departmentProposal;
  if(!dp||typeof dp!=='object')return false;
  const cur=p[field];
  const orig=dp[field];
  if(cur===orig)return false;
  if(cur==null&&orig==null)return false;
  if(String(cur)===''&&String(orig)==='')return false;
  if(Number(cur)===Number(orig)&&!isNaN(Number(cur)))return false;
  return true;
}
function formatPlanDeptValue(p, field){
  const dp=p.departmentProposal;
  if(!dp||typeof dp!=='object')return '—';
  const v=dp[field];
  if(field==='teacherId'){
    const t=teachers.find(x=>x.id===v);
    return t?esc(t.fullName):(v||'—');
  }
  if(field==='indicator')return esc(indName(v||''));
  if(field==='articleType')return esc(artName(v||'')||'—');
  if(field==='plannedMonth'){
    const yr=dp['plannedYear'];
    return v?esc(monthShort(v)+(yr?` ${yr}`:'')):'—';
  }
  if(field==='plannedYear')return v?esc(String(v)):'—';
  return esc(String(v!=null?v:'—'));
}
function planCell(content, p, field){
  const changed=field?isPlanFieldChangedByInstitute(p,field):false;
  const deptLbl=esc(String(t('ui.plan.deptValueLabel')||'Кафедра'));
  const instLbl=esc(String(t('ui.plan.instValueLabel')||'Научный отдел'));
  let inner=content;
  if(changed&&field){
    const deptVal=formatPlanDeptValue(p,field);
    inner=`<div class="plan-dept-value">${deptLbl}: ${deptVal}</div><div class="plan-inst-value">${instLbl}: ${content}</div>`;
  }
  const cls=changed?' class="plan-cell-changed-by-institute"':'';
  const title=changed?` title="${esc(String(t('ui.plan.changedByInstituteHint')))}"`:'';
  return `<td${cls}${title}>${inner}</td>`;
}
function planMonthCell(p){
  const content=p.plannedMonth?esc(monthShort(p.plannedMonth))+(p.plannedYear?` ${esc(String(p.plannedYear))}`:''):'—';
  const changed=isPlanFieldChangedByInstitute(p,'plannedMonth')||isPlanFieldChangedByInstitute(p,'plannedYear');
  const deptLbl=esc(String(t('ui.plan.deptValueLabel')||'Кафедра'));
  const instLbl=esc(String(t('ui.plan.instValueLabel')||'Научный отдел'));
  let inner=content;
  if(changed){
    const deptVal=formatPlanDeptValue(p,'plannedMonth');
    inner=`<div class="plan-dept-value">${deptLbl}: ${deptVal}</div><div class="plan-inst-value">${instLbl}: ${content}</div>`;
  }
  const cls=changed?' class="plan-cell-changed-by-institute"':'';
  const title=changed?` title="${esc(String(t('ui.plan.changedByInstituteHint')))}"`:'';
  return `<td${cls}${title}>${inner}</td>`;
}
function monthShort(m){
  const d=dict(currentLang), dr=dict('ru');
  const arr=(d && d.meta && d.meta.monthsShort) || (dr && dr.meta && dr.meta.monthsShort) || [];
  return arr[Number(m)||0] || '';
}

function indName(code){
  const d=dict(currentLang), dr=dict('ru');
  return (d && d.meta && d.meta.indicators && d.meta.indicators[code]) || (dr && dr.meta && dr.meta.indicators && dr.meta.indicators[code]) || code;
}

// Типы статьи: строим карты из meta.articleTypeDefs
const ARTICLE_TYPE_DEFS = (function(){ var r=dict('ru'); return (r && r.meta && r.meta.articleTypeDefs) || []; })();
const ARTICLE_TYPE_BY_CODE = Object.fromEntries(ARTICLE_TYPE_DEFS.map(x=>[x.code,x]));
const ARTICLE_TYPE_CODE_BY_RU = Object.fromEntries(ARTICLE_TYPE_DEFS.map(x=>[x.ru,x.code]));
const ARTICLE_TYPE_CODE_BY_UZ = Object.fromEntries(ARTICLE_TYPE_DEFS.map(x=>[x.uz,x.code]));
function artName(code){
  if(!code) return '-';
  const def = ARTICLE_TYPE_BY_CODE[String(code)] || null;
  if(!def) return String(code);
  return (currentLang==='uz') ? def.uz : def.ru;
}
const ILMIY_DARAJA_NAMES={CANDIDATE:{ru:'кандидат наук',uz:'Fan nomzodi'},PHD:{ru:'PhD',uz:'PhD'},DSC:{ru:'DSc',uz:'DSc'}};
const ILMIY_UNVON_NAMES={DOTSENT:{ru:'доцент',uz:'Dotsent'},PROFESSOR:{ru:'профессор',uz:'Professor'}};
function ilmiyDarajaName(code){if(!code)return '—';const L=ILMIY_DARAJA_NAMES[code];return L?(currentLang==='uz'?L.uz:L.ru):code;}
function ilmiyUnvonName(code){if(!code)return '—';const L=ILMIY_UNVON_NAMES[code];return L?(currentLang==='uz'?L.uz:L.ru):code;}
const MASHGULOT_TURI_NAMES={LECTURE:{ru:'Лекция',uz:"Ma'ruza"},SEMINAR:{ru:'Семинар',uz:'Seminar'},PRACTICAL:{ru:'Практическое',uz:'Amaliy'},LABORATORY:{ru:'Лабораторная',uz:'Laboratoriya'},INDIVIDUAL:{ru:'Индивидуальный урок',uz:'Individuaal dars'},OTHER:{ru:'Другое',uz:"Boshqa"}};
const XORIJIY_TIL_NAMES={RUSSIAN:{ru:'Русский',uz:'Rus tili'},ENGLISH:{ru:'Английский',uz:'Ingliz tili'},FARSI:{ru:'Фарси',uz:'Fors tili'},TURKISH:{ru:'Турецкий',uz:'Turk tili'},ARABIC:{ru:'Арабский',uz:'Arab tili'},CHINESE:{ru:'Китайский',uz:'Xitoy tili'}};
function mashgulotTuriName(code){if(!code)return '—';const L=MASHGULOT_TURI_NAMES[code];return L?(currentLang==='uz'?L.uz:L.ru):code;}
function xorijiyTilName(code){if(!code)return '—';const L=XORIJIY_TIL_NAMES[code];return L?(currentLang==='uz'?L.uz:L.ru):code;}

// Нормализация типа статьи. SCOPUS/WOS -> WOS_SCOPUS для обратной совместимости
function normalizeArticleType(v){
  if(!v) return '';
  const s=String(v).trim();
  if(ARTICLE_TYPE_BY_CODE[s]) return s;
  if(ARTICLE_TYPE_CODE_BY_RU[s]) return ARTICLE_TYPE_CODE_BY_RU[s];
  if(ARTICLE_TYPE_CODE_BY_UZ[s]) return ARTICLE_TYPE_CODE_BY_UZ[s];
  if(s==='SCOPUS'||s==='WOS') return 'WOS_SCOPUS';
  return s;
}

function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),2200); }
function notifyUser(msg){
  const text=String(msg||'');
  toast(text);
  try{ alert(text); }catch(_e){}
}
function showSimilarWorksToast(similarWorks){
  if(!similarWorks||!Array.isArray(similarWorks)||similarWorks.length===0)return;
  const el=$('similarWorksToast'); const list=$('similarWorksList'); const title=$('similarWorksTitle');
  if(!el||!list)return;
  const msg=String(t('ui.similarWorks.title')||(currentLang==='uz'?'Shu nomli yoki o‘xshash ish allaqachon qo‘shilgan bo‘lishi mumkin:':'Возможно, похожая работа уже добавлена:'));
  if(title)title.textContent=msg;
  list.innerHTML=similarWorks.map((sw,idx)=>{
    const authorRaw=sw.author?String(sw.author):'';
    const author=authorRaw?esc(authorRaw):'—';
    const ind=indName(sw.indicator);
    const ay=sw.academicYear?esc(sw.academicYear):'—';
    return `<li><a href="#" data-work-id="${sw.id}" data-author="${esc(authorRaw)}" data-similar-idx="${idx}">${esc(sw.title||'—')}</a><div class="similar-works-meta">${author} · ${esc(ind)} · ${ay}</div></li>`;
  }).join('');
  list.querySelectorAll('a').forEach(a=>{
    a.onclick=async e=>{
      e.preventDefault();
      closeSimilarWorksToast();
      const idx=Number(a.getAttribute('data-similar-idx')||-1);
      const clicked=(idx>=0&&idx<similarWorks.length)?similarWorks[idx]:{
        id:+a.getAttribute('data-work-id'),
        author:a.getAttribute('data-author')||'',
        title:a.textContent||''
      };
      await openWorksFromSimilarNotification(clicked, similarWorks);
    };
  });
  el.classList.remove('hidden'); el.classList.add('show');
  clearTimeout(showSimilarWorksToast._t);
  showSimilarWorksToast._t=setTimeout(closeSimilarWorksToast,12000);
}
function closeSimilarWorksToast(){ const el=$('similarWorksToast'); if(el){ el.classList.add('hidden'); el.classList.remove('show'); } clearTimeout(showSimilarWorksToast._t); }
function normalizeWorkTitleForDuplicate(v){
  if(v==null) return '';
  return String(v).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}
function getWorkComparableTitle(indicator,title,grantName){
  if(String(indicator||'')==='GRANT_PROJECTS') return normalizeWorkTitleForDuplicate(grantName||title||'');
  return normalizeWorkTitleForDuplicate(title||'');
}
function normalizeWorkArticleTypeForDuplicate(v){
  return normalizeArticleType(v||'');
}
function resetWorksFocus(){
  worksFocusActive=false;
  worksFocusTeacherId=null;
  worksFocusHighlightIds=new Set();
  worksFocusHighlightTitles=new Set();
}
function setWorksFocusFromSimilar(clickedWork, similarWorks){
  const list=Array.isArray(similarWorks)?similarWorks:[];
  const clickedWorkId=clickedWork&&clickedWork.id!=null?clickedWork.id:null;
  const clickedAuthor=clickedWork&&clickedWork.author?String(clickedWork.author):'';
  let teacherId=null;
  const clicked=works.find(x=>String(x.id)===String(clickedWorkId||''));
  if(clicked&&clicked.teacherId!=null)teacherId=Number(clicked.teacherId)||null;
  if(!teacherId&&clickedAuthor){
    const teacher=teachers.find(t=>String(t.fullName||'').trim()===String(clickedAuthor).trim());
    if(teacher)teacherId=Number(teacher.id)||null;
  }
  worksFocusTeacherId=teacherId;
  worksFocusHighlightIds=new Set(list.map(sw=>String(sw.id)));
  worksFocusHighlightTitles=new Set(
    list.map(sw=>getWorkComparableTitle(sw.indicator,sw.title,sw.grantName)).filter(Boolean)
  );
  worksFocusActive=true;
}
async function openWorksFromSimilarNotification(clickedWork, similarWorks){
  setWorksFocusFromSimilar(clickedWork, similarWorks);
  const tabWorks=$('tab-works');
  if(tabWorks)tabWorks.click();
  if($('workYearSel')&&clickedWork&&clickedWork.academicYear)$('workYearSel').value=String(clickedWork.academicYear);
  if($('workTeacherSel')&&worksFocusTeacherId)$('workTeacherSel').value=String(worksFocusTeacherId);
  await loadWorks();
  requestAnimationFrame(()=>{
    const first=document.querySelector('#worksTbody tr.similar-work-highlight');
    if(first)first.scrollIntoView({block:'center',behavior:'smooth'});
  });
}
function findLocalDuplicateWorks(indicator,title,grantName,articleType,excludeId){
  const needle=getWorkComparableTitle(indicator,title,grantName);
  if(!needle||needle.length<3||!Array.isArray(works)) return [];
  const needleArticleType = String(indicator||'')==='ARTICLE_TYPE'
    ? normalizeWorkArticleTypeForDuplicate(articleType)
    : '';
  return works
    .filter(w=>{
      if(excludeId&&String(w.id)===String(excludeId)) return false;
      if(String(w.indicator||'')!==String(indicator||'')) return false;
      if(String(indicator||'')==='ARTICLE_TYPE'){
        const hayArticleType = normalizeWorkArticleTypeForDuplicate(w.articleType);
        if(hayArticleType!==needleArticleType) return false;
      }
      const hay=getWorkComparableTitle(w.indicator,w.title,w.grantName);
      return hay!==''&&hay===needle;
    })
    .slice(0,5)
    .map(w=>({ id:w.id, title:(w.title||w.grantName||'—'), indicator:w.indicator, academicYear:w.academicYear||null, author:(w.teacher&&w.teacher.fullName)||null }));
}
async function openWorkByIdFromApi(id){
  let w=works.find(x=>x.id===id||String(x.id)===String(id));
  if(!w){ try{ w=await api(`/departments/${departmentId}/scientific-works/${id}`); }catch(e){ toast('Ошибка: '+(e&&e.message||e)); return; } }
  try{ await openWorkModal(w); }catch(e){ console.error('openWorkModal:',e); toast('Ошибка: '+(e&&e.message||e)); }
}
function getUserRoleLabel(user){
  if(!user)return '';
  if(user.role==='admin')return String(t('ui.roleAdmin')||'Админ');
  const sr=Number(user.scienceRole);
  if(sr===1)return String(t('ui.roleScience1')||'Ответств. по науке');
  if(sr===2)return String(t('ui.roleScience2')||'Научный отдел');
  if(sr===3)return String(t('ui.roleScience3')||'Мониторинг');
  return ''; // обычный пользователь без научной роли — не показываем
}

// ===== PERMISSIONS (на основе currentUser после загрузки auth/me) =====
const DEFAULT_PERMS = { notifications:{view:true,edit:false}, teachers:{view:true,edit:true}, plan:{view:true,edit:true}, works:{view:true,edit:true}, stats:{view:true,edit:true}, backup:{view:true,edit:true} };
function perm(tab){ const p=currentUser && currentUser.permissions; if(!p||(typeof p)!=='object')return DEFAULT_PERMS[tab]||DEFAULT_PERMS.teachers; return p[tab]||DEFAULT_PERMS[tab]; }
function canViewTab(tab){ if(currentUser && currentUser.role==='admin')return true; return perm(tab).view!==false; }
function canEditTab(tab){ if(currentUser && currentUser.role==='admin')return true; const p=perm(tab); return p.view!==false&&p.edit!==false; }

// ===== Stats filter sidebar =====
let sfOpen=false;
let seOpen=false;
function repositionStatsLayout(){
  const dock=$('statsExcelDock');
  const colsChecks=$('statsExportColsChecks');
  const colsCard=colsChecks ? colsChecks.closest('.statsFilterCard') : null;
  if(dock && colsCard && colsCard.parentElement !== dock){
    dock.appendChild(colsCard);
  }
  if(colsCard){
    colsCard.classList.remove('is-collapsed');
    const colsHeader=colsCard.querySelector('.statsFilterCardHeader');
    if(colsHeader)colsHeader.setAttribute('aria-expanded','true');
  }

  const statusCard=$('statsMonth') ? $('statsMonth').closest('.statsFilterCard') : null;
  if(statusCard){
    statusCard.style.display='none';
    statusCard.setAttribute('aria-hidden','true');
  }

  const topRow=$('statsTopRow');
  const summaryBox=$('statsAggBox');
  if(topRow && summaryBox && summaryBox.previousElementSibling !== topRow){
    topRow.insertAdjacentElement('afterend', summaryBox);
  }

  const legacyXls=$('statsExportXlsBtnLegacy');
  const legacyPdf=$('statsExportPdfBtnLegacy');
  if(legacyXls) legacyXls.remove();
  if(legacyPdf) legacyPdf.remove();
  const legacyRow=document.querySelector('#statsAggBox .statsActionRow[hidden]');
  if(legacyRow && !legacyRow.querySelector('button')) legacyRow.remove();
}
function toggleStatsFilterSidebar(forceClose){
  sfOpen=(forceClose===true)?false:!sfOpen;
  const panel=$('statsFilterSidebar');
  const toggle=$('statsFilterSidebarToggle');
  if(panel){
    panel.classList.toggle('closed',!sfOpen);
    panel.style.display=sfOpen?'block':'none';
  }
  if(toggle)toggle.classList.toggle('shifted',sfOpen);
}
function toggleStatsExcelDock(forceClose){
  seOpen=(forceClose===true)?false:!seOpen;
  const dock=$('statsExcelDock');
  const toggle=$('statsExcelDockToggle');
  if(dock){
    dock.classList.toggle('closed',!seOpen);
    dock.style.display=seOpen?'block':'none';
  }
  if(toggle)toggle.classList.toggle('shifted',seOpen);
}
function updateSidebarVisibility(){
  repositionStatsLayout();
  const statsActive=document.querySelector('#panel-stats.active');
  const filterToggle=$('statsFilterSidebarToggle');
  const excelToggle=$('statsExcelDockToggle');
  const filterPanel=$('statsFilterSidebar');
  const excelDock=$('statsExcelDock');
  if(filterToggle)filterToggle.style.display=statsActive?'block':'none';
  if(excelToggle)excelToggle.style.display=statsActive?'block':'none';
  if(filterPanel)filterPanel.style.display=(statsActive&&sfOpen)?'block':'none';
  if(excelDock)excelDock.style.display=(statsActive&&seOpen)?'block':'none';
  if(!statsActive){
    toggleStatsFilterSidebar(true);
    toggleStatsExcelDock(true);
  }
  const notificationsActive=document.querySelector('#panel-notifications.active');
  const ministryRow=$('ministryHeaderFilterRow');
  const mainHeader=$('mainContentHeader');
  if(currentUser && (currentUser.accessLevel||'')==='ministry'){
    if(mainHeader)mainHeader.style.display='block';
    if(ministryRow)ministryRow.style.display=notificationsActive?'none':'grid';
  }else{
    if(mainHeader)mainHeader.style.display='none';
  }
}
function syncStatsSidebarsForViewport(){
  const isNarrow=window.matchMedia('(max-width:960px)').matches;
  if(isNarrow){
    if(sfOpen) toggleStatsFilterSidebar(true);
    if(seOpen) toggleStatsExcelDock(true);
  }
  updateSidebarVisibility();
}
repositionStatsLayout();
function syncSidebarToMain(){
  const mainMonth=Number($('statsMonth')&&$('statsMonth').value||0);
  const currentSidebarMonths=getSidebarMonthCheckboxes().length?getSelectedStatsMonths():null;
  setSidebarSelectedMonths(mainMonth?[mainMonth]:(currentSidebarMonths!==null?currentSidebarMonths:STATS_MONTH_VALUES.slice()));
  $('sfHalf1').checked=$('statsHalf1').checked;
  $('sfHalf2').checked=$('statsHalf2').checked;
  $('sfSourcePlan').checked=$('statsSourcePlan').checked;
  $('sfSourceOut').checked=$('statsSourceOut').checked;
  $('sfStatusDone').checked=$('statsStatusDone').checked;
  $('sfStatusPartial').checked=$('statsStatusPartial').checked;
  $('sfStatusNotDone').checked=$('statsStatusNotDone').checked;
}
function syncMainFromSidebar(){
  const selectedMonths=getSelectedStatsMonths();
  $('statsMonth').value=selectedMonths.length===1?String(selectedMonths[0]):'';
  $('statsHalf1').checked=$('sfHalf1').checked;
  $('statsHalf2').checked=$('sfHalf2').checked;
  $('statsSourcePlan').checked=$('sfSourcePlan').checked;
  $('statsSourceOut').checked=$('sfSourceOut').checked;
  $('statsStatusDone').checked=$('sfStatusDone').checked;
  $('statsStatusPartial').checked=$('sfStatusPartial').checked;
  $('statsStatusNotDone').checked=$('sfStatusNotDone').checked;
  saveUIState(); renderStats();
}
function initSidebarSync(){
  const mainMonth=$('statsMonth');
  renderSidebarMonthChecks();
  new MutationObserver(()=>renderSidebarMonthChecks()).observe(mainMonth,{childList:true});
  if($('sfMonthLabel'))$('sfMonthLabel').addEventListener('dblclick',toggleSidebarMonthChecksAll);
  // main → sidebar (addEventListener so we don't overwrite existing .onchange)
  ['statsMonth','statsHalf1','statsHalf2','statsSourcePlan','statsSourceOut','statsStatusDone','statsStatusPartial','statsStatusNotDone'].forEach(id=>{
    $(id).addEventListener('change',syncSidebarToMain);
  });
  // sidebar → main
  ['sfHalf1','sfHalf2','sfSourcePlan','sfSourceOut','sfStatusDone','sfStatusPartial','sfStatusNotDone'].forEach(id=>{
    $(id).addEventListener('change',syncMainFromSidebar);
  });
}

// ===== UI STATE PERSISTENCE =====
const UI_STATE_KEY='IlmiyStat_ui_state';
const UI_STATE_STATS_FILTERS_VERSION=3;
const UI_SELECT_IDS=['planTeacherSel','planYearSel','planFilterMonth','planFilterIndicator','planFilterArticleType',
  'workTeacherSel','workYearSel','workFilterInd','workFilterSrc','workFilterArticleType',
  'statsPeriod','statsYearSel','statsTeacherSel','statsQuarter','statsMonth'];
const UI_CHECKBOX_IDS=['planFilterDone','planFilterNotDone','planFilterH1','planFilterH2',
  'statsHalf1','statsHalf2',
  'statsSourcePlan','statsSourceOut','statsStatusDone','statsStatusPartial','statsStatusNotDone',
  'statsPlanChkInPlan','statsPlanChkOutPlan'];
const UI_CHECKBOX_GROUP_IDS=['statsWorkTypeChecks','statsArticleTypeChecks','statsLiteratureTypeChecks'];
function getOwnGroupCheckboxes(containerId){
  const el=$(containerId); if(!el)return[];
  return Array.from(el.querySelectorAll('input[type="checkbox"]')).filter(cb=>cb.closest('.checkGroupBody')===el);
}

function saveUIState(){
  try{
    const state={};
    UI_SELECT_IDS.forEach(id=>{const el=$(id);if(el)state['s_'+id]=el.value;});
    UI_CHECKBOX_IDS.forEach(id=>{const el=$(id);if(el)state['c_'+id]=el.checked;});
    UI_CHECKBOX_GROUP_IDS.forEach(id=>{const el=$(id);if(el){
      state['g_'+id]=getOwnGroupCheckboxes(id).filter(cb=>cb.checked).map(cb=>cb.value);
    }});
    state._statsFiltersVersion=UI_STATE_STATS_FILTERS_VERSION;
    const activeTab=document.querySelector('.tabbtn[aria-selected="true"]');
    if(activeTab)state._activeTab=activeTab.getAttribute('aria-controls');
    localStorage.setItem(UI_STATE_KEY,JSON.stringify(state));
  }catch(_e){}
}

function restoreUIState(){
  try{
    const raw=localStorage.getItem(UI_STATE_KEY);
    if(!raw)return;
    const state=JSON.parse(raw);
    const needsStatsFiltersMigration=Number(state._statsFiltersVersion||0)<UI_STATE_STATS_FILTERS_VERSION;
    UI_SELECT_IDS.forEach(id=>{const el=$(id);if(el&&state['s_'+id]!==undefined){
      el.value=state['s_'+id];
      if(!el.value&&state['s_'+id])el.value='';
    }});
    UI_CHECKBOX_IDS.forEach(id=>{const el=$(id);if(el&&state['c_'+id]!==undefined)el.checked=state['c_'+id];});
    UI_CHECKBOX_GROUP_IDS.forEach(id=>{const el=$(id);if(el&&state['g_'+id]){
      const set=new Set(state['g_'+id]);
      getOwnGroupCheckboxes(id).forEach(cb=>cb.checked=set.has(cb.value));
    }});
    if(needsStatsFiltersMigration){
      const workTypesEl=$('statsWorkTypeChecks');
      if(workTypesEl){
        const literatureCb=workTypesEl.querySelector('input[type="checkbox"][value="LITERATURE"]');
        if(literatureCb)literatureCb.checked=true;
      }
      const literatureTypesEl=$('statsLiteratureTypeChecks');
      if(literatureTypesEl){
        literatureTypesEl.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=true);
      }
      if($('statsStatusNotDone'))$('statsStatusNotDone').checked=true;
      if($('sfStatusNotDone'))$('sfStatusNotDone').checked=true;
    }
  }catch(_e){}
}

function restoreActiveTab(){
  try{
    const raw=localStorage.getItem(UI_STATE_KEY);
    if(!raw)return;
    const state=JSON.parse(raw);
    if(state._activeTab){
      const tab=document.querySelector(`.tabbtn[aria-controls="${state._activeTab}"]`);
      if(tab)tab.click();
    }
  }catch(_e){}
}

function setLangButtonsActive(){
  const ruBtn=$('langRuBtn'), uzBtn=$('langUzBtn');
  if(ruBtn)ruBtn.setAttribute('aria-pressed',String(currentLang==='ru'));
  if(uzBtn)uzBtn.setAttribute('aria-pressed',String(currentLang==='uz'));
}

function getDepartmentName(){
  if(!departmentData) return '';
  // Выбираем название в зависимости от текущего языка
  if(currentLang === 'uz'){
    return departmentData.nameUz || departmentData.name || '';
  }
  return departmentData.name || departmentData.nameUz || '';
}

function updateMainTitle(){
  const el=$('mainTitle'); if(!el)return;
  const dict=(window.CAB_I18N && CAB_I18N[currentLang] && CAB_I18N[currentLang].ui) || ((CAB_I18N && CAB_I18N.ru && CAB_I18N.ru.ui));
  if(currentUser && (currentUser.accessLevel||'')==='ministry'){
    el.textContent = (dict && dict.mainTitleMinistry) || 'Кабинет министерства';
    return;
  }
  const deptName = getDepartmentName();
  if(!dict){ el.textContent = `Кабинет кафедры (ID: ${departmentId})`; return; }
  if(deptName && typeof dict.mainTitleWithName==='function'){
    el.textContent = dict.mainTitleWithName(deptName);
  }else if(typeof dict.mainTitleWithId==='function'){
    el.textContent = dict.mainTitleWithId(departmentId);
  }else{
    el.textContent = `Кабинет кафедры (ID: ${departmentId})`;
  }
}

function applyLanguage(){
  try{ document.documentElement.lang=currentLang; }catch(_e){}
  setLangButtonsActive();
  updateMainTitle();
  // Обновляем title страницы с учётом языка
  const deptName = getDepartmentName();
  const dictTitle=(window.CAB_I18N && CAB_I18N[currentLang] && CAB_I18N[currentLang].ui) || ((CAB_I18N && CAB_I18N.ru && CAB_I18N.ru.ui));
  if(deptName){
    document.title = `IlmiySTAT — ${deptName}`;
  }else if(currentUser && (currentUser.accessLevel||'')==='ministry'){
    document.title = `IlmiySTAT — ${(dictTitle && dictTitle.mainTitleMinistry) || 'Кабинет министерства'}`;
  }else{
    document.title = currentLang==='uz' ? 'IlmiySTAT — Kafedra kabineti' : 'IlmiySTAT — Кабинет кафедры';
  }

  // Верхнее меню
  const langLabel=$('langLabel');
  const dict=(window.CAB_I18N && CAB_I18N[currentLang] && CAB_I18N[currentLang].ui) || ((CAB_I18N && CAB_I18N.ru && CAB_I18N.ru.ui));
  if(langLabel && dict)langLabel.textContent=dict.langLabel;
  const logoutBtn=$('logoutBtn');
  if(logoutBtn && dict)logoutBtn.textContent=dict.logout;
  const userInfo=$('userInfo');
  if(userInfo && currentUser && currentUser.username){
    const roleLbl=getUserRoleLabel(currentUser);
    userInfo.textContent=`${String(t('ui.userLabel'))}: ${currentUser.username}${roleLbl?` (${roleLbl})`:''}`;
  }

  // Вкладки
  const tabNotifications=$('tab-notifications');
  const tabTeachers=$('tab-teachers');
  const tabPlan=$('tab-plan');
  const tabWorks=$('tab-works');
  const tabStats=$('tab-stats');
  const tabBackup=$('tab-backup');
  if(dict && dict.notifications){
    const intro=$('notificationsIntro');
    if(intro)intro.textContent=dict.notifications.intro||'Уведомления от администрации и министерства.';
    const markAll=$('notificationMarkAllReadBtn');
    if(markAll)markAll.textContent=dict.notifications.markAllRead||'Прочитаны все';
    const senderLbl=$('notificationSenderLabel');
    if(senderLbl)senderLbl.textContent=dict.notifications.senderFilterLabel||'Отправитель:';
    const senderSel=$('notificationSenderFilter');
    if(senderSel){
      const opts=senderSel.querySelectorAll('option');
      if(opts[0])opts[0].textContent=dict.notifications.senderAll||'— все —';
      if(opts[1])opts[1].textContent=dict.notifications.senderAdmin||'Администратор';
      if(opts[2])opts[2].textContent=dict.notifications.senderMinistry||'Министерство';
    }
  }
  if(dict && dict.tabs){
    const lbl=$('tabNotificationsLabel');
    if(lbl)lbl.textContent=dict.tabs.notifications||'Уведомления';
    const lblT=$('tabTeachersLabel');if(lblT)lblT.textContent=dict.tabs.teachers||'Педагоги';
    const lblP=$('tabPlanLabel');if(lblP)lblP.textContent=dict.tabs.plan||'План';
    const lblW=$('tabWorksLabel');if(lblW)lblW.textContent=dict.tabs.works||'Научные работы';
    const lblS=$('tabStatsLabel');if(lblS)lblS.textContent=dict.tabs.stats||'Статистика';
    const lblB=$('tabBackupLabel');if(lblB)lblB.textContent=dict.tabs.backup||'Импорт / Экспорт';
  }

  // Педагоги
  const teachersIntro=document.querySelector('#panel-teachers .card .muted');
  if(teachersIntro && (dict && dict.teachers))teachersIntro.textContent=dict.teachers.intro;
  const teacherFullNameLabel=document.querySelector('#panel-teachers label');
  if(teacherFullNameLabel && (dict && dict.teachers))teacherFullNameLabel.childNodes[0].textContent=dict.teachers.fullNameLabel;
  const teacherFullNameInput=$('teacherFullName');
  if(teacherFullNameInput && (dict && dict.teachers))teacherFullNameInput.placeholder=dict.teachers.fullNamePlaceholder;
  const teacherAddBtn=$('teacherAddBtn');
  if(teacherAddBtn && (dict && dict.teachers))teacherAddBtn.textContent=dict.teachers.addBtn;
  const teachersListTitle=document.querySelector('#panel-teachers .muted b');
  if(teachersListTitle && (dict && dict.teachers))teachersListTitle.textContent=dict.teachers.listTitle;
  const teachersRefreshBtn=$('teachersRefreshBtn');
  if(teachersRefreshBtn && (dict && dict.teachers))teachersRefreshBtn.textContent=dict.teachers.refreshBtn;
  updateDemoTeacherLimitUI();

  // План
  const planIntro=document.querySelector('#panel-plan .card .muted');
  if(planIntro && (dict && dict.plan))planIntro.textContent=dict.plan.intro;
  if((dict && dict.plan)){
    const setLbl=(inputId, txt)=>{
      const el=$(inputId);
      const lbl=(el && el.closest && el.closest('label'));
      if(lbl && lbl.childNodes && lbl.childNodes[0]) lbl.childNodes[0].textContent=txt;
    };
    setLbl('planTeacherSel', dict.plan.teacherLabel);
    setLbl('planYearSel', dict.plan.yearLabel);
  }
  // Текст "— все педагоги —" в селекторе (до загрузки списка)
  const planTeacherSel=$('planTeacherSel');
  if(planTeacherSel){
    const o=planTeacherSel.querySelector('option[value=""]');
    if(o) o.textContent=String(t('ui.common.allTeachers'));
  }
  const planStatusLbl=document.querySelector('#panel-plan .note label');
  if(planStatusLbl && (dict && dict.plan))planStatusLbl.childNodes[0].textContent=dict.plan.statusLabel;
  const planDoneLbl=(function(){var e=document.querySelector('#planFilterDone');return e&&e.nextElementSibling;})();
  const planNotDoneLbl=(function(){var e=document.querySelector('#planFilterNotDone');return e&&e.nextElementSibling;})();
  if(planDoneLbl && (dict && dict.plan))planDoneLbl.textContent=dict.plan.done;
  if(planNotDoneLbl && (dict && dict.plan))planNotDoneLbl.textContent=dict.plan.notDone;
  const h1Lbl=(function(){var e=document.querySelector('#planFilterH1');return e&&e.nextElementSibling;})();
  const h2Lbl=(function(){var e=document.querySelector('#planFilterH2');return e&&e.nextElementSibling;})();
  if(h1Lbl && (dict && dict.plan))h1Lbl.textContent=dict.plan.half1;
  if(h2Lbl && (dict && dict.plan))h2Lbl.textContent=dict.plan.half2;
  if((dict && dict.plan)){
    const setLbl=(inputId, txt)=>{
      const el=$(inputId);
      const lbl=(el && el.closest && el.closest('label'));
      if(lbl && lbl.childNodes && lbl.childNodes[0]) lbl.childNodes[0].textContent=txt;
    };
    setLbl('planFilterMonth', dict.plan.monthLabel);
    setLbl('planFilterIndicator', dict.plan.indicatorLabel);
    setLbl('planFilterArticleType', dict.plan.articleTypeLabel);
  }
  const planResetBtn=$('planFilterResetBtn');
  const planExportBtn=$('planExportBtn');
  if(planResetBtn && (dict && dict.plan))planResetBtn.textContent=dict.plan.resetFilters;
  if(planExportBtn && (dict && dict.plan))planExportBtn.textContent=dict.plan.exportExcel;
  const planListTitle=document.querySelector('#panel-plan .card:nth-of-type(2) .muted b');
  if(planListTitle && (dict && dict.plan))planListTitle.textContent=dict.plan.listTitle;
  const planRefreshBtn=$('planRefreshBtn');
  const planAddBtn=$('planAddOpenBtn');
  const planApproveAllBtn=$('planApproveAllBtn');
  const planUnapproveAllBtn=$('planUnapproveAllBtn');
  if(planRefreshBtn && (dict && dict.plan))planRefreshBtn.textContent=dict.plan.refreshBtn;
  if(planAddBtn && (dict && dict.plan))planAddBtn.textContent=dict.plan.addBtn;
  if(planApproveAllBtn && (dict && dict.plan))planApproveAllBtn.textContent=dict.plan.approveAllBtn||'Утвердить все';
  if(planUnapproveAllBtn && (dict && dict.plan))planUnapproveAllBtn.textContent=dict.plan.unapproveAllBtn||'Снять все утверждения';

  // Научные работы – верхние фильтры и кнопки (основные подписи)
  const worksTop=document.querySelector('#panel-works .card .muted');
  if(worksTop && (dict && dict.works))worksTop.textContent=dict.works.intro;
  if((dict && dict.works)){
    const setLbl=(inputId, txt)=>{
      const el=$(inputId);
      const lbl=(el && el.closest && el.closest('label'));
      if(!lbl)return;
      const tn=Array.from(lbl.childNodes||[]).find(n=>n && n.nodeType===3);
      if(tn){ tn.nodeValue = `${txt} `; return; }
      lbl.insertBefore(document.createTextNode(`${txt} `), lbl.firstChild);
    };
    setLbl('workTeacherSel', dict.works.teacherLabel);
    setLbl('workYearSel', dict.works.yearLabel);
    setLbl('workFilterInd', dict.works.indicatorLabel);
    setLbl('workFilterSrc', dict.works.sourceLabel);
    setLbl('workFilterArticleType', dict.works.articleTypeLabel);
  }
  const workTeacherSel=$('workTeacherSel');
  if(workTeacherSel){
    const o=workTeacherSel.querySelector('option[value=""]');
    if(o) o.textContent=String(t('ui.common.allTeachers'));
  }
  const workFilterIndSel=$('workFilterInd');
  if(workFilterIndSel){
    const o=workFilterIndSel.querySelector('option[value=""]');
    if(o) o.textContent=String(t('ui.common.all'));
  }
  const workFilterSrcSel=$('workFilterSrc');
  if(workFilterSrcSel){
    const o=workFilterSrcSel.querySelector('option[value=""]');
    if(o) o.textContent=String(t('ui.common.all'));
  }
  const workFilterArtSel=$('workFilterArticleType');
  if(workFilterArtSel){
    const o=workFilterArtSel.querySelector('option[value=""]');
    if(o) o.textContent=String(t('ui.common.all'));
  }
  const worksListTitle=document.querySelector('#panel-works .card:nth-of-type(2) .muted b');
  if(worksListTitle && (dict && dict.works))worksListTitle.textContent=dict.works.listTitle;
  const workRefreshBtn=$('workRefreshBtn');
  const workExportBtn=$('workExportBtn');
  const workAddBtn=$('workAddOpenBtn');
  if(workRefreshBtn && (dict && dict.works))workRefreshBtn.textContent=dict.works.refreshBtn;
  if(workExportBtn && (dict && dict.works))workExportBtn.textContent=dict.works.exportBtn;
  if(workAddBtn && (dict && dict.works))workAddBtn.textContent=dict.works.addBtn;

  // Статистика – только заголовок и вводный текст
  const statsIntro=$('statsFiltersIntro');
  if(statsIntro && (dict && dict.stats))statsIntro.textContent=dict.stats.intro;
  applyStatsAssistantLanguage();
  if($('statsDashboardTitle'))$('statsDashboardTitle').textContent=currentLang==='uz'?'Kafedra statistikasi':'Статистика кафедры';
  if($('statsPlanFactReportTitle'))$('statsPlanFactReportTitle').textContent=currentLang==='uz'?'Interaktiv hisobot reja/bajarildi':'Интерактивный отчёт план/выполнено';
  if($('statsPlanFactReportDesc'))$('statsPlanFactReportDesc').textContent=currentLang==='uz'
    ?'Har bir ko‘rsatkich bo‘yicha oylik grafiklar.'
    :'Помесячные графики по каждому показателю.';
  if($('statsPlanFactReportBtn'))$('statsPlanFactReportBtn').textContent=currentLang==='uz'?'Hisobotni ochish':'Открыть отчёт';
  const statsPeriodLabel=$('statsPeriodLabel');
  if(statsPeriodLabel && (dict && dict.stats))statsPeriodLabel.textContent=dict.stats.periodLabel;
  const statsYearLabel=$('statsYearLabel');
  if(statsYearLabel && (dict && dict.stats))statsYearLabel.textContent=dict.stats.yearLabel;
  const statsTeacherLabel=$('statsTeacherLabel');
  if(statsTeacherLabel && (dict && dict.stats))statsTeacherLabel.textContent=dict.stats.teacherLabel;
  const statsTeacherSel=$('statsTeacherSel');
  if(statsTeacherSel){
    const o=statsTeacherSel.querySelector('option[value=""]');
    if(o) o.textContent=String(t('ui.common.allTeachers'));
  }
  const statsPeriodSel=$('statsPeriod');
  if(statsPeriodSel && (dict && dict.stats)){
    const oa=statsPeriodSel.querySelector('option[value="academic"]');
    const oc=statsPeriodSel.querySelector('option[value="calendar"]');
    if(oa)oa.textContent=dict.stats.periodAcademic||oa.textContent;
    if(oc)oc.textContent=dict.stats.periodCalendar||oc.textContent;
  }
  const statsQuarterSel=$('statsQuarter');
  if(statsQuarterSel && (dict && dict.stats)){
    const oAll=statsQuarterSel.querySelector('option[value=""]');
    const o1=statsQuarterSel.querySelector('option[value="1"]');
    const o2=statsQuarterSel.querySelector('option[value="2"]');
    const o3=statsQuarterSel.querySelector('option[value="3"]');
    const o4=statsQuarterSel.querySelector('option[value="4"]');
    if(oAll)oAll.textContent=dict.stats.quarterAll||oAll.textContent;
    if(o1)o1.textContent=(dict.stats.quartersAcademic && dict.stats.quartersAcademic.q1)||o1.textContent;
    if(o2)o2.textContent=(dict.stats.quartersAcademic && dict.stats.quartersAcademic.q2)||o2.textContent;
    if(o3)o3.textContent=(dict.stats.quartersAcademic && dict.stats.quartersAcademic.q3)||o3.textContent;
    if(o4)o4.textContent=(dict.stats.quartersAcademic && dict.stats.quartersAcademic.q4)||o4.textContent;
  }

  const chooseTxt=String((dict&&dict.stats&&dict.stats.chooseOption)||(dict&&dict.common&&dict.common.choose)||'— выберите —');
  if($('ministryInstLabel'))$('ministryInstLabel').textContent=(dict&&dict.stats&&dict.stats.instLabel)||'Институт';
  if($('ministryDeanLabel'))$('ministryDeanLabel').textContent=(dict&&dict.stats&&dict.stats.deanLabel)||'Деканат';
  if($('ministryDeptLabel'))$('ministryDeptLabel').textContent=(dict&&dict.stats&&dict.stats.deptLabel)||'Кафедра';
  [$('ministryInstSel'),$('ministryDeanSel'),$('ministryDeptSel')].forEach(sel=>{ if(sel){ const o=sel.querySelector('option[value=""]'); if(o)o.textContent=chooseTxt; }});
  if((dict && dict.stats)){
    if($('statsQuarterLabel'))$('statsQuarterLabel').textContent=dict.stats.quarterLabel||$('statsQuarterLabel').textContent;
    if($('statsWorkTypeTitle'))$('statsWorkTypeTitle').textContent=dict.stats.workTypeTitle||$('statsWorkTypeTitle').textContent;
    if($('statsArticleTypeTitle'))$('statsArticleTypeTitle').textContent=dict.stats.articleTypeTitle||$('statsArticleTypeTitle').textContent;
    if($('statsLiteratureTypeTitle'))$('statsLiteratureTypeTitle').textContent=dict.stats.literatureTypeTitle||$('statsLiteratureTypeTitle').textContent;
    if($('statsMonthLabel'))$('statsMonthLabel').textContent=dict.stats.monthLabel||$('statsMonthLabel').textContent;
    if($('statsHalfLabel'))$('statsHalfLabel').textContent=dict.stats.halfLabel||$('statsHalfLabel').textContent;
    if($('statsHalf1Text'))$('statsHalf1Text').textContent=dict.stats.half1||$('statsHalf1Text').textContent;
    if($('statsHalf2Text'))$('statsHalf2Text').textContent=dict.stats.half2||$('statsHalf2Text').textContent;
    if($('statsSourceLabel'))$('statsSourceLabel').textContent=dict.stats.sourceLabel||$('statsSourceLabel').textContent;
    if($('statsStatusLabel'))$('statsStatusLabel').textContent=dict.stats.statusLabel||$('statsStatusLabel').textContent;
    if($('statsSourcePlanText'))$('statsSourcePlanText').textContent=dict.stats.sourcePlan||$('statsSourcePlanText').textContent;
    if($('statsSourceOutText'))$('statsSourceOutText').textContent=dict.stats.sourceOut||$('statsSourceOutText').textContent;
    if($('statsStatusDoneText'))$('statsStatusDoneText').textContent=dict.stats.statusDone||$('statsStatusDoneText').textContent;
    if($('statsStatusPartialText'))$('statsStatusPartialText').textContent=dict.stats.statusPartial||$('statsStatusPartialText').textContent;
    if($('statsStatusNotDoneText'))$('statsStatusNotDoneText').textContent=dict.stats.statusNotDone||$('statsStatusNotDoneText').textContent;
    if($('seDockTitle'))$('seDockTitle').textContent=dict.stats.colsTitle||$('seDockTitle').textContent;
    if($('statsExportXlsBtn'))$('statsExportXlsBtn').textContent=dict.stats.exportBtn||$('statsExportXlsBtn').textContent;
    if($('statsExportPdfBtn'))$('statsExportPdfBtn').textContent=dict.stats.exportPdfBtn||$('statsExportPdfBtn').textContent;
    if($('statsExportPdfByIndicatorBtn'))$('statsExportPdfByIndicatorBtn').textContent=dict.stats.exportPdfByIndicatorBtn||$('statsExportPdfByIndicatorBtn').textContent;
    if($('statsResetBtn'))$('statsResetBtn').textContent=dict.stats.resetBtn||$('statsResetBtn').textContent;
    updateStatsColsManageBtn();
    try{ updateStatsTableColsWarning(); }catch(_e){}

    // Боковая панель фильтров статистики
    if($('statsFilterSidebarToggle') && dict.stats.filtersTitle)$('statsFilterSidebarToggle').title=dict.stats.filtersTitle;
    if($('sfTitle'))$('sfTitle').textContent=dict.stats.filtersTitle||$('sfTitle').textContent;
    if($('sfMonthLabel'))$('sfMonthLabel').textContent=dict.stats.monthLabel||$('sfMonthLabel').textContent;
    if($('sfHalfLabel'))$('sfHalfLabel').textContent=dict.stats.halfLabel||$('sfHalfLabel').textContent;
    if($('sfHalf1Text'))$('sfHalf1Text').textContent=dict.stats.half1||$('sfHalf1Text').textContent;
    if($('sfHalf2Text'))$('sfHalf2Text').textContent=dict.stats.half2||$('sfHalf2Text').textContent;
    if($('sfSourceLabel'))$('sfSourceLabel').textContent=dict.stats.sourceLabel||$('sfSourceLabel').textContent;
    if($('sfSourcePlanText'))$('sfSourcePlanText').textContent=dict.stats.sourcePlan||$('sfSourcePlanText').textContent;
    if($('sfSourceOutText'))$('sfSourceOutText').textContent=dict.stats.sourceOut||$('sfSourceOutText').textContent;
    if($('sfStatusLabel'))$('sfStatusLabel').textContent=dict.stats.statusLabel||$('sfStatusLabel').textContent;
    if($('sfStatusDoneText'))$('sfStatusDoneText').textContent=(dict.stats.statusDone||'✓');
    if($('sfStatusPartialText'))$('sfStatusPartialText').textContent=(dict.stats.statusPartial||'●');
    if($('sfStatusNotDoneText'))$('sfStatusNotDoneText').textContent=(dict.stats.statusNotDone||'✗');

    // Подсказки (tooltips) боковой панели и основной статистики
    const tt=dict.stats && dict.stats.tooltips;
    if(tt){
      if($('statsWorkTypeTitle'))$('statsWorkTypeTitle').title=tt.doubleClickTitleHint||'';
      if($('statsArticleTypeTitle'))$('statsArticleTypeTitle').title=tt.doubleClickTitleHint||'';
      if($('statsLiteratureTypeTitle'))$('statsLiteratureTypeTitle').title=tt.doubleClickTitleHint||'';
      if($('seDockTitle'))$('seDockTitle').title=tt.doubleClickTitleHint||'';
      if($('statsHalf1'))$('statsHalf1').closest('label').title=tt.half1Hint||'';
      if($('statsHalf2'))$('statsHalf2').closest('label').title=tt.half2Hint||'';
      if($('sfMonthLabel'))$('sfMonthLabel').title=tt.monthLabelHint||'';
      if($('sfMonth'))$('sfMonth').title=tt.monthSelectHint||'';
      if($('sfHalfLabel'))$('sfHalfLabel').title=tt.halfLabelHint||'';
      if($('sfHalf1'))$('sfHalf1').closest('label').title=tt.half1Hint||'';
      if($('sfHalf2'))$('sfHalf2').closest('label').title=tt.half2Hint||'';
      if($('sfSourceLabel'))$('sfSourceLabel').title=tt.sourceLabelHint||'';
      if($('sfSourcePlan'))$('sfSourcePlan').closest('label').title=tt.sourcePlanHint||'';
      if($('sfSourceOut'))$('sfSourceOut').closest('label').title=tt.sourceOutHint||'';
      if($('sfStatusLabel'))$('sfStatusLabel').title=tt.statusLabelHint||'';
      if($('sfStatusDone'))$('sfStatusDone').closest('label').title=tt.statusDoneHint||'';
      if($('sfStatusPartial'))$('sfStatusPartial').closest('label').title=tt.statusPartialHint||'';
      if($('sfStatusNotDone'))$('sfStatusNotDone').closest('label').title=tt.statusNotDoneHint||'';
    }

    // Блок "Выполнение относительно плана"
    if($('statsPlanPctTitle') && dict.stats.planTitle)$('statsPlanPctTitle').textContent=dict.stats.planTitle;
    if($('statsResultsSectionTitle') && dict.stats.resultsSectionTitle)$('statsResultsSectionTitle').textContent=dict.stats.resultsSectionTitle;
    if($('statsTableTitle') && dict.stats.statsTableSectionTitle)$('statsTableTitle').textContent=dict.stats.statsTableSectionTitle;
    if($('planTableTitle') && dict.stats.statsPlanTableSectionTitle)$('planTableTitle').textContent=dict.stats.statsPlanTableSectionTitle;
    if($('statsPlanSourceLabel') && dict.stats.planSourceLabel)$('statsPlanSourceLabel').textContent=dict.stats.planSourceLabel;
    if($('statsPlanInPlanText'))$('statsPlanInPlanText').textContent=dict.stats.sourcePlan||$('statsPlanInPlanText').textContent;
    if($('statsPlanOutPlanText'))$('statsPlanOutPlanText').textContent=dict.stats.sourceOut||$('statsPlanOutPlanText').textContent;

    // План научных работ (сворачиваемая таблица)
    if($('planTableHeader'))$('planTableHeader').title=t('planTable.collapseHint')||'';

    // Блок "Зачтённые работы"
    if($('statsAggTitle') && (dict.stats.agg && dict.stats.agg.title))$('statsAggTitle').textContent=dict.stats.agg.title;
    if($('statsAggLabelIndicators') && (dict.stats.agg && dict.stats.agg.byWorkType))$('statsAggLabelIndicators').textContent=dict.stats.agg.byWorkType;
    if($('statsAggLabelCoauthor') && (dict.stats.agg && dict.stats.agg.coauthorScore))$('statsAggLabelCoauthor').textContent=dict.stats.agg.coauthorScore;
  }

  // Заголовки таблицы статистики (data-col -> cols.<key>) + tooltip
  try{
    document.querySelectorAll('#statsTable thead th[data-col]').forEach(th=>{
      const k=th.getAttribute('data-col');
      if(k){
        const lbl=th.querySelector('.th-label');
        if(lbl)lbl.textContent=String(colLabel(k));
        else th.innerHTML=`<span class="th-label">${esc(String(colLabel(k)))}</span><span class="th-resize" aria-hidden="true"></span>`;
        const hint=colHint(k);
        if(hint && !String(hint).startsWith('colHints.')) th.title=String(hint);
      }
    });
  }catch(_e){}

  // Импорт / экспорт
  const backupIntro=document.querySelector('#panel-backup .card .muted');
  if(backupIntro && (dict && dict.backup))backupIntro.innerHTML=dict.backup.introHtml;
  const importLabel=(function(){var e=document.querySelector('label[for=\"importFile\"], #importFile');return e&&e.parentElement;})();
  if(importLabel && importLabel.tagName==='LABEL' && (dict && dict.backup))importLabel.childNodes[0].textContent=dict.backup.importLabel;
  const importWipeLbl=(function(){var e=document.querySelector('#importWipe');return e&&e.parentElement&&e.parentElement.querySelector('span');})();
  if(importWipeLbl && (dict && dict.backup))importWipeLbl.textContent=dict.backup.importWipe;
  const importBtn=$('importBtn');
  if(importBtn && (dict && dict.backup))importBtn.textContent=dict.backup.importBtn;
  const exportLabel=(function(){var e=document.querySelector('#exportArea');return e&&e.parentElement;})();
  if(exportLabel && exportLabel.tagName==='LABEL' && (dict && dict.backup))exportLabel.childNodes[0].textContent=dict.backup.exportLabel;
  const exportArea=$('exportArea');
  if(exportArea && (dict && dict.backup) && dict.backup.exportPlaceholder)exportArea.placeholder=dict.backup.exportPlaceholder;
  const exportBtn=$('exportBtn');
  const downloadBtn=$('downloadBtn');
  if(exportBtn && (dict && dict.backup))exportBtn.textContent=dict.backup.exportBtn;
  if(downloadBtn && (dict && dict.backup))downloadBtn.textContent=dict.backup.downloadBtn;
  const backupDangerTitle=document.querySelector('#panel-backup .note b');
  const backupDangerText=document.querySelector('#panel-backup .note .muted');
  const backupDangerDesc=$('backupDangerDesc');
  const clearAllBtn=$('clearAllDataBtn');
  if(backupDangerTitle && (dict && dict.backup))backupDangerTitle.textContent=dict.backup.dangerTitle;
  if(backupDangerText && (dict && dict.backup) && backupDangerText.childNodes[1]){
    backupDangerText.childNodes[1].textContent=dict.backup.dangerSuffix;
  }
  if(backupDangerDesc && (dict && dict.backup) && dict.backup.dangerDesc)backupDangerDesc.textContent=dict.backup.dangerDesc;
  if(clearAllBtn && (dict && dict.backup))clearAllBtn.textContent=dict.backup.clearAllBtn;

  // PDF-просмотрщик: подсказки и подписи кнопок
  if((dict && dict.pdfViewer)){
    if($('pdfDownloadBtn')){$('pdfDownloadBtn').title=dict.pdfViewer.download;$('pdfDownloadBtn').innerHTML='&#8681; '+dict.pdfViewer.download;}
    if($('pdfCloseBtn')){$('pdfCloseBtn').title=dict.pdfViewer.close;$('pdfCloseBtn').innerHTML='&#10005; '+dict.pdfViewer.close;}
  }

  // Обновляем опции источника (фильтр и модалка)
  const wfSrc=$('workFilterSrc');
  if(wfSrc){
    const optAll=wfSrc.querySelector('option[value=""]');
    const optPlan=wfSrc.querySelector('option[value="PLAN"]');
    const optOut=wfSrc.querySelector('option[value="OUT_OF_PLAN"]');
    if(optAll)optAll.textContent=String(t('ui.common.all'));
    if(optPlan)optPlan.textContent=String(t('meta.sources.PLAN'));
    if(optOut)optOut.textContent=String(t('meta.sources.OUT_OF_PLAN'));
  }
  const wmSrc=$('wmSource');
  if(wmSrc){
    const optPlan=wmSrc.querySelector('option[value="PLAN"]');
    const optOut=wmSrc.querySelector('option[value="OUT_OF_PLAN"]');
    if(optPlan)optPlan.textContent=String(t('meta.sources.PLAN'));
    if(optOut)optOut.textContent=String(t('meta.sources.OUT_OF_PLAN'));
  }

  // Модалка плана: подписи и кнопки
  if((dict && dict.planModal)){
    const setLbl=(inputId, txt)=>{
      const el=$(inputId);
      const lbl=(el && el.closest && el.closest('label'));
      if(lbl && lbl.childNodes && lbl.childNodes[0]) lbl.childNodes[0].textContent=txt;
    };
    setLbl('pmTeacher', dict.planModal.teacher);
    setLbl('pmYear', dict.planModal.academicYear);
    setLbl('pmIndicator', dict.planModal.indicator);
    setLbl('pmArticleType', dict.planModal.articleType);
    const citLbl=($('pmCitations') && $('pmCitations').closest('label')); if(citLbl && citLbl.childNodes[0]) citLbl.childNodes[0].textContent=dict.planModal.citationsPlan;
    const patLbl=($('pmPatents') && $('pmPatents').closest('label')); if(patLbl && patLbl.childNodes[0]) patLbl.childNodes[0].textContent=dict.planModal.patentsPlan;
    setLbl('pmMonth', dict.planModal.month);
    const pmCancel=document.querySelector('#planModal .modal-actions .btn.secondary');
    if(pmCancel)pmCancel.textContent=dict.planModal.cancel;
    if($('pmSaveBtn'))$('pmSaveBtn').textContent=dict.planModal.save;
  }

  // Модалка работы: подписи/плейсхолдеры/кнопки/опции статуса
  if((dict && dict.workModal)){
    const setLbl=(inputId, txt)=>{
      const el=$(inputId);
      const lbl=(el && el.closest && el.closest('label'));
      if(lbl && lbl.childNodes && lbl.childNodes[0]) lbl.childNodes[0].textContent=txt;
    };
    setLbl('wmTeacher', dict.workModal.teacher);
    setLbl('wmYear', dict.workModal.academicYear);
    setLbl('wmSource', dict.workModal.source);
    setLbl('wmIndicator', dict.workModal.indicator);
    setLbl('wmArticleType', dict.workModal.articleType);
    const citLbl=($('wmCitations') && $('wmCitations').closest('label')); if(citLbl && citLbl.childNodes[0]) citLbl.childNodes[0].textContent=dict.workModal.citationsCountUz||dict.workModal.citationsCount||'';
    if($('tmFullNameLabel'))$('tmFullNameLabel').textContent=(dict.teachers&&dict.teachers.fullNameLabel)||'Ф.И.О.';
    if($('tmProfileLinksLabel'))$('tmProfileLinksLabel').textContent=dict.workModal.profileLinks||dict.workModal.profileLink||'Ссылки на профили';
    if($('tmProfileLinkAddBtn'))$('tmProfileLinkAddBtn').textContent='+ '+(dict.workModal.addProfile||'Добавить профиль');
    if($('wmHIndexLabel'))$('wmHIndexLabel').textContent=dict.workModal.hIndex||'';
    const titleLbl=($('wmTitle') && $('wmTitle').closest('label')); if(titleLbl && titleLbl.childNodes[0]) titleLbl.childNodes[0].textContent=dict.workModal.title;
    if($('wmTitle') && dict.workModal.titlePh)$('wmTitle').placeholder=dict.workModal.titlePh;
    const pubLbl=($('wmPublisher') && $('wmPublisher').closest('label')); if(pubLbl && pubLbl.childNodes[0]) pubLbl.childNodes[0].textContent=dict.workModal.publisher;
    if($('wmPublisher') && dict.workModal.publisherPh)$('wmPublisher').placeholder=dict.workModal.publisherPh;
    const ccLbl=($('wmCouncil') && $('wmCouncil').closest('label')); if(ccLbl && ccLbl.childNodes[0]) ccLbl.childNodes[0].textContent=dict.workModal.council;
    if($('wmCouncil') && dict.workModal.councilPh)$('wmCouncil').placeholder=dict.workModal.councilPh;
    const cnLbl=($('wmCertNo') && $('wmCertNo').closest('label')); if(cnLbl && cnLbl.childNodes[0]) cnLbl.childNodes[0].textContent=dict.workModal.certNo;
    if($('wmCertNo') && dict.workModal.certNoPh)$('wmCertNo').placeholder=dict.workModal.certNoPh;
    setLbl('wmMonth', dict.workModal.month);
    const yLbl=($('wmPubYear') && $('wmPubYear').closest('label')); if(yLbl && yLbl.childNodes[0]) yLbl.childNodes[0].textContent=dict.workModal.publishYear;
    const pmLbl=($('wmPlannedMonth') && $('wmPlannedMonth').closest('label')); if(pmLbl && pmLbl.childNodes[0]) pmLbl.childNodes[0].textContent=dict.workModal.plannedMonth;
    const caLbl=($('wmCoAuthors') && $('wmCoAuthors').closest('label')); if(caLbl && caLbl.childNodes[0]) caLbl.childNodes[0].textContent=dict.workModal.coAuthorsCount;
    const catLbl=($('wmCoAuthorTeachers') && $('wmCoAuthorTeachers').closest('label')); if(catLbl && catLbl.childNodes[0]) catLbl.childNodes[0].textContent=dict.workModal.coAuthorTeachers;
    if($('wmCoAuthorClearBtn'))$('wmCoAuthorClearBtn').textContent=dict.workModal.coAuthorClear;
    if($('wmCoAuthorHelp') && dict.workModal.coAuthorHelp)$('wmCoAuthorHelp').textContent=dict.workModal.coAuthorHelp;
    const sLbl=($('wmSiteUrl') && $('wmSiteUrl').closest('label')); if(sLbl && sLbl.childNodes[0]) sLbl.childNodes[0].textContent=dict.workModal.siteUrl;
    const fLbl=($('wmFileUrl') && $('wmFileUrl').closest('label')); if(fLbl && fLbl.childNodes[0]) fLbl.childNodes[0].textContent=dict.workModal.fileUrl;
    if($('wmPdfLabel'))$('wmPdfLabel').textContent=(dict.works && dict.works.pdfColumn)||$('wmPdfLabel').textContent;
    const stLbl=($('wmStatus') && $('wmStatus').closest('label')); if(stLbl && stLbl.childNodes[0]) stLbl.childNodes[0].textContent=dict.workModal.completionStatus;
    const patNoLbl=($('wmPatentNo') && $('wmPatentNo').closest('label')); if(patNoLbl && patNoLbl.childNodes[0]) patNoLbl.childNodes[0].textContent=dict.workModal.patentNo;
    const patDateLbl=($('wmPatentDay') && $('wmPatentDay').closest('label')); if(patDateLbl && patDateLbl.childNodes[0]) patDateLbl.childNodes[0].textContent=dict.workModal.patentDate;
    const patIssuedLbl=($('wmPatentIssuedBy') && $('wmPatentIssuedBy').closest('label')); if(patIssuedLbl && patIssuedLbl.childNodes[0]) patIssuedLbl.childNodes[0].textContent=dict.workModal.patentIssuedBy;
    const certDateLbl=($('wmCertDay') && $('wmCertDay').closest('label')); if(certDateLbl && certDateLbl.childNodes[0]) certDateLbl.childNodes[0].textContent=dict.workModal.certDate;
    if($('wmTop1000DirectionLabel'))$('wmTop1000DirectionLabel').textContent=dict.workModal.top1000DirectionCode||'Yoʻnalish kodi';
    if($('wmTop1000Direction')&&dict.workModal.directionSearchPh)$('wmTop1000Direction').placeholder=dict.workModal.directionSearchPh;
    if($('wmTop1000HoursLabel'))$('wmTop1000HoursLabel').textContent=dict.workModal.top1000Hours||'Учебные часы';
    if($('wmTop1000CertLabel'))$('wmTop1000CertLabel').textContent=dict.workModal.top1000CertNumbers||'Номера сертификатов';
    if($('wmGrantNameLabel'))$('wmGrantNameLabel').textContent=dict.workModal.grantName||'Название гранта';
    if($('wmGrantDurationLabel'))$('wmGrantDurationLabel').textContent=dict.workModal.grantDuration||'Срок';
    if($('wmGrantPartnerLabel'))$('wmGrantPartnerLabel').textContent=dict.workModal.grantPartner||'Партнёр — зарубежный вуз';
    if($('wmGrantAmountLabel'))$('wmGrantAmountLabel').textContent=dict.workModal.grantAmount||'Сумма гранта (USD)';
    if($('wmGrantParticipantsLabel'))$('wmGrantParticipantsLabel').textContent=dict.workModal.grantParticipants||'Участники гранта';
    if($('wmGrantParticipantNameInput')&&dict.workModal.grantParticipantNamesPh)$('wmGrantParticipantNameInput').placeholder=dict.workModal.grantParticipantNamesPh;
    if($('wmGrantParticipantNameAddBtn')&&dict.workModal.grantParticipantAdd)$('wmGrantParticipantNameAddBtn').textContent='+ '+dict.workModal.grantParticipantAdd;
    if($('wmGrantParticipantsHint')&&dict.workModal.grantParticipantsHint)$('wmGrantParticipantsHint').textContent=dict.workModal.grantParticipantsHint;
    if($('wmIlmiyDarajaLabel'))$('wmIlmiyDarajaLabel').textContent=dict.workModal.ilmiyDaraja||'Ilmiy daraja';
    if($('wmIlmiyUnvonLabel'))$('wmIlmiyUnvonLabel').textContent=dict.workModal.ilmiyUnvon||'Ilmiy unvon';
    if($('wmEducationDirectionCodeLabel'))$('wmEducationDirectionCodeLabel').textContent=dict.workModal.educationDirectionCode||'Yoʻnalish kodi';
    if($('wmEducationDirectionCode')&&dict.workModal.directionSearchPh)$('wmEducationDirectionCode').placeholder=dict.workModal.directionSearchPh;
    if($('wmSpecialtyCodeLabel'))$('wmSpecialtyCodeLabel').textContent=dict.workModal.specialtyCode||'Код специальности';
    if($('wmSpecialtyCode')&&dict.workModal.specialtyCodePh)$('wmSpecialtyCode').placeholder=dict.workModal.specialtyCodePh;
    if($('wmDiplomRaqamiLabel'))$('wmDiplomRaqamiLabel').textContent=dict.workModal.diplomRaqami||'Diplom raqami';
    if($('wmDiplomRaqami')&&dict.workModal.diplomRaqamiPh)$('wmDiplomRaqami').placeholder=dict.workModal.diplomRaqamiPh;
    if($('wmDegreeDateLabel'))$('wmDegreeDateLabel').textContent=dict.workModal.degreeDate||'Дата';
    if($('wmXorijiyTilFanNomiLabel'))$('wmXorijiyTilFanNomiLabel').textContent=dict.workModal.xorijiyTilFanNomi||"Fan nomi";
    if($('wmXorijiyTilFanYonalishLabel'))$('wmXorijiyTilFanYonalishLabel').textContent=dict.workModal.xorijiyTilFanYonalish||"Fan yo'nalish";
    if($('wmXorijiyTilMashgulotTuriLabel'))$('wmXorijiyTilMashgulotTuriLabel').textContent=dict.workModal.xorijiyTilMashgulotTuri||"Mashg'ulot turi";
    if($('wmXorijiyTilTilLabel'))$('wmXorijiyTilTilLabel').textContent=dict.workModal.xorijiyTilTil||"Qaysi xorijiy tilda";
    if($('wmXorijiyTilMashgulotSoatiLabel'))$('wmXorijiyTilMashgulotSoatiLabel').textContent=dict.workModal.xorijiyTilMashgulotSoati||"Mashg'ulot soati";
    const wmCancel=document.querySelector('#workModal .modal-actions .btn.secondary');
    if(wmCancel)wmCancel.textContent=dict.workModal.cancel;
    if($('wmSaveBtn'))$('wmSaveBtn').textContent=dict.workModal.save;
    const tmCancel=document.querySelector('#teacherModal .modal-actions .btn.secondary');
    if(tmCancel)tmCancel.textContent=dict.workModal.cancel;
    if($('tmSaveBtn'))$('tmSaveBtn').textContent=dict.workModal.save;

    // Опции статуса в модалке
    const stSel=$('wmStatus');
    if(stSel){
      const oN=stSel.querySelector('option[value="NOT_DONE"]');
      const oP=stSel.querySelector('option[value="PARTIAL"]');
      const oD=stSel.querySelector('option[value="DONE"]');
      if(oN)oN.textContent=String(t('meta.statuses.NOT_DONE'));
      if(oP)oP.textContent=String(t('meta.statuses.PARTIAL'));
      if(oD)oD.textContent=String(t('meta.statuses.DONE'));
    }
    // Опции учёной степени и звания в модалке
    const darajaSel=$('wmIlmiyDaraja');
    if(darajaSel){
      const oEmpty=darajaSel.querySelector('option[value=""]');
      if(oEmpty)oEmpty.textContent=String(t('ui.common.choose')||'—');
      ['CANDIDATE','PHD','DSC'].forEach(code=>{
        const o=darajaSel.querySelector('option[value="'+code+'"]');
        if(o&&ILMIY_DARAJA_NAMES[code])o.textContent=currentLang==='uz'?ILMIY_DARAJA_NAMES[code].uz:ILMIY_DARAJA_NAMES[code].ru;
      });
    }
    const unvonSel=$('wmIlmiyUnvon');
    if(unvonSel){
      const oEmpty=unvonSel.querySelector('option[value=""]');
      if(oEmpty)oEmpty.textContent=String(t('ui.common.choose')||'—');
      ['DOTSENT','PROFESSOR'].forEach(code=>{
        const o=unvonSel.querySelector('option[value="'+code+'"]');
        if(o&&ILMIY_UNVON_NAMES[code])o.textContent=currentLang==='uz'?ILMIY_UNVON_NAMES[code].uz:ILMIY_UNVON_NAMES[code].ru;
      });
    }
  }

  // Заголовки таблиц (как UI-текст)
  if((dict && dict.tables)){
    const setHeaders=(sel, labels)=>{
      const ths=Array.from(document.querySelectorAll(sel));
      if(!ths.length||!Array.isArray(labels))return;
      for(let i=0;i<ths.length && i<labels.length;i++){
        ths[i].textContent=labels[i];
      }
    };
    setHeaders('#panel-teachers table thead th', dict.tables.teachers);
    setHeaders('#panel-plan table thead th', dict.tables.plan);
    setHeaders('#panel-works table thead th', dict.tables.works);
  }

  // Перестраиваем селекты, где подписи зависят от языка (с сохранением выбранного значения)
  try{
    initPlanFilters();
    const wfi=$('workFilterInd'); if(wfi){ const prev=String(wfi.value||''); fillIndicatorSelect(wfi,true); wfi.value=prev; }
    const wfa=$('workFilterArticleType'); if(wfa){ const prev=String(wfa.value||''); fillArticleTypeSelect(wfa,true); wfa.value=prev; }
    const pmInd=$('pmIndicator'); if(pmInd){ const prev=String(pmInd.value||''); fillIndicatorSelect(pmInd,false); pmInd.value=prev; }
    const pmArt=$('pmArticleType'); if(pmArt){ const prev=String(pmArt.value||''); fillArticleTypeSelect(pmArt); pmArt.value=prev; }
    const pmMonth=$('pmMonth'); if(pmMonth){ const prev=String(pmMonth.value||''); fillMonthSelect(pmMonth,true); pmMonth.value=prev; }
    const wmInd=$('wmIndicator'); if(wmInd){ const prev=String(wmInd.value||''); fillIndicatorSelect(wmInd,false); wmInd.value=prev; }
    const wmArt=$('wmArticleType'); if(wmArt){ const prev=String(wmArt.value||''); fillArticleTypeSelect(wmArt); wmArt.value=prev; }
    const wmMonth=$('wmMonth'); if(wmMonth){ const prev=String(wmMonth.value||''); fillMonthSelect(wmMonth,false); wmMonth.value=prev; }
    const wmPatM=$('wmPatentMonth'); if(wmPatM){ const prev=String(wmPatM.value||''); fillMonthSelect(wmPatM,false); wmPatM.value=prev; }
    const wmCertM=$('wmCertMonth'); if(wmCertM){ const prev=String(wmCertM.value||''); fillMonthSelect(wmCertM,false); wmCertM.value=prev; }
    fillXorijiyTilSelects();
    if($('wmPlannedMonth')) refreshWorkPlannedMonthSelect($('wmPlannedMonth').value||'');
    fillStatsYearOptions();
    fillStatsMonth();
    // Обновляем подписи в чекбокс-группах статистики без перерисовки (сохраняем checked)
    const updGroup=(id,labelFn)=>{
      const el=$(id); if(!el)return;
      el.querySelectorAll('label.checkItem').forEach(lbl=>{
        const cb=lbl.querySelector('input');
        const sp=lbl.querySelector('span');
        if(!cb||!sp)return;
        sp.textContent=String(labelFn(cb.value));
      });
    };
    updGroup('statsWorkTypeChecks',(code)=> ((dict && dict.stats && dict.stats.workTypes && dict.stats.workTypes[code]) || (window.CAB_I18N && window.CAB_I18N.ru && window.CAB_I18N.ru.ui && window.CAB_I18N.ru.ui.stats && window.CAB_I18N.ru.ui.stats.workTypes && window.CAB_I18N.ru.ui.stats.workTypes[code]) || code));
    updGroup('statsArticleTypeChecks',(code)=> artName(code));
    updGroup('statsLiteratureTypeChecks',(code)=> indName(code));
    updGroup('statsExportColsChecks',(code)=> colLabel(code));
    syncStatsTypeUi();
  }catch(_e){}
}

function setLang(lang){
  currentLang=lang==='uz'?'uz':'ru';
  try{ localStorage.setItem('cabinetLang',currentLang);}catch(_e){}
  applyLanguage();
  try{ renderTeachers(); renderPlans(); renderWorks(); renderStats(); }catch(_e){}
}

async function api(endpoint, opt={}){
  const token = getAuthToken();
  const headers = {'Content-Type':'application/json',...opt.headers};
  if(token) headers['Authorization'] = `Bearer ${token}`;
  const timeoutMs = Number(opt.timeoutMs || 20000);
  const controller = new AbortController();
  const hasExternalSignal = !!opt.signal;
  let timeoutId = null;
  if(!hasExternalSignal && Number.isFinite(timeoutMs) && timeoutMs > 0){
    timeoutId = setTimeout(()=>controller.abort(), timeoutMs);
  }
  try{
    const res = await fetch(`${API}${endpoint}`,{...opt,headers,signal:hasExternalSignal?opt.signal:controller.signal});
    if(!res.ok){ const e = await res.json().catch(()=>({})); throw new Error(e.error||`HTTP ${res.status}`); }
    return res.json();
  }catch(err){
    if(err && err.name === 'AbortError') throw new Error('Таймаут запроса к серверу');
    throw err;
  }finally{
    if(timeoutId) clearTimeout(timeoutId);
  }
}

function statsAssistantDict(){
  if(currentLang==='uz'){
    return {
      kicker:'AI-chat',
      title:'Kafedra bazasi bo‘yicha savol bering',
      hint:'Masalan: “2025-2026 o‘quv yilida nechta maqola chop etilgan?”',
      placeholder:'Kafedra ma’lumotlari bo‘yicha savol yozing',
      send:'So‘rash',
      you:'Siz',
      ai:'AI',
      loading:'Hisoblayapman...',
      noDept:'Avval kafedrani tanlang.',
      toggleKicker:'AI-chat',
      toggleShow:'Savol berish',
      toggleHide:'Yashirish',
      examples:[
        "2025-2026 o‘quv yilida nechta maqola chop etilgan?",
        "2025-2026 o‘quv yilida nechta VAK maqola bor?",
        "2025-2026 o‘quv yilida reja bo‘yicha nechta Scopus/WoS maqola bor?"
      ]
    };
  }
  return {
    kicker:'AI-чат по базе',
    title:'Задайте вопрос по публикациям кафедры',
    hint:'Например: «Сколько статей за 2025-2026 учебный год?»',
    placeholder:'Напишите вопрос по данным кафедры',
    send:'Спросить',
    you:'Вы',
    ai:'AI',
    loading:'Считаю...',
    noDept:'Сначала выберите кафедру.',
    toggleKicker:'AI-ЧАТ',
    toggleShow:'Задать',
    toggleHide:'Скрыть',
    examples:[
      'Сколько статей за 2025-2026 учебный год?',
      'Сколько ВАКовских статей за 2025-2026 учебный год?',
      'Сколько статей Scopus/WoS по плану за 2025-2026 учебный год?'
    ]
  };
}

function renderStatsAssistant(){
  const feed=$('statsAssistantFeed');
  if(!feed)return;
  const d=statsAssistantDict();
  feed.innerHTML=statsAssistantMessages.map(msg=>{
    const roleClass=msg.role==='user'?'is-user':'is-bot';
    const roleLabel=msg.role==='user'?d.you:d.ai;
    const extra=msg.extra?`<div class="statsAssistantMsgExtra">${esc(msg.extra)}</div>`:'';
    return `<div class="statsAssistantMsg ${roleClass}"><div class="statsAssistantMsgMeta">${esc(roleLabel)}</div><div class="statsAssistantMsgText">${esc(msg.text)}</div>${extra}</div>`;
  }).join('');
  feed.scrollTop=feed.scrollHeight;
  saveStatsAssistantMessages();
}

function statsAssistantHistoryStorageKey(){
  const uid=currentUser&&currentUser.id?String(currentUser.id):'anon';
  const did=departmentId?String(departmentId):'0';
  return `IlmiyStat_statsAssistantHistory_${uid}_${did}`;
}

function getStatsAssistantHistoryId(){
  try{ return localStorage.getItem(statsAssistantHistoryStorageKey())||''; }catch(_e){ return ''; }
}

function setStatsAssistantHistoryId(id){
  try{
    const key=statsAssistantHistoryStorageKey();
    if(id) localStorage.setItem(key,String(id));
    else localStorage.removeItem(key);
  }catch(_e){}
}

function statsAssistantMessagesStorageKey(){
  return `${statsAssistantHistoryStorageKey()}_messages`;
}

function saveStatsAssistantMessages(){
  try{
    const compact=statsAssistantMessages.slice(-40).map(msg=>({
      role:msg&&msg.role==='user'?'user':'bot',
      text:String((msg&&msg.text)||''),
      extra:String((msg&&msg.extra)||'')
    })).filter(msg=>msg.text);
    localStorage.setItem(statsAssistantMessagesStorageKey(),JSON.stringify(compact));
  }catch(_e){}
}

function loadStatsAssistantLocalMessages(){
  try{
    const raw=localStorage.getItem(statsAssistantMessagesStorageKey());
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr.map(msg=>({
      role:msg&&msg.role==='user'?'user':'bot',
      text:String((msg&&msg.text)||''),
      extra:String((msg&&msg.extra)||'')
    })).filter(msg=>msg.text):[];
  }catch(_e){ return []; }
}

function clearStatsAssistantLocalMessages(){
  try{ localStorage.removeItem(statsAssistantMessagesStorageKey()); }catch(_e){}
}

function statsAssistantUiStorageKey(){
  return `${statsAssistantHistoryStorageKey()}_ui`;
}

function loadStatsAssistantUiState(){
  try{
    const raw=localStorage.getItem(statsAssistantUiStorageKey());
    const parsed=raw?JSON.parse(raw):null;
    statsAssistantCollapsed=!!(parsed&&parsed.collapsed);
  }catch(_e){
    statsAssistantCollapsed=false;
  }
}

function saveStatsAssistantUiState(){
  try{
    localStorage.setItem(statsAssistantUiStorageKey(),JSON.stringify({collapsed:!!statsAssistantCollapsed}));
  }catch(_e){}
}

function applyStatsAssistantCollapsedState(){
  const card=$('statsAssistantCard');
  if(!card)return;
  card.classList.toggle('is-collapsed',!!statsAssistantCollapsed);
}

function toggleStatsAssistantCollapsed(){
  statsAssistantCollapsed=!statsAssistantCollapsed;
  saveStatsAssistantUiState();
  applyStatsAssistantLanguage();
}

function ensureStatsAssistantControls(){
  const headTop=document.querySelector('#statsAssistantCard .statsAssistantHeadTop');
  const clearBtn=$('statsAssistantClearBtn');
  if(!headTop||!clearBtn)return;
  let actions=headTop.querySelector('.statsAssistantHeadActions');
  if(!actions){
    actions=document.createElement('div');
    actions.className='statsAssistantHeadActions';
    headTop.appendChild(actions);
  }
  if(clearBtn.parentNode!==actions) actions.appendChild(clearBtn);
}

async function loadStatsAssistantHistory(){
  if(!departmentId)return;
  const historyId=getStatsAssistantHistoryId();
  if(!historyId){
    statsAssistantMessages=loadStatsAssistantLocalMessages();
    renderStatsAssistant();
    return;
  }
  try{
    const res=await api(`/assistant/history?departmentId=${encodeURIComponent(String(departmentId))}&historyId=${encodeURIComponent(historyId)}`,{timeoutMs:120000});
    if(res&&res.historyId) setStatsAssistantHistoryId(res.historyId);
    statsAssistantMessages=Array.isArray(res&&res.messages)?res.messages.map(msg=>({
      role:msg&&msg.role==='user'?'user':'bot',
      text:String((msg&&msg.text)||''),
      extra:String((msg&&msg.extra)||'')
    })):[];
    renderStatsAssistant();
  }catch(_e){
    setStatsAssistantHistoryId('');
    statsAssistantMessages=[];
    renderStatsAssistant();
  }
}
function applyStatsAssistantLanguage(){
  const d=statsAssistantDict();
  ensureStatsAssistantControls();
  if($('statsAssistantKicker'))$('statsAssistantKicker').textContent=d.kicker;
  if($('statsAssistantTitle'))$('statsAssistantTitle').textContent=d.title;
  if($('statsAssistantHint'))$('statsAssistantHint').textContent=d.hint;
  if($('statsAssistantInput'))$('statsAssistantInput').placeholder=d.placeholder;
  if($('statsAssistantSendBtn'))$('statsAssistantSendBtn').textContent=statsAssistantBusy?d.loading:d.send;
  if($('statsAssistantClearBtn')){
    const clearText=currentLang==='uz'?'Tozalash':'Стереть';
    $('statsAssistantClearBtn').textContent=clearText;
    $('statsAssistantClearBtn').title=clearText;
  }
  if($('statsAssistantToggleKicker'))$('statsAssistantToggleKicker').textContent=d.toggleKicker;
  if($('statsAssistantToggleBtn')){
    const toggleText=statsAssistantCollapsed?d.toggleShow:d.toggleHide;
    const toggleBtn=$('statsAssistantToggleBtn');
    if($('statsAssistantToggleText'))$('statsAssistantToggleText').textContent=toggleText;
    toggleBtn.title=toggleText;
    toggleBtn.setAttribute('aria-label',toggleText);
    toggleBtn.setAttribute('aria-expanded',statsAssistantCollapsed?'false':'true');
  }
  applyStatsAssistantCollapsedState();
  renderStatsAssistant();
}

function clearStatsAssistantChat(){
  setStatsAssistantHistoryId('');
  clearStatsAssistantLocalMessages();
  statsAssistantMessages=[];
  renderStatsAssistant();
}

async function askStatsAssistant(prefillQuery){
  const input=$('statsAssistantInput');
  const btn=$('statsAssistantSendBtn');
  if(!input||!btn||statsAssistantBusy)return;
  const query=String(prefillQuery!=null?prefillQuery:input.value).trim();
  if(!query)return;
  if(!departmentId){
    notifyUser(statsAssistantDict().noDept);
    return;
  }

  statsAssistantBusy=true;
  const historyForRequest=statsAssistantMessages.slice(-12).map(msg=>({
    role:msg&&msg.role==='user'?'user':'bot',
    text:String((msg&&msg.text)||'')
  })).filter(msg=>msg.text);
  statsAssistantMessages.push({role:'user',text:query});
  applyStatsAssistantLanguage();
  renderStatsAssistant();
  if(prefillQuery==null)input.value='';

  try{
    const res=await api('/assistant/query',{method:'POST',body:JSON.stringify({query,departmentId,messages:historyForRequest}),timeoutMs:120000});
    if(res&&res.historyId) setStatsAssistantHistoryId(res.historyId);
    const extra='';
    const answer=String((res&&res.answer)||'').trim();
    if(!answer) throw new Error('ИИ вернул пустой ответ');
    statsAssistantMessages.push({role:'bot',text:answer,extra});
  }catch(e){
    statsAssistantMessages.push({role:'bot',text:`Ошибка: ${e.message||e}`});
  }finally{
    statsAssistantBusy=false;
    applyStatsAssistantLanguage();
    renderStatsAssistant();
  }
}

function initStatsAssistant(){
  const btn=$('statsAssistantSendBtn');
  const input=$('statsAssistantInput');
  const clearBtn=$('statsAssistantClearBtn');
  const toggleBtn=$('statsAssistantToggleBtn');
  loadStatsAssistantUiState();
  ensureStatsAssistantControls();
  if(!btn||!input)return;
  btn.onclick=()=>askStatsAssistant();
  if(clearBtn)clearBtn.onclick=clearStatsAssistantChat;
  if(toggleBtn)toggleBtn.onclick=toggleStatsAssistantCollapsed;
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      askStatsAssistant();
    }
  });
  applyStatsAssistantLanguage();
  loadStatsAssistantHistory();
}

function logout(){ clearAuthToken(); const base=location.pathname.replace(/\/[^/]*$/, '')||''; location.href=base+'/login.html?mode=user'; }

// Открыть интерактивный отчёт план/факт (помесячно)
window.openPlanFactMonthlyReport = function(){
  const base = location.pathname.replace(/\/[^/]*$/, '') || '';
  try{
    if(!departmentId){
      alert(currentLang==='uz' ? 'Kafedra tanlanmagan.' : 'Кафедра не выбрана.');
      return;
    }
    const yearSel = $('statsYearSel');
    const yearVal = yearSel ? String(yearSel.value || '') : '';
    const url = base + '/report-plan-fact.html?departmentId=' + encodeURIComponent(String(departmentId)) + (yearVal ? ('&academicYear=' + encodeURIComponent(yearVal)) : '');
    // IMPORTANT: noopener is not used because the child window needs opener for token handoff.
    const w = window.open(url, '_blank');
    const token = getAuthToken();
    if(w && token){
      const origin = location.origin;
      const payload = { type: 'ILMIYSTAT_TOKEN', token };
      let tries = 0;
      const timer = setInterval(()=>{
        tries++;
        try{ w.postMessage(payload, origin); }catch(_e){}
        if(tries >= 15){ clearInterval(timer); }
      }, 120);
      window.addEventListener('message', (ev)=>{
        try{
          if(ev.origin !== origin) return;
          if(ev.data && ev.data.type === 'ILMIYSTAT_TOKEN_REQUEST'){
            try{ w.postMessage(payload, origin); }catch(_e){}
          }
        }catch(_e){}
      }, { once: true });
    }
  }catch(_e){
    window.open(base + '/report-plan-fact.html', '_blank', 'noopener');
  }
};
// ===== SELECTS =====
function fillYears(sel, selected){
  if(!sel)return;
  sel.innerHTML='';
  const cur = new Date().getFullYear();
  
  // Собираем уникальные годы из загруженных данных
  const yearsFromData = new Set();
  if(plans && plans.length > 0){
    plans.forEach(p => { if(p.academicYear) yearsFromData.add(p.academicYear); });
  }
  if(works && works.length > 0){
    works.forEach(w => { if(w.academicYear) yearsFromData.add(w.academicYear); });
  }
  
  // Создаём массив всех возможных годов (из данных + стандартный диапазон)
  const allYears = new Set(yearsFromData);
  for(let y=cur+1;y>=2019;y--){
    allYears.add(`${y}-${y+1}`);
  }
  
  // Сортируем годы (новые сначала)
  const sortedYears = Array.from(allYears).sort((a,b)=>{
    const aMatch = a.match(/^(\d{4})-/);
    const bMatch = b.match(/^(\d{4})-/);
    const aYear = aMatch ? +aMatch[1] : 0;
    const bYear = bMatch ? +bMatch[1] : 0;
    return bYear - aYear;
  });
  
  // Заполняем селектор
  for(const year of sortedYears){
    const o=document.createElement('option');
    o.value=year;
    o.textContent=year;
    if(year===selected || (!selected && year===`${cur}-${cur+1}`))o.selected=true;
    sel.appendChild(o);
  }
  const optionValues=Array.from(sel.options).map(o=>String(o.value||''));
  if(optionValues.length){
    const selectedValue=String(selected||'');
    if(selectedValue && optionValues.includes(selectedValue)){
      sel.value=selectedValue;
    }else if(!sel.value || !optionValues.includes(String(sel.value||''))){
      const fallback=optionValues.includes(`${cur}-${cur+1}`) ? `${cur}-${cur+1}` : optionValues[0];
      sel.value=fallback;
    }
  }
}
function fillTeacherSelect(sel, addAll=false, selectedId=null){
  if(!sel)return;
  sel.innerHTML='';
  if(addAll){ const o=document.createElement('option'); o.value=''; o.textContent=String(t('ui.common.allTeachers')); sel.appendChild(o); }
  teachers.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.fullName; if(selectedId&&t.id==selectedId)o.selected=true; sel.appendChild(o); });
}
function fillIndicatorSelect(sel, addAll=false){
  if(!sel)return;
  sel.innerHTML='';
  if(addAll){ const o=document.createElement('option'); o.value=''; o.textContent=String(t('ui.common.all')); sel.appendChild(o); }
  INDICATORS.forEach(code=>{ const o=document.createElement('option'); o.value=code; o.textContent=indName(code); sel.appendChild(o); });
}
function fillArticleTypeSelect(sel,addAll){
  if(!sel)return;
  sel.innerHTML=addAll?`<option value="">${esc(t('ui.common.all'))}</option>`:`<option value="">${esc(t('ui.common.choose'))}</option>`;
  ARTICLE_TYPES.forEach(code=>{ const o=document.createElement('option'); o.value=code; o.textContent=artName(code); sel.appendChild(o); });
}
function fillEducationDirectionDatalist(inputId, listId){
  const input=$(inputId), list=$(listId);
  if(!input||!list||!window.EDUCATION_DIRECTIONS)return;
  list.innerHTML='';
  window.EDUCATION_DIRECTIONS.forEach(item=>{
    const val=`${item.code} - ${item.name}`;
    const o=document.createElement('option'); o.value=val; list.appendChild(o);
  });
}
function fillMonthSelect(sel, academicOrder=false){
  if(!sel)return;
  sel.innerHTML=`<option value="">${esc(t('ui.common.choose'))}</option>`;
  const order = academicOrder ? ACADEMIC_MONTH_ORDER : [1,2,3,4,5,6,7,8,9,10,11,12];
  order.forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=monthText(m); sel.appendChild(o); });
}
function enableEasyMultiSelect(sel){
  if(!sel || sel.dataset.easyMultiBound==='1')return;
  sel.dataset.easyMultiBound='1';
  sel.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    const target=e.target;
    if(!target || target.tagName!=='OPTION')return;
    if(e.ctrlKey || e.metaKey || e.shiftKey)return; // keep native modifiers behavior
    e.preventDefault();
    target.selected=!target.selected;
    sel.focus();
    sel.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
function fillXorijiyTilSelects(){
  const mtSel=$('wmXorijiyTilMashgulotTuri'), xtSel=$('wmXorijiyTilTil');
  if(!mtSel||!xtSel)return;
  const mtVal=mtSel.value, xtVal=xtSel.value;
  mtSel.innerHTML=`<option value="">${esc(t('ui.common.choose'))}</option>`+Object.entries(MASHGULOT_TURI_NAMES).map(([code,labels])=>`<option value="${esc(code)}">${esc(currentLang==='uz'?labels.uz:labels.ru)}</option>`).join('');
  xtSel.innerHTML=`<option value="">${esc(t('ui.common.choose'))}</option>`+Object.entries(XORIJIY_TIL_NAMES).map(([code,labels])=>`<option value="${esc(code)}">${esc(currentLang==='uz'?labels.uz:labels.ru)}</option>`).join('');
  mtSel.value=mtVal; xtSel.value=xtVal;
}

// ===== SIDEBAR =====
const SIDEBAR_STATE_KEY = 'IlmiyStat_sidebar_collapsed';
function toggleMainNav(){
  const sidebar = $('mainNavSidebar');
  const main = $('mainContent');
  const overlay = $('mainContentOverlay');
  const toggle = $('mainNavToggle');
  if(!sidebar || !main) return;
  const isMobile = window.matchMedia('(max-width:960px)').matches;
  if(isMobile){
    sidebar.classList.toggle('open');
    toggle.setAttribute('aria-label', sidebar.classList.contains('open') ? 'Закрыть меню' : 'Открыть меню');
  } else {
    const collapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    main.classList.toggle('sidebar-collapsed', collapsed);
    try{ localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? '1' : '0'); }catch(_e){}
    toggle.setAttribute('aria-label', collapsed ? 'Открыть меню' : 'Закрыть меню');
  }
}
function initMainNavSidebar(){
  const sidebar = $('mainNavSidebar');
  const main = $('mainContent');
  const overlay = $('mainContentOverlay');
  if(!sidebar || !main) return;
  const isMobile = window.matchMedia('(max-width:960px)').matches;
  if(isMobile){
    sidebar.classList.remove('collapsed','open');
  } else {
    sidebar.classList.remove('open');
    try{
      const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
      const collapsed = stored === '1';
      sidebar.classList.toggle('collapsed', collapsed);
      main.classList.toggle('sidebar-collapsed', collapsed);
    }catch(_e){}
  }
}
function closeMainNavIfMobile(){
  const sidebar = $('mainNavSidebar');
  const overlay = $('mainContentOverlay');
  if(!sidebar) return;
  if(window.matchMedia('(max-width:960px)').matches && sidebar.classList.contains('open')){
    sidebar.classList.remove('open');
  }
}

// ===== TABS =====
const TAB_MAP = { 'tab-notifications':'notifications', 'tab-teachers':'teachers', 'tab-plan':'plan', 'tab-works':'works', 'tab-stats':'stats', 'tab-backup':'backup' };
function initTabs(){
  document.querySelectorAll('.tabbtn').forEach(tab=>{
    const tabKey = TAB_MAP[tab.id];
    if(tabKey && !canViewTab(tabKey)){ tab.style.display='none'; return; }
    tab.onclick=()=>{
      document.querySelectorAll('.tabbtn').forEach(t=>t.setAttribute('aria-selected','false'));
      document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
      tab.setAttribute('aria-selected','true');
      (function(){var e=$(tab.getAttribute('aria-controls'));if(e)e.classList.add('active');})();
      if(tabKey==='notifications')loadNotifications();
      if(tabKey==='stats'){
        try{
          const missingBlocks=
            !$('statsArticleTypeBlock')||!$('statsLiteratureTypeBlock')||
            !$('statsArticleTypeChecks')||!$('statsLiteratureTypeChecks');
          const emptyGroups=
            !!$('statsArticleTypeChecks')&&getOwnGroupCheckboxes('statsArticleTypeChecks').length===0||
            !!$('statsLiteratureTypeChecks')&&getOwnGroupCheckboxes('statsLiteratureTypeChecks').length===0;
          if(missingBlocks||emptyGroups){
            initStatsTypeCheckboxes();
          }else{
            syncStatsTypeUi();
          }
        }catch(_e){}
      }
      requestAnimationFrame(()=>{ updateWorksStickyScrollbar(); updateStatsStickyScrollbar(); });
      saveUIState();
      updateSidebarVisibility();
      closeMainNavIfMobile();
    };
  });
  // Активируем первую видимую вкладку, если текущая скрыта
  const activeTab = document.querySelector('.tabbtn[aria-selected="true"]');
  if(activeTab && TAB_MAP[activeTab.id] && !canViewTab(TAB_MAP[activeTab.id])){
    const firstVisible = document.querySelector('.tabbtn:not([style*="display: none"])');
    if(firstVisible){ firstVisible.click(); }
  }
}

// ===== NOTIFICATIONS =====
const CATEGORY_LABELS = { article_submission: 'Приём статей', other: 'Прочее' };
const SENDER_LABELS = { admin: 'Администратор', ministry: 'Министерство' };
const SENDER_LABELS_UZ = { admin: 'Administrator', ministry: 'Vazirlik' };
function getNotificationSenderType(n){
  const a=n.author||{};
  if((a.accessLevel||'')==='ministry')return 'ministry';
  if((a.role||'')==='admin')return 'admin';
  return '';
}
let notificationInstitutes = [];
let notificationListCache = [];

let notificationUnreadCount = 0;
async function updateNotificationBadge(){
  try{
    const r=await api('/notifications/unread-count');
    const c=Number(r.unreadCount||0);
    notificationUnreadCount=c;
    const badge=$('notificationBadge');
    if(badge){
      badge.textContent=String(c);
      badge.style.display=c>0?'inline-flex':'none';
    }
  }catch(_e){}
}
function renderNotificationsList(list){
  const listEl=$('notificationsList'); if(!listEl)return;
  const filterVal=($('notificationSenderFilter')&&$('notificationSenderFilter').value)||'';
  const filtered=!filterVal?list:list.filter(n=>getNotificationSenderType(n)===filterVal);
  if(!filtered.length){ listEl.innerHTML='<p class="muted">Нет уведомлений</p>'; return; }
  const senderLbl=currentLang==='uz'?SENDER_LABELS_UZ:SENDER_LABELS;
  listEl.innerHTML=filtered.map(n=>{
    const author=n.author||{}; const authorName=author.username||'-';
    const senderType=getNotificationSenderType(n);
    const senderName=senderType?(senderLbl[senderType]||authorName):authorName;
    const catLabel=(currentLang==='uz'?(n.category==='article_submission'?'Maqolalar qabul qilish':'Boshqa'):(CATEGORY_LABELS[n.category]||n.category));
    const date=n.createdAt?new Date(n.createdAt).toLocaleString('ru-RU'):'-';
    const body=n.body?`<div class="notification-body muted" style="margin-top:8px;white-space:pre-wrap">${esc(n.body)}</div>`:'';
    const readClass=n.isRead?'notification-read':'notification-unread';
    return `<div class="notification-item card ${readClass}" style="margin-bottom:12px;padding:16px;cursor:pointer" data-notification-id="${n.id}" data-read="${n.isRead}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <strong>${esc(n.title||'')}</strong>
        <span class="muted small">${catLabel} · ${esc(senderName)} · ${date}</span>
      </div>${body}</div>`;
  }).join('');
  listEl.querySelectorAll('.notification-item').forEach(el=>{
    el.onclick=async function(){
      const id=parseInt(el.getAttribute('data-notification-id'),10);
      const isRead=el.getAttribute('data-read')==='true';
      if(!id||isRead)return;
      try{
        await api(`/notifications/${id}/read`,{method:'POST'});
        el.classList.remove('notification-unread');
        el.classList.add('notification-read');
        el.setAttribute('data-read','true');
        const nn=notificationListCache.find(x=>x.id===id); if(nn)nn.isRead=true;
        await updateNotificationBadge();
      }catch(_e){}
    };
  });
}
async function loadNotifications(){
  const listEl=$('notificationsList'); if(!listEl)return;
  try{
    const list=await api('/notifications');
    notificationListCache=list||[];
    await updateNotificationBadge();
    if(!list||!list.length){ listEl.innerHTML='<p class="muted">Нет уведомлений</p>'; return; }
    const hasUnread=list.some(n=>!n.isRead);
    const markAllBtn=$('notificationMarkAllReadBtn');
    if(markAllBtn){ markAllBtn.style.display=hasUnread?'':'none'; }
    renderNotificationsList(list);
  }catch(e){
    listEl.innerHTML='<p class="muted">Ошибка загрузки уведомлений</p>';
  }
}
async function markAllNotificationsRead(){
  try{
    await api('/notifications/read-all',{method:'POST'});
    await loadNotifications();
    toast(String(t('ui.toasts.saved')||'Сохранено'));
  }catch(e){ toast('Ошибка: '+e.message); }
}

function openNotificationModal(){
  const modal=$('notificationModal'); if(!modal)return;
  $('notificationCategory').value='other';
  $('notificationTitle').value='';
  $('notificationBody').value='';
  $('notificationAllInstitutes').checked=true;
  $('notificationInstituteChecks').style.display='none';
  fillNotificationInstituteChecks();
  modal.classList.remove('hidden');
}
function closeNotificationModal(){
  const modal=$('notificationModal'); if(modal)modal.classList.add('hidden');
}
async function fillNotificationInstituteChecks(){
  const container=$('notificationInstituteChecks'); if(!container)return;
  try{
    notificationInstitutes=await api('/institutes');
    const active=notificationInstitutes.filter(i=>i.isActive!==false);
    container.innerHTML=active.map(i=>`<label class="checkItem"><input type="checkbox" name="notificationInst" value="${i.id}"><span>${esc(currentLang==='uz'&&i.nameUz?i.nameUz:i.name)}</span></label>`).join('');
  }catch(e){
    container.innerHTML='<p class="muted small">Ошибка загрузки институтов</p>';
  }
}
if($('notificationAllInstitutes')){
  $('notificationAllInstitutes').onchange=function(){
    const show=$('notificationInstituteChecks');
    if(show)show.style.display=this.checked?'none':'block';
  };
}
if($('notificationCreateBtn')){
  $('notificationCreateBtn').onclick=openNotificationModal;
}
if($('notificationMarkAllReadBtn')){
  $('notificationMarkAllReadBtn').onclick=markAllNotificationsRead;
}
if($('notificationSenderFilter')){
  $('notificationSenderFilter').onchange=function(){
    if(notificationListCache.length)renderNotificationsList(notificationListCache);
  };
}
if($('notificationForm')){
  $('notificationForm').onsubmit=async function(e){
    e.preventDefault();
    const allCb=$('notificationAllInstitutes');
    let targetInstituteIds=null;
    if(!allCb||!allCb.checked){
      const checked=Array.from(document.querySelectorAll('input[name="notificationInst"]:checked')).map(c=>Number(c.value)).filter(n=>n>0);
      if(checked.length>0)targetInstituteIds=checked;
    }
    const category=$('notificationCategory').value;
    const title=($('notificationTitle').value||'').trim();
    const body=($('notificationBody').value||'').trim();
    if(!title){ toast('Введите заголовок'); return; }
    try{
      await api('/notifications',{method:'POST',body:JSON.stringify({category,title,body,targetInstituteIds})});
      toast(String(t('ui.toasts.saved')||'Сохранено'));
      closeNotificationModal();
      loadNotifications();
    }catch(err){
      toast('Ошибка: '+err.message);
    }
  };
}

// ===== TEACHERS =====
async function loadTeachers(){
  try{ teachers = await api(`/departments/${departmentId}/teachers`); renderTeachers(); fillAllTeacherSelects(); }
  catch(e){ toast('Ошибка: '+e.message); }
}
function fillAllTeacherSelects(){
  fillTeacherSelect($('planTeacherSel'),true);
  fillTeacherSelect($('workTeacherSel'),true);
  fillStatsTeacherSelect();
}
function fillStatsTeacherSelect(){
  const sel=$('statsTeacherSel'); if(!sel)return;
  const arr=(currentUser&&(currentUser.accessLevel||'')==='ministry'&&statsDeptIdsForMinistry.length>0)?statsTeachersForMinistry:teachers;
  sel.innerHTML='';
  const o0=document.createElement('option'); o0.value=''; o0.textContent=String(t('ui.common.allTeachers')); sel.appendChild(o0);
  arr.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.fullName; sel.appendChild(o); });
}
function ensureTeacherDemoLimitNotice(){
  const intro=document.querySelector('#panel-teachers .card .muted');
  if(!intro)return null;
  let notice=$('teacherDemoLimitNotice');
  if(notice)return notice;
  notice=document.createElement('div');
  notice.id='teacherDemoLimitNotice';
  notice.className='muted hidden';
  notice.style.margin='0 0 10px';
  notice.style.color='#8a5200';
  notice.style.fontWeight='600';
  intro.insertAdjacentElement('afterend',notice);
  return notice;
}
function isDemoDepartmentCabinet(){
  const username=String((currentUser&&currentUser.username)||'').trim().toLowerCase();
  const deptNameRu=String((departmentData&&departmentData.name)||'').trim().toLowerCase();
  const deptNameUz=String((departmentData&&departmentData.nameUz)||'').trim().toLowerCase();
  return username==='demo' || deptNameRu.includes('демо') || deptNameRu.includes('demo') || deptNameUz.includes('demo');
}
function isDemoTeacherLimitReached(){
  return isDemoDepartmentCabinet() && teachers.length >= DEMO_TEACHER_LIMIT;
}
function getDemoTeacherLimitMessage(reached){
  return reached
    ? (currentLang==='uz'
      ? `Demo versiyada ko‘pi bilan ${DEMO_TEACHER_LIMIT} ta pedagog qo‘shish mumkin. Limitga yetdingiz.`
      : `В демо-версии можно добавить не более ${DEMO_TEACHER_LIMIT} педагогов. Лимит достигнут.`)
    : (currentLang==='uz'
      ? `Demo versiyada ko‘pi bilan ${DEMO_TEACHER_LIMIT} ta pedagog qo‘shish mumkin.`
      : `В демо-версии можно добавить не более ${DEMO_TEACHER_LIMIT} педагогов.`);
}
function updateDemoTeacherLimitUI(){
  const notice=ensureTeacherDemoLimitNotice();
  const addBtn=$('teacherAddBtn');
  if(!isDemoDepartmentCabinet()){
    if(notice)notice.classList.add('hidden');
    if(addBtn){
      addBtn.disabled=false;
      addBtn.removeAttribute('title');
    }
    return;
  }
  const limitReached=isDemoTeacherLimitReached();
  if(notice){
    notice.textContent=getDemoTeacherLimitMessage(limitReached);
    notice.classList.remove('hidden');
  }
  if(addBtn){
    addBtn.disabled=limitReached;
    addBtn.title=getDemoTeacherLimitMessage(limitReached);
  }
}
function renderTeachers(){
  if($('teacherCount'))$('teacherCount').textContent=`(${teachers.length})`;
  const tb=$('teachersTbody'); if(!tb)return; tb.innerHTML='';
  const editAllowed = canEditTab('teachers');
  updateDemoTeacherLimitUI();
  if($('teacherAddBtn'))$('teacherAddBtn').style.display=editAllowed?'':'none';
  if(!teachers.length){ tb.innerHTML=`<tr><td colspan="3" class="muted">${esc(t('ui.common.noTeachers')||'')}</td></tr>`; return; }
  teachers.forEach(teacher=>{
    const tr=document.createElement('tr');
    const actionsHtml = editAllowed ? `<div class="actions"><button class="btn secondary small" onclick="editTeacher(${teacher.id})">${esc(t('ui.actions.editShort'))}</button><button class="btn danger small" onclick="delTeacher(${teacher.id})">${esc(t('ui.actions.delete'))}</button></div>` : '';
    tr.innerHTML=`<td>${teacher.id}</td><td>${esc(teacher.fullName)}</td><td>${actionsHtml}</td>`;
    tb.appendChild(tr);
  });
}
window.editTeacher=async id=>{ const tt=teachers.find(x=>x.id===id); if(!tt)return; editingTeacherId=id; $('tmFullName').value=tt.fullName||''; try{ const raw=Array.isArray(tt.profileLinks)?tt.profileLinks:(tt.profileLinks?JSON.parse(tt.profileLinks):[]); teacherProfileLinksArray=(Array.isArray(raw)?raw:[]).map(p=>({platform:['GOOGLE_SCHOLAR','SCOPUS','RESEARCH_GATE','WEB_OF_SCIENCE','RINC','LINKEDIN','ORCID','OTHER'].includes(p.platform)?p.platform:'OTHER',name:p.name||'',url:p.url||''})); }catch(_){teacherProfileLinksArray=tt.profileLinks?[{platform:'OTHER',name:'',url:String(tt.profileLinks)}]:[];} renderTeacherProfileLinksList(); $('teacherModalTitle').textContent=t('ui.actions.editShort')||'Редактировать'; $('teacherModal').classList.remove('hidden'); };
window.closeTeacherModal=()=>{ $('teacherModal').classList.add('hidden'); editingTeacherId=null; };
if($('tmSaveBtn'))$('tmSaveBtn').onclick=async()=>{
  if(!editingTeacherId)return;
  const fullName=($('tmFullName')&&$('tmFullName').value)?$('tmFullName').value.trim():'';
  if(!fullName)return alert(String(t('ui.alerts.emptyName')));
  const profileLinksJson=teacherProfileLinksArray.length?JSON.stringify(teacherProfileLinksArray.map(p=>({platform:p.platform||'OTHER',name:p.platform==='OTHER'?p.name:undefined,url:(p.url||'').trim()})).filter(p=>p.url)):null;
  try{
    await api(`/departments/${departmentId}/teachers/${editingTeacherId}`,{method:'PUT',body:JSON.stringify({fullName,profileLinks:profileLinksJson})});
    toast(String(t('ui.toasts.saved')));
    closeTeacherModal();
    await loadTeachers();
    fillAllTeacherSelects();
  }catch(e){toast('Ошибка: '+e.message);}
};
window.delTeacher=async id=>{ if(!confirm(String(t('ui.dialogs.confirmDeleteTeacher'))))return; try{ await api(`/departments/${departmentId}/teachers/${id}`,{method:'DELETE'}); toast(String(t('ui.toasts.deleted'))); await loadTeachers(); await loadPlans(); await loadWorks(); }catch(e){toast('Ошибка: '+e.message);} };
if($('teacherAddBtn'))$('teacherAddBtn').onclick=async()=>{
  const n=($('teacherFullName')&&$('teacherFullName').value)?$('teacherFullName').value.trim():'';
  if(!n)return alert(String(t('ui.alerts.enterName')));
  if(isDemoTeacherLimitReached()){
    const msg=getDemoTeacherLimitMessage(true);
    updateDemoTeacherLimitUI();
    toast(msg);
    return;
  }
  try{
    await api(`/departments/${departmentId}/teachers`,{method:'POST',body:JSON.stringify({fullName:n})});
    if($('teacherFullName'))$('teacherFullName').value='';
    toast(String(t('ui.toasts.added')));
    await loadTeachers();
  }catch(e){toast('Ошибка: '+e.message);}
};
if($('teachersRefreshBtn'))$('teachersRefreshBtn').onclick=()=>loadTeachers();

// ===== PLANS =====
function initPlanFilters(){
  // Инициализация фильтра месяца
  const monthSel=$('planFilterMonth');
  if(monthSel){
    const prev=String(monthSel.value||'');
    monthSel.innerHTML=`<option value="">${esc(t('ui.common.allMonths'))}</option>`;
    ACADEMIC_MONTH_ORDER.forEach(m=>{
      const o=document.createElement('option'); o.value=String(m); o.textContent=monthText(m);
      monthSel.appendChild(o);
    });
    monthSel.value=prev;
  }
  // Инициализация фильтра типа работы
  const indSel=$('planFilterIndicator');
  if(indSel){
    const prev=String(indSel.value||'');
    indSel.innerHTML=`<option value="">${esc(t('ui.common.all'))}</option>`;
    INDICATORS.forEach(code=>{
      const o=document.createElement('option'); o.value=code; o.textContent=indName(code);
      indSel.appendChild(o);
    });
    indSel.value=prev;
  }
  // Инициализация фильтра типа статьи
  const artSel=$('planFilterArticleType');
  if(artSel){
    const prev=String(artSel.value||'');
    artSel.innerHTML=`<option value="">${esc(t('ui.common.all'))}</option>`;
    ARTICLE_TYPES.forEach(code=>{
      const o=document.createElement('option'); o.value=code; o.textContent=artName(code);
      artSel.appendChild(o);
    });
    artSel.value=prev;
  }
}

// Обновить все планы (для модального окна работ)
async function refreshAllPlans(){
  try{
    allPlans = await api(`/departments/${departmentId}/plan-items`);
  }catch(e){
    console.warn('Ошибка загрузки всех планов:', e.message);
  }
}

async function loadPlans(){
  initPlanFilters();
  const year=$('planYearSel').value, tid=$('planTeacherSel').value;
  
  // Загружаем работы для того же года (нужны для расчёта статусов)
  try{
    const worksUrl=year?`/departments/${departmentId}/scientific-works?academicYear=${year}`:`/departments/${departmentId}/scientific-works`;
    works = await api(worksUrl);
  }catch(e){
    console.warn('Не удалось загрузить работы для расчёта статусов:', e.message);
  }
  
  // Обновляем все планы (для модального окна работ)
  await refreshAllPlans();
  
  // Загружаем планы с фильтрами для отображения в таблице
  let url=`/departments/${departmentId}/plan-items`;
  if(year) url+=`?academicYear=${year}`;
  if(tid) url+=(year?`&`:`?`)+`teacherId=${tid}`;
  try{ 
    plans = await api(url); 
    // Обновляем годы после загрузки планов
    fillYears($('planYearSel'), year);
    fillYears($('workYearSel'), $('workYearSel').value);
    fillYears($('statsYearSel'), $('statsYearSel').value);
    renderPlans();
  }catch(e){toast('Ошибка: '+e.message);}
}

function isH1Month(m){ return [8,9,10,11,12].includes(Number(m)); }
function isH2Month(m){ return [1,2,3,4,5,6,7].includes(Number(m)); }

function getWorkPdfs(w){
  const arr=Array.isArray(w.uploadedPdfs)?w.uploadedPdfs:[];
  if(arr.length)return arr;
  if(w.uploadedFile)return [{id:'legacy',file:w.uploadedFile,name:w.originalFileName||w.uploadedFile}];
  return [];
}
function hasLinkEvidence(value){
  const s=String(value||'').trim();
  return /^https?:\/\//i.test(s);
}
// Для статистики и отчётов статус "выполнено" определяется только completionStatus.
// Проверка наличия файла относится к вводу/валидации работ, а не к аналитике.
function isDoneWork(w){
  return String(w&&w.completionStatus||'').trim().toUpperCase()==='DONE';
}

async function computePlanStatus(p, filterByTeacherId){
  // Сначала фильтруем только работы "по плану" (source === 'PLAN')
  let relevant = works.filter(w => w.source === 'PLAN' && w.indicator === p.indicator);
  
  // Отладка: показываем сколько работ с нужным source и indicator
  console.log(`План ID=${p.id}: indicator=${p.indicator}, найдено работ (source=PLAN, indicator совпадает): ${relevant.length}`);
  
  // Проверяем педагога (учитываем соавторов)
  const pTeacherId = Number(p.teacherId||0);
  if(pTeacherId){
    relevant = relevant.filter(w=>{
      const wTeacherId = Number(w.teacherId||0);
      const coAuthors = Array.isArray(w.coAuthorTeacherIds) ? w.coAuthorTeacherIds.map(Number) : [];
      return wTeacherId === pTeacherId || coAuthors.includes(pTeacherId);
    });
    console.log(`  После фильтра по педагогу (${pTeacherId}): ${relevant.length}`);
  }else if(filterByTeacherId){
    const ftid = Number(filterByTeacherId||0);
    if(ftid){
      relevant = relevant.filter(w=>{
        const wTeacherId = Number(w.teacherId||0);
        const coAuthors = Array.isArray(w.coAuthorTeacherIds) ? w.coAuthorTeacherIds.map(Number) : [];
        return wTeacherId === ftid || coAuthors.includes(ftid);
      });
      console.log(`  После фильтра по выбранному педагогу (${ftid}): ${relevant.length}`);
    }
  }
  
  // Проверяем учебный год
  if(p.academicYear){
    relevant = relevant.filter(w => w.academicYear === p.academicYear);
    console.log(`  После фильтра по году (${p.academicYear}): ${relevant.length}`);
  }
  
  // Для статей проверяем тип статьи (с нормализацией)
  if(p.indicator === 'ARTICLE_TYPE'){
    const pType = normalizeArticleType(p.articleType||'');
    relevant = relevant.filter(w => normalizeArticleType(w.articleType||'') === pType);
    console.log(`  После фильтра по типу статьи (${p.articleType}): ${relevant.length}`);
  }
  
  // Проверяем месяц
  const pm = Number(p.plannedMonth||0);
  if(pm){
    relevant = relevant.filter(w => {
      const wPlanned = Number(w.plannedMonth||0);
      const wMonth = Number(w.month||0);
      return wPlanned ? wPlanned === pm : wMonth === pm;
    });
    console.log(`  После фильтра по месяцу (${pm}): ${relevant.length}`);
  }
  
  // Отладка: показываем финальный результат
  if(relevant.length > 0){
    relevant.forEach(w => {
      console.log(`    Работа ID=${w.id}: status=${w.completionStatus}, fileUrl=${w.fileUrl?'есть':'НЕТ'}, isDone=${isDoneWork(w)}`);
    });
  } else {
    console.log(`  Нет подходящих работ для плана ID=${p.id}`);
  }
  
  // Цитаты - суммируем
  if(p.indicator === 'CITATIONS'){
    const target = Number(p.citationsCount||0);
    let sumDone = 0;
    for(const w of relevant) if(isDoneWork(w)) sumDone += Number(w.citationsCount||0);
    
    if(target > 0){
      if(sumDone >= target) return 'DONE';
      if(sumDone > 0) return 'PARTIAL';
      if(relevant.some(w => w.completionStatus === 'PARTIAL')) return 'PARTIAL';
      return 'NOT_DONE';
    }
    
    if(relevant.some(w => isDoneWork(w))) return 'DONE';
    if(relevant.some(w => w.completionStatus === 'PARTIAL')) return 'PARTIAL';
    return 'NOT_DONE';
  }
  
  // Патенты - считаем количество
  if(p.indicator === 'PATENTS'){
    const target = Number(p.patentsCount||0);
    let doneCount = 0;
    for(const w of relevant) if(isDoneWork(w)) doneCount++;
    
    if(target > 0){
      if(doneCount >= target) return 'DONE';
      if(doneCount > 0) return 'PARTIAL';
      if(relevant.some(w => w.completionStatus === 'PARTIAL')) return 'PARTIAL';
      return 'NOT_DONE';
    }
    
    if(relevant.some(w => isDoneWork(w))) return 'DONE';
    if(relevant.some(w => w.completionStatus === 'PARTIAL')) return 'PARTIAL';
    return 'NOT_DONE';
  }
  
  // Остальные типы работ
  if(relevant.some(w => isDoneWork(w))) return 'DONE';
  if(relevant.some(w => w.completionStatus === 'PARTIAL')) return 'PARTIAL';
  return 'NOT_DONE';
}

// Получить инициалы из полного имени (Фамилия И.О.)
function getInitials(fullName){
  if(!fullName)return '';
  const parts=fullName.trim().split(/\s+/);
  if(parts.length===1)return parts[0];
  return parts[0]+' '+parts.slice(1).map(p=>p[0]+'.').join('');
}

// Индекс месяца в учебном году (авг=0, сен=1, ..., июл=11)
function academicMonthIndex(m){
  const order=[8,9,10,11,12,1,2,3,4,5,6,7];
  return order.indexOf(Number(m));
}

async function getFilteredPlansForCurrentFilters(){
  const fDone=$('planFilterDone').checked, fNot=$('planFilterNotDone').checked;
  const fH1=$('planFilterH1').checked, fH2=$('planFilterH2').checked;
  const fMonth=+$('planFilterMonth').value||0;
  const fIndicator=$('planFilterIndicator').value;
  const fArticleType=$('planFilterArticleType').value;
  const selectedTeacher=$('planTeacherSel').value;
  const selectedTeacherId=Number(selectedTeacher||0);
  const isAllTeachers=!selectedTeacher;

  if(!fH1 && !fH2){
    return { filtered: [], isAllTeachers, reason: 'needHalfYear' };
  }

  const filtered=[];
  for(const p of plans){
    const st = await computePlanStatus(p, selectedTeacherId||null);
    p._status = st;
    const pm=Number(p.plannedMonth||0);

    if(pm && !((fH1&&isH1Month(pm))||(fH2&&isH2Month(pm)))) continue;
    if(fMonth && pm !== fMonth) continue;
    if(fIndicator && p.indicator !== fIndicator) continue;
    if(fArticleType && p.articleType !== fArticleType) continue;
    if(st==='DONE'&&!fDone) continue;
    if((st==='NOT_DONE'||st==='PARTIAL')&&!fNot) continue;

    filtered.push(p);
  }

  if(isAllTeachers){
    filtered.sort((a,b)=>{
      const ia=getInitials((a.teacher&&a.teacher.fullName)||'');
      const ib=getInitials((b.teacher&&b.teacher.fullName)||'');
      const c1=ia.localeCompare(ib,'ru');
      if(c1)return c1;
      const c2=academicMonthIndex(a.plannedMonth)-academicMonthIndex(b.plannedMonth);
      if(c2)return c2;
      const c3=indName(a.indicator).localeCompare(indName(b.indicator),'ru');
      if(c3)return c3;
      return a.id-b.id;
    });
  }else{
    filtered.sort((a,b)=>a.id-b.id);
  }

  return { filtered, isAllTeachers, reason: null };
}

async function renderPlans(){
  const { filtered, isAllTeachers, reason } = await getFilteredPlansForCurrentFilters();

  if(reason==='needHalfYear'){
    $('planCount').textContent=`(0 из ${plans.length})`;
    $('planTbody').innerHTML=`<tr><td colspan="10" class="muted">${esc(String(t('ui.plan.needHalfYear')))}</td></tr>`;
    return;
  }

  $('planCount').textContent=`(${filtered.length} из ${plans.length})`;
  const tb=$('planTbody'); tb.innerHTML='';

  if(isAllTeachers && filtered.length>0){
    const hint=document.createElement('tr');
    hint.innerHTML=`<td colspan="10" class="muted small" style="background:#f8f9fa">${esc(String(t('ui.plan.allTeachersHint')))}</td>`;
    tb.appendChild(hint);
  }

  if(!filtered.length){
    const msg = t('ui.plan.noPlansByFilters');
    const text = (msg && String(msg).trim())
      ? String(msg)
      : (currentLang==='uz' ? 'Tanlangan filtrlarga mos reja yo‘q.' : 'Нет планов по выбранным фильтрам.');
    tb.innerHTML=`<tr><td colspan="10" class="muted">${esc(text)}</td></tr>`;
    return;
  }

  const sr = currentUser ? Number(currentUser.scienceRole) : null;
  const canCreatePlanRole = (currentUser && (currentUser.role==='admin' || sr===1)) && canEditTab('plan');
  const canDeletePlanRole = canEditTab('plan');
  const canApprovePlanRole = currentUser && (currentUser.role==='admin' || sr===2);
  const canConfirmByDept = currentUser && (currentUser.role==='admin' || sr===1);
  const draftCount = filtered.filter(p=>(p.approvalStatus||'draft')==='draft').length;
  const approvedCount = filtered.filter(p=>{const s=p.approvalStatus||'draft'; return s==='approved'||s==='approved_by_institute';}).length;
  const planAddBtn=$('planAddOpenBtn');
  const planApproveAllBtn=$('planApproveAllBtn');
  const planUnapproveAllBtn=$('planUnapproveAllBtn');
  if(planAddBtn)planAddBtn.style.display=canCreatePlanRole?'':'none';
  if(planApproveAllBtn){
    planApproveAllBtn.style.display=(canApprovePlanRole && draftCount>0)?'':'none';
    planApproveAllBtn.textContent=String(t('ui.plan.approveAllBtn'))+(draftCount>0?` (${draftCount})`:'');
  }
  if(planUnapproveAllBtn){
    planUnapproveAllBtn.style.display=(canApprovePlanRole && approvedCount>0)?'':'none';
    planUnapproveAllBtn.textContent=String(t('ui.plan.unapproveAllBtn'))+(approvedCount>0?` (${approvedCount})`:'');
  }
  filtered.forEach(p=>{
    const tr=document.createElement('tr');
    const statusPill = p._status==='DONE'?`<span class="pill done">${esc(t('ui.stats.statusDone'))}</span>`:p._status==='PARTIAL'?`<span class="pill partial">${esc(t('ui.stats.statusPartial'))}</span>`:`<span class="pill not">${esc(t('ui.stats.statusNotDone'))}</span>`;
    const approvalStatus = p.approvalStatus||'draft';
    const lastDate = getLastApprovalChangeDate(p);
    const dateStr = lastDate ? formatApprovalDate(lastDate) : '';
    let approvalPill = '';
    if(approvalStatus==='draft'){
      approvalPill = `<span class="pill not">${esc(t('ui.plan.approvalDraft'))}</span>`;
    }else if(approvalStatus==='approved_by_institute'){
      approvalPill = `<span class="pill partial" title="${(p.approvedByUser&&p.approvedByUser.username)?esc(p.approvedByUser.username):''}">${esc(t('ui.plan.approvalByInstitute'))}</span><div class="small muted">${esc(t('ui.plan.approvalAwaitDept'))}</div>${dateStr?`<div class="small muted">${esc(dateStr)}</div>`:''}`;
    }else if(approvalStatus==='approved'){
      approvalPill = `<span class="pill approved" title="${(p.approvedConfirmedByUser&&p.approvedConfirmedByUser.username)?esc(p.approvedConfirmedByUser.username):''}">${esc(t('ui.plan.approvalApproved'))}</span>${dateStr?`<div class="small muted">${esc(dateStr)}</div>`:''}`;
    }else if(approvalStatus==='unapproval_requested'){
      approvalPill = `<span class="pill partial" title="${(p.unapprovalRequestedByUser&&p.unapprovalRequestedByUser.username)?esc(p.unapprovalRequestedByUser.username):''}">${esc(t('ui.plan.approvalUnapprovalRequested'))}</span><div class="small muted">${esc(t('ui.plan.approvalAwaitDept'))}</div>${dateStr?`<div class="small muted">${esc(dateStr)}</div>`:''}`;
    }else{
      approvalPill = `<span class="pill not">${esc(t('ui.plan.approvalDraft'))}</span>`;
    }
    const isDraft = approvalStatus==='draft';
    const isApprovedByInst = approvalStatus==='approved_by_institute';
    const isApproved = approvalStatus==='approved';
    const isUnapprovalReq = approvalStatus==='unapproval_requested';
    let actionsHtml = '';
    if(isDraft){
      if(canEditTab('plan')) actionsHtml += `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button>`;
      if(canDeletePlanRole) actionsHtml += `<button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
      if(canApprovePlanRole) actionsHtml += `<button class="btn small" onclick="approvePlan(${p.id})">${esc(t('ui.plan.approveBtn'))}</button>`;
    }else if(isApprovedByInst){
      if(canEditTab('plan')) actionsHtml += `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button>`;
      if(canConfirmByDept) actionsHtml += `<button class="btn small" onclick="confirmApprovalPlan(${p.id})">${esc(t('ui.plan.confirmApprovalBtn'))}</button>`;
      if(canApprovePlanRole) actionsHtml += `<button class="btn secondary small" onclick="unapprovePlan(${p.id})">${esc(t('ui.plan.unapproveBtn'))}</button>`;
      if(canDeletePlanRole) actionsHtml += `<button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
    }else if(isApproved){
      if(canEditTab('plan')) actionsHtml += `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button>`;
      if(canApprovePlanRole) actionsHtml += `<button class="btn secondary small" onclick="unapprovePlan(${p.id})">${esc(t('ui.plan.unapproveBtn'))}</button>`;
      if(canDeletePlanRole) actionsHtml += `<button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
    }else if(isUnapprovalReq){
      if(canEditTab('plan')) actionsHtml += `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button>`;
      if(canConfirmByDept) actionsHtml += `<button class="btn small" onclick="confirmUnapprovalPlan(${p.id})">${esc(t('ui.plan.confirmUnapprovalBtn'))}</button><button class="btn secondary small" onclick="cancelUnapprovalPlan(${p.id})">${esc(t('ui.plan.cancelUnapprovalBtn'))}</button>`;
      if(canDeletePlanRole) actionsHtml += `<button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
    }
    if(currentUser && currentUser.role==='admin'){
      if(isDraft) actionsHtml = `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button><button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button><button class="btn small" onclick="approvePlan(${p.id})">${esc(t('ui.plan.approveBtn'))}</button>`;
      else if(isApprovedByInst) actionsHtml = `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button><button class="btn small" onclick="confirmApprovalPlan(${p.id})">${esc(t('ui.plan.confirmApprovalBtn'))}</button><button class="btn secondary small" onclick="unapprovePlan(${p.id})">${esc(t('ui.plan.unapproveBtn'))}</button><button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
      else if(isApproved) actionsHtml = `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button><button class="btn secondary small" onclick="unapprovePlan(${p.id})">${esc(t('ui.plan.unapproveBtn'))}</button><button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
      else if(isUnapprovalReq) actionsHtml = `<button class="btn secondary small" onclick="editPlan(${p.id})">${esc(t('ui.actions.editShort'))}</button><button class="btn small" onclick="confirmUnapprovalPlan(${p.id})">${esc(t('ui.plan.confirmUnapprovalBtn'))}</button><button class="btn secondary small" onclick="cancelUnapprovalPlan(${p.id})">${esc(t('ui.plan.cancelUnapprovalBtn'))}</button><button class="btn danger small" onclick="delPlan(${p.id})">${esc(t('ui.actions.deleteShort'))}</button>`;
    }
    const selectedTeacherId=Number(($('planTeacherSel')&&$('planTeacherSel').value)||0);
    const teacherById=(Number(p.teacherId||0)>0)?teachers.find(tt=>Number(tt.id)===Number(p.teacherId)):null;
    const teacherByFilter=selectedTeacherId?teachers.find(tt=>Number(tt.id)===selectedTeacherId):null;
    const teacherFullName=(p.teacher&&p.teacher.fullName)|| (teacherById&&teacherById.fullName) || (teacherByFilter&&teacherByFilter.fullName) || '';
    const teacherDisplay=teacherFullName
      ? (isAllTeachers?getInitials(teacherFullName):teacherFullName)
      : String(t('ui.plan.departmentWide')||'Кафедра');
    const teacherCell=planCell(`<span title="${esc(teacherFullName)}">${esc(teacherDisplay)}</span>`,p,'teacherId');
    const indicatorCell=planCell(esc(indName(p.indicator)),p,'indicator');
    const citationsCell=planCell(esc(String(p.indicator==='CITATIONS'?(p.citationsCount||'—'):'—')),p,'citationsCount');
    const patentsCell=planCell(esc(String(p.indicator==='PATENTS'?(p.patentsCount||'—'):'—')),p,'patentsCount');
    const articleTypeCell=planCell(p.indicator==='ARTICLE_TYPE'?esc(artName(p.articleType)):'—',p,'articleType');
    const monthCell=planMonthCell(p);
    tr.innerHTML=`<td>${p.id}</td>${teacherCell}${indicatorCell}${citationsCell}${patentsCell}${articleTypeCell}${monthCell}<td>${statusPill}</td><td>${approvalPill}</td><td><div class="actions">${actionsHtml}</div></td>`;
    tb.appendChild(tr);
  });
  const hasAnyChanged=filtered.some(p=>p.departmentProposal&&Object.keys(p.departmentProposal).length>0&&(
    isPlanFieldChangedByInstitute(p,'teacherId')||isPlanFieldChangedByInstitute(p,'indicator')||
    isPlanFieldChangedByInstitute(p,'citationsCount')||isPlanFieldChangedByInstitute(p,'patentsCount')||
    isPlanFieldChangedByInstitute(p,'articleType')||isPlanFieldChangedByInstitute(p,'plannedMonth')||
    isPlanFieldChangedByInstitute(p,'plannedYear')
  ));
  const leg=$('planLegend');
  const legText=$('planLegendText');
  if(leg&&legText){
    leg.style.display=hasAnyChanged?'block':'none';
    legText.textContent=String(t('ui.plan.changedByInstituteHint')||'');
  }
}

window.delPlan=async id=>{ if(!confirm(String(t('ui.dialogs.confirmDeletePlan'))))return; try{ await api(`/departments/${departmentId}/plan-items/${id}`,{method:'DELETE'}); toast(String(t('ui.toasts.deleted'))); await loadPlans(); await loadStatsData(); }catch(e){toast('Ошибка: '+e.message);} };
window.editPlan=id=>{ const p=plans.find(x=>x.id===id); if(!p)return; openPlanModal(p); };
window.approvePlan=async id=>{ try{ await api(`/departments/${departmentId}/plan-items/${id}/approve`,{method:'POST'}); toast(String(t('ui.toasts.approved'))); await loadPlans(); await loadStatsData(); }catch(e){toast('Ошибка: '+e.message);} };
window.unapprovePlan=async id=>{ if(!confirm(String(t('ui.dialogs.confirmUnapprove'))))return; try{ await api(`/departments/${departmentId}/plan-items/${id}/unapprove`,{method:'POST'}); toast(String(t('ui.toasts.unapproved'))); await loadPlans(); await loadStatsData(); }catch(e){toast('Ошибка: '+e.message);} };
window.confirmApprovalPlan=async id=>{ try{ await api(`/departments/${departmentId}/plan-items/${id}/confirm-approval`,{method:'POST'}); toast(String(t('ui.toasts.approved'))); await loadPlans(); await loadStatsData(); }catch(e){toast('Ошибка: '+e.message);} };
window.confirmUnapprovalPlan=async id=>{ if(!confirm(String(t('ui.dialogs.confirmUnapprove'))))return; try{ await api(`/departments/${departmentId}/plan-items/${id}/confirm-unapproval`,{method:'POST'}); toast(String(t('ui.toasts.unapproved'))); await loadPlans(); await loadStatsData(); }catch(e){toast('Ошибка: '+e.message);} };
window.cancelUnapprovalPlan=async id=>{ if(!confirm(String(t('ui.dialogs.confirmCancelUnapproval'))))return; try{ await api(`/departments/${departmentId}/plan-items/${id}/cancel-unapproval`,{method:'POST'}); toast(String(t('ui.toasts.unapprovalCancelled'))); await loadPlans(); await loadStatsData(); }catch(e){toast('Ошибка: '+e.message);} };
window.approveAllPlans=async ()=>{
  const { filtered } = await getFilteredPlansForCurrentFilters();
  const drafts = filtered.filter(p=>(p.approvalStatus||'draft')==='draft');
  if(!drafts.length){ toast(currentLang==='uz'?'Tasdiqlash uchun reja yo‘q':'Нет черновиков для утверждения'); return; }
  const confirmMsg = typeof t('ui.dialogs.confirmApproveAll')==='function' ? t('ui.dialogs.confirmApproveAll')(drafts.length) : `Утвердить ${drafts.length} план(ов)?`;
  if(!confirm(confirmMsg)) return;
  let ok=0, err=0;
  for(const p of drafts){
    try{ await api(`/departments/${departmentId}/plan-items/${p.id}/approve`,{method:'POST'}); ok++; }
    catch(e){ err++; }
  }
  if(ok) toast(String(t('ui.toasts.approved'))+(ok>1?' ('+ok+')':''));
  if(err) toast('Ошибка: '+err+(err===1?' план не утверждён':' планов не утверждено'));
  await loadPlans();
  await loadStatsData();
};
window.unapproveAllPlans=async ()=>{
  const { filtered } = await getFilteredPlansForCurrentFilters();
  const approved = filtered.filter(p=>{const s=p.approvalStatus||'draft'; return s==='approved'||s==='approved_by_institute';});
  if(!approved.length){ toast(currentLang==='uz'?'Bekor qilish uchun tasdiqlangan reja yo‘q':'Нет утверждённых планов для снятия'); return; }
  const confirmMsg = typeof t('ui.dialogs.confirmUnapproveAll')==='function' ? t('ui.dialogs.confirmUnapproveAll')(approved.length) : `Снять утверждение с ${approved.length} план(ов)?`;
  if(!confirm(confirmMsg)) return;
  let ok=0, err=0;
  for(const p of approved){
    try{ await api(`/departments/${departmentId}/plan-items/${p.id}/unapprove`,{method:'POST'}); ok++; }
    catch(e){ err++; }
  }
  if(ok) toast(String(t('ui.toasts.unapproved'))+(ok>1?' ('+ok+')':''));
  if(err) toast('Ошибка: '+err+(err===1?' план не снят':' планов не снято'));
  await loadPlans();
  await loadStatsData();
};

const planChange=()=>{saveUIState();loadPlans();};
if($('planTeacherSel'))$('planTeacherSel').onchange=planChange;
if($('planYearSel'))$('planYearSel').onchange=planChange;
if($('planFilterDone'))$('planFilterDone').onchange=planChange;
if($('planFilterNotDone'))$('planFilterNotDone').onchange=planChange;
if($('planFilterH1'))$('planFilterH1').onchange=planChange;
if($('planFilterH2'))$('planFilterH2').onchange=planChange;
if($('planFilterMonth'))$('planFilterMonth').onchange=planChange;
if($('planFilterArticleType'))$('planFilterArticleType').onchange=planChange;
if($('planAddOpenBtn'))$('planAddOpenBtn').onclick=()=>openPlanModal();
if($('planAddOpenBtn2'))$('planAddOpenBtn2').onclick=()=>openPlanModal();
if($('planRefreshBtn'))$('planRefreshBtn').onclick=()=>loadPlans();
if($('planApproveAllBtn'))$('planApproveAllBtn').onclick=()=>approveAllPlans();
if($('planUnapproveAllBtn'))$('planUnapproveAllBtn').onclick=()=>unapproveAllPlans();
if($('planFilterResetBtn'))$('planFilterResetBtn').onclick=()=>{
  if($('planTeacherSel'))$('planTeacherSel').value='';
  if($('planFilterDone'))$('planFilterDone').checked=true;
  if($('planFilterNotDone'))$('planFilterNotDone').checked=true;
  if($('planFilterH1'))$('planFilterH1').checked=true;
  if($('planFilterH2'))$('planFilterH2').checked=true;
  if($('planFilterMonth'))$('planFilterMonth').value='';
  if($('planFilterIndicator'))$('planFilterIndicator').value='';
  if($('planFilterArticleType'))$('planFilterArticleType').value='';
  saveUIState();
  loadPlans();
};
// Обновление фильтра типа статьи при изменении показателя
if($('planFilterIndicator'))$('planFilterIndicator').onchange=()=>{
  const ind=($('planFilterIndicator')&&$('planFilterIndicator').value)?$('planFilterIndicator').value:'';
  if($('planFilterArticleType')){ $('planFilterArticleType').disabled=ind&&ind!=='ARTICLE_TYPE'; if(ind&&ind!=='ARTICLE_TYPE')$('planFilterArticleType').value=''; }
  saveUIState();
  loadPlans();
};

// Plan Modal
function isPlanWosScopusSelected(){
  return $('pmIndicator').value==='ARTICLE_TYPE' && $('pmArticleType').value==='WOS_SCOPUS';
}
function isPlanWosBulkMode(){
  return isPlanWosScopusSelected() && !editingPlanId;
}
function fillPlanWosTeacherSelect(sel, selectedIds=[]){
  fillTeacherSelect(sel,false);
  const idSet=new Set((selectedIds||[]).map(Number).filter(x=>x>0));
  Array.from(sel.options).forEach(o=>{ o.selected=idSet.has(Number(o.value)); });
  enableEasyMultiSelect(sel);
}
function addPlanWosDistributionRow(monthValue=10, selectedTeacherIds=[]){
  const host=$('pmWosDistributionRows');
  if(!host)return;
  const row=document.createElement('div');
  row.className='pm-wos-row';
  row.style.display='grid';
  row.style.gridTemplateColumns='minmax(150px,220px) 1fr auto';
  row.style.gap='8px';
  row.style.alignItems='start';
  row.innerHTML=`
    <label style="margin:0">Месяц<select class="pmWosMonth"></select></label>
    <label style="margin:0">Педагоги<select class="pmWosTeachers" multiple size="5"></select></label>
    <button class="btn danger small pmWosRowRemove" type="button" style="margin-top:22px">Удалить</button>
  `;
  host.appendChild(row);
  const monthSel=row.querySelector('.pmWosMonth');
  const teachersSel=row.querySelector('.pmWosTeachers');
  fillMonthSelect(monthSel,true);
  monthSel.value=String(monthValue||10);
  fillPlanWosTeacherSelect(teachersSel,selectedTeacherIds);
  const removeBtn=row.querySelector('.pmWosRowRemove');
  if(removeBtn)removeBtn.onclick=()=>{
    const rows=host.querySelectorAll('.pm-wos-row');
    if(rows.length<=1){
      fillPlanWosTeacherSelect(teachersSel,[]);
      monthSel.value='10';
      return;
    }
    row.remove();
  };
}
function resetPlanWosDistributionRows(rowsData=[]){
  const host=$('pmWosDistributionRows');
  if(!host)return;
  host.innerHTML='';
  if(Array.isArray(rowsData)&&rowsData.length){
    rowsData.forEach(r=>addPlanWosDistributionRow(r.month,r.teacherIds));
  }else{
    addPlanWosDistributionRow(10,[]);
  }
}
function collectPlanWosDistributionRows(){
  const host=$('pmWosDistributionRows');
  const rows=host?Array.from(host.querySelectorAll('.pm-wos-row')):[];
  if(!rows.length){
    return { error:'Добавьте хотя бы одно распределение по месяцам' };
  }
  const monthMap=new Map();
  for(const row of rows){
    const monthSel=row.querySelector('.pmWosMonth');
    const teachersSel=row.querySelector('.pmWosTeachers');
    const month=Number(monthSel&&monthSel.value||0);
    const teacherIds=Array.from((teachersSel&&teachersSel.selectedOptions)||[]).map(o=>Number(o.value)).filter(x=>x>0);
    if(!month) return { error:'Выберите месяц в каждом распределении' };
    if(!teacherIds.length) return { error:'Выберите хотя бы одного педагога в каждом распределении' };
    if(!monthMap.has(month))monthMap.set(month,new Set());
    const set=monthMap.get(month);
    teacherIds.forEach(id=>set.add(id));
  }
  const distributions=Array.from(monthMap.entries())
    .sort((a,b)=>academicMonthIndex(a[0])-academicMonthIndex(b[0]))
    .map(([month,set])=>({ plannedMonth:month, teacherIds:Array.from(set).sort((a,b)=>a-b) }));
  return { distributions };
}
function openPlanModal(p=null){
  editingPlanId=p?p.id:null;
  $('planModalTitle').textContent=p?String(t('ui.plan.modalTitleEdit')):String(t('ui.plan.modalTitleAdd'));
  fillTeacherSelect($('pmTeacher'),false,(p&&p.teacherId));
  fillTeacherSelect($('pmCoAuthorTeachers'),false);
  fillYears($('pmYear'),(p&&p.academicYear)||$('planYearSel').value);
  fillIndicatorSelect($('pmIndicator'),false);
  fillArticleTypeSelect($('pmArticleType'));
  fillMonthSelect($('pmMonth'),true);
  if(p){
    $('pmIndicator').value=p.indicator;
    $('pmArticleType').value=p.articleType||'';
    $('pmCitations').value=p.citationsCount||'';
    $('pmPatents').value=p.patentsCount||'';
    $('pmMonth').value=p.plannedMonth||'';
    const coIds=Array.isArray(p.coAuthorTeacherIds)?p.coAuthorTeacherIds.map(Number):[];
    Array.from($('pmCoAuthorTeachers').options).forEach(o=>o.selected=coIds.includes(+o.value));
  }else{
    $('pmCitations').value='';$('pmPatents').value='';
    if(teachers.length>0&&(!$('pmTeacher').value||$('pmTeacher').value===''))$('pmTeacher').value=teachers[0].id;
    if(INDICATORS.length>0&&(!$('pmIndicator').value||$('pmIndicator').value===''))$('pmIndicator').value=INDICATORS[0];
    if($('pmYear').options.length>0&&(!$('pmYear').value||$('pmYear').value===''))$('pmYear').value=$('pmYear').options[0].value;
    if($('pmIndicator').value==='ARTICLE_TYPE'&&(!$('pmArticleType').value||$('pmArticleType').value===''))$('pmArticleType').value=ARTICLE_TYPES[0]||'VAK';
    const ind=$('pmIndicator').value;
    if(ind&&ind!=='GRANT_PROJECTS'&&$('pmMonth').options.length>1&&(!$('pmMonth').value||$('pmMonth').value===''))$('pmMonth').value=10;
    Array.from($('pmCoAuthorTeachers').options).forEach(o=>o.selected=false);
    resetPlanWosDistributionRows();
  }
  updatePlanModalFields();
  $('planModal').classList.remove('hidden');
}
function closePlanModal(){ $('planModal').classList.add('hidden'); editingPlanId=null; }

function updatePlanModalFields(){
  const ind=$('pmIndicator').value;
  const artType=$('pmArticleType').value;
  const isTop1000=ind==='TOP1000_TRAINING';
  const isGrantProjects=ind==='GRANT_PROJECTS';
  const isWosScopus=(ind==='ARTICLE_TYPE'&&artType==='WOS_SCOPUS');
  const isWosBulk=isWosScopus&&!editingPlanId;
  const hideTeacher=isGrantProjects||isWosBulk;
  const tw=$('pmTeacherWrap'); if(tw)tw.style.display=hideTeacher?'none':'block';
  const caw=$('pmCoAuthorTeachersWrap'); if(caw)caw.style.display=(isWosScopus&&!isWosBulk)?'block':'none';
  const wdw=$('pmWosDistributionWrap'); if(wdw)wdw.style.display=isWosBulk?'block':'none';
  if(isWosBulk&&$('pmWosDistributionRows')&&!$('pmWosDistributionRows').children.length)resetPlanWosDistributionRows();
  $('pmArticleTypeWrap').style.display=(isTop1000||isGrantProjects?false:ind==='ARTICLE_TYPE')?'block':'none';
  $('pmCitationsWrap').style.display=(isTop1000||isGrantProjects?false:ind==='CITATIONS')?'block':'none';
  $('pmPatentsWrap').style.display=(isTop1000||isGrantProjects?false:ind==='PATENTS')?'block':'none';
  const mw=$('pmMonthWrap'); if(mw)mw.style.display=isWosBulk?'none':'block';
  const gh=$('pmGrantHint'); if(gh){ gh.style.display=isGrantProjects?'block':'none'; gh.textContent=isGrantProjects?String(t('ui.planModal.grantHint')):''; }
}
if($('pmIndicator'))$('pmIndicator').onchange=updatePlanModalFields;
if($('pmArticleType'))$('pmArticleType').onchange=updatePlanModalFields;
if($('pmWosDistAddBtn'))$('pmWosDistAddBtn').onclick=()=>addPlanWosDistributionRow(10,[]);
if($('pmWosDistClearBtn'))$('pmWosDistClearBtn').onclick=()=>resetPlanWosDistributionRows();
if($('pmSaveBtn'))$('pmSaveBtn').onclick=async()=>{
  if(!departmentId){ alert('Кафедра не выбрана. Откройте кабинет с параметром departmentId в URL.'); return; }
  const btn=$('pmSaveBtn'); const origText=btn?btn.textContent:'';
  if(btn){ btn.disabled=true; btn.textContent='Сохранение...'; }
  const teacherId=$('pmTeacher').value, academicYear=$('pmYear').value, indicator=$('pmIndicator').value;
  const articleType=$('pmArticleType').value, plannedMonth=$('pmMonth').value;
  const citationsCount=$('pmCitations').value, patentsCount=$('pmPatents').value;
  const isGrantProjects=indicator==='GRANT_PROJECTS';
  const isWosScopusPlan=(indicator==='ARTICLE_TYPE'&&articleType==='WOS_SCOPUS');
  const isWosBulkMode=isWosScopusPlan&&!editingPlanId;
  const coAuthorTeacherIds = isWosBulkMode ? [] : Array.from($('pmCoAuthorTeachers').selectedOptions).map(o=>+o.value).filter(x=>x>0&&x!==+(teacherId||0));
  if(!isGrantProjects&&!isWosBulkMode&&!teacherId){
    if(!teachers.length)return alert('Сначала добавьте педагогов в кафедру (вкладка «Педагоги»)');
    return alert(String(t('ui.alerts.needTeacher')));
  }
  if(!academicYear)return alert(String(t('ui.alerts.needYear')||'Выберите учебный год'));
  if(!indicator)return alert(String(t('ui.alerts.needIndicator')));
  if(indicator==='ARTICLE_TYPE'&&!articleType)return alert(String(t('ui.alerts.needArticleType')));
  const isTop1000=indicator==='TOP1000_TRAINING';
  if(!isTop1000&&!isGrantProjects&&!isWosBulkMode&&!plannedMonth)return alert(String(t('ui.alerts.needMonth')));
  if(indicator==='CITATIONS'&&(!citationsCount||citationsCount<=0))return alert(String(t('ui.alerts.needCitationsPlan')));
  if(indicator==='PATENTS'&&(!patentsCount||patentsCount<=0))return alert(String(t('ui.alerts.needPatentsPlan')));
  let wosDistributions=[];
  if(isWosBulkMode){
    const parsed=collectPlanWosDistributionRows();
    if(parsed.error)return alert(parsed.error);
    wosDistributions=parsed.distributions||[];
  }
  const body={teacherId:isGrantProjects?null:+(teacherId||0),academicYear,indicator,
    articleType:indicator==='ARTICLE_TYPE'?articleType:null,
    citationsCount:indicator==='CITATIONS'?+citationsCount:null,
    patentsCount:indicator==='PATENTS'?+patentsCount:null,
    plannedMonth:plannedMonth?+plannedMonth:null,
    coAuthorTeacherIds:isWosScopusPlan?coAuthorTeacherIds:[]};
  try{
    if(isWosBulkMode){
      let created=0, skipped=0;
      // Hosting-safe mode: save WOS/Scopus distribution via regular plan-items endpoint.
      if(!allPlans.length)await refreshAllPlans();
      const existingSet=new Set(
        allPlans
          .filter(p=>String(p.academicYear||'')===String(academicYear)
            && String(p.indicator||'')==='ARTICLE_TYPE'
            && normalizeArticleType(p.articleType||'')==='WOS_SCOPUS')
          .map(p=>`${Number(p.teacherId||0)}|${Number(p.plannedMonth||0)}`)
      );
      for(const d of wosDistributions){
        const month=Number(d.plannedMonth||0);
        const teacherIds=Array.isArray(d.teacherIds)?d.teacherIds.map(Number).filter(x=>x>0):[];
        for(const tid of teacherIds){
          const key=`${tid}|${month}`;
          if(existingSet.has(key)){ skipped++; continue; }
          const coAuthorTeacherIds=teacherIds.filter(x=>x!==tid);
          await api(`/departments/${departmentId}/plan-items`,{method:'POST',body:JSON.stringify({
            teacherId:tid, academicYear, indicator:'ARTICLE_TYPE', articleType:'WOS_SCOPUS',
            plannedMonth:month, coAuthorTeacherIds
          })});
          existingSet.add(key);
          created++;
        }
      }
      toast(`Добавлено: ${created}${skipped>0?`, пропущено: ${skipped}`:''}`);
    }else{
      if(editingPlanId) await api(`/departments/${departmentId}/plan-items/${editingPlanId}`,{method:'PUT',body:JSON.stringify(body)});
      else await api(`/departments/${departmentId}/plan-items`,{method:'POST',body:JSON.stringify(body)});
      toast(editingPlanId?'Сохранено':'Добавлено');
    }
    closePlanModal();
    await loadPlans();
    await loadStatsData();
  }catch(e){
    const msg=String(e&&e.message||e);
    toast('Ошибка: '+msg);
    alert(msg.includes('Ошибка')||msg.includes('обязатель')||msg.includes('не найден')?msg:'Ошибка при сохранении плана: '+msg);
  }finally{ if(btn){ btn.disabled=false; btn.textContent=origText; } }
};

// ===== WORKS =====
async function loadWorks(){
  const year=$('workYearSel').value, tid=$('workTeacherSel').value;
  let url=`/departments/${departmentId}/scientific-works`;
  if(year) url+=`?academicYear=${year}`;
  if(tid) url+=(year?`&`:`?`)+`teacherId=${tid}`;
  try{ 
    works = await api(url); 
    // Обновляем годы после загрузки работ
    fillYears($('planYearSel'), $('planYearSel').value);
    fillYears($('workYearSel'), year);
    fillYears($('statsYearSel'), $('statsYearSel').value);
    renderWorks(); 
  }catch(e){toast('Ошибка: '+e.message);}
}
function fmtPatentDateTable(w){
  if(!w.patentDay&&!w.patentMonth&&!w.patentYear)return '—';
  const d=w.patentDay||'?', m=w.patentMonth?monthShort(w.patentMonth):'?', y=w.patentYear||'?';
  return `${d} ${m} ${y}`;
}
function fmtCertDateTable(w){
  if(!w.certDay&&!w.certMonth&&!w.certYear)return '—';
  const d=w.certDay||'?', m=w.certMonth?monthShort(w.certMonth):'?', y=w.certYear||'?';
  return `${d} ${m} ${y}`;
}
function getCoAuthorNames(w){
  if(!Array.isArray(w.coAuthorTeacherIds)||!w.coAuthorTeacherIds.length)return '—';
  return w.coAuthorTeacherIds.map(id=>{
    const t=teachers.find(x=>x.id===id);
    return t?getInitials(t.fullName):('ID:'+id);
  }).join(', ');
}
function getGrantParticipantNames(w){
  const dept=getGrantParticipantsDept(w);
  const other=getGrantParticipantsOther(w);
  const parts=[dept!=='—'?dept:'',other!=='—'?other:''].filter(Boolean);
  return parts.length?parts.join('; '):'—';
}
function getGrantParticipantsDept(w){
  const ids=Array.isArray(w.grantParticipantTeacherIds)?w.grantParticipantTeacherIds:[];
  if(!ids.length)return '—';
  return ids.map(id=>{ const t=teachers.find(x=>x.id===id); return t?t.fullName:('ID:'+id); }).join('; ');
}
function getGrantParticipantsOther(w){
  const raw=(w.grantParticipantNames||'').trim();
  if(!raw)return '—';
  return raw.split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean).join('; ');
}
// initialsFromName = getInitials (определена выше)

function getFilteredWorksForCurrentFilters(){
  const fInd=$('workFilterInd').value, fSrc=$('workFilterSrc').value, fArt=$('workFilterArticleType').value;
  const selectedTeacherId=Number($('workTeacherSel').value||0);
  const isAllTeachers=!selectedTeacherId;
  const filtered=works.filter(w=>{
    if(selectedTeacherId){
      const mainTid=Number(w.teacherId||0);
      const coTids=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(Number):[];
      if(mainTid!==selectedTeacherId && !coTids.includes(selectedTeacherId))return false;
    }
    if(fInd&&w.indicator!==fInd)return false;
    if(fSrc&&w.source!==fSrc)return false;
    if(fArt&&(w.indicator!=='ARTICLE_TYPE'||normalizeArticleType(w.articleType||'')!==normalizeArticleType(fArt)))return false;
    return true;
  });
  return { filtered, selectedTeacherId, isAllTeachers };
}

let _worksScrollSync=false;
function updateWorksStickyScrollbar(){
  const bar=$('worksStickyScrollbar'), track=$('worksStickyScrollbarTrack'), card=document.querySelector('#panel-works .works-card');
  const statsBar=$('statsStickyScrollbar');
  if(statsBar)statsBar.classList.remove('visible');
  if(!bar||!track||!card)return;
  const panelWorks=$('panel-works');
  const isActive=panelWorks&&panelWorks.classList.contains('active');
  if(!isActive){ bar.classList.remove('visible'); return; }
  const wrap=card.querySelector('.works-table-wrap');
  const table=wrap?wrap.querySelector('table'):null;
  if(!table){ bar.classList.remove('visible'); return; }
  const tw=table.scrollWidth, cw=card.clientWidth;
  if(tw<=cw){ bar.classList.remove('visible'); return; }
  track.style.width=tw+'px';
  bar.classList.add('visible');
  if(!_worksScrollSync){
    _worksScrollSync=true;
    let fromCard=false, fromBar=false;
    card.addEventListener('scroll',function(){ if(fromBar)return; fromCard=true; bar.scrollLeft=card.scrollLeft; requestAnimationFrame(()=>{fromCard=false;}); });
    bar.addEventListener('scroll',function(){ if(fromCard)return; fromBar=true; card.scrollLeft=bar.scrollLeft; requestAnimationFrame(()=>{fromBar=false;}); });
  }
  bar.scrollLeft=card.scrollLeft;
}

let _statsScrollSync=false;
function updateStatsStickyScrollbar(){
  const bar=$('statsStickyScrollbar'), track=$('statsStickyScrollbarTrack'), wrap=$('statsTableWrap');
  const worksBar=$('worksStickyScrollbar');
  if(worksBar)worksBar.classList.remove('visible');
  if(!bar||!track||!wrap)return;
  const panelStats=$('panel-stats');
  const isActive=panelStats&&panelStats.classList.contains('active');
  if(!isActive){ bar.classList.remove('visible'); return; }
  const table=wrap.querySelector('#statsTable');
  if(!table){ bar.classList.remove('visible'); return; }
  const sw=wrap.scrollWidth, cw=wrap.clientWidth;
  if(sw<=cw){ bar.classList.remove('visible'); return; }
  track.style.width=sw+'px';
  bar.classList.add('visible');
  if(!_statsScrollSync){
    _statsScrollSync=true;
    let fromWrap=false, fromBar=false;
    wrap.addEventListener('scroll',function(){ if(fromBar)return; fromWrap=true; bar.scrollLeft=wrap.scrollLeft; requestAnimationFrame(()=>{fromWrap=false;}); });
    bar.addEventListener('scroll',function(){ if(fromWrap)return; fromBar=true; wrap.scrollLeft=bar.scrollLeft; requestAnimationFrame(()=>{fromBar=false;}); });
  }
  bar.scrollLeft=wrap.scrollLeft;
}

const STATS_COL_WIDTHS_KEY='IlmiyStat_stats_col_widths_v2';
const PLAN_COL_WIDTHS_KEY='IlmiyStat_plan_col_widths_v1';
const PLAN_TABLE_HEIGHT_KEY='IlmiyStat_plan_table_height_v1';
let statsMeasureCanvas=null;
function statsFontString(el){
  if(!el)return '400 13px system-ui';
  const cs=getComputedStyle(el);
  return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}
function statsMeasureText(text,font){
  if(!statsMeasureCanvas)statsMeasureCanvas=document.createElement('canvas');
  const ctx=statsMeasureCanvas.getContext('2d');
  ctx.font=font||'400 13px system-ui';
  return ctx.measureText(String(text||'')).width;
}
function getStatsAutoWidths(keys){
  const table=$('statsTable');
  const colgroup=$('statsColgroup');
  const widths={};
  if(!table||!colgroup)return widths;
  const bodyCell=table.querySelector('tbody td[data-col]');
  const bodyFont=statsFontString(bodyCell||table);
  const visibleKeys=Array.isArray(keys)?keys:Array.from(colgroup.querySelectorAll('col[data-col]')).map(col=>col.getAttribute('data-col'));
  visibleKeys.forEach(key=>{
    const col=colgroup.querySelector(`col[data-col="${key}"]`);
    const th=table.querySelector(`thead th[data-col="${key}"]`);
    if(!col||!th||th.style.display==='none')return;
    const defaultW=parseInt(col.getAttribute('data-default-w')||'80',10)||80;
    const headerText=(th.textContent||'').replace(/\s+/g,' ').trim();
    let max=statsMeasureText(headerText,statsFontString(th));
    let samples=0;
    table.querySelectorAll(`tbody td[data-col="${key}"]`).forEach(td=>{
      if(samples>=120)return;
      const text=(td.textContent||'').replace(/\s+/g,' ').trim();
      if(!text)return;
      samples++;
      max=Math.max(max,statsMeasureText(text.slice(0,160),bodyFont));
    });
    widths[key]=Math.max(64,Math.min(520,Math.ceil(max+34), defaultW));
  });
  return widths;
}
function initStatsTableResize(){
  const table=$('statsTable'), colgroup=$('statsColgroup');
  if(!table||!colgroup)return;
  try{
    const saved=JSON.parse(localStorage.getItem(STATS_COL_WIDTHS_KEY)||'{}');
    colgroup.querySelectorAll('col[data-col]').forEach((col,i)=>{
      const k=col.getAttribute('data-col');
      if(saved[k])col.style.width=Math.max(28,Number(saved[k]))+'px';
    });
  }catch(_e){}
  table.querySelectorAll('thead th .th-resize').forEach((handle,i)=>{
    if(handle._bound)return;
    handle._bound=true;
    handle.title=(typeof t==='function'&&t('ui.stats.tooltips.resizeColHint'))||'Изменить ширину столбца';
    handle.addEventListener('mousedown',function(e){
      e.preventDefault();
      e.stopPropagation();
      const th=handle.closest('th[data-col]');
      if(!th)return;
      const colKey=th.getAttribute('data-col');
      const col=Array.from(colgroup.querySelectorAll('col[data-col]')).find(c=>c.getAttribute('data-col')===colKey);
      if(!col)return;
      const startX=e.clientX;
      const startW=parseInt(col.style.width,10)||Math.round(th.getBoundingClientRect().width)||80;
      let lastW=startW;
      const onMove=function(e2){
        const dx=e2.clientX-startX;
        lastW=Math.max(28,startW+dx);
        col.style.width=lastW+'px';
        th.style.width=lastW+'px';
      };
      const onUp=function(){
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        document.body.style.cursor='';
        document.body.style.userSelect='';
        const widths={};
        try{ Object.assign(widths,JSON.parse(localStorage.getItem(STATS_COL_WIDTHS_KEY)||'{}')); }catch(_){}
        widths[colKey]=lastW;
        localStorage.setItem(STATS_COL_WIDTHS_KEY,JSON.stringify(widths));
      };
      document.body.style.cursor='col-resize';
      document.body.style.userSelect='none';
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  });
}
function getPlanDefaultWidth(key){
  return key==='fio'?180:132;
}
function applyPlanTableColWidths(){
  const colgroup=$('planStatsColgroup');
  if(!colgroup)return;
  let saved={};
  try{ saved=JSON.parse(localStorage.getItem(PLAN_COL_WIDTHS_KEY)||'{}'); }catch(_e){}
  colgroup.querySelectorAll('col[data-col]').forEach(col=>{
    const key=col.getAttribute('data-col');
    const def=parseInt(col.getAttribute('data-default-w')||String(getPlanDefaultWidth(key)),10)||getPlanDefaultWidth(key);
    const raw=saved[key]!=null?saved[key]:def;
    const px=Math.max(72,parseInt(String(raw),10)||def);
    col.style.width=px+'px';
  });
}
function initPlanTableResize(){
  const table=$('planStatsTable'), colgroup=$('planStatsColgroup');
  if(!table||!colgroup)return;
  applyPlanTableColWidths();
  table.querySelectorAll('thead th .th-resize').forEach(handle=>{
    if(handle._bound)return;
    handle._bound=true;
    handle.title=(typeof t==='function'&&t('ui.stats.tooltips.resizeColHint'))||'Изменить ширину столбца';
    handle.addEventListener('mousedown',function(e){
      e.preventDefault();
      e.stopPropagation();
      const th=handle.closest('th[data-col]');
      if(!th)return;
      const key=th.getAttribute('data-col');
      const col=colgroup.querySelector(`col[data-col="${key}"]`);
      if(!col)return;
      const startX=e.clientX;
      const startW=parseInt(col.style.width,10)||Math.round(th.getBoundingClientRect().width)||getPlanDefaultWidth(key);
      let lastW=startW;
      const onMove=function(e2){
        const dx=e2.clientX-startX;
        lastW=Math.max(72,startW+dx);
        col.style.width=lastW+'px';
      };
      const onUp=function(){
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        document.body.style.cursor='';
        document.body.style.userSelect='';
        const widths={};
        try{ Object.assign(widths,JSON.parse(localStorage.getItem(PLAN_COL_WIDTHS_KEY)||'{}')); }catch(_){}
        widths[key]=lastW;
        localStorage.setItem(PLAN_COL_WIDTHS_KEY,JSON.stringify(widths));
      };
      document.body.style.cursor='col-resize';
      document.body.style.userSelect='none';
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  });
}
function initPlanTableHeightResize(){
  const wrap=$('planTableWrap');
  if(!wrap)return;
  const minHeight=220;
  try{
    const saved=parseInt(localStorage.getItem(PLAN_TABLE_HEIGHT_KEY)||'',10);
    if(saved) wrap.style.height=Math.max(minHeight,saved)+'px';
  }catch(_e){}
  if(wrap.dataset.heightResizeReady==='1')return;
  wrap.dataset.heightResizeReady='1';
  let saveTimer=0;
  const persistHeight=()=>{
    if(saveTimer)clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      const current=Math.round(wrap.getBoundingClientRect().height||0);
      if(!current)return;
      try{ localStorage.setItem(PLAN_TABLE_HEIGHT_KEY,String(Math.max(minHeight,current))); }catch(_e){}
    },120);
  };
  if(typeof ResizeObserver!=='undefined'){
    const ro=new ResizeObserver(()=>persistHeight());
    ro.observe(wrap);
  }else{
    wrap.addEventListener('mouseup',persistHeight);
    wrap.addEventListener('touchend',persistHeight,{passive:true});
  }
}
function fitPlanTableHeightToContent(){
  const wrap=$('planTableWrap');
  const inner=$('planTableInner');
  if(!wrap||!inner)return;
  const minHeight=220;
  requestAnimationFrame(()=>{
    const target=Math.max(minHeight, Math.ceil(inner.scrollHeight)+2);
    wrap.style.height=target+'px';
    try{ localStorage.setItem(PLAN_TABLE_HEIGHT_KEY,String(target)); }catch(_e){}
  });
}

function applyWorksTableColumnVisibility(filteredWorks){
  const table=document.getElementById('worksTable'); if(!table)return;
  const selectedInd=$('workFilterInd')?$('workFilterInd').value:'';
  const visibleCols=selectedInd&&INDICATOR_WORKS_COLUMNS[selectedInd]
    ? new Set(INDICATOR_WORKS_COLUMNS[selectedInd])
    : null;
  document.querySelectorAll('#worksTable th[data-col], #worksTable td[data-col]').forEach(el=>{
    const col=el.getAttribute('data-col');
    el.style.display=(!visibleCols||visibleCols.has(col))?'':'none';
  });
  requestAnimationFrame(()=>updateWorksStickyScrollbar());
}
function renderWorks(){
  const { filtered, selectedTeacherId, isAllTeachers } = getFilteredWorksForCurrentFilters();
  $('workCount').textContent=`(${filtered.length} из ${works.length})`;
  const tb=$('worksTbody'); tb.innerHTML='';
  const worksEditAllowed = canEditTab('works');
  const workAddBtn=$('workAddOpenBtn');
  if(workAddBtn)workAddBtn.style.display=worksEditAllowed?'':'none';
  if(!filtered.length){
    const msg = t('ui.works.noWorksByFilters');
    const text = (msg && String(msg).trim())
      ? String(msg)
      : (currentLang==='uz' ? 'Tanlangan filtrlarga mos ilmiy ishlar yo‘q.' : 'Нет научных работ по выбранным фильтрам.');
    applyWorksTableColumnVisibility([]);
    const colCount=Math.max(1,Array.from(document.querySelectorAll('#worksTable thead th[data-col]')).filter(th=>th.style.display!=='none').length);
    tb.innerHTML=`<tr><td colspan="${colCount}" class="muted">${esc(text)}</td></tr>`;
    requestAnimationFrame(()=>updateWorksStickyScrollbar());
    return;
  }
  const teacherMap=new Map(teachers.map(t=>[t.id,t.fullName]));
  filtered.forEach(w=>{
    const tr=document.createElement('tr');
    const comparableTitle=getWorkComparableTitle(w.indicator,w.title,w.grantName);
    const isSimilarHighlight=worksFocusActive&&(
      worksFocusHighlightIds.has(String(w.id))||
      (comparableTitle!==''&&worksFocusHighlightTitles.has(comparableTitle))
    );
    if(isSimilarHighlight)tr.classList.add('similar-work-highlight');
    tr.setAttribute('data-work-id',String(w.id));
    const srcText=w.source==='PLAN'?String(t('meta.sources.PLAN')):String(t('meta.sources.OUT_OF_PLAN'));
    const statusPill=w.completionStatus==='DONE'?`<span class="pill done">${esc(t('ui.stats.statusDone'))}</span>`:w.completionStatus==='PARTIAL'?`<span class="pill partial">${esc(t('ui.stats.statusPartial'))}</span>`:`<span class="pill not">${esc(t('ui.stats.statusNotDone'))}</span>`;
    const siteLink=w.siteUrl?`<a href="${esc(w.siteUrl)}" target="_blank">${esc(String(t('ui.common.linkText')))}</a>`:'—';
    const fileLink=w.fileUrl?`<a href="${esc(w.fileUrl)}" target="_blank">${esc(String(t('ui.common.fileText')))}</a>`:'—';
    const patentNo=w.indicator==='PATENTS'&&w.patentNumber?esc(w.patentNumber):'—';
    const patentDate=w.indicator==='PATENTS'?fmtPatentDateTable(w):'—';
    const patentIssued=w.indicator==='PATENTS'&&w.patentIssuedBy?esc(w.patentIssuedBy):'—';
    const isGrantWork=w.indicator==='GRANT_PROJECTS';
    const grantName=isGrantWork&&w.grantName?esc(w.grantName):'—';
    const grantDuration=isGrantWork&&w.grantDuration?esc(w.grantDuration):'—';
    const grantPartner=isGrantWork&&w.grantPartnerForeign?esc(w.grantPartnerForeign):'—';
    const grantParticipantsDept=isGrantWork?esc(getGrantParticipantsDept(w)):'—';
    const grantParticipantsOther=isGrantWork?esc(getGrantParticipantsOther(w)):'—';
    const grantAmount=isGrantWork&&w.grantAmountUsd?esc(w.grantAmountUsd)+' USD':'—';
    const citationsCount=w.indicator==='CITATIONS'&&(w.citationsCount!=null&&w.citationsCount!=='')?String(w.citationsCount):'—';
    const hIndexVal=w.indicator==='CITATIONS'&&(w.hIndex!=null&&w.hIndex!=='')?String(w.hIndex):'—';
    const profileLink=w.indicator==='CITATIONS'&&w.profileLink?`<a href="${esc(w.profileLink)}" target="_blank">${esc(String(t('ui.common.linkText')))}</a>`:'—';
    const artType=w.indicator==='ARTICLE_TYPE'?esc(artName(w.articleType)):'—';
    const council=COUNCIL_INDICATORS.has(w.indicator)&&w.coordCouncilName?esc(w.coordCouncilName):'—';
    const hasCertFields=COUNCIL_INDICATORS.has(w.indicator)||w.indicator==='XORIJIY_TIL_SERTIFIKAT';
    const certNo=hasCertFields&&w.decisionNumber?esc(w.decisionNumber):'—';
    const certDate=hasCertFields?fmtCertDateTable(w):'—';
    const isCertSert=w.indicator==='XORIJIY_TIL_SERTIFIKAT';
    const isDoctorateWork=(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON');
    const certForeignLangVal=isCertSert?(w.certForeignLang||(w.ilmiyDaraja&&XORIJIY_TIL_NAMES[w.ilmiyDaraja]?w.ilmiyDaraja:null)):null;
    const certDarajasiVal=isCertSert?(w.certDarajasi||(w.ilmiyUnvon&&!ILMIY_UNVON_NAMES[w.ilmiyUnvon]?w.ilmiyUnvon:null)):null;
    const certForeignLangCell=isCertSert?esc(xorijiyTilName(certForeignLangVal)||'—'):'—';
    const certDarajasiCell=isCertSert?esc(certDarajasiVal||'—'):'—';
    const certUmumiyBaliCell=isCertSert?esc(w.certUmumiyBali||'—'):'—';
    const ilmiyDarajaCell=(isDoctorateWork&&!isCertSert)?esc(ilmiyDarajaName(w.ilmiyDaraja)):'—';
    const ilmiyUnvonCell=(isDoctorateWork&&!isCertSert)?esc(ilmiyUnvonName(w.ilmiyUnvon)):'—';
    const educationDirectionCell=isDoctorateWork?esc(w.educationDirectionCode||'—'):'—';
    const specialtyCodeCell=isDoctorateWork?esc(w.specialtyCode||'—'):'—';
    const diplomRaqamiCell=isDoctorateWork?esc(w.diplomRaqami||'—'):'—';
    const degreeDateCell=isDoctorateWork?esc(w.degreeDate||'—'):'—';
    const isXorijiyTilWork=w.indicator==='XORIJIY_TIL_MASHGULOT';
    const fanNomiCell=isXorijiyTilWork?esc(w.xorijiyTilFanNomi||'—'):'—';
    const fanYonalishCell=isXorijiyTilWork?esc(w.xorijiyTilFanYonalish||'—'):'—';
    const mashgulotTuriCell=isXorijiyTilWork?esc(mashgulotTuriName(w.xorijiyTilMashgulotTuri)):'—';
    const xorijiyTilCell=isXorijiyTilWork?esc(xorijiyTilName(w.xorijiyTilTil)):'—';
    const mashgulotSoatiCell=isXorijiyTilWork?esc(w.xorijiyTilMashgulotSoati||'—'):'—';
    const plannedCell=w.source==='PLAN'?(worksEditAllowed?`<div style="min-width:170px">
      <select class="workPlannedMonthSel" data-id="${w.id}">
        <option value="">${esc(t('ui.common.choose'))}</option>
        ${ACADEMIC_MONTH_ORDER.map(mm=>{
          const selected=Number(w.plannedMonth||0)===mm?'selected':'';
          return `<option value="${mm}" ${selected}>${esc(monthText(mm))}</option>`;
        }).join('')}
      </select>
      <div class="small muted">${w.plannedMonth?`${esc(monthText(w.plannedMonth))}${w.plannedYear?' '+w.plannedYear+String(t('ui.common.yearSuffix')):''}`.trim():''}</div>
    </div>`:`<span class="small">${w.plannedMonth?esc(monthText(w.plannedMonth))+(w.plannedYear?' '+w.plannedYear:''):'—'}</span>`):'<span class="muted small">—</span>';
    const coAuthorNames=getCoAuthorNames(w);
    const coTids=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(Number):[];
    const mainAuthorName=teacherMap.get(Number(w.teacherId))||'';
    const isCoauthorView=!!selectedTeacherId && Number(w.teacherId)!==selectedTeacherId && coTids.includes(selectedTeacherId);
    const hasCoauthorParticipation=coTids.length>0 || Number(w.coAuthorsCount||1)>1;
    const coauthorBadge=hasCoauthorParticipation
      ? `<div class="small" style="font-weight:700;color:#8a5200">${esc(currentLang==='uz'?'Hammualliflik ishi':'Соавторская работа')}</div>`
      : '';
    const authorMeta=mainAuthorName
      ? `<div class="small muted">${esc(t('ui.works.authorLabel'))}: ${esc(mainAuthorName)}</div>`
      : '';
    const isTop1000Work=w.indicator==='TOP1000_TRAINING';
    const receivingOrg=isTop1000Work?(w.title||'—'):'—';
    const titleHtml=(!isAllTeachers&&Number(w.teacherId)!==selectedTeacherId&&mainAuthorName)
      ?`<div>${esc(w.title||'—')}</div>${coauthorBadge}${authorMeta}`
      :esc((w.title||'—').slice(0,40))+(((w.title&&w.title.length)>40)?'...':'');
    const titleCell=isTop1000Work?'—':titleHtml;
    
    tr.innerHTML=`
      <td data-col="id">${w.id}</td>
      <td data-col="source">${esc(srcText)}</td>
      <td data-col="indicator">${esc(indName(w.indicator))}</td>
      <td data-col="grantName" title="${grantName}" class="small">${grantName}</td>
      <td data-col="grantDuration" class="small">${grantDuration}</td>
      <td data-col="grantPartner" title="${grantPartner}" class="small">${grantPartner}</td>
      <td data-col="grantParticipantsDept" title="${grantParticipantsDept}" class="small">${grantParticipantsDept}</td>
      <td data-col="grantParticipantsOther" title="${grantParticipantsOther}" class="small">${grantParticipantsOther}</td>
      <td data-col="grantAmount" class="small">${grantAmount}</td>
      <td data-col="patentNo">${patentNo}</td>
      <td data-col="patentDate">${patentDate}</td>
      <td data-col="patentIssued">${patentIssued}</td>
      <td data-col="citations">${citationsCount}</td>
      <td data-col="hIndex">${hIndexVal}</td>
      <td data-col="profile">${profileLink}</td>
      <td data-col="artType">${artType}</td>
      <td data-col="title" title="${esc(w.title||'')}">${titleCell}</td>
      <td data-col="receivingOrg" title="${esc(receivingOrg)}">${esc(receivingOrg)}</td>
      <td data-col="publisher">${esc(w.publisher||'—')}</td>
      <td data-col="council">${council}</td>
      <td data-col="certNo">${certNo}</td>
      <td data-col="certDate">${certDate}</td>
      <td data-col="certForeignLang">${certForeignLangCell}</td>
      <td data-col="certDarajasi">${certDarajasiCell}</td>
      <td data-col="certUmumiyBali">${certUmumiyBaliCell}</td>
      <td data-col="ilmiyDaraja">${ilmiyDarajaCell}</td>
      <td data-col="ilmiyUnvon">${ilmiyUnvonCell}</td>
      <td data-col="educationDirection">${educationDirectionCell}</td>
      <td data-col="specialtyCode">${specialtyCodeCell}</td>
      <td data-col="diplomRaqami">${diplomRaqamiCell}</td>
      <td data-col="degreeDate">${degreeDateCell}</td>
      <td data-col="fanNomi">${fanNomiCell}</td>
      <td data-col="fanYonalish">${fanYonalishCell}</td>
      <td data-col="mashgulotTuri">${mashgulotTuriCell}</td>
      <td data-col="xorijiyTil">${xorijiyTilCell}</td>
      <td data-col="mashgulotSoati">${mashgulotSoatiCell}</td>
      <td data-col="month">${w.month?esc(monthShort(w.month)):'—'}</td>
      <td data-col="year">${w.year||'—'}</td>
      <td data-col="coAuthorsCount">${w.coAuthorsCount||1}</td>
      <td data-col="coAuthorNames" title="${esc(coAuthorNames)}">${coAuthorNames.length>30?coAuthorNames.slice(0,30)+'...':coAuthorNames}</td>
      <td data-col="planned">${plannedCell}</td>
      <td data-col="siteUrl">${siteLink}</td>
      <td data-col="fileUrl">${fileLink}</td>
      <td data-col="pdf">
        <div class="work-pdfs-cell" data-work-id="${w.id}" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
          ${(function(){
            const pdfs=getWorkPdfs(w);
            let html='';
            pdfs.forEach(p=>{
              const fid=typeof p.id==='number'?p.id:'legacy';
              const fname=esc(p.name||p.file||'PDF');
              html+=`<div class="work-pdf-row" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                <button class="btn secondary small" onclick="previewPdf(${w.id},${typeof p.id==='number'?p.id:'null'})" title="${esc(t('ui.works.viewPdf'))}">&#128196;</button>
                <span class="work-pdf-name muted small" title="${fname}" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fname}</span>
                ${worksEditAllowed?`<button class="btn danger small" onclick="deletePdf(${w.id},${typeof p.id==='number'?p.id:'null'})" title="${esc(t('ui.works.deletePdf'))}">&#10005;</button>`:''}
              </div>`;
            });
            if(worksEditAllowed)html+=`<label class="btn secondary small" style="cursor:pointer;margin:0" title="${esc(t('ui.works.uploadPdf'))}">+ Файл<input type="file" accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,application/pdf,image/jpeg,image/png,image/tiff" class="pdfUploadInput" data-id="${w.id}" style="display:none"></label>`;
            return html||'—';
          })()}
        </div>
      </td>
      <td data-col="status">
        ${worksEditAllowed?`<div class="row" style="gap:10px">
          <select class="workStatusSel" data-id="${w.id}">
            <option value="NOT_DONE" ${w.completionStatus==='NOT_DONE'?'selected':''}>${esc(t('meta.statuses.NOT_DONE'))}</option>
            <option value="PARTIAL" ${w.completionStatus==='PARTIAL'?'selected':''}>${esc(t('meta.statuses.PARTIAL'))}</option>
            <option value="DONE" ${w.completionStatus==='DONE'?'selected':''}>${esc(t('meta.statuses.DONE'))}</option>
          </select>
        </div>`:statusPill}
      </td>
      <td data-col="actions">${worksEditAllowed?`<div class="actions"><button class="btn secondary small" onclick="editWork(${w.id})">${esc(t('ui.actions.editShort'))}</button><button class="btn danger small" onclick="delWork(${w.id})">${esc(t('ui.actions.deleteShort'))}</button></div>`:''}</td>
    `;
    tb.appendChild(tr);
  });

  applyWorksTableColumnVisibility(filtered);
  
  // Обработчики для селекторов в таблице (как в оригинале)
  tb.querySelectorAll('.workPlannedMonthSel').forEach(selEl=>{
    selEl.addEventListener('change',async()=>{
      const id=Number(selEl.dataset.id);
      const w=works.find(x=>x.id===id);
      if(!w)return;
      const nextPm=Number(selEl.value||0)||null;
      const nextPy=nextPm?plannedCalendarYearFromAcademic(w.academicYear,nextPm):null;
      try{
        await api(`/departments/${departmentId}/scientific-works/${id}`,{
          method:'PUT',
          body:JSON.stringify({plannedMonth:nextPm,plannedYear:nextPy})
        });
        toast(String(t('ui.toasts.plannedMonthUpdated')));
        await loadWorks();
        await loadPlans();
        await loadStats();
      }catch(e){toast('Ошибка: '+e.message);}
    });
  });
  
  tb.querySelectorAll('.workStatusSel').forEach(selEl=>{
    selEl.addEventListener('change',async()=>{
      const id=Number(selEl.dataset.id);
      const w=works.find(x=>x.id===id);
      if(!w)return;
      const next=selEl.value;
      if(next==='DONE'&&!w.fileUrl&&getWorkPdfs(w).length===0){
        selEl.value=w.completionStatus||'NOT_DONE';
        return alert(String(t('ui.alerts.needFileForDone')));
      }
      try{
        await api(`/departments/${departmentId}/scientific-works/${id}`,{
          method:'PUT',
          body:JSON.stringify({completionStatus:next})
        });
        toast(String(t('ui.toasts.statusUpdated')));
        await loadWorks();
        await loadPlans();
        await loadStats();
      }catch(e){toast('Ошибка: '+e.message);}
    });
  });
  tb.querySelectorAll('.pdfUploadInput').forEach(inp=>{
    inp.addEventListener('change',async()=>{
      const id=Number(inp.dataset.id);
      const file=inp.files[0];
      if(!file)return;
      if(file.size>20*1024*1024){alert(t('ui.alerts.fileTooLarge')||'Файл слишком большой (макс. 20 МБ)');inp.value='';return;}
      const displayName=prompt(t('ui.works.pdfDisplayNamePrompt')||'Название файла (необязательно):',file.name.replace(/\.(pdf|jpg|jpeg|png|tiff|tif)$/i,''));
      const fd=new FormData();
      fd.append('file',file,file.name||'document');
      if(displayName!==null&&String(displayName).trim())fd.append('displayName',String(displayName).trim());
      try{
        const token=getAuthToken();
        const res=await fetch(`${API}/upload.php?action=upload&workId=${id}&departmentId=${departmentId}`,{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
        const json=await res.json();
        if(!res.ok)throw new Error(json.error||'Upload failed');
        toast(t('ui.toasts.fileUploaded')||'Файл загружен');
        await loadWorks();
      }catch(e){toast('Ошибка: '+e.message);}
    });
  });
  requestAnimationFrame(()=>updateWorksStickyScrollbar());
}
window.deletePdf=async (workId,fileId)=>{
  if(!confirm(t('ui.dialogs.confirmDeleteFile')||'Удалить загруженный файл?'))return;
  try{
    const token=getAuthToken();
    let url=`${API}/upload.php?action=delete&workId=${workId}&departmentId=${departmentId}`;
    if(fileId!=null&&fileId!=='legacy')url+=`&fileId=${fileId}`;
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+token}});
    const json=await res.json();
    if(!res.ok)throw new Error(json.error||'Delete failed');
    toast(t('ui.toasts.fileDeleted')||'Файл удалён');
    await loadWorks();
  }catch(e){toast('Ошибка: '+e.message);}
};
window.previewPdf=(workId,fileId)=>{
  openPdfViewer(workId,fileId);
};
let currentPdfBlobUrl='';
let currentPdfWorkId=0;
let currentPdfFilename='';
function parseFilenameFromContentDisposition(cd){
  if(!cd)return null;
  const utf8Match=cd.match(/filename\*=UTF-8''([^;]+)/i);
  if(utf8Match)try{return decodeURIComponent(utf8Match[1].trim());}catch(_){}
  const fnMatch=cd.match(/filename=["']?([^"';]+)["']?/i);
  return fnMatch?fnMatch[1].trim():null;
}
function fixMojibakeFilename(str){
  if(!str||typeof str!=='string')return str;
  if(/^[\x20-\x7E.\-]+$/.test(str))return str;
  if(!/Ð|Ã|Â|â|€|³|²/i.test(str))return str;
  try{return decodeURIComponent(escape(str));}catch(_){}
  return str;
}
async function forceBlobMimeIfNeeded(blob, filenameHint){
  if(!blob) return blob;
  const rawType=String(blob.type||'').toLowerCase();
  const name=String(filenameHint||'').toLowerCase();
  const hasBadType=!rawType || rawType==='text/html' || rawType==='application/octet-stream' || rawType.startsWith('text/');
  if(!hasBadType)return blob;
  try{
    const headBuf=await blob.slice(0,16).arrayBuffer();
    const b=new Uint8Array(headBuf);
    let forced='';
    // %PDF-
    if(b.length>=5&&b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2D)forced='application/pdf';
    // JPEG FF D8 FF
    else if(b.length>=3&&b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)forced='image/jpeg';
    // PNG 89 50 4E 47
    else if(b.length>=4&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4E&&b[3]===0x47)forced='image/png';
    // TIFF II*\0 or MM\0*
    else if(b.length>=4&&((b[0]===0x49&&b[1]===0x49&&b[2]===0x2A&&b[3]===0x00)||(b[0]===0x4D&&b[1]===0x4D&&b[2]===0x00&&b[3]===0x2A)))forced='image/tiff';
    if(!forced){
      if(/\.pdf($|\?)/.test(name))forced='application/pdf';
      else if(/\.(jpg|jpeg)($|\?)/.test(name))forced='image/jpeg';
      else if(/\.png($|\?)/.test(name))forced='image/png';
      else if(/\.(tif|tiff)($|\?)/.test(name))forced='image/tiff';
    }
    return forced?new Blob([blob],{type:forced}):blob;
  }catch(_e){
    return blob;
  }
}
let currentPdfFileId=null;
async function openPdfViewer(workId,fileId){
  const w=works.find(x=>x.id===workId)||(statsWorksCache&&statsWorksCache.find(x=>x.id===workId));
  const overlay=$('pdfViewerOverlay');
  const frame=$('pdfViewerFrame');
  const info=$('pdfViewerInfo');
  const title=$('pdfViewerTitle');
  currentPdfWorkId=workId;
  currentPdfFileId=fileId;
  title.textContent=w?(w.title||'PDF'):'PDF';
  if(w){
    const teacherName=(function(){var t=teachers.find(te=>te.id===Number(w.teacherId));return t&&t.fullName;})()||'';
    info.innerHTML=`
      <h3 style="margin:0 0 14px">${esc(w.title||'—')}</h3>
      <table style="min-width:auto;border-collapse:collapse">
        <tr><td style="font-weight:700;padding:4px 12px 4px 0">${esc(t('ui.works.infoTeacher')||'Педагог')}</td><td>${esc(teacherName)}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0">${esc(t('ui.works.infoIndicator')||'Показатель')}</td><td>${esc(indName(w.indicator))}</td></tr>
        ${w.indicator==='ARTICLE_TYPE'?`<tr><td style="font-weight:700;padding:4px 12px 4px 0">${esc(t('ui.works.infoArticleType')||'Тип статьи')}</td><td>${esc(artName(w.articleType))}</td></tr>`:''}
        <tr><td style="font-weight:700;padding:4px 12px 4px 0">${esc(t('ui.works.infoPublisher')||'Издатель')}</td><td>${esc(w.publisher||'—')}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0">${esc(t('ui.works.infoYear')||'Год')}</td><td>${w.year||'—'}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0">${esc(t('ui.works.infoStatus')||'Статус')}</td><td>${esc(statusLabel(w.completionStatus))}</td></tr>
      </table>
    `;
  }else{
    info.innerHTML='';
  }
  overlay.classList.add('open');
  document.body.style.overflow='hidden';
  frame.src='';
  try{
    const token=getAuthToken();
    let url=`${API}/upload.php?action=file&workId=${workId}&departmentId=${departmentId}`;
    if(fileId!=null&&fileId!=='legacy')url+=`&fileId=${fileId}`;
    const res=await fetch(url,{headers:{'Authorization':'Bearer '+token}});
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'HTTP '+res.status);}
    currentPdfFilename=parseFilenameFromContentDisposition(res.headers.get('Content-Disposition'));
    const blobRaw=await res.blob();
    const blob=await forceBlobMimeIfNeeded(blobRaw,currentPdfFilename);
    if(currentPdfBlobUrl)URL.revokeObjectURL(currentPdfBlobUrl);
    currentPdfBlobUrl=URL.createObjectURL(blob);
    frame.src=currentPdfBlobUrl;
  }catch(e){
    info.innerHTML+=`<div style="color:var(--danger);margin-top:14px;font-weight:600">${esc('Ошибка: '+e.message)}</div>`;
  }
}
function closePdfViewer(){
  const overlay=$('pdfViewerOverlay');
  overlay.classList.remove('open');
  $('pdfViewerFrame').src='';
  document.body.style.overflow='';
  if(currentPdfBlobUrl){URL.revokeObjectURL(currentPdfBlobUrl);currentPdfBlobUrl='';}
  currentPdfWorkId=0;
  currentPdfFileId=null;
  currentPdfFilename='';
}
async function downloadCurrentPdf(){
  if(!currentPdfBlobUrl)return;
  let fname=currentPdfFilename;
  if(!fname){
    const w=works.find(x=>x.id===currentPdfWorkId)||(statsWorksCache&&statsWorksCache.find(x=>x.id===currentPdfWorkId));
    const pdfs=w?getWorkPdfs(w):[];
    const p=currentPdfFileId!=null?pdfs.find(x=>x.id===currentPdfFileId):pdfs[0];
    fname=(p&&p.name)||(w&&w.originalFileName)||(w&&w.title)||'work_'+currentPdfWorkId;
  }
  fname=fixMojibakeFilename(fname);
  if(!fname)fname='document';
  if(!/\.(pdf|jpg|jpeg|png|tiff|tif)$/i.test(fname))fname+='.pdf';
  const a=document.createElement('a');
  a.href=currentPdfBlobUrl;
  a.download=fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
window.delWork=async id=>{ if(!confirm(String(t('ui.dialogs.confirmDeleteWork'))))return; try{ await api(`/departments/${departmentId}/scientific-works/${id}`,{method:'DELETE'}); toast(String(t('ui.toasts.deleted'))); await loadWorks(); await loadPlans(); await loadStats(); }catch(e){toast('Ошибка: '+e.message);} };
window.editWork=async id=>{
  let w=works.find(x=>x.id==id||String(x.id)===String(id));
  if(!w){ await loadWorks(); w=works.find(x=>x.id==id||String(x.id)===String(id)); }
  if(!w){ toast(String(t('ui.toasts.workNotFound')||'Работа не найдена')); return; }
  try{ await openWorkModal(w); }catch(e){ console.error('openWorkModal:',e); toast('Ошибка: '+(e&&e.message||e)); }
};

const workChange=()=>{resetWorksFocus();saveUIState();loadWorks();};
if($('workTeacherSel'))$('workTeacherSel').onchange=workChange;
if($('workYearSel'))$('workYearSel').onchange=workChange;
if($('workFilterInd'))$('workFilterInd').onchange=workChange;
if($('workFilterSrc'))$('workFilterSrc').onchange=workChange;
if($('workFilterArticleType'))$('workFilterArticleType').onchange=workChange;
if($('workRefreshBtn'))$('workRefreshBtn').onclick=()=>{ loadWorks(); loadPlans(); };
if($('workAddOpenBtn'))$('workAddOpenBtn').onclick=()=>openWorkModal();

// Функции для работы с планом (как в оригинале)
function plannedCalendarYearFromAcademic(academicYear,month){
  if(!academicYear||!month)return null;
  const match=String(academicYear).match(/^(\d{4})-(\d{4})$/);
  if(!match)return null;
  const m=Number(month);
  return m>=8?+match[1]:+match[2];
}
async function getPlanMonthsForCurrentSelection(){
  const teacherId=$('wmTeacher').value, academicYear=$('wmYear').value;
  if(!academicYear)return [];
  const indicator=$('wmIndicator').value;
  let articleType=null;
  if(indicator==='ARTICLE_TYPE')articleType=$('wmArticleType').value||null;
  let planItems;
  if(indicator==='GRANT_PROJECTS'||indicator==='TOP1000_TRAINING'){
    planItems=allPlans.filter(p=>(p.teacherId==null||p.teacherId==='')&&p.academicYear===academicYear);
  }else{
    if(!teacherId)return [];
    planItems=allPlans.filter(p=>String(p.teacherId)===String(teacherId)&&p.academicYear===academicYear);
  }
  let matches=planItems.filter(p=>p.indicator===indicator);
  if(indicator==='ARTICLE_TYPE'){
    const artCode=normalizeArticleType(articleType||'');
    matches=matches.filter(p=>normalizeArticleType(p.articleType||'')===artCode);
  }
  return matches.map(p=>Number(p.plannedMonth||0)).filter(Boolean);
}
function getWosPlanCoauthorTeacherIdsForCurrentSelection(){
  const teacherId=Number($('wmTeacher').value||0);
  const academicYear=$('wmYear').value;
  if(!teacherId||!academicYear)return [];
  const indicator=$('wmIndicator').value;
  const articleType=normalizeArticleType($('wmArticleType').value||'');
  if(!(indicator==='ARTICLE_TYPE'&&articleType==='WOS_SCOPUS'))return [];
  const plannedMonth=Number(($('wmPlannedMonth')&&$('wmPlannedMonth').value)||0)||0;
  const yearWosPlans=allPlans.filter(p=>{
    if(String(p.academicYear||'')!==String(academicYear))return false;
    if(String(p.indicator||'')!=='ARTICLE_TYPE')return false;
    return normalizeArticleType(p.articleType||'')==='WOS_SCOPUS';
  });
  const matches=yearWosPlans.filter(p=>{
    const pTid=Number(p.teacherId||0);
    if(pTid!==teacherId)return false;
    return true;
  });
  const ids=[];
  matches.forEach(p=>{
    const arr=Array.isArray(p.coAuthorTeacherIds)?p.coAuthorTeacherIds:[];
    arr.forEach(v=>{
      const id=Number(v||0);
      if(id>0&&id!==teacherId)ids.push(id);
    });
  });
  const explicit=Array.from(new Set(ids));
  if(explicit.length)return explicit;

  // Fallback: derive coauthors from WOS/Scopus plan distribution when coAuthorTeacherIds is empty.
  const sameMonthPlans=(plannedMonth
    ? yearWosPlans.filter(p=>Number(p.plannedMonth||0)===plannedMonth)
    : yearWosPlans);
  const derived=sameMonthPlans
    .map(p=>Number(p.teacherId||0))
    .filter(id=>id>0&&id!==teacherId);
  if(derived.length)return Array.from(new Set(derived));

  const derivedByYear=yearWosPlans
    .map(p=>Number(p.teacherId||0))
    .filter(id=>id>0&&id!==teacherId);
  return Array.from(new Set(derivedByYear));
}
function applyWorkCoauthorOptionsByPlan(){
  const sel=$('wmCoAuthorTeachers'); if(!sel)return;
  const prevSelected=Array.from(sel.selectedOptions).map(o=>Number(o.value)).filter(x=>x>0);
  const indicator=$('wmIndicator').value;
  const articleType=normalizeArticleType($('wmArticleType').value||'');
  const source=$('wmSource').value;
  const isWosPlan=(source==='PLAN'&&indicator==='ARTICLE_TYPE'&&articleType==='WOS_SCOPUS');
  if(!isWosPlan){
    fillTeacherSelect(sel,false);
    Array.from(sel.options).forEach(o=>o.selected=prevSelected.includes(Number(o.value)));
    const help=$('wmCoAuthorHelp');
    if(help)help.textContent='Выберите педагогов-соавторов из кафедры. Баллы распределяются поровну: 1 / «Всего авторов». Если есть внешние соавторы (не из списка), увеличьте поле «Кол-во соавторов (всего авторов)».';
    updateWorkCoauthorAutoCount();
    return;
  }
  const recommendedIds=getWosPlanCoauthorTeacherIdsForCurrentSelection();
  fillTeacherSelect(sel,false);
  const hasPrevSelected=prevSelected.length>0;
  Array.from(sel.options).forEach(o=>{
    const id=Number(o.value);
    o.selected=hasPrevSelected ? prevSelected.includes(id) : recommendedIds.includes(id);
  });
  const help=$('wmCoAuthorHelp');
  if(help){
    help.textContent=recommendedIds.length
      ? 'Показаны все педагоги кафедры. Соавторы из плана WOS/Scopus выделены автоматически, при необходимости измените выбор.'
      : 'Показаны все педагоги кафедры. В плане WOS/Scopus нет соавторов для автоподстановки, выберите вручную.';
  }
  updateWorkCoauthorAutoCount();
}
function buildPlannedMonthSelectOptions(sel,monthsFromPlan,keepValue){
  const prev=keepValue!==undefined?String(keepValue||''):String(sel.value||'');
  const uniq=Array.from(new Set((monthsFromPlan||[]).map(x=>Number(x)).filter(Boolean)))
    .sort((a,b)=>academicMonthIndex(a)-academicMonthIndex(b));
  sel.innerHTML='';
  const o0=document.createElement('option');
  o0.value='';
  o0.textContent=String(uniq.length ? t('ui.common.autoAsPlan') : t('ui.common.chooseMonth'));
  sel.appendChild(o0);
  if(uniq.length){
    for(const m of uniq){
      const o=document.createElement('option');
      o.value=String(m);
      o.textContent=monthText(m);
      if(String(m)===prev || (!prev && m===uniq[0]))o.selected=true;
      sel.appendChild(o);
    }
  }else{
    for(const m of ACADEMIC_MONTH_ORDER){
      const o=document.createElement('option');
      o.value=String(m);
      o.textContent=monthText(m);
      if(String(m)===prev)o.selected=true;
      sel.appendChild(o);
    }
  }
}
function showWorkPlannedMonthIfNeeded(){
  const src=$('wmSource').value;
  $('wmPlannedMonthWrap').style.display=src==='PLAN'?'block':'none';
  if(src!=='PLAN'){
    $('wmPlannedMonth').innerHTML='';
    $('wmPlannedMonth').value='';
  }
}
async function refreshWorkPlannedMonthSelect(keepValue){
  showWorkPlannedMonthIfNeeded();
  if($('wmSource').value!=='PLAN')return;
  const monthsFromPlan=await getPlanMonthsForCurrentSelection();
  const valueToKeep = keepValue === true ? $('wmPlannedMonth').value : keepValue;
  buildPlannedMonthSelectOptions($('wmPlannedMonth'),monthsFromPlan,valueToKeep);
}
async function findPlannedDateTextForSelection(){
  const teacherId=$('wmTeacher').value, academicYear=$('wmYear').value;
  if(!teacherId||!academicYear)return '';
  const source=$('wmSource').value;
  if(source!=='PLAN')return String(t('ui.planInfo.outOfPlan'));
  const indicator=$('wmIndicator').value;
  let articleType=null;
  if(indicator==='ARTICLE_TYPE'){
    articleType=$('wmArticleType').value||null;
    if(!articleType)return String(t('ui.planInfo.needArticleType'));
  }
  const monthsFromPlan=await getPlanMonthsForCurrentSelection();
  const uniqMonths=Array.from(new Set(monthsFromPlan)).sort((a,b)=>academicMonthIndex(a)-academicMonthIndex(b));
  const chosen=Number($('wmPlannedMonth').value||0)||null;
  if(!uniqMonths.length){
    return String(t('ui.planInfo.noMonthInPlan'));
  }
  if(uniqMonths.length>1&&!chosen){
    const list=uniqMonths.map(m=>monthText(m)).join(', ');
    const fn=t('ui.planInfo.manyMonths');
    return (typeof fn==='function')?fn(list):String(fn);
  }
  const effectiveMonth=chosen||(uniqMonths.length===1?uniqMonths[0]:null);
  if(!effectiveMonth)return String(t('ui.planInfo.choosePlannedMonth'));
  const y=plannedCalendarYearFromAcademic(academicYear,effectiveMonth);
  const m=monthText(effectiveMonth);
  const fn=t('ui.planInfo.credited');
  return (typeof fn==='function')?fn(m,y):String(fn);
}
async function updatePlannedInfo(){
  applyWorkCoauthorOptionsByPlan();
  await refreshWorkPlannedMonthSelect(true);
  $('wmPlannedInfo').textContent=await findPlannedDateTextForSelection();
}
function updateWorkCoauthorAutoCount(){
  const teacherId=$('wmTeacher').value;
  const selected=Array.from($('wmCoAuthorTeachers').selectedOptions).map(o=>+o.value).filter(id=>id&&id!==+teacherId);
  const minAuthors=1+selected.length;
  const el=$('wmCoAuthors');
  if(!el)return;
  const cur=parseInt(el.value,10)||1;
  const prevMin=parseInt(el.dataset.autoMin||'1',10);
  if(cur<=prevMin||cur<minAuthors){
    el.value=String(minAuthors);
  }
  el.dataset.autoMin=String(minAuthors);
}
if($('wmCoAuthorTeachers'))$('wmCoAuthorTeachers').onchange=updateWorkCoauthorAutoCount;
enableEasyMultiSelect($('pmCoAuthorTeachers'));
enableEasyMultiSelect($('wmCoAuthorTeachers'));
enableEasyMultiSelect($('wmGrantParticipants'));
if($('wmCoAuthorClearBtn'))$('wmCoAuthorClearBtn').onclick=()=>{
  Array.from($('wmCoAuthorTeachers').options).forEach(o=>o.selected=false);
  updateWorkCoauthorAutoCount();
};

// Work Modal
async function openWorkModal(w=null){
  // Загружаем все планы, если ещё не загружены
  if(!allPlans.length) await refreshAllPlans();
  let openWorkModalGrantIds=[];
  editingWorkId=w?w.id:null;
  $('workModalTitle').textContent=w?String(t('ui.works.modalTitleEdit')):String(t('ui.works.modalTitleAdd'));
  fillTeacherSelect($('wmTeacher'),false,(w&&w.teacherId));
  fillYears($('wmYear'),(w&&w.academicYear)||($('workYearSel')?$('workYearSel').value:undefined));
  fillIndicatorSelect($('wmIndicator'),false);
  fillArticleTypeSelect($('wmArticleType'));
  fillMonthSelect($('wmMonth'),false);
  fillMonthSelect($('wmPlannedMonth'),true);
  fillMonthSelect($('wmPatentMonth'),false);
  fillMonthSelect($('wmCertMonth'),false);
  fillXorijiyTilSelects();
  fillEducationDirectionDatalist('wmTop1000Direction','wmTop1000DirectionList');
  fillEducationDirectionDatalist('wmEducationDirectionCode','wmEducationDirectionCodeList');
  fillTeacherSelect($('wmCoAuthorTeachers'),false);
  if(w){
    $('wmSource').value=w.source||'PLAN';
    $('wmIndicator').value=w.indicator;
    $('wmArticleType').value=w.articleType||'';
    $('wmCitations').value=w.citationsCount||'';
    $('wmHIndex').value=w.hIndex||'';
    $('wmTitle').value=w.title||'';
    $('wmPublisher').value=w.publisher||'';
    $('wmCouncil').value=w.coordCouncilName||'';
    $('wmCertNo').value=w.decisionNumber||'';
    $('wmMonth').value=w.month||'';
    $('wmPubYear').value=w.year||'';
    $('wmPlannedMonth').value=w.plannedMonth||'';
    $('wmCoAuthors').value=w.coAuthorsCount||1;
    $('wmSiteUrl').value=w.siteUrl||'';
    $('wmFileUrl').value=w.fileUrl||'';
    wmPdfPendingArray=[];
    $('wmPdfInput').value='';
    renderWmPdfList(w);
    $('wmStatus').value=w.completionStatus||'NOT_DONE';
    $('wmPatentNo').value=w.patentNumber||'';
    $('wmPatentDay').value=w.patentDay||'';
    $('wmPatentMonth').value=w.patentMonth||'';
    $('wmPatentYear').value=w.patentYear||'';
    $('wmPatentIssuedBy').value=w.patentIssuedBy||'';
    $('wmCertDay').value=w.certDay||'';
    $('wmCertMonth').value=w.certMonth||'';
    $('wmCertYear').value=w.certYear||'';
    if($('wmTop1000Direction'))$('wmTop1000Direction').value=w.top1000DirectionName||'';
    if($('wmTop1000Hours'))$('wmTop1000Hours').value=w.top1000TrainingHours||'';
    if($('wmTop1000Cert'))$('wmTop1000Cert').value=w.top1000CertNumbers||'';
    if($('wmGrantName'))$('wmGrantName').value=w.grantName||'';
    if($('wmGrantDuration'))$('wmGrantDuration').value=w.grantDuration||'';
    if($('wmGrantPartner'))$('wmGrantPartner').value=w.grantPartnerForeign||'';
    if($('wmGrantAmount'))$('wmGrantAmount').value=w.grantAmountUsd||'';
    if($('wmIlmiyDaraja'))$('wmIlmiyDaraja').value=w.ilmiyDaraja||'';
    if($('wmIlmiyUnvon'))$('wmIlmiyUnvon').value=w.ilmiyUnvon||'';
    if($('wmEducationDirectionCode'))$('wmEducationDirectionCode').value=w.educationDirectionCode||'';
    if($('wmSpecialtyCode'))$('wmSpecialtyCode').value=w.specialtyCode||'';
    if($('wmDiplomRaqami'))$('wmDiplomRaqami').value=w.diplomRaqami||'';
    if($('wmDegreeDate'))$('wmDegreeDate').value=w.degreeDate||'';
    if($('wmXorijiyTilFanNomi'))$('wmXorijiyTilFanNomi').value=w.xorijiyTilFanNomi||'';
    if($('wmXorijiyTilFanYonalish'))$('wmXorijiyTilFanYonalish').value=w.xorijiyTilFanYonalish||'';
    if($('wmXorijiyTilMashgulotTuri'))$('wmXorijiyTilMashgulotTuri').value=w.xorijiyTilMashgulotTuri||'';
    if($('wmXorijiyTilTil'))$('wmXorijiyTilTil').value=w.xorijiyTilTil||'';
    if($('wmXorijiyTilMashgulotSoati'))$('wmXorijiyTilMashgulotSoati').value=w.xorijiyTilMashgulotSoati||'';
    grantParticipantOtherNamesArray=parseGrantParticipantNames(w.grantParticipantNames);
    renderGrantParticipantNamesList();
    const coIds=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds:[];
    Array.from($('wmCoAuthorTeachers').options).forEach(o=>o.selected=coIds.includes(+o.value));
    openWorkModalGrantIds=Array.isArray(w.grantParticipantTeacherIds)?w.grantParticipantTeacherIds:[];
  }else{
    $('wmSource').value='PLAN';$('wmCitations').value='';$('wmHIndex').value='';$('wmTitle').value='';$('wmPublisher').value='';
    $('wmCouncil').value='';$('wmCertNo').value='';$('wmMonth').value='';$('wmPubYear').value='';
    $('wmPlannedMonth').value='';$('wmCoAuthors').value='1';$('wmSiteUrl').value='';$('wmFileUrl').value='';
    wmPdfPendingArray=[];$('wmPdfInput').value='';renderWmPdfList(null);
    $('wmStatus').value='NOT_DONE';$('wmPatentNo').value='';$('wmPatentDay').value='';$('wmPatentMonth').value='';
    $('wmPatentYear').value='';$('wmPatentIssuedBy').value='';$('wmCertDay').value='';$('wmCertMonth').value='';$('wmCertYear').value='';
    if($('wmTop1000Direction'))$('wmTop1000Direction').value='';if($('wmTop1000Hours'))$('wmTop1000Hours').value='';if($('wmTop1000Cert'))$('wmTop1000Cert').value='';
    if($('wmGrantName'))$('wmGrantName').value='';if($('wmGrantDuration'))$('wmGrantDuration').value='';if($('wmGrantPartner'))$('wmGrantPartner').value='';if($('wmGrantAmount'))$('wmGrantAmount').value='';
    if($('wmIlmiyDaraja'))$('wmIlmiyDaraja').value='';if($('wmIlmiyUnvon'))$('wmIlmiyUnvon').value='';if($('wmEducationDirectionCode'))$('wmEducationDirectionCode').value='';if($('wmSpecialtyCode'))$('wmSpecialtyCode').value='';if($('wmDiplomRaqami'))$('wmDiplomRaqami').value='';if($('wmDegreeDate'))$('wmDegreeDate').value='';
    if($('wmXorijiyTilFanNomi'))$('wmXorijiyTilFanNomi').value='';if($('wmXorijiyTilFanYonalish'))$('wmXorijiyTilFanYonalish').value='';if($('wmXorijiyTilMashgulotTuri'))$('wmXorijiyTilMashgulotTuri').value='';if($('wmXorijiyTilTil'))$('wmXorijiyTilTil').value='';if($('wmXorijiyTilMashgulotSoati'))$('wmXorijiyTilMashgulotSoati').value='';
    if($('wmCertForeignLang'))$('wmCertForeignLang').value='';if($('wmCertDarajasi'))$('wmCertDarajasi').value='';if($('wmCertUmumiyBali'))$('wmCertUmumiyBali').value='';
    grantParticipantOtherNamesArray=[];renderGrantParticipantNamesList();if($('wmGrantParticipantNameInput'))$('wmGrantParticipantNameInput').value='';
    Array.from($('wmCoAuthorTeachers').options).forEach(o=>o.selected=false);
    if($('wmGrantParticipants'))Array.from($('wmGrantParticipants').options).forEach(o=>o.selected=false);
    openWorkModalGrantIds=[];
  }
  await updateWorkModalFields();
  if(w&&w.indicator==='XORIJIY_TIL_SERTIFIKAT'){
    if($('wmCertForeignLang'))$('wmCertForeignLang').value=w.certForeignLang||'';
    if($('wmCertDarajasi'))$('wmCertDarajasi').value=w.certDarajasi||'';
    if($('wmCertUmumiyBali'))$('wmCertUmumiyBali').value=w.certUmumiyBali||'';
  }
  if(openWorkModalGrantIds.length&&$('wmGrantParticipants'))Array.from($('wmGrantParticipants').options).forEach(o=>o.selected=openWorkModalGrantIds.includes(+o.value));
  updateWorkCoauthorAutoCount();
  const saveBtn=$('wmSaveBtn');
  if(saveBtn){
    saveBtn.disabled=false;
    saveBtn.textContent=String(t('ui.workModal.save')||'Сохранить');
  }
  const modal=$('workModal');
  if(!modal){ throw new Error('Модальное окно не найдено'); }
  modal.classList.remove('hidden');
}
function closeWorkModal(){ $('workModal').classList.add('hidden'); editingWorkId=null; }
function renderWmPdfList(w){
  const list=$('wmPdfList'); if(!list)return;
  const pdfs=w?getWorkPdfs(w):[];
  let html='';
  pdfs.forEach(p=>{
    const name=esc(p.name||p.file||'PDF');
    html+=`<div class="wm-pdf-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <button type="button" class="btn secondary small" onclick="previewPdf(${w.id},${typeof p.id==='number'?p.id:'null'})" title="${esc(t('ui.works.viewPdf'))}">&#128196;</button>
      <span class="small muted" style="flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name}</span>
      <button type="button" class="btn danger small" onclick="wmPdfDeleteRow(${w.id},${typeof p.id==='number'?p.id:'null'})" title="${esc(t('ui.works.deletePdf'))}">&#10005;</button>
    </div>`;
  });
  wmPdfPendingArray.forEach((item,i)=>{
    const name=esc(item.displayName||item.file.name||'PDF');
    html+=`<div class="wm-pdf-row wm-pdf-pending" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span class="small muted" style="flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name}</span>
      <button type="button" class="btn danger small" onclick="wmPdfRemovePending(${i})" title="${esc(t('ui.works.deletePdf'))}">&#10005;</button>
    </div>`;
  });
  list.innerHTML=html||'';
}
window.wmPdfDeleteRow=async(workId,fileId)=>{
  if(!confirm(t('ui.dialogs.confirmDeleteFile')||'Удалить файл?'))return;
  try{
    const token=getAuthToken();
    let url=`${API}/upload.php?action=delete&workId=${workId}&departmentId=${departmentId}`;
    if(fileId!=null)url+=`&fileId=${fileId}`;
    await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+token}});
    await loadWorks();
    const w=works.find(x=>x.id===workId);
    renderWmPdfList(w);
  }catch(e){toast('Ошибка: '+e.message);}
};
window.wmPdfRemovePending=(i)=>{
  wmPdfPendingArray.splice(i,1);
  renderWmPdfList(editingWorkId?works.find(x=>x.id===editingWorkId):null);
};
function profilePlatformName(code){
  const p=PROFILE_PLATFORMS.find(x=>x.code===code);
  return p?String(t('ui.workModal.'+p.key)||code):code;
}
function renderTeacherProfileLinksList(){
  const list=$('tmProfileLinksList');if(!list)return;
  let html='';
  teacherProfileLinksArray.forEach((item,i)=>{
    const platOpts=PROFILE_PLATFORMS.map(p=>`<option value="${esc(p.code)}"${item.platform===p.code?' selected':''}>${esc(profilePlatformName(p.code))}</option>`).join('');
    const otherRow=item.platform==='OTHER'?`<input type="text" class="tm-profile-other-name" data-idx="${i}" placeholder="${esc(t('ui.workModal.profilePlatformOtherName')||'Название')}" value="${esc(item.name||'')}" style="width:120px" />`:'';
    html+=`<div class="tm-profile-row row" style="align-items:center;gap:6px;flex-wrap:wrap" data-idx="${i}">
      <select class="tm-profile-platform" data-idx="${i}" style="min-width:140px">${platOpts}</select>
      ${otherRow}
      <input type="url" class="tm-profile-url" data-idx="${i}" placeholder="https://..." value="${esc(item.url||'')}" style="flex:1;min-width:180px" />
      <button type="button" class="btn danger small" onclick="teacherProfileLinkRemove(${i})" title="${esc(t('ui.works.deletePdf')||'Удалить')}">&#10005;</button>
    </div>`;
  });
  list.innerHTML=html||'';
  list.querySelectorAll('.tm-profile-platform').forEach(sel=>sel.onchange=()=>{teacherProfileLinksArray[+sel.dataset.idx].platform=sel.value;if(sel.value==='OTHER')teacherProfileLinksArray[+sel.dataset.idx].name=teacherProfileLinksArray[+sel.dataset.idx].name||'';renderTeacherProfileLinksList();});
  list.querySelectorAll('.tm-profile-url').forEach(inp=>inp.oninput=()=>{teacherProfileLinksArray[+inp.dataset.idx].url=inp.value;});
  list.querySelectorAll('.tm-profile-other-name').forEach(inp=>inp.oninput=()=>{teacherProfileLinksArray[+inp.dataset.idx].name=inp.value;});
}
window.teacherProfileLinkAdd=()=>{teacherProfileLinksArray.push({platform:'GOOGLE_SCHOLAR',url:''});renderTeacherProfileLinksList();};
window.teacherProfileLinkRemove=(i)=>{teacherProfileLinksArray.splice(i,1);renderTeacherProfileLinksList();};
if($('tmProfileLinkAddBtn'))$('tmProfileLinkAddBtn').onclick=()=>teacherProfileLinkAdd();
if($('wmGrantParticipantNameAddBtn'))$('wmGrantParticipantNameAddBtn').onclick=()=>grantParticipantNameAdd();
const wmGrantNameInp=$('wmGrantParticipantNameInput');if(wmGrantNameInp)wmGrantNameInp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();grantParticipantNameAdd();}});

function parseGrantParticipantNames(str){
  if(!str||typeof str!=='string')return [];
  return str.split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean);
}
function renderGrantParticipantNamesList(){
  const list=$('wmGrantParticipantNamesList');if(!list)return;
  let html='';
  grantParticipantOtherNamesArray.forEach((name,i)=>{
    html+=`<div class="row" style="align-items:center;gap:6px;flex-wrap:wrap" data-idx="${i}">
      <span class="small" style="flex:1;min-width:120px">${esc(name)}</span>
      <button type="button" class="btn danger small" onclick="grantParticipantNameRemove(${i})" title="${esc(t('ui.works.deletePdf')||'Удалить')}">&#10005;</button>
    </div>`;
  });
  list.innerHTML=html||'';
}
window.grantParticipantNameAdd=()=>{
  const inp=$('wmGrantParticipantNameInput');if(!inp)return;
  const v=inp.value.trim();if(!v)return;
  grantParticipantOtherNamesArray.push(v);
  inp.value='';
  renderGrantParticipantNamesList();
};
window.grantParticipantNameRemove=(i)=>{grantParticipantOtherNamesArray.splice(i,1);renderGrantParticipantNamesList();};
async function updateWorkModalFields(){
  const ind=$('wmIndicator').value, src=$('wmSource').value;
  const isTop1000=ind==='TOP1000_TRAINING';
  const isGrantProjects=ind==='GRANT_PROJECTS';
  const isCitations=ind==='CITATIONS';
  const isXorijiyTil=ind==='XORIJIY_TIL_MASHGULOT';
  const isDegreeUnvon=(ind==='DSC_PROFESSOR_UNVON'||ind==='PHD_DOTSENT_UNVON'||ind==='XORIJIY_TIL_SERTIFIKAT');
  const isDegreeOrXorijiy=(isDegreeUnvon||isXorijiyTil);
  const isDoctorateUnvon=(ind==='DSC_PROFESSOR_UNVON'||ind==='PHD_DOTSENT_UNVON');
  const isXorijiyTilSertifikat=(ind==='XORIJIY_TIL_SERTIFIKAT');
  $('wmTeacherWrap').style.display=isGrantProjects?'none':'block';
  $('wmArticleTypeWrap').style.display=(isTop1000||isGrantProjects||isDegreeOrXorijiy?false:ind==='ARTICLE_TYPE')?'block':'none';
  $('wmCitationsWrap').style.display=(isTop1000||isGrantProjects||isDegreeOrXorijiy?false:isCitations)?'block':'none';
  $('wmHIndexWrap').style.display=isCitations?'block':'none';
  $('wmPatentFields').style.display=(isTop1000||isGrantProjects||isDegreeOrXorijiy?false:ind==='PATENTS')?'block':'none';
  $('wmTop1000Fields').style.display=isTop1000?'block':'none';
  $('wmDegreeUnvonFields').style.display=isDoctorateUnvon?'block':'none';
  $('wmXorijiyTilFields').style.display=isXorijiyTil?'block':'none';
  $('wmXorijiyTilSertifikatFields').style.display=isXorijiyTilSertifikat?'block':'none';
  $('wmGrantFields').style.display=isGrantProjects?'block':'none';
  $('wmCouncilWrap').style.display=(isTop1000||isGrantProjects||isDegreeOrXorijiy?false:COUNCIL_INDICATORS.has(ind))?'block':'none';
  $('wmCertNoWrap').style.display=(isTop1000||isGrantProjects||(isDegreeOrXorijiy&&!isXorijiyTilSertifikat)?false:COUNCIL_INDICATORS.has(ind)||isXorijiyTilSertifikat)?'block':'none';
  $('wmCertDateFields').style.display=(isTop1000||isGrantProjects||(isDegreeOrXorijiy&&!isXorijiyTilSertifikat)?false:COUNCIL_INDICATORS.has(ind)||isXorijiyTilSertifikat)?'block':'none';
  $('wmPlannedMonthWrap').style.display=(isCitations?false:src==='PLAN')?'block':'none';
  if(isCitations){
    $('wmSourceWrap').style.display='none';
    $('wmTitleWrap').style.display='none';
    $('wmPublisherWrap').style.display='none';
    $('wmMonthWrap').style.display='none';
    $('wmPubYearWrap').style.display='none';
    $('wmPlannedMonthWrap').style.display='none';
    const wmPlannedInfo=$('wmPlannedInfo');if(wmPlannedInfo)wmPlannedInfo.style.display='none';
    $('wmCoAuthorsWrap').style.display='none';
    $('wmCoAuthorTeachersWrap').style.display='none';
    $('wmSiteUrlWrap').style.display='none';
    $('wmFileUrlWrap').style.display='none';
    $('wmPdfWrap').style.display='none';
    $('wmStatusWrap').style.display='block';
  }else if(isDegreeUnvon){
    $('wmSourceWrap').style.display='block';
    const wmPlannedInfo=$('wmPlannedInfo');if(wmPlannedInfo)wmPlannedInfo.style.display='';
    $('wmTitleWrap').style.display='none';
    $('wmPublisherWrap').style.display='none';
    $('wmMonthWrap').style.display='block';
    $('wmPubYearWrap').style.display='none';
    $('wmCoAuthorsWrap').style.display='none';
    $('wmCoAuthorTeachersWrap').style.display='none';
    $('wmSiteUrlWrap').style.display='none';
    $('wmFileUrlWrap').style.display='block';
    $('wmPdfWrap').style.display='block';
    $('wmStatusWrap').style.display='block';
    if(isDoctorateUnvon){
      if($('wmIlmiyDarajaLabel'))$('wmIlmiyDarajaLabel').textContent=String(t('ui.workModal.ilmiyDaraja')||'Ilmiy daraja');
      if($('wmIlmiyUnvonLabel'))$('wmIlmiyUnvonLabel').textContent=String(t('ui.workModal.ilmiyUnvon')||'Ilmiy unvon');
      if($('wmEducationDirectionCodeLabel'))$('wmEducationDirectionCodeLabel').textContent=String(t('ui.workModal.educationDirectionCode')||'Yoʻnalish kodi');
      if($('wmEducationDirectionCode'))$('wmEducationDirectionCode').placeholder=String(t('ui.workModal.directionSearchPh')||'Qidirish (kod yoki nom)');
      if($('wmSpecialtyCodeLabel'))$('wmSpecialtyCodeLabel').textContent=String(t('ui.workModal.specialtyCode')||'Код специальности');
      if($('wmSpecialtyCode'))$('wmSpecialtyCode').placeholder=String(t('ui.workModal.specialtyCodePh')||'По классификатору');
      if($('wmDiplomRaqamiLabel'))$('wmDiplomRaqamiLabel').textContent=String(t('ui.workModal.diplomRaqami')||'Diplom raqami');
      if($('wmDiplomRaqami'))$('wmDiplomRaqami').placeholder=String(t('ui.workModal.diplomRaqamiPh')||'№ диплома');
      if($('wmDegreeDateLabel'))$('wmDegreeDateLabel').textContent=String(t('ui.workModal.degreeDate')||'Дата');
      const darajaSel=$('wmIlmiyDaraja'),unvonSel=$('wmIlmiyUnvon');
      if(darajaSel){
        const o0=darajaSel.querySelector('option[value=""]');if(o0)o0.textContent=String(t('ui.common.choose')||'—');
        ['CANDIDATE','PHD','DSC'].forEach(c=>{const o=darajaSel.querySelector('option[value="'+c+'"]');if(o&&ILMIY_DARAJA_NAMES[c])o.textContent=currentLang==='uz'?ILMIY_DARAJA_NAMES[c].uz:ILMIY_DARAJA_NAMES[c].ru;});
      }
      if(unvonSel){
        const o0=unvonSel.querySelector('option[value=""]');if(o0)o0.textContent=String(t('ui.common.choose')||'—');
        ['DOTSENT','PROFESSOR'].forEach(c=>{const o=unvonSel.querySelector('option[value="'+c+'"]');if(o&&ILMIY_UNVON_NAMES[c])o.textContent=currentLang==='uz'?ILMIY_UNVON_NAMES[c].uz:ILMIY_UNVON_NAMES[c].ru;});
      }
    }
    if(isXorijiyTilSertifikat){
      const cnLbl=$('wmCertNo')&&$('wmCertNo').closest('label'); if(cnLbl&&cnLbl.childNodes[0])cnLbl.childNodes[0].textContent=String(t('ui.workModal.certSertifikatRaqami')||'Sertifikat raqami №');
      const certDateLbl=$('wmCertDay')&&$('wmCertDay').closest('label'); if(certDateLbl&&certDateLbl.childNodes[0])certDateLbl.childNodes[0].textContent=String(t('ui.workModal.certOlinganSanasi')||'Olingan sanasi');
      if($('wmCertForeignLangLabel'))$('wmCertForeignLangLabel').textContent=String(t('ui.workModal.certChetTiliNomi')||'Chet tili nomi');
      if($('wmCertDarajasiLabel'))$('wmCertDarajasiLabel').textContent=String(t('ui.workModal.certDarajasi')||'Darajasi');
      if($('wmCertUmumiyBaliLabel'))$('wmCertUmumiyBaliLabel').textContent=String(t('ui.workModal.certUmumiyBali')||'Umumiy bali');
      const cfl=$('wmCertForeignLang'); if(cfl){ cfl.innerHTML=`<option value="">${esc(t('ui.common.choose'))}</option>`+Object.entries(XORIJIY_TIL_NAMES).map(([code,labels])=>`<option value="${esc(code)}">${esc(currentLang==='uz'?labels.uz:labels.ru)}</option>`).join(''); }
    }
  }else if(isTop1000){
    $('wmSourceWrap').style.display='block';
    const wmPlannedInfo2=$('wmPlannedInfo');if(wmPlannedInfo2)wmPlannedInfo2.style.display='';
    $('wmTitleWrap').style.display='none';
    $('wmPublisherWrap').style.display='block';
    if($('wmPublisherLabel'))$('wmPublisherLabel').textContent=String(t('ui.workModal.receivingOrg')||'Название принимающей организации');
    if($('wmTop1000DirectionLabel'))$('wmTop1000DirectionLabel').textContent=String(t('ui.workModal.top1000DirectionCode')||'Yoʻnalish kodi');
    if($('wmTop1000Direction'))$('wmTop1000Direction').placeholder=String(t('ui.workModal.directionSearchPh')||'Qidirish (kod yoki nom)');
    if($('wmTop1000HoursLabel'))$('wmTop1000HoursLabel').textContent=String(t('ui.workModal.top1000Hours')||'Учебные часы');
    if($('wmTop1000CertLabel'))$('wmTop1000CertLabel').textContent=String(t('ui.workModal.top1000CertNumbers')||'Номера сертификатов');
    $('wmMonthWrap').style.display='block';
    $('wmPubYearWrap').style.display='none';
    $('wmCoAuthorsWrap').style.display='none';
    $('wmCoAuthorTeachersWrap').style.display='none';
    $('wmSiteUrlWrap').style.display='none';
    $('wmFileUrlWrap').style.display='block';
    $('wmPdfWrap').style.display='block';
    $('wmStatusWrap').style.display='block';
  }else if(isXorijiyTil){
    $('wmSourceWrap').style.display='block';
    const wmPlannedInfo3=$('wmPlannedInfo');if(wmPlannedInfo3)wmPlannedInfo3.style.display='';
    $('wmTitleWrap').style.display='none';
    if($('wmXorijiyTilFanNomiLabel'))$('wmXorijiyTilFanNomiLabel').textContent=String(t('ui.workModal.xorijiyTilFanNomi')||"Fan nomi");
    if($('wmXorijiyTilFanYonalishLabel'))$('wmXorijiyTilFanYonalishLabel').textContent=String(t('ui.workModal.xorijiyTilFanYonalish')||"Fan yo'nalish");
    if($('wmXorijiyTilMashgulotTuriLabel'))$('wmXorijiyTilMashgulotTuriLabel').textContent=String(t('ui.workModal.xorijiyTilMashgulotTuri')||"Mashg'ulot turi");
    if($('wmXorijiyTilTilLabel'))$('wmXorijiyTilTilLabel').textContent=String(t('ui.workModal.xorijiyTilTil')||"Qaysi xorijiy tilda");
    if($('wmXorijiyTilMashgulotSoatiLabel'))$('wmXorijiyTilMashgulotSoatiLabel').textContent=String(t('ui.workModal.xorijiyTilMashgulotSoati')||"Mashg'ulot soati");
    $('wmPublisherWrap').style.display='none';
    $('wmMonthWrap').style.display='block';
    $('wmPubYearWrap').style.display='none';
    $('wmCoAuthorsWrap').style.display='none';
    $('wmCoAuthorTeachersWrap').style.display='none';
    $('wmSiteUrlWrap').style.display='none';
    $('wmFileUrlWrap').style.display='block';
    $('wmPdfWrap').style.display='block';
    $('wmStatusWrap').style.display='block';
  }else if(isGrantProjects){
    $('wmSourceWrap').style.display='block';
    const wmPlannedInfo4=$('wmPlannedInfo');if(wmPlannedInfo4)wmPlannedInfo4.style.display='';
    $('wmTitleWrap').style.display='none';
    if($('wmTitle')&&$('wmTitle').closest('label')&&$('wmTitle').closest('label').childNodes[0])$('wmTitle').closest('label').childNodes[0].textContent=String(t('ui.workModal.title')||'Название работы');
    if($('wmTitle')&&t('ui.workModal.titlePh'))$('wmTitle').placeholder=String(t('ui.workModal.titlePh'));
    $('wmPublisherWrap').style.display='none';
    $('wmMonthWrap').style.display='block';
    $('wmPubYearWrap').style.display='none';
    $('wmCoAuthorsWrap').style.display='none';
    $('wmCoAuthorTeachersWrap').style.display='none';
    $('wmSiteUrlWrap').style.display='block';
    $('wmFileUrlWrap').style.display='block';
    $('wmPdfWrap').style.display='block';
    $('wmStatusWrap').style.display='block';
    if($('wmGrantNameLabel'))$('wmGrantNameLabel').textContent=String(t('ui.workModal.grantName')||'Grant nomi');
    if($('wmGrantDurationLabel'))$('wmGrantDurationLabel').textContent=String(t('ui.workModal.grantDuration')||'Muddati');
    if($('wmGrantPartnerLabel'))$('wmGrantPartnerLabel').textContent=String(t('ui.workModal.grantPartner')||'Hamkor xorijiy OTT');
    if($('wmGrantAmountLabel'))$('wmGrantAmountLabel').textContent=String(t('ui.workModal.grantAmount')||'Grant miqdori (AQSH doll.)');
    if($('wmGrantParticipantsLabel'))$('wmGrantParticipantsLabel').textContent=String(t('ui.workModal.grantParticipants')||'Grant ishtirokchilari');
    if($('wmGrantParticipantNameInput'))$('wmGrantParticipantNameInput').placeholder=String(t('ui.workModal.grantParticipantNamesPh')||'Ф.И.О. участников (если не из списка педагогов)');
    const addBtn=$('wmGrantParticipantNameAddBtn');if(addBtn)addBtn.textContent='+ '+(t('ui.workModal.grantParticipantAdd')||'Добавить');
    const gph=$('wmGrantParticipantsHint');if(gph)gph.textContent=String(t('ui.workModal.grantParticipantsHint')||'Выберите педагогов кафедры или укажите Ф.И.О. ниже');
    fillTeacherSelect($('wmGrantParticipants'),false);
  }else{
    $('wmSourceWrap').style.display='block';
    const wmPlannedInfo5=$('wmPlannedInfo');if(wmPlannedInfo5)wmPlannedInfo5.style.display='';
    $('wmTitleWrap').style.display='block';
    if($('wmTitle')&&$('wmTitle').closest('label')&&$('wmTitle').closest('label').childNodes[0])$('wmTitle').closest('label').childNodes[0].textContent=String(t('ui.workModal.title')||'Название работы');
    if($('wmTitle')&&t('ui.workModal.titlePh'))$('wmTitle').placeholder=String(t('ui.workModal.titlePh'));
    $('wmPublisherWrap').style.display='block';
    if($('wmPublisherLabel'))$('wmPublisherLabel').textContent=String(t('ui.workModal.publisher')||'Издательство / журнал');
    $('wmMonthWrap').style.display='block';
    $('wmPubYearWrap').style.display='block';
    $('wmCoAuthorsWrap').style.display='block';
    $('wmCoAuthorTeachersWrap').style.display='block';
    $('wmSiteUrlWrap').style.display='block';
    $('wmFileUrlWrap').style.display='block';
    $('wmPdfWrap').style.display='block';
    $('wmStatusWrap').style.display='block';
  }
  await updatePlannedInfo();
}
if($('wmIndicator'))$('wmIndicator').onchange=async()=>{await updateWorkModalFields();};
if($('wmSource'))$('wmSource').onchange=async()=>{await updateWorkModalFields();};
if($('wmArticleType'))$('wmArticleType').onchange=async()=>{await updatePlannedInfo();};
if($('wmTeacher'))$('wmTeacher').onchange=async()=>{await updatePlannedInfo();};
if($('wmYear'))$('wmYear').onchange=async()=>{await updatePlannedInfo();};
if($('wmPlannedMonth'))$('wmPlannedMonth').onchange=async()=>{await updatePlannedInfo();};

if($('wmPdfInput'))$('wmPdfInput').onchange=async()=>{
  const f=$('wmPdfInput').files[0];
  if(!f)return;
  if(f.size>20*1024*1024){alert(t('ui.alerts.fileTooLarge')||'Файл слишком большой (макс. 20 МБ)');$('wmPdfInput').value='';return;}
  const displayName=prompt(t('ui.works.pdfDisplayNamePrompt')||'Название файла (необязательно):',f.name.replace(/\.(pdf|jpg|jpeg|png|tiff|tif)$/i,''));
  $('wmPdfInput').value='';
  if(editingWorkId){
    try{
      const fd=new FormData(); fd.append('file',f,f.name||'document');
      if(displayName!==null&&String(displayName).trim())fd.append('displayName',String(displayName).trim());
      const token=getAuthToken();
      const res=await fetch(`${API}/upload.php?action=upload&workId=${editingWorkId}&departmentId=${departmentId}`,{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
      if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'Upload failed');
      await loadWorks();
      const w=works.find(x=>x.id===editingWorkId);
      renderWmPdfList(w);
      toast(t('ui.toasts.fileUploaded')||'Файл загружен');
    }catch(e){
      const msg=e&&e.message||'';
      const hint=(/failed to fetch|network|load failed/i.test(msg))?' Проверьте: сервер запущен, лимиты PHP (upload_max_filesize, post_max_size ≥25M).':'';
      toast('Ошибка: '+msg+hint);
    }
  }else{
    wmPdfPendingArray.push({file:f,displayName:displayName!==null&&String(displayName).trim()?String(displayName).trim():null});
    renderWmPdfList(null);
  }
};

if($('wmSaveBtn'))$('wmSaveBtn').onclick=async()=>{
  if(!departmentId){ notifyUser('Кафедра не выбрана. Откройте кабинет с параметром departmentId в URL.'); return; }
  const wmBtn=$('wmSaveBtn'); const wmOrig=wmBtn?wmBtn.textContent:'';
  if(wmBtn){ wmBtn.disabled=true; wmBtn.textContent='Сохранение...'; }
  try{
  const teacherId=$('wmTeacher').value, academicYear=$('wmYear').value;
  const indicator=$('wmIndicator').value, articleType=$('wmArticleType').value;
  const completionStatus=$('wmStatus').value;
  const coordCouncilName=$('wmCouncil').value.trim(), decisionNumber=$('wmCertNo').value.trim();
  const patentNumber=$('wmPatentNo').value.trim(), patentDay=$('wmPatentDay').value, patentMonth=$('wmPatentMonth').value, patentYear=$('wmPatentYear').value, patentIssuedBy=$('wmPatentIssuedBy').value.trim();
  const certDay=$('wmCertDay').value, certMonth=$('wmCertMonth').value, certYear=$('wmCertYear').value;
  const isCitations=indicator==='CITATIONS';
  let source, title, publisher, month, year, plannedMonth, coAuthorsCount, siteUrl, fileUrl, citationsCount, scientificPlatform, profileLink, hIndex, coAuthorTeacherIds;
  if(isCitations){
    source='PLAN';
    const monthsFromPlan=await getPlanMonthsForCurrentSelection();
    const uniqMonths=Array.from(new Set(monthsFromPlan)).sort((a,b)=>academicMonthIndex(a)-academicMonthIndex(b));
    plannedMonth=uniqMonths.length>=1?String(uniqMonths[0]):null;
    title=null;publisher=null;month=null;year=null;coAuthorsCount=1;siteUrl=null;fileUrl=null;
    citationsCount=$('wmCitations').value;
    scientificPlatform=null;
    profileLink=null;
    hIndex=$('wmHIndex').value;
    coAuthorTeacherIds=[];
  }else{
    source=$('wmSource').value;
    title=$('wmTitle').value.trim();publisher=$('wmPublisher').value.trim();
    month=$('wmMonth').value;year=$('wmPubYear').value;
    plannedMonth=$('wmPlannedMonth').value;
    coAuthorsCount=$('wmCoAuthors').value||1;
    siteUrl=$('wmSiteUrl').value.trim();fileUrl=$('wmFileUrl').value.trim();
    citationsCount=$('wmCitations').value;
    scientificPlatform=null;profileLink=null;hIndex=null;
    coAuthorTeacherIds=Array.from($('wmCoAuthorTeachers').selectedOptions).map(o=>+o.value).filter(x=>x&&x!==+teacherId);
  }
  
  const isGrantProjects=indicator==='GRANT_PROJECTS';
  if(!isGrantProjects&&!teacherId){ notifyUser(String(t('ui.alerts.needTeacher'))); return; }
  if(!indicator){ notifyUser(String(t('ui.alerts.needIndicator'))); return; }
  if(indicator==='ARTICLE_TYPE'&&!articleType){ notifyUser(String(t('ui.alerts.needArticleType'))); return; }
  const isXorijiyTilSave=indicator==='XORIJIY_TIL_MASHGULOT';
  const isXorijiyTilSertifikatSave=indicator==='XORIJIY_TIL_SERTIFIKAT';
  const isTop1000=indicator==='TOP1000_TRAINING';
  if(isTop1000&&!publisher){ notifyUser(String(t('ui.alerts.needReceivingOrg')||'Укажите название принимающей организации')); return; }
  const editingWork=editingWorkId?works.find(x=>x.id===editingWorkId):null;
  const hasAnyFile=!!fileUrl||wmPdfPendingArray.length>0||(editingWork&&getWorkPdfs(editingWork).length>0);
  if(!isCitations&&completionStatus==='DONE'&&!hasAnyFile){ notifyUser(String(t('ui.alerts.needFileForDone'))); return; }
  
  if(!isCitations&&source==='PLAN'&&!plannedMonth){
    const monthsFromPlan=await getPlanMonthsForCurrentSelection();
    const uniqMonths=Array.from(new Set(monthsFromPlan)).sort((a,b)=>academicMonthIndex(a)-academicMonthIndex(b));
    if(uniqMonths.length===1){
      plannedMonth=String(uniqMonths[0]);
    }else if(uniqMonths.length>1){
      notifyUser(String(t('ui.planInfo.manyMonthsShort'))); return;
    }
  }
  if(!isCitations&&source==='PLAN'&&!isGrantProjects&&!plannedMonth){ notifyUser(String(t('ui.alerts.needPlannedMonth'))); return; }
  
  const plannedYear=source==='PLAN'&&plannedMonth?plannedCalendarYearFromAcademic(academicYear,+plannedMonth):null;
  const top1000Direction=($('wmTop1000Direction')&&$('wmTop1000Direction').value)?$('wmTop1000Direction').value.trim():'';
  const top1000Specialty=null;
  const top1000Hours=($('wmTop1000Hours')&&$('wmTop1000Hours').value)?$('wmTop1000Hours').value.trim():'';
  const top1000Cert=($('wmTop1000Cert')&&$('wmTop1000Cert').value)?$('wmTop1000Cert').value.trim():'';
  const grantName=($('wmGrantName')&&$('wmGrantName').value)?$('wmGrantName').value.trim():'';
  const grantDuration=($('wmGrantDuration')&&$('wmGrantDuration').value)?$('wmGrantDuration').value.trim():'';
  const grantPartner=($('wmGrantPartner')&&$('wmGrantPartner').value)?$('wmGrantPartner').value.trim():'';
  const grantAmount=($('wmGrantAmount')&&$('wmGrantAmount').value)?$('wmGrantAmount').value.trim():'';
  const grantParticipantNames=Array.isArray(grantParticipantOtherNamesArray)&&grantParticipantOtherNamesArray.length?grantParticipantOtherNamesArray.join('\n'):'';
  const grantParticipantTeacherIds=isGrantProjects&&$('wmGrantParticipants')?Array.from($('wmGrantParticipants').selectedOptions).map(o=>+o.value).filter(x=>x):[];
  const isDoctorateUnvon=(indicator==='DSC_PROFESSOR_UNVON'||indicator==='PHD_DOTSENT_UNVON');
  const ilmiyDaraja=isDoctorateUnvon&&$('wmIlmiyDaraja')?$('wmIlmiyDaraja').value.trim()||null:null;
  const ilmiyUnvon=isDoctorateUnvon&&$('wmIlmiyUnvon')?$('wmIlmiyUnvon').value.trim()||null:null;
  const educationDirectionCode=isDoctorateUnvon&&$('wmEducationDirectionCode')?$('wmEducationDirectionCode').value.trim()||null:null;
  const specialtyCode=isDoctorateUnvon&&$('wmSpecialtyCode')?$('wmSpecialtyCode').value.trim()||null:null;
  const diplomRaqami=isDoctorateUnvon&&$('wmDiplomRaqami')?$('wmDiplomRaqami').value.trim()||null:null;
  const degreeDate=isDoctorateUnvon&&$('wmDegreeDate')?$('wmDegreeDate').value.trim()||null:null;
  const xorijiyTilFanNomi=isXorijiyTilSave&&$('wmXorijiyTilFanNomi')?$('wmXorijiyTilFanNomi').value.trim()||null:null;
  const xorijiyTilFanYonalish=isXorijiyTilSave&&$('wmXorijiyTilFanYonalish')?$('wmXorijiyTilFanYonalish').value.trim()||null:null;
  const xorijiyTilMashgulotTuri=isXorijiyTilSave&&$('wmXorijiyTilMashgulotTuri')?$('wmXorijiyTilMashgulotTuri').value||null:null;
  const xorijiyTilTil=isXorijiyTilSave&&$('wmXorijiyTilTil')?$('wmXorijiyTilTil').value||null:null;
  const xorijiyTilMashgulotSoati=isXorijiyTilSave&&$('wmXorijiyTilMashgulotSoati')?$('wmXorijiyTilMashgulotSoati').value.trim()||null:null;
  const certForeignLang=isXorijiyTilSertifikatSave&&$('wmCertForeignLang')?$('wmCertForeignLang').value||null:null;
  const certDarajasi=isXorijiyTilSertifikatSave&&$('wmCertDarajasi')?$('wmCertDarajasi').value.trim()||null:null;
  const certUmumiyBali=isXorijiyTilSertifikatSave&&$('wmCertUmumiyBali')?$('wmCertUmumiyBali').value.trim()||null:null;
  const body={teacherId:isGrantProjects?null:+teacherId,academicYear,source,indicator,
    articleType:indicator==='ARTICLE_TYPE'?articleType:null,
    citationsCount:indicator==='CITATIONS'?+citationsCount:null,
    scientificPlatform:null,profileLink:isCitations?profileLink:null,hIndex:isCitations&&(hIndex!==''&&hIndex!=null)?+hIndex:null,
    title:isXorijiyTilSave?null:(isTop1000?(publisher||'Обучение'):(title||null)),publisher:(isTop1000?null:isGrantProjects?null:publisher)||null,
    top1000DirectionName:isTop1000?top1000Direction||null:undefined,top1000SpecialtyCode:isTop1000?top1000Specialty||null:undefined,top1000TrainingHours:isTop1000?top1000Hours||null:undefined,top1000CertNumbers:isTop1000?top1000Cert||null:undefined,
    grantName:isGrantProjects?grantName||null:undefined,grantDuration:isGrantProjects?grantDuration||null:undefined,grantPartnerForeign:isGrantProjects?grantPartner||null:undefined,grantParticipantTeacherIds:isGrantProjects?grantParticipantTeacherIds:undefined,grantParticipantNames:isGrantProjects?grantParticipantNames||null:undefined,grantAmountUsd:isGrantProjects?grantAmount||null:undefined,
    ilmiyDaraja:isDoctorateUnvon?ilmiyDaraja:undefined,ilmiyUnvon:isDoctorateUnvon?ilmiyUnvon:undefined,educationDirectionCode:isDoctorateUnvon?educationDirectionCode:undefined,specialtyCode:isDoctorateUnvon?specialtyCode:undefined,diplomRaqami:isDoctorateUnvon?diplomRaqami:undefined,degreeDate:isDoctorateUnvon?degreeDate:undefined,
    xorijiyTilFanNomi:isXorijiyTilSave?xorijiyTilFanNomi:undefined,xorijiyTilFanYonalish:isXorijiyTilSave?xorijiyTilFanYonalish:undefined,xorijiyTilMashgulotTuri:isXorijiyTilSave?xorijiyTilMashgulotTuri:undefined,xorijiyTilTil:isXorijiyTilSave?xorijiyTilTil:undefined,xorijiyTilMashgulotSoati:isXorijiyTilSave?xorijiyTilMashgulotSoati:undefined,
    certForeignLang:isXorijiyTilSertifikatSave?certForeignLang:undefined,certDarajasi:isXorijiyTilSertifikatSave?certDarajasi:undefined,certUmumiyBali:isXorijiyTilSertifikatSave?certUmumiyBali:undefined,
    coordCouncilName:COUNCIL_INDICATORS.has(indicator)?coordCouncilName:null,
    decisionNumber:(COUNCIL_INDICATORS.has(indicator)||isXorijiyTilSertifikatSave)?decisionNumber:null,
    month:month?+month:null,year:year?+year:null,
    plannedMonth:(source==='PLAN'&&plannedMonth)?+plannedMonth:null,
    plannedYear,
    coAuthorsCount:+coAuthorsCount||1,coAuthorTeacherIds,
    siteUrl:siteUrl||null,fileUrl:fileUrl||null,completionStatus,
    patentNumber:indicator==='PATENTS'?patentNumber:null,
    patentDay:indicator==='PATENTS'&&patentDay?+patentDay:null,
    patentMonth:indicator==='PATENTS'&&patentMonth?+patentMonth:null,
    patentYear:indicator==='PATENTS'&&patentYear?+patentYear:null,
    patentIssuedBy:indicator==='PATENTS'?patentIssuedBy:null,
    certDay:(COUNCIL_INDICATORS.has(indicator)||isXorijiyTilSertifikatSave)&&certDay?+certDay:null,
    certMonth:(COUNCIL_INDICATORS.has(indicator)||isXorijiyTilSertifikatSave)&&certMonth?+certMonth:null,
    certYear:(COUNCIL_INDICATORS.has(indicator)||isXorijiyTilSertifikatSave)&&certYear?+certYear:null
  };
    const localDuplicates=findLocalDuplicateWorks(body.indicator,body.title,body.grantName,body.articleType,editingWorkId);
    if(localDuplicates.length>0){
      const dupMsg=currentLang==='uz'?'Bunday nomli ish allaqachon saqlangan':'Работа с таким названием уже сохранена';
      notifyUser(dupMsg);
      showSimilarWorksToast(localDuplicates);
      return;
    }
    let savedWork;
    if(editingWorkId){
      savedWork=await api(`/departments/${departmentId}/scientific-works/${editingWorkId}`,{method:'PUT',body:JSON.stringify(body)});
    }else{
      savedWork=await api(`/departments/${departmentId}/scientific-works`,{method:'POST',body:JSON.stringify(body)});
    }
    const savedId=(savedWork&&savedWork.id)||(editingWorkId||0);
    if(wmPdfPendingArray.length>0&&!savedId){ toast('Ошибка: работа не сохранена, файлы не загружены'); return; }
    const token=getAuthToken();
    for(const item of wmPdfPendingArray){
      const fd=new FormData(); fd.append('file',item.file,item.file.name||'document');
      if(item.displayName)fd.append('displayName',item.displayName);
      try{
        const r=await fetch(`${API}/upload.php?action=upload&workId=${savedId}&departmentId=${departmentId}`,{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
        const j=await r.json().catch(()=>({}));
        if(!r.ok)toast('PDF: '+(j.error||'upload error'));
      }catch(uploadErr){
        const msg=uploadErr&&uploadErr.message||'';
        const hint=(/failed to fetch|network|load failed/i.test(msg))?' Проверьте: сервер запущен, лимиты PHP (upload_max_filesize, post_max_size ≥25M).':'';
        toast('Ошибка загрузки файла: '+(msg||uploadErr)+hint);
        throw uploadErr;
      }
    }
    wmPdfPendingArray=[];
    toast(editingWorkId?'Сохранено':'Добавлено');
    closeWorkModal();
    await loadWorks();
    await loadPlans();
    await loadStats();
    if(savedWork&&Array.isArray(savedWork.similarWorks)&&savedWork.similarWorks.length>0){
      showSimilarWorksToast(savedWork.similarWorks);
    }
  }catch(e){
    const msg='Ошибка: '+(e&&e.message||e);
    console.error('wmSaveBtn error:',e);
    notifyUser(msg);
  }
  finally{ if(wmBtn){ wmBtn.disabled=false; wmBtn.textContent=wmOrig; } }
};

// ===== STATS =====
const STATS_WORK_TYPES=['ARTICLES','LITERATURE','PATENTS','CITATIONS','TOP1000_TRAINING','GRANT_PROJECTS','DSC_PROFESSOR_UNVON','PHD_DOTSENT_UNVON','XORIJIY_TIL_MASHGULOT','XORIJIY_TIL_SERTIFIKAT'];
const STATS_LITERATURE_TYPES=['TEXTBOOK','TUTORIAL','METHOD_GUIDELINES','METHODICAL_MANUAL','UMK','E_TEXTBOOK','MONOGRAPH'];
const STATS_WORKTYPE_TO_INDICATORS={ARTICLES:['ARTICLE_TYPE'],LITERATURE:['TEXTBOOK','TUTORIAL','METHOD_GUIDELINES','METHODICAL_MANUAL','UMK','E_TEXTBOOK','MONOGRAPH'],PATENTS:['PATENTS'],CITATIONS:['CITATIONS'],TOP1000_TRAINING:['TOP1000_TRAINING'],GRANT_PROJECTS:['GRANT_PROJECTS'],DSC_PROFESSOR_UNVON:['DSC_PROFESSOR_UNVON'],PHD_DOTSENT_UNVON:['PHD_DOTSENT_UNVON'],XORIJIY_TIL_MASHGULOT:['XORIJIY_TIL_MASHGULOT'],XORIJIY_TIL_SERTIFIKAT:['XORIJIY_TIL_SERTIFIKAT']};
const STATS_LITERATURE_SET=new Set(STATS_LITERATURE_TYPES);
let statsAggDetailMode='';

const STATS_XLS_COLUMNS=[
  {key:'rowNum'},{key:'id'},{key:'teacher'},{key:'role'},{key:'author'},{key:'coAuthorNames'},{key:'sourceText'},{key:'indicator'},{key:'citations'},{key:'hIndex'},{key:'profileLink'},{key:'scientificPlatform'},{key:'articleType'},{key:'title'},{key:'publisher'},{key:'siteUrl'},{key:'fileUrl'},{key:'pdf'},{key:'monthText'},{key:'year'},{key:'calendarYear'},{key:'academicYear'},{key:'creditedPlan'},{key:'patentNumber'},{key:'patentDate'},{key:'patentIssuedBy'},{key:'coordCouncilName'},{key:'decisionNumber'},{key:'certDate'},{key:'certForeignLang'},{key:'certDarajasi'},{key:'certUmumiyBali'},{key:'ilmiyDaraja'},{key:'ilmiyUnvon'},{key:'educationDirectionCode'},{key:'specialtyCode'},{key:'diplomRaqami'},{key:'degreeDate'},{key:'fanNomi'},{key:'fanYonalish'},{key:'mashgulotTuri'},{key:'xorijiyTil'},{key:'mashgulotSoati'},{key:'grantName'},{key:'grantDuration'},{key:'grantPartner'},{key:'grantParticipantsDept'},{key:'grantParticipantsOther'},{key:'grantAmount'},{key:'top1000Direction'},{key:'top1000Specialty'},{key:'top1000Hours'},{key:'top1000CertNumbers'},{key:'quarter'},{key:'coAuthors'},{key:'coPoints'},{key:'statusText'}
];

let statsLastRows=[], statsLastMeta=null;
let statsAllRows=[];
let statsPlansCache=[], statsWorksCache=[];
let statsDeptIdsForMinistry=[]; // Для ministry: ID кафедр для статистики (из фильтра)
let statsTeachersForMinistry=[]; // Для ministry: педагоги выбранной кафедры (для фильтра и teacherMap)

function getStatsSearchQuery(){
  return String(($('statsSearchInput') && $('statsSearchInput').value) || '').trim().toLowerCase();
}
function stripHtml(val){
  return String(val == null ? '' : val).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function statsRowMatchesSearch(row,query){
  if(!query)return true;
  return [
    row.id,row.teacher,row.role,row.author,row.coAuthorNames,row.sourceText,row.indicator,row.citations,row.hIndex,row.profileLink,
    row.scientificPlatform,row.articleType,row.title,row.publisher,row.siteUrl,row.fileUrl,row.monthText,row.year,row.calendarYear,
    row.academicYear,row.creditedPlan,row.patentNumber,row.patentIssuedBy,row.coordCouncilName,row.decisionNumber,row.certForeignLang,
    row.ilmiyDaraja,row.ilmiyUnvon,row.fanNomi,row.fanYonalish,row.xorijiyTil,row.grantName,row.grantPartner,row.top1000Direction,
    row.top1000Specialty,row.statusText
  ].some(val=>stripHtml(val).toLowerCase().includes(query));
}
function updateStatsColsManageBtn(){
  const btn=$('statsColsManageBtn');
  const txt=$('statsColsManageText');
  const panel=$('statsColumnsPanel');
  if(!btn||!txt)return;
  const sel=statsGetSelectedXlsCols().length;
  const tot=STATS_XLS_COLUMNS.length;
  const base=currentLang==='uz' ? 'Ustunlarni boshqarish' : 'Управлять столбцами';
  txt.textContent=`${base} (${sel}/${tot})`;
  if(panel)btn.setAttribute('aria-expanded',panel.classList.contains('is-collapsed')?'false':'true');
}
function initStatsDashboardControls(){
  const colsBtn=$('statsColsManageBtn');
  const colsPanel=$('statsColumnsPanel');
  if(colsBtn&&colsPanel){
    colsBtn.onclick=()=>{
      colsPanel.classList.toggle('is-collapsed');
      updateStatsColsManageBtn();
    };
    updateStatsColsManageBtn();
  }
}

function renderStatsCheckboxGroup(containerId,items,checked=true){
  const el=$(containerId); if(!el)return;
  el.innerHTML='';
  items.forEach(it=>{
    const id=`${containerId}__${String(it.value).replace(/\W/g,'_')}`;
    const lbl=document.createElement('label'); lbl.className='checkItem'; lbl.htmlFor=id;
    if(it.hint) lbl.title=it.hint;
    const cb=document.createElement('input'); cb.type='checkbox'; cb.id=id; cb.value=it.value; cb.checked=checked;
    const sp=document.createElement('span'); sp.textContent=it.label;
    lbl.appendChild(cb); lbl.appendChild(sp); el.appendChild(lbl);
  });
}
function statsGetCheckedValues(containerId){
  return getOwnGroupCheckboxes(containerId).filter(cb=>cb.checked&&!cb.disabled).map(cb=>cb.value);
}
function statsSetDisabled(containerId,disabled){
  const el=$(containerId); if(!el)return;
  el.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.disabled=disabled);
  el.style.opacity=disabled?'0.6':'1';
}
function mountStatsTypeDependentBlocks(){
  const workTypeBody=$('statsWorkTypeChecks');
  if(!workTypeBody)return;
  const articleBlock=$('statsArticleTypeBlock');
  const literatureBlock=$('statsLiteratureTypeBlock');
  const articleLabel=workTypeBody.querySelector('input[type="checkbox"][value="ARTICLES"]')?.closest('label.checkItem');
  const literatureLabel=workTypeBody.querySelector('input[type="checkbox"][value="LITERATURE"]')?.closest('label.checkItem');
  const checkGroup=workTypeBody.closest('.checkGroup');
  const safeFallbackParent=checkGroup&&checkGroup.parentElement ? checkGroup.parentElement : workTypeBody.parentElement;
  // Place blocks directly under their parent work-type options.
  if(articleBlock && articleLabel){
    articleLabel.insertAdjacentElement('afterend',articleBlock);
  }else if(articleBlock && safeFallbackParent){
    safeFallbackParent.insertBefore(articleBlock, checkGroup ? checkGroup.nextSibling : null);
  }
  if(literatureBlock && literatureLabel){
    literatureLabel.insertAdjacentElement('afterend',literatureBlock);
  }else if(literatureBlock && safeFallbackParent){
    safeFallbackParent.insertBefore(literatureBlock, articleBlock ? articleBlock.nextSibling : (checkGroup ? checkGroup.nextSibling : null));
  }
}
function preserveStatsTypeDependentBlocks(){
  const workTypeBody=$('statsWorkTypeChecks');
  if(!workTypeBody)return;
  const articleBlock=$('statsArticleTypeBlock');
  const literatureBlock=$('statsLiteratureTypeBlock');
  const checkGroup=workTypeBody.closest('.checkGroup');
  const safeParent=checkGroup&&checkGroup.parentElement ? checkGroup.parentElement : workTypeBody.parentElement;
  if(!safeParent)return;
  // Prevent dependent blocks from being removed when work-type checkbox container is re-rendered.
  if(articleBlock && articleBlock.parentElement===workTypeBody){
    safeParent.insertBefore(articleBlock, checkGroup ? checkGroup.nextSibling : null);
  }
  if(literatureBlock && literatureBlock.parentElement===workTypeBody){
    safeParent.insertBefore(literatureBlock, articleBlock ? articleBlock.nextSibling : (checkGroup ? checkGroup.nextSibling : null));
  }
}
function syncStatsTypeUi(){
  mountStatsTypeDependentBlocks();
  const wt=statsGetCheckedValues('statsWorkTypeChecks');
  const hasArticles=wt.includes('ARTICLES');
  const hasLiterature=wt.includes('LITERATURE');
  const articleBlock=$('statsArticleTypeBlock');
  const literatureBlock=$('statsLiteratureTypeBlock');
  // Keep dependent groups visible; only disable their checkboxes when parent type is off.
  // This prevents "disappearing" type filters after tab switches.
  if(articleBlock)articleBlock.classList.remove('is-hidden');
  if(literatureBlock)literatureBlock.classList.remove('is-hidden');
  statsSetDisabled('statsArticleTypeChecks',!hasArticles);
  statsSetDisabled('statsLiteratureTypeChecks',!hasLiterature);
  const hint=$('statsTypeHint');
  if(hint){
    const parts=[];
    if(!hasArticles)parts.push(String(t('ui.stats.hints.articlesOff')));
    if(!hasLiterature)parts.push(String(t('ui.stats.hints.literatureOff')));
    hint.textContent=parts.join(' ');
  }
}
function statsToggleAllInGroup(containerId,syncCb){
  const cbs=getOwnGroupCheckboxes(containerId).filter(cb=>!cb.disabled);
  if(!cbs.length)return;
  const allChecked=cbs.every(cb=>cb.checked);
  const newVal=!allChecked;
  cbs.forEach(cb=>cb.checked=newVal);
  if(syncCb)syncCb();
  saveUIState();
  renderStats();
}
function statsToggleCheckboxList(checkboxes,syncCb){
  const cbs=Array.from(checkboxes||[]);
  if(!cbs.length)return;
  const allChecked=cbs.every(cb=>cb.checked);
  const newVal=!allChecked;
  cbs.forEach(cb=>cb.checked=newVal);
  if(syncCb)syncCb();
  saveUIState();
  renderStats();
}
function statsToggleAllInCard(card){
  if(!card)return;
  if(card.querySelector('#statsWorkTypeChecks')){
    statsToggleCheckboxList([
      ...getOwnGroupCheckboxes('statsWorkTypeChecks'),
      ...getOwnGroupCheckboxes('statsArticleTypeChecks'),
      ...getOwnGroupCheckboxes('statsLiteratureTypeChecks')
    ],()=>{ syncStatsTypeUi(); });
    return;
  }
  if(card.querySelector('#statsExportColsChecks')){
    statsToggleCheckboxList(card.querySelectorAll('#statsExportColsChecks input[type="checkbox"]'),()=>{
      const keys=statsGetSelectedXlsCols();
      localStorage.setItem('IlmiyStat_stats_xls_cols',JSON.stringify(keys));
      statsUpdateXlsHint();
      statsApplyColsToTable();
    });
    return;
  }
  const body=card.querySelector('.statsFilterCardBody')||card;
  statsToggleCheckboxList(body.querySelectorAll('input[type="checkbox"]'));
}
function initStatsTypeCheckboxes(){
  preserveStatsTypeDependentBlocks();
  renderStatsCheckboxGroup('statsWorkTypeChecks',STATS_WORK_TYPES.map(code=>({value:code,label:(function(){var d=dict(currentLang),r=dict('ru');var a=d&&d.ui&&d.ui.stats&&d.ui.stats.workTypes&&d.ui.stats.workTypes[code];var b=r&&r.ui&&r.ui.stats&&r.ui.stats.workTypes&&r.ui.stats.workTypes[code];return a||b||code;})()})),true);
  renderStatsCheckboxGroup('statsArticleTypeChecks',ARTICLE_TYPES.map(code=>({value:code,label:artName(code)})),true);
  renderStatsCheckboxGroup('statsLiteratureTypeChecks',STATS_LITERATURE_TYPES.map(code=>({value:code,label:indName(code)})),true);
  restoreUIState();
  if($('statsMonth') && $('sfMonth'))syncSidebarToMain();
  $('statsWorkTypeChecks')&&$('statsWorkTypeChecks').addEventListener('change',(e)=>{
    const ownBody=$('statsWorkTypeChecks');
    if(!ownBody || e.target.closest('.checkGroupBody')!==ownBody)return;
    syncStatsTypeUi();saveUIState();renderStats();
  });
  $('statsArticleTypeChecks')&&$('statsArticleTypeChecks').addEventListener('change',()=>{saveUIState();renderStats();});
  $('statsLiteratureTypeChecks')&&$('statsLiteratureTypeChecks').addEventListener('change',()=>{saveUIState();renderStats();});
  syncStatsTypeUi();
  // Двойной клик по заголовку — включить/выключить все фильтры в группе
  ['statsWorkTypeTitle','statsArticleTypeTitle','statsLiteratureTypeTitle'].forEach((titleId,i)=>{
    const titleEl=$(titleId); if(!titleEl)return;
    const containerIds=['statsWorkTypeChecks','statsArticleTypeChecks','statsLiteratureTypeChecks'];
    const containerId=containerIds[i];
    const triggerToggle=()=>statsToggleAllInGroup(containerId,i===0?syncStatsTypeUi:null);
    titleEl.style.cursor='pointer';
    titleEl.title=t('ui.stats.tooltips.doubleClickTitleHint');
    titleEl.ondblclick=(ev)=>{ if(ev)ev.preventDefault(); triggerToggle(); };
    // Mobile fallback: double-tap on title should behave like desktop double-click.
    titleEl.onpointerup=(ev)=>{
      if(!ev || (ev.pointerType!=='touch' && ev.pointerType!=='pen')) return;
      const now=Date.now();
      const last=Number(titleEl.dataset.lastTapTs||0);
      if(last && (now-last)<=360){
        titleEl.dataset.lastTapTs='0';
        ev.preventDefault();
        triggerToggle();
      }else{
        titleEl.dataset.lastTapTs=String(now);
      }
    };
    titleEl.ontouchend=(ev)=>{
      const now=Date.now();
      const last=Number(titleEl.dataset.lastTapTsTouch||0);
      if(last && (now-last)<=360){
        titleEl.dataset.lastTapTsTouch='0';
        if(ev)ev.preventDefault();
        triggerToggle();
      }else{
        titleEl.dataset.lastTapTsTouch=String(now);
      }
    };
  });
}
function statsGetSelectedXlsCols(){
  const el=$('statsExportColsChecks'); if(!el)return STATS_XLS_COLUMNS.map(c=>c.key);
  return Array.from(el.querySelectorAll('input[type="checkbox"]')).filter(cb=>cb.checked).map(cb=>cb.value);
}
function statsAllXlsColKeys(){
  return STATS_XLS_COLUMNS.map(c=>c.key);
}
function updateStatsTableColsWarning(){
  const bar=$('statsTableColsWarning');
  if(!bar)return;
  if(statsGetSelectedXlsCols().length===0){
    bar.hidden=false;
    const msg=String((t('ui.stats.xlsColsNoneWarning')||'')).trim();
    bar.textContent=msg||'В блоке «Столбцы для Excel» не выбран ни один столбец — колонки таблицы скрыты. Включите нужные чекбоксы (панель со значком Excel).';
  }else{
    bar.hidden=true;
    bar.textContent='';
  }
}
function statsApplyXlsCols(keys){
  const el=$('statsExportColsChecks'); if(!el)return;
  const set=new Set(keys||[]);
  el.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=set.has(cb.value));
  statsUpdateXlsHint();
  statsApplyColsToTable();
}
function statsUpdateXlsHint(){
  const hint=$('statsExportColsHint'); if(!hint)return;
  const sel=statsGetSelectedXlsCols().length, tot=STATS_XLS_COLUMNS.length;
  const fn=t('ui.stats.selectedHint');
  hint.textContent=(typeof fn==='function')?fn(sel,tot):String(fn);
  updateStatsColsManageBtn();
}
function statsApplyColsToTable(){
  const keys=new Set(statsGetSelectedXlsCols());
  document.querySelectorAll('#statsTable th[data-col],#statsTable td[data-col]').forEach(el=>{
    el.style.display=keys.has(el.getAttribute('data-col'))?'':'none';
  });
  const colgroup=$('statsColgroup');
  if(colgroup){
    let savedWidths={};
    try{savedWidths=JSON.parse(localStorage.getItem(STATS_COL_WIDTHS_KEY)||'{}');}catch(_){}
    const autoWidths=getStatsAutoWidths(Array.from(keys));
    colgroup.querySelectorAll('col[data-col]').forEach(col=>{
      const k=col.getAttribute('data-col');
      if(keys.has(k)){
        const raw=savedWidths[k]!=null?savedWidths[k]:(autoWidths[k]!=null?autoWidths[k]:(col.getAttribute('data-saved-w')||col.getAttribute('data-default-w')||80));
        const px=typeof raw==='number'?raw:(parseInt(String(raw),10)||80);
        col.style.width=Math.max(28,px)+'px';
        col.style.minWidth='';
        col.removeAttribute('data-saved-w');
      }else{
        col.setAttribute('data-saved-w',col.style.width||col.getAttribute('data-default-w')||'80px');
        col.style.width='0';
        col.style.minWidth='0';
      }
    });
  }
  requestAnimationFrame(()=>updateStatsStickyScrollbar());
  updateStatsTableColsWarning();
}
function initStatsExportCols(){
  renderStatsCheckboxGroup('statsExportColsChecks',STATS_XLS_COLUMNS.map(c=>{
    const h=colHint(c.key); return {value:c.key,label:String(colLabel(c.key)),hint:(h&&!String(h).startsWith('colHints.'))?String(h):''};
  }),true);
  const allKeys=statsAllXlsColKeys();
  const valid=new Set(allKeys);
  let keysToApply=allKeys.slice();
  const saved=localStorage.getItem('IlmiyStat_stats_xls_cols');
  if(saved){
    try{
      const parsed=JSON.parse(saved);
      if(Array.isArray(parsed)){
        const filtered=parsed.filter(k=>valid.has(k));
        if(filtered.length>0)keysToApply=filtered;
      }
    }catch(_e){}
  }
  statsApplyXlsCols(keysToApply);
  try{localStorage.setItem('IlmiyStat_stats_xls_cols',JSON.stringify(statsGetSelectedXlsCols()));}catch(_e){}
  $('statsExportColsChecks')&&$('statsExportColsChecks').addEventListener('change',()=>{
    const keys=statsGetSelectedXlsCols();
    localStorage.setItem('IlmiyStat_stats_xls_cols',JSON.stringify(keys));
    statsUpdateXlsHint();
    statsApplyColsToTable();
  });
  // Двойной клик по заголовку в боковом Excel-доке — включить/выключить все столбцы
  const dockTitleEl=$('seDockTitle');
  if(dockTitleEl){
    dockTitleEl.style.cursor='pointer';
    dockTitleEl.title=t('ui.stats.tooltips.doubleClickTitleHint');
    dockTitleEl.ondblclick=()=>{
      statsToggleAllInGroup('statsExportColsChecks',()=>{
        const keys=statsGetSelectedXlsCols();
        localStorage.setItem('IlmiyStat_stats_xls_cols',JSON.stringify(keys));
        statsUpdateXlsHint();
        statsApplyColsToTable();
      });
    };
  }
}

function fillStatsYearOptions(){
  const period=$('statsPeriod').value;
  const sel=$('statsYearSel'); sel.innerHTML='';
  const o0=document.createElement('option'); o0.value='';
  o0.textContent=period==='academic'?String(t('ui.stats.allAcademicYears')):String(t('ui.stats.allYears'));
  sel.appendChild(o0);
  
  // Собираем уникальные годы из загруженных данных
  const yearsFromData = new Set();
  if(statsPlansCache && statsPlansCache.length > 0){
    statsPlansCache.forEach(p => { if(p.academicYear) yearsFromData.add(p.academicYear); });
  }
  if(statsWorksCache && statsWorksCache.length > 0){
    statsWorksCache.forEach(w => { if(w.academicYear) yearsFromData.add(w.academicYear); });
  }
  
  if(period==='academic'){
    // Добавляем годы из данных
    const allYears = new Set(yearsFromData);
    const now=new Date(), cy=now.getFullYear(), cm=now.getMonth()+1;
    const base=cm>=8?cy:cy-1;
    // Добавляем стандартный диапазон
    for(let y=base;y>=2019;y--){
      allYears.add(`${y}-${y+1}`);
    }
    // Сортируем годы (новые сначала)
    const sortedYears = Array.from(allYears).sort((a,b)=>{
      const aMatch = a.match(/^(\d{4})-/);
      const bMatch = b.match(/^(\d{4})-/);
      const aYear = aMatch ? +aMatch[1] : 0;
      const bYear = bMatch ? +bMatch[1] : 0;
      return bYear - aYear;
    });
    sortedYears.forEach(year => {
      const o=document.createElement('option');
      o.value=year;o.textContent=year;
      sel.appendChild(o);
    });
    const currentValue=String(sel.dataset.pendingValue || sel.value || '');
    const optionValues=Array.from(sel.options).map(o=>String(o.value||''));
    if(currentValue && optionValues.includes(currentValue))sel.value=currentValue;
    else if(optionValues.length > 1){
      const nowYear=new Date().getMonth()+1>=8 ? new Date().getFullYear() : new Date().getFullYear()-1;
      const fallback=`${nowYear}-${nowYear+1}`;
      sel.value=optionValues.includes(fallback) ? fallback : optionValues[1];
    }else if(optionValues.length===1){
      sel.value=optionValues[0];
    }
    delete sel.dataset.pendingValue;
    $('statsYearLabel').textContent=String(t('ui.stats.yearLabelAcademic'));
    $('statsPeriodHint').textContent=String(t('ui.stats.periodHintAcademic'));
  }else{
    // Для календарного года собираем годы из данных (year, calendarYear, plannedYear)
    const calendarYears = new Set();
    if(statsWorksCache && statsWorksCache.length > 0){
      statsWorksCache.forEach(w => {
        if(w.year) calendarYears.add(String(w.year));
        if(w.calendarYear) calendarYears.add(String(w.calendarYear));
        if(w.plannedYear) calendarYears.add(String(w.plannedYear));
      });
    }
    // Добавляем стандартный диапазон
    const now = new Date().getFullYear();
    for(let y=now;y>=2019;y--){
      calendarYears.add(String(y));
    }
    // Сортируем годы (новые сначала)
    const sortedYears = Array.from(calendarYears).sort((a,b)=>Number(b)-Number(a));
    sortedYears.forEach(year => {
      const o=document.createElement('option');
      o.value=year; o.textContent=year;
      sel.appendChild(o);
    });
    const currentValue=String(sel.dataset.pendingValue || sel.value || '');
    const optionValues=Array.from(sel.options).map(o=>String(o.value||''));
    if(currentValue && optionValues.includes(currentValue))sel.value=currentValue;
    else if(optionValues.length > 1){
      const fallback=String(new Date().getFullYear());
      sel.value=optionValues.includes(fallback) ? fallback : optionValues[1];
    }else if(optionValues.length===1){
      sel.value=optionValues[0];
    }
    delete sel.dataset.pendingValue;
    $('statsYearLabel').textContent=String(t('ui.stats.yearLabelCalendar'));
    $('statsPeriodHint').textContent=String(t('ui.stats.periodHintCalendar'));
  }
}
function fillStatsMonth(){
  const sel=$('statsMonth');
  sel.innerHTML=`<option value="">${esc(t('ui.common.allMonths'))}</option>`;
  for(let m=1;m<=12;m++){
    const o=document.createElement('option'); o.value=String(m); o.textContent=monthText(m);
    sel.appendChild(o);
  }
  renderSidebarMonthChecks();
}

const STATS_MONTH_VALUES=Array.from({length:12},(_,i)=>i+1);
function getSidebarMonthCheckboxes(){
  return Array.from(document.querySelectorAll('#sfMonthChecks input[type="checkbox"]'));
}
function getSelectedStatsMonths(){
  const boxes=getSidebarMonthCheckboxes();
  if(boxes.length){
    return boxes.filter(cb=>cb.checked).map(cb=>Number(cb.value));
  }
  const single=Number($('statsMonth')&&$('statsMonth').value||0);
  return single?[single]:STATS_MONTH_VALUES.slice();
}
function matchesStatsMonthFilter(monthValue,selectedMonths){
  const mm=Number(monthValue||0);
  if(!selectedMonths||selectedMonths.length===STATS_MONTH_VALUES.length)return true;
  if(selectedMonths.length===0)return false;
  return selectedMonths.includes(mm);
}
function ensureSidebarMonthChecksHost(){
  const select=$('sfMonth');
  if(!select)return null;
  let host=$('sfMonthChecks');
  if(!host){
    host=document.createElement('div');
    host.id='sfMonthChecks';
    host.className='sfChecksGrid';
    host.title='Double-click the month title to toggle all months';
    select.insertAdjacentElement('afterend',host);
  }
  select.style.display='none';
  return host;
}
function renderSidebarMonthChecks(){
  const host=ensureSidebarMonthChecksHost();
  if(!host)return;
  const existing=getSidebarMonthCheckboxes();
  const selected=existing.length
    ? existing.filter(cb=>cb.checked).map(cb=>Number(cb.value))
    : (Number($('statsMonth')&&$('statsMonth').value||0)?[Number($('statsMonth').value)]:STATS_MONTH_VALUES.slice());
  const selectedSet=new Set(selected);
  host.innerHTML='';
  STATS_MONTH_VALUES.forEach(m=>{
    const label=document.createElement('label');
    label.className='checkItem small';
    label.innerHTML=`<input type="checkbox" value="${m}"><span>${esc(monthText(m))}</span>`;
    const input=label.querySelector('input');
    input.checked=selectedSet.has(m);
    input.addEventListener('change',syncMainFromSidebar);
    host.appendChild(label);
  });
}
function setSidebarSelectedMonths(months){
  const boxes=getSidebarMonthCheckboxes();
  if(!boxes.length)return;
  const set=new Set((months||[]).map(Number));
  boxes.forEach(cb=>{ cb.checked=set.has(Number(cb.value)); });
}
function toggleSidebarMonthChecksAll(){
  const boxes=getSidebarMonthCheckboxes();
  if(!boxes.length)return;
  const allOn=boxes.every(cb=>cb.checked);
  boxes.forEach(cb=>{ cb.checked=!allOn; });
  syncMainFromSidebar();
}

function coauthorPoints(n){
  const N = Number.isFinite(+n) && +n > 0 ? Math.floor(+n) : 1;
  return 1 / N;
}
function fmtPoints(x){
  if(!isFinite(x))return'0';
  const s=(Math.round(x*1000)/1000).toFixed(3);
  return s.replace(/\.?0+$/,'');
}
function quarterFromMonth(m){
  const mm=Number(m);
  if(!mm)return'';
  if(mm<=3)return'1';
  if(mm<=6)return'2';
  if(mm<=9)return'3';
  return'4';
}
function isMonthInAcademicYear(mm){
  const m=Number(mm||0);
  if(!m)return false;
  return (m>=8&&m<=12)||(m>=1&&m<=7);
}
function calendarYearForWork(w){
  if(w.year)return+ w.year;
  if(w.plannedYear)return+ w.plannedYear;
  if(w.calendarYear)return+ w.calendarYear;
  const ay=w.academicYear||'';const m=+w.month||+w.plannedMonth||0;
  const match=ay.match(/^(\d{4})-(\d{4})$/);
  if(match&&m){return m>=8?+match[1]:+match[2];}
  return null;
}
function getCoAuthorsCount(w){
  const n=parseInt((w&&w.coAuthorsCount),10);
  return Number.isFinite(n)&&n>0?n:1;
}
function getCitationsCount(w){
  const n=parseInt((w&&w.citationsCount),10);
  return Number.isFinite(n)&&n>=0?n:0;
}
function getPlanUnitCount(p){
  if(p&&p.indicator==='CITATIONS'){
    const n=parseInt(p.citationsCount,10);
    return Number.isFinite(n)&&n>0?n:0;
  }
  if(p&&p.indicator==='PATENTS'){
    const n=parseInt(p.patentsCount,10);
    return Number.isFinite(n)&&n>0?n:1;
  }
  return 1;
}
function getWorkCreditUnits(w){
  return w&&w.indicator==='CITATIONS'?getCitationsCount(w):1;
}
function fmtPatentDate(w){
  const d=w.patentDay,m=w.patentMonth,y=w.patentYear;
  if(!d&&!m&&!y)return'';
  return`${d||'??'}.${m?String(m).padStart(2,'0'):'??'}.${y||'????'}`;
}
function fmtCertDate(w){
  const d=w.certDay,m=w.certMonth,y=w.certYear;
  if(!d&&!m&&!y)return'';
  return`${d||'??'}.${m?String(m).padStart(2,'0'):'??'}.${y||'????'}`;
}
function statusLabel(st){return st==='DONE'?String(t('ui.stats.statusDone')):st==='PARTIAL'?String(t('ui.stats.statusPartial')):String(t('ui.stats.statusNotDone'));}

async function initMinistryHeaderFilter(){
  const row=$('ministryHeaderFilterRow'); if(!row)return;
  const mainHeader=$('mainContentHeader'); if(mainHeader)mainHeader.style.display='block';
  row.style.display='grid';
  const instSel=$('ministryInstSel'), deanSel=$('ministryDeanSel'), deptSel=$('ministryDeptSel');
  if(!instSel||!deanSel||!deptSel)return;
  const institutes=await api('/institutes').catch(()=>[]);
  const departments=await api('/departments').catch(()=>[]);
  const chooseOpt=esc(t('ui.stats.chooseOption')||t('ui.common.choose')||'— выберите —');
  instSel.innerHTML=`<option value="">${chooseOpt}</option>`+ (institutes||[]).filter(i=>i.isActive!==false).map(i=>`<option value="${i.id}">${(currentLang==='uz'&&i.nameUz)?i.nameUz:i.name}</option>`).join('');
  deanSel.innerHTML=`<option value="">${chooseOpt}</option>`;
  deptSel.innerHTML=`<option value="">${chooseOpt}</option>`;
  instSel.onchange=()=>onMinistryHeaderInstChange();
  deanSel.onchange=()=>onMinistryHeaderDeanChange();
  deptSel.onchange=()=>onMinistryHeaderDeptChange();
  const currentDept=(departments||[]).find(d=>String(d.id)===String(departmentId));
  if(currentDept&&currentDept.instituteId){ instSel.value=String(currentDept.instituteId); await onMinistryHeaderInstChange(); }
  if(currentDept&&currentDept.deaneryId){ deanSel.value=String(currentDept.deaneryId); await onMinistryHeaderDeanChange(); }
  if(departmentId){ deptSel.value=String(departmentId); await onMinistryHeaderDeptChange(); }
  else{ const firstInst=(institutes||[]).filter(i=>i.isActive!==false)[0]; if(firstInst){ instSel.value=String(firstInst.id); await onMinistryHeaderInstChange(); } }
}
async function onMinistryHeaderInstChange(){
  const instId=$('ministryInstSel').value;
  const chooseOpt=esc(t('ui.stats.chooseOption')||t('ui.common.choose')||'— выберите —');
  $('ministryDeanSel').innerHTML=`<option value="">${chooseOpt}</option>`;
  $('ministryDeptSel').innerHTML=`<option value="">${chooseOpt}</option>`;
  departmentId=null; statsDeptIdsForMinistry=[]; statsTeachersForMinistry=[];
  if(!instId)return;
  const deaneries=await api(`/deaneries?instituteId=${instId}`).catch(()=>[]);
  const deanList=(deaneries||[]).filter(d=>d.isActive!==false);
  $('ministryDeanSel').innerHTML=`<option value="">${chooseOpt}</option>`+ deanList.map(d=>`<option value="${d.id}">${(currentLang==='uz'&&d.nameUz)?d.nameUz:d.name}</option>`).join('');
  if(deanList.length>0){ $('ministryDeanSel').value=String(deanList[0].id); await onMinistryHeaderDeanChange(); }
}
async function onMinistryHeaderDeanChange(){
  const deanId=$('ministryDeanSel').value;
  const chooseOpt=esc(t('ui.stats.chooseOption')||t('ui.common.choose')||'— выберите —');
  $('ministryDeptSel').innerHTML=`<option value="">${chooseOpt}</option>`;
  departmentId=null; statsDeptIdsForMinistry=[]; statsTeachersForMinistry=[];
  if(!deanId)return;
  const departments=await api('/departments').catch(()=>[]);
  const filtered=(departments||[]).filter(d=>String(d.deaneryId)===String(deanId)&&d.isActive!==false);
  $('ministryDeptSel').innerHTML=`<option value="">${chooseOpt}</option>`+ filtered.map(d=>`<option value="${d.id}">${(currentLang==='uz'&&d.nameUz)?d.nameUz:d.name}</option>`).join('');
  if(filtered.length>0){ $('ministryDeptSel').value=String(filtered[0].id); await onMinistryHeaderDeptChange(); }
}
async function onMinistryHeaderDeptChange(){
  const deptId=$('ministryDeptSel').value;
  departmentId=deptId||null;
  statsDeptIdsForMinistry=deptId?[deptId]:[];
  if(deptId){ statsTeachersForMinistry=await api(`/departments/${deptId}/teachers`).catch(()=>[]); }
  else{ statsTeachersForMinistry=[]; }
  const depts=await api('/departments').catch(()=>[]);
  const dept=(depts||[]).find(d=>String(d.id)===String(deptId));
  departmentData=dept?{name:dept.name,nameUz:dept.nameUz}:null;
  updateMainTitle();
  document.title=departmentData?`IlmiySTAT — ${currentLang==='uz'?(departmentData.nameUz||departmentData.name):(departmentData.name||departmentData.nameUz)}`:(currentLang==='uz'?'IlmiySTAT — Vazirlik kabineti':'IlmiySTAT — Кабинет министерства');
  fillStatsTeacherSelect();
  await loadStatsData();
  fillStatsYearOptions();
  fillStatsMonth();
  await loadTeachers();
  try{ works=await api(`/departments/${departmentId}/scientific-works`); plans=await api(`/departments/${departmentId}/plan-items`); allPlans=[...plans]; }catch(e){ works=[]; plans=[]; allPlans=[]; }
  if($('planYearSel'))fillYears($('planYearSel')); if($('workYearSel'))fillYears($('workYearSel')); if($('statsYearSel'))fillYears($('statsYearSel'));
  fillAllTeacherSelects();
  await loadWorks();
  await loadPlans();
  await loadStats();
  renderTeachers(); renderPlans(); renderWorks(); renderStats();
  await loadStatsAssistantHistory();
}

function getStatsDepartmentIds(){
  const al=currentUser&&(currentUser.accessLevel||'department');
  if(al==='ministry')return statsDeptIdsForMinistry.length>0?statsDeptIdsForMinistry:[];
  return [departmentId];
}
async function loadStatsData(){
  try{
    const deptIds=getStatsDepartmentIds();
    if(deptIds.length===0){statsPlansCache=[];statsWorksCache=[];return;}
    const [plArr,wkArr]=await Promise.all([
      Promise.all(deptIds.map(did=>api(`/departments/${did}/plan-items`).catch(()=>[]))),
      Promise.all(deptIds.map(did=>api(`/departments/${did}/scientific-works`).catch(()=>[])))
    ]);
    statsPlansCache=plArr.flatMap((arr,i)=>arr.map(p=>({...p,_statsDeptId:deptIds[i]})));
    statsWorksCache=wkArr.flatMap((arr,i)=>arr.map(w=>({...w,_statsDeptId:deptIds[i]})));
  }catch(e){toast('Ошибка загрузки данных: '+e.message);}
}

function renderStats(){
  const period=$('statsPeriod').value;
  const yearVal=$('statsYearSel').value;
  const teacherFilter=+$('statsTeacherSel').value||0;
  const quarterFilter=$('statsQuarter').value;
  const monthFilters=getSelectedStatsMonths();
  const sourcePlanOn=$('statsSourcePlan').checked;
  const sourceOutOn=$('statsSourceOut').checked;
  const stDoneOn=$('statsStatusDone').checked;
  const stPartialOn=$('statsStatusPartial').checked;
  const stNotDoneOn=$('statsStatusNotDone').checked;
  const fH1=$('statsHalf1').checked;
  const fH2=$('statsHalf2').checked;

  const workTypesSel=statsGetCheckedValues('statsWorkTypeChecks');
  const allowedIndicators=new Set();
  workTypesSel.forEach(wt=>(STATS_WORKTYPE_TO_INDICATORS[wt]||[]).forEach(ind=>allowedIndicators.add(ind)));
  const articleTypesSel=statsGetCheckedValues('statsArticleTypeChecks');
  const literatureTypesSel=statsGetCheckedValues('statsLiteratureTypeChecks');
  const citationsMin=0;

  const teachersForStats=(currentUser&&(currentUser.accessLevel||'')==='ministry'&&statsDeptIdsForMinistry.length>0)?statsTeachersForMinistry:teachers;
  const teacherMap=new Map(teachersForStats.map(t=>[t.id,t.fullName]));
  const rows=[];
  let total=0,doneCount=0,partialCount=0,notCount=0;
  let creditedTotal=0;
  let aggPlanTotal=0;
  const ensureDetailEntry=(map,key,label)=>{
    if(!map.has(key))map.set(key,{
      key,label,
      planned:0,
      done:0,partial:0,notDone:0,
      planWorkDone:0,planWorkPartial:0,
      planDone:0,planPartial:0,planNotDone:0,
      outPlan:0
    });
    return map.get(key);
  };
  const creditedByIndicator=new Map(),creditedByType=new Map(),creditedByLiterature=new Map();
  const detailByType=new Map(),detailByLiterature=new Map(),detailBySimpleIndicator=new Map();
  const planDetailByType=new Map(),planDetailByLiterature=new Map(),planDetailBySimpleIndicator=new Map();
  const outPlanByType=new Map(),outPlanByLiterature=new Map(),outPlanBySimpleIndicator=new Map();
  let creditedCoauthorSum=0;

  for(const w of statsWorksCache){
    const monthUsed=Number(w.plannedMonth||w.month||0);
    if(period==='academic'){
      if(!isMonthInAcademicYear(monthUsed))continue;
      if(yearVal&&String(w.academicYear||'')!==yearVal)continue;
    }else{
      const cy=calendarYearForWork(w);
      if(!cy)continue;
      if(yearVal&&String(cy)!==yearVal)continue;
    }
    const baseTid=+w.teacherId||0;
    const coTids=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(Number):[];
    const matchesTeacher=!teacherFilter||baseTid===teacherFilter||coTids.includes(teacherFilter);
    if(!matchesTeacher)continue;
    if(!workTypesSel.length||!allowedIndicators.has(w.indicator))continue;
    if(citationsMin>0){
      if(w.indicator!=='CITATIONS')continue;
      if(getCitationsCount(w)<citationsMin)continue;
    }
    const workArticleTypeNorm=w.indicator==='ARTICLE_TYPE'
      ? normalizeArticleType(w.articleType||'').trim()
      : '';
    if(w.indicator==='ARTICLE_TYPE'){
      if(!articleTypesSel.length)continue;
      if(articleTypesSel.length<ARTICLE_TYPES.length&&!articleTypesSel.includes(workArticleTypeNorm))continue;
    }
    if(STATS_LITERATURE_SET.has(w.indicator)){
      // Если выбрана "Литература" в workTypesSel, но не выбраны конкретные типы литературы - показываем все типы
      // Если выбраны конкретные типы - фильтруем по ним
      const hasLiteratureWorkType=workTypesSel.includes('LITERATURE');
      if(hasLiteratureWorkType&&literatureTypesSel.length===0){
        // Выбрана "Литература", но не выбраны конкретные типы - показываем все (не пропускаем)
      }else{
        // Если "Литература" не выбрана ИЛИ выбраны конкретные типы - применяем фильтр
        if(!literatureTypesSel.length)continue;
        if(literatureTypesSel.length<STATS_LITERATURE_TYPES.length&&!literatureTypesSel.includes(w.indicator))continue;
      }
    }
    if(!matchesStatsMonthFilter(monthUsed,monthFilters))continue;
    const q=quarterFromMonth(monthUsed);
    if(quarterFilter&&q!==quarterFilter)continue;
    if(monthUsed&&!(fH1&&isH1Month(monthUsed))&&!(fH2&&isH2Month(monthUsed)))continue;
    if(!sourcePlanOn&&w.source==='PLAN')continue;
    if(!sourceOutOn&&w.source==='OUT_OF_PLAN')continue;
    const status=w.completionStatus||'NOT_DONE';
    if(status==='DONE'&&!stDoneOn)continue;
    if(status==='PARTIAL'&&!stPartialOn)continue;
    if(status==='NOT_DONE'&&!stNotDoneOn)continue;

    const displayTeacherIds=teacherFilter
      ? [teacherFilter]
      : (baseTid?[baseTid]:[]);
    if(!displayTeacherIds.length)continue;

    const n=getCoAuthorsCount(w);
    const pts=coauthorPoints(n);
    const hasPdf=!!w.uploadedFile||getWorkPdfs(w).length>0;
    const pdfCell=hasPdf?`<button class="btn secondary small" onclick="previewPdf(${w.id})" title="${esc(String(t('ui.works.viewPdf')))}">&#128196;</button>`:'—';

    for(const displayTid of displayTeacherIds){
      const displayRole=displayTid===baseTid
        ? String(t('ui.roles.author'))
        : (currentLang==='uz'?'Hammuallif':'Соавтор');
      const coAuthorDisplayIds=(displayTid===baseTid
        ? coTids.slice()
        : [baseTid,...coTids.filter(id=>id!==displayTid)]
      ).filter((id,idx,arr)=>id&&arr.indexOf(id)===idx);
      const coAuthorDisplayNames=coAuthorDisplayIds
        .map(id=>teacherMap.get(id))
        .filter(Boolean)
        .join(', ');

      total++;
      creditedCoauthorSum+=pts;
      if(status==='DONE')doneCount++;
      if(status==='PARTIAL')partialCount++;
      if(status==='NOT_DONE')notCount++;

      if(w.indicator==='ARTICLE_TYPE'){
        const artCode=workArticleTypeNorm;
        if(artCode){
          const detail=ensureDetailEntry(detailByType,artCode,artName(artCode));
          if(status==='DONE')detail.done++;
          else if(status==='PARTIAL')detail.partial++;
          else detail.notDone++;
          if(w.source==='PLAN'){
            if(status==='DONE')detail.planWorkDone++;
            else if(status==='PARTIAL')detail.planWorkPartial++;
          }
          if(w.source==='OUT_OF_PLAN'&&(status==='DONE'||status==='PARTIAL')){
            outPlanByType.set(artCode,(outPlanByType.get(artCode)||0)+1);
          }
        }
      }
      if(STATS_LITERATURE_SET.has(w.indicator)){
        const detail=ensureDetailEntry(detailByLiterature,w.indicator,indName(w.indicator));
        if(status==='DONE')detail.done++;
        else if(status==='PARTIAL')detail.partial++;
        else detail.notDone++;
        if(w.source==='PLAN'){
          if(status==='DONE')detail.planWorkDone++;
          else if(status==='PARTIAL')detail.planWorkPartial++;
        }
        if(w.source==='OUT_OF_PLAN'&&(status==='DONE'||status==='PARTIAL')){
          outPlanByLiterature.set(w.indicator,(outPlanByLiterature.get(w.indicator)||0)+1);
        }
      }
      if(w.indicator==='CITATIONS' || w.indicator==='PATENTS'){
        const units=w.indicator==='CITATIONS'?getCitationsCount(w):1;
        const detail=ensureDetailEntry(detailBySimpleIndicator,w.indicator,indName(w.indicator));
        if(status==='DONE')detail.done+=units;
        else if(status==='PARTIAL')detail.partial+=units;
        else detail.notDone+=units;
        if(w.source==='PLAN'){
          if(status==='DONE')detail.planWorkDone+=units;
          else if(status==='PARTIAL')detail.planWorkPartial+=units;
        }
        if(w.source==='OUT_OF_PLAN'&&(status==='DONE'||status==='PARTIAL')){
          outPlanBySimpleIndicator.set(w.indicator,(outPlanBySimpleIndicator.get(w.indicator)||0)+units);
        }
      }

      if(status==='DONE'||status==='PARTIAL'){
        creditedTotal++;
        const indIncrement = w.indicator==='CITATIONS' ? getCitationsCount(w) : 1;
        const indKey=STATS_LITERATURE_SET.has(w.indicator) ? 'LITERATURE' : w.indicator;
        creditedByIndicator.set(indKey,(creditedByIndicator.get(indKey)||0)+indIncrement);
        if(STATS_LITERATURE_SET.has(w.indicator)){
          creditedByLiterature.set(w.indicator,(creditedByLiterature.get(w.indicator)||0)+1);
        }
        const artCode=workArticleTypeNorm;
        if(artCode)creditedByType.set(artCode,(creditedByType.get(artCode)||0)+1);
      }

      rows.push({
        indicatorCode:w.indicator,
        articleTypeCode:workArticleTypeNorm,
        sourceCode:w.source||'',
        completionStatusCode:status,
        rowNum:rows.length+1,
        id:w.id,
        teacher:teacherMap.get(displayTid)||'',
        role:displayRole,
        author:teacherMap.get(baseTid)||'',
        coAuthorNames:coAuthorDisplayNames,
        sourceText:w.source==='PLAN'?String(t('meta.sources.PLAN')):String(t('meta.sources.OUT_OF_PLAN')),
        indicator:indName(w.indicator),
        citations:w.indicator==='CITATIONS'?getCitationsCount(w):'',
        hIndex:w.indicator==='CITATIONS'?(w.hIndex!=null&&w.hIndex!==''?String(w.hIndex):''):'',
        profileLink:w.indicator==='CITATIONS'?(w.profileLink||''):'',
        scientificPlatform:w.indicator==='CITATIONS'?(w.scientificPlatform?profilePlatformName(w.scientificPlatform):''):'',
        articleType:w.articleType?artName(w.articleType):'',
        title:w.title||'',
        publisher:w.publisher||'',
        siteUrl:w.siteUrl||'',
        fileUrl:w.fileUrl||'',
        pdf:pdfCell,
        monthText:monthUsed?monthText(monthUsed):'',
        year:w.year||'',
        calendarYear:calendarYearForWork(w)||'',
        academicYear:w.academicYear||'',
        creditedPlan:w.source==='PLAN'?`${monthText(w.plannedMonth)||''} ${w.plannedYear||''}`.trim():'',
        patentNumber:w.patentNumber||'',
        patentDate:fmtPatentDate(w),
        patentIssuedBy:w.patentIssuedBy||'',
        coordCouncilName:w.coordCouncilName||'',
        decisionNumber:w.decisionNumber||'',
        certDate:fmtCertDate(w),
        certForeignLang:w.indicator==='XORIJIY_TIL_SERTIFIKAT'?xorijiyTilName(w.certForeignLang):'',
        certDarajasi:w.indicator==='XORIJIY_TIL_SERTIFIKAT'?(w.certDarajasi||''):'',
        certUmumiyBali:w.indicator==='XORIJIY_TIL_SERTIFIKAT'?(w.certUmumiyBali||''):'',
        ilmiyDaraja:(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?ilmiyDarajaName(w.ilmiyDaraja):'',
        ilmiyUnvon:(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?ilmiyUnvonName(w.ilmiyUnvon):'',
        educationDirectionCode:(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.educationDirectionCode||''):'',
        specialtyCode:(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.specialtyCode||''):'',
        diplomRaqami:(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.diplomRaqami||''):'',
        degreeDate:(w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.degreeDate||''):'',
        fanNomi:w.indicator==='XORIJIY_TIL_MASHGULOT'?(w.xorijiyTilFanNomi||''):'',
        fanYonalish:w.indicator==='XORIJIY_TIL_MASHGULOT'?(w.xorijiyTilFanYonalish||''):'',
        mashgulotTuri:w.indicator==='XORIJIY_TIL_MASHGULOT'?mashgulotTuriName(w.xorijiyTilMashgulotTuri):'',
        xorijiyTil:w.indicator==='XORIJIY_TIL_MASHGULOT'?xorijiyTilName(w.xorijiyTilTil):'',
        mashgulotSoati:w.indicator==='XORIJIY_TIL_MASHGULOT'?(w.xorijiyTilMashgulotSoati||''):'',
        grantName:w.indicator==='GRANT_PROJECTS'?(w.grantName||''):'',
        grantDuration:w.indicator==='GRANT_PROJECTS'?(w.grantDuration||''):'',
        grantPartner:w.indicator==='GRANT_PROJECTS'?(w.grantPartnerForeign||''):'',
        grantParticipantsDept:w.indicator==='GRANT_PROJECTS'?getGrantParticipantsDept(w):'',
        grantParticipantsOther:w.indicator==='GRANT_PROJECTS'?getGrantParticipantsOther(w):'',
        grantAmount:w.indicator==='GRANT_PROJECTS'?(w.grantAmountUsd?(w.grantAmountUsd+' USD'):''):'',
        top1000Direction:w.indicator==='TOP1000_TRAINING'?(w.top1000DirectionName||''):'',
        top1000Specialty:w.indicator==='TOP1000_TRAINING'?(w.top1000SpecialtyCode||''):'',
        top1000Hours:w.indicator==='TOP1000_TRAINING'?(w.top1000TrainingHours||''):'',
        top1000CertNumbers:w.indicator==='TOP1000_TRAINING'?(w.top1000CertNumbers||''):'',
        quarter:q?['','I','II','III','IV'][+q]||'':'',
        coAuthors:n,
        coPoints:fmtPoints(pts),
        statusText:statusLabel(status)
      });
    }
  }
  const searchQuery=getStatsSearchQuery();
  const displayRows=searchQuery?rows.filter(r=>statsRowMatchesSearch(r,searchQuery)):rows.slice();
  statsAllRows=rows;
  statsLastRows=displayRows;
  statsLastMeta={period,yearVal,teacherFilter,quarterFilter,searchQuery};

  // Aggregates (как в оригинале: statsChip, сортировка по count↓, label↑)
  const toSortedEntries=(map,labelFn)=>{
    const arr=Array.from(map.entries()).map(([k,count])=>({key:k,label:labelFn?labelFn(k):k,count}));
    arr.sort((a,b)=>(b.count-a.count)||String(a.label).localeCompare(String(b.label),'ru'));
    return arr;
  };
  const renderAggChips=(container,entries,emptyText,variant)=>{
    container.innerHTML='';
    if(!entries.length){container.innerHTML=`<span class="muted small">${emptyText}</span>`;return;}
    entries.forEach(e=>{
      const sp=document.createElement('span');
      sp.className='statsChip';
      if(variant==='detail')sp.classList.add('statsChipDetail');
      sp.innerHTML=`<span>${esc(e.label)}</span> <b>${e.count}</b>`;
      container.appendChild(sp);
    });
  };
  const mergePlannedIntoDetailMap=(targetMap,plannedMap)=>{
    plannedMap.forEach((plannedDetail,key)=>{
      const detail=ensureDetailEntry(targetMap,key,plannedDetail.label);
      detail.planned=Number(plannedDetail.planned||0);
      detail.planDone=Number(plannedDetail.planDone||0);
      detail.planPartial=Number(plannedDetail.planPartial||0);
      detail.planNotDone=Number(plannedDetail.planNotDone||0);
    });
  };
  const buildIndicatorEntriesFromRows=(list)=>{
    const counts=new Map();
    list.forEach(r=>{
      const key=r.indicatorCode||'';
      if(!key)return;
      const increment=key==='CITATIONS'?(parseInt(r.citations,10)||1):1;
      counts.set(key,(counts.get(key)||0)+increment);
    });
    return toSortedEntries(counts,k=>{
      if(k==='ARTICLE_TYPE')return String(t('ui.stats.workTypes.ARTICLES'));
      if(k==='LITERATURE')return String(t('ui.stats.workTypes.LITERATURE'));
      return indName(k);
    });
  };
  const buildIndicatorEntriesFromAggregate=(map)=>{
    return toSortedEntries(map,k=>{
      if(k==='ARTICLE_TYPE')return String(t('ui.stats.workTypes.ARTICLES'));
      if(k==='LITERATURE')return String(t('ui.stats.workTypes.LITERATURE'));
      return indName(k);
    });
  };
  const detailMetaLabels={
    planned: currentLang==='uz' ? 'Reja' : 'План',
    done: currentLang==='uz' ? 'Bajarilgan' : 'Выполнено',
    partial: currentLang==='uz' ? 'Qisman' : 'Частично',
    debtors: currentLang==='uz' ? 'Qarzdorlar' : 'Задолжников',
    inProgress: currentLang==='uz' ? 'Jarayonda' : 'В процессе',
    outPlan: currentLang==='uz' ? 'Rejadan tashqari' : 'Вне плана'
  };
  const renderAggDetailCards=(container,entries,detailMap,emptyText,outPlanMap,mode)=>{
    container.innerHTML='';
    if(!entries.length){
      container.innerHTML=`<span class="muted small">${emptyText}</span>`;
      return;
    }
    entries.forEach(e=>{
      const detail=detailMap.get(e.key)||{
        planned:0,done:0,partial:0,notDone:0,
        planWorkDone:0,planWorkPartial:0,
        planDone:0,planPartial:0,planNotDone:0,
        outPlan:0
      };
      const visibleDone=sourcePlanOn?Number(detail.planWorkDone||0):0;
      const visiblePartial=(sourcePlanOn&&stPartialOn)?Number(detail.planWorkPartial||0):0;
      const completedCount=visibleDone+visiblePartial;
      const outPlanCount=Number((outPlanMap&&outPlanMap.get(e.key))||detail.outPlan||0);
      const plannedCount=sourcePlanOn?Number(detail.planned||0):0;
      const completedPct=plannedCount>0
        ? Math.round((completedCount/plannedCount)*100)
        : null;
      const pctFromPlan=(n)=>plannedCount>0?Math.round((Number(n||0)/plannedCount)*100):0;
      const pctText=(n)=>plannedCount>0?`${pctFromPlan(n)}%`:'—';
      const metricText=(enabled,n)=>enabled?String(Number(n||0)):'—';
      const planEnabled=sourcePlanOn;
      const outPlanEnabled=sourceOutOn;
      const doneEnabled=sourcePlanOn&&stDoneOn;
      const partialEnabled=sourcePlanOn&&stPartialOn;
      const notDoneEnabled=sourcePlanOn&&stNotDoneOn;
      const now=new Date();
      const overdueTeacherIds=new Set();
      let inProgressCount=0;
      if(sourcePlanOn&&stNotDoneOn){
        for(const p of statsPlansCache){
          if(!isPlanItemInAggScope(p))continue;
          let isMatch=false;
          if(mode==='article'){
            isMatch=(p.indicator==='ARTICLE_TYPE'&&normalizeArticleType(p.articleType||'').trim()===e.key);
          }else if(mode==='literature'){
            isMatch=(STATS_LITERATURE_SET.has(p.indicator)&&p.indicator===e.key);
          }else if(mode==='indicator'){
            isMatch=(p.indicator===e.key);
          }
          if(!isMatch)continue;
          const teacherScope=getPlanAggTeacherFilter(p);
          if(teacherScope===false)continue;
          const useCoauthorForDebtorStatus=true;
          const useYearWideMonthCredit=
            p.indicator==='ARTICLE_TYPE'&&normalizeArticleType(p.articleType||'').trim()==='WOS_SCOPUS';
          const st=getPlanItemStatus(
            p,
            statsWorksCache,
            teacherScope,
            useCoauthorForDebtorStatus,
            useYearWideMonthCredit
          );
          if(st!=='not')continue;
          if(isPlanItemOverdueByCurrentDate(p, now)){
            const tid=Number(p.teacherId||0);
            if(tid>0)overdueTeacherIds.add(tid);
            else if(teacherFilter)overdueTeacherIds.add(Number(teacherFilter));
          }else{
            inProgressCount++;
          }
        }
      }
      const debtorsCount=sourcePlanOn?overdueTeacherIds.size:0;
      const overdueTeacherNames=Array.from(overdueTeacherIds)
        .map(id=>teacherMap.get(id)||teacherMap.get(String(id))||`ID ${id}`)
        .filter(Boolean)
        .sort((a,b)=>String(a).localeCompare(String(b),'ru'));
      const card=document.createElement('div');
      card.className='statsAggDetailCard';
      card.innerHTML=`
        <div class="statsAggDetailHead">
          <div class="statsAggDetailTitle">${esc(e.label)}</div>
        </div>
        <div class="statsAggDetailMeta">
          <div class="statsAggDetailMetaItem is-planned"><span class="statsAggDetailMetaItemLabel">${esc(detailMetaLabels.planned)}</span><span class="statsAggDetailMetaItemValue">${metricText(planEnabled,plannedCount)}</span></div>
          <div class="statsAggDetailMetaItem is-outplan"><span class="statsAggDetailMetaItemLabel">${esc(detailMetaLabels.outPlan)}</span><span class="statsAggDetailMetaItemValue">${metricText(outPlanEnabled,outPlanCount)}</span></div>
          <div class="statsAggDetailMetaItem is-done"><span class="statsAggDetailMetaItemLabel">${esc(detailMetaLabels.done)}</span><span class="statsAggDetailMetaItemValue">${metricText(doneEnabled,visibleDone)} <small>(${doneEnabled?pctText(visibleDone):'—'})</small></span></div>
          <div class="statsAggDetailMetaItem is-partial"><span class="statsAggDetailMetaItemLabel">${esc(detailMetaLabels.partial)}</span><span class="statsAggDetailMetaItemValue">${metricText(partialEnabled,visiblePartial)} <small>(${partialEnabled?pctText(visiblePartial):'—'})</small></span></div>
          <div class="statsAggDetailMetaItem is-debt"><span class="statsAggDetailMetaItemLabel">${esc(detailMetaLabels.debtors)}</span><span class="statsAggDetailMetaItemValue">${metricText(notDoneEnabled,debtorsCount)} <small>(${notDoneEnabled?pctText(debtorsCount):'—'})</small></span></div>
          <div class="statsAggDetailMetaItem is-progress"><span class="statsAggDetailMetaItemLabel">${esc(detailMetaLabels.inProgress)}</span><span class="statsAggDetailMetaItemValue">${metricText(notDoneEnabled,inProgressCount)} <small>(${notDoneEnabled?pctText(inProgressCount):'—'})</small></span></div>
        </div>`;
      const debtItem=card.querySelector('.statsAggDetailMetaItem.is-debt');
      if(debtItem&&overdueTeacherNames.length){
        debtItem.classList.add('is-clickable');
        debtItem.setAttribute('role','button');
        debtItem.setAttribute('tabindex','0');
        debtItem.title=currentLang==='uz'
          ? "Qarzdor pedagoglar ro'yxatini ochish"
          : 'Показать список педагогов-должников';
        const debtList=document.createElement('div');
        debtList.className='statsAggDebtList';
        debtList.hidden=true;
        const debtTitle=currentLang==='uz' ? 'Qarzdor pedagoglar (F.I.O.):' : 'Педагоги-должники (Ф.И.О.):';
        debtList.innerHTML=`<div class="statsAggDebtListTitle">${esc(debtTitle)}</div><ol>${overdueTeacherNames.map(n=>`<li>${esc(n)}</li>`).join('')}</ol>`;
        card.appendChild(debtList);
        const toggleDebtList=()=>{ debtList.hidden=!debtList.hidden; };
        debtItem.addEventListener('click',toggleDebtList);
        debtItem.addEventListener('keydown',(ev)=>{
          if(ev.key==='Enter'||ev.key===' '){
            ev.preventDefault();
            toggleDebtList();
          }
        });
      }
      container.appendChild(card);
    });
  };
  const renderAggIndicatorChips=(entries,emptyText,typeEntries,literatureEntries,simpleIndicatorEntries,typeDetails,literatureDetails,simpleIndicatorDetails,workTypeDetails,workLiteratureDetails,totalCreditedPct)=>{
    const container=$('statsAggIndicators');
    if(!container)return;
    container.innerHTML='';
    if(!entries.length){
      container.innerHTML=`<span class="muted small">${emptyText}</span>`;
      return;
    }
    const availableModes=new Set(entries.map(e=>
      e.key==='ARTICLE_TYPE'
        ? 'article'
        : (STATS_LITERATURE_SET.has(e.key)
          ? `literature:${e.key}`
          : (e.key==='LITERATURE'
            ? 'literature'
            : (e.key==='CITATIONS'
              ? 'citations'
              : (e.key==='PATENTS' ? 'patents' : ''))))
    ).filter(Boolean));
    if(statsAggDetailMode && !availableModes.has(statsAggDetailMode))statsAggDetailMode='';
    const calcModePct=()=> (typeof totalCreditedPct==='number' ? totalCreditedPct : null);
    const buildInlineDetail=(mode)=>{
      const wrap=document.createElement('div');
      wrap.className='statsAggInlineDetails';
      const label=document.createElement('span');
      label.className='statsAggInlineLabel';
      const grid=document.createElement('div');
      grid.className='statsAggInlineGrid';
      if(mode==='article'){
        label.textContent=String(t('ui.stats.agg.byArticleType'));
        renderAggDetailCards(grid,typeEntries,typeDetails,String(t('ui.stats.agg.noneByTypes')),outPlanByType,'article');
      }else if(mode==='literature' || String(mode).startsWith('literature:')){
        const literatureKey=String(mode).startsWith('literature:') ? String(mode).split(':')[1] : '';
        label.textContent=literatureKey ? indName(literatureKey) : String(t('ui.stats.agg.byLiteratureType'));
        const literatureEmptyText=workTypesSel.includes('LITERATURE')
          ? String(t('ui.stats.agg.noneByLiterature'))
          : String(t('ui.stats.agg.literatureDisabled'));
        renderAggDetailCards(
          grid,
          literatureKey ? literatureEntries.filter(item=>item.key===literatureKey) : literatureEntries,
          literatureDetails,
          literatureEmptyText,
          outPlanByLiterature,
          'literature'
        );
      }else if(mode==='citations' || mode==='patents'){
        const key=mode==='citations' ? 'CITATIONS' : 'PATENTS';
        label.textContent=indName(key);
        renderAggDetailCards(
          grid,
          simpleIndicatorEntries.filter(item=>item.key===key),
          simpleIndicatorDetails,
          String(t('ui.stats.agg.noneByTypes')),
          outPlanBySimpleIndicator,
          'indicator'
        );
      }
      wrap.appendChild(label);
      wrap.appendChild(grid);
      return wrap;
    };
    entries.forEach(e=>{
      const mode=e.key==='ARTICLE_TYPE'
        ? 'article'
        : (STATS_LITERATURE_SET.has(e.key)
          ? `literature:${e.key}`
          : (e.key==='LITERATURE'
            ? 'literature'
            : (e.key==='CITATIONS'
              ? 'citations'
              : (e.key==='PATENTS' ? 'patents' : ''))));
      const chip=document.createElement(mode?'button':'span');
      chip.className='statsChip';
      if(mode){
        chip.type='button';
        chip.classList.add('is-interactive');
        if(statsAggDetailMode===mode)chip.classList.add('is-active');
        chip.addEventListener('click',()=>{
          statsAggDetailMode=statsAggDetailMode===mode?'':mode;
          renderAggIndicatorChips(entries,emptyText,typeEntries,literatureEntries,simpleIndicatorEntries,typeDetails,literatureDetails,simpleIndicatorDetails,workTypeDetails,workLiteratureDetails,totalCreditedPct);
        });
      }
      if(mode){
        const pct=calcModePct();
        const pctText=pct==null?'':` (${pct}%)`;
        chip.innerHTML=`<span>${esc(e.label)}</span> <b>${e.count}${esc(pctText)}</b>`;
      }else{
        chip.innerHTML=`<span>${esc(e.label)}</span> <b>${e.count}</b>`;
      }
      container.appendChild(chip);
      if(mode && statsAggDetailMode===mode){
        container.appendChild(buildInlineDetail(mode));
      }
    });
  };

  let indEntries=buildIndicatorEntriesFromAggregate(creditedByIndicator);
  let typeEntries=[], literatureEntries=[];
  const isPlanItemInAggScope=(p)=>{
    if(period==='academic'){
      if(yearVal&&String(p.academicYear||'')!==yearVal)return false;
      if(!isMonthInAcademicYear(p.plannedMonth))return false;
    }else{
      const cy=calendarYearForWork({academicYear:p.academicYear,month:p.plannedMonth});
      if(!cy)return false;
      if(yearVal&&String(cy)!==yearVal)return false;
    }
    if(teacherFilter){
      const pTid=Number(p.teacherId||0);
      if(pTid!==teacherFilter)return false;
    }
    if(!workTypesSel.length||!allowedIndicators.has(p.indicator))return false;
    if(p.indicator==='ARTICLE_TYPE'){
      if(!articleTypesSel.length)return false;
      const pArt=normalizeArticleType(p.articleType||'').trim();
      if(articleTypesSel.length<ARTICLE_TYPES.length&&!articleTypesSel.includes(pArt))return false;
    }
    if(STATS_LITERATURE_SET.has(p.indicator)){
      const hasLiteratureWorkType=workTypesSel.includes('LITERATURE');
      if(hasLiteratureWorkType&&literatureTypesSel.length===0){
      }else{
        if(!literatureTypesSel.length)return false;
        if(literatureTypesSel.length<STATS_LITERATURE_TYPES.length&&!literatureTypesSel.includes(p.indicator))return false;
      }
    }
    const planMonth=Number(p.plannedMonth||0);
    if(!matchesStatsMonthFilter(planMonth,monthFilters))return false;
    const q=quarterFromMonth(planMonth);
    if(quarterFilter&&q!==quarterFilter)return false;
    if(planMonth&&!(fH1&&isH1Month(planMonth))&&!(fH2&&isH2Month(planMonth)))return false;
    return true;
  };
  const getPlanAggTeacherFilter=(p)=>{
    if(!teacherFilter)return null;
    const pTid=Number(p.teacherId||0);
    if(pTid!==teacherFilter)return false;
    return null;
  };
  const getVisibleStatusCount=(detail)=>(stDoneOn?detail.done:0)+(stPartialOn?detail.partial:0)+(stNotDoneOn?detail.notDone:0);
  if(sourcePlanOn){
    for(const p of statsPlansCache){
      if(!isPlanItemInAggScope(p))continue;
      aggPlanTotal++;
      const teacherScope=getPlanAggTeacherFilter(p);
      if(teacherScope===false)continue;
      const st=getPlanItemStatus(p, statsWorksCache, teacherScope,true);
      if(p.indicator==='ARTICLE_TYPE'){
        const artCode=normalizeArticleType(p.articleType||'').trim();
        if(artCode){
          const detail=ensureDetailEntry(planDetailByType,artCode,artName(artCode));
          detail.planned++;
          if(st==='done')detail.planDone++;
          else if(st==='partial')detail.planPartial++;
          else detail.planNotDone++;
        }
      }
      if(STATS_LITERATURE_SET.has(p.indicator)){
        const detail=ensureDetailEntry(planDetailByLiterature,p.indicator,indName(p.indicator));
        detail.planned++;
        if(st==='done')detail.planDone++;
        else if(st==='partial')detail.planPartial++;
        else detail.planNotDone++;
      }
      if(p.indicator==='CITATIONS' || p.indicator==='PATENTS'){
        const targetUnits=getPlanUnitCount(p);
        const progress=getPlanItemUnitProgress(p, statsWorksCache, teacherScope, true, false);
        const detail=ensureDetailEntry(planDetailBySimpleIndicator,p.indicator,indName(p.indicator));
        detail.planned+=targetUnits;
        detail.planDone+=Math.min(progress.done,targetUnits);
        detail.planPartial+=Math.min(Math.max(targetUnits-progress.done,0),progress.partial);
        detail.planNotDone+=Math.max(targetUnits-(progress.done+progress.partial),0);
      }
    }
  }
  mergePlannedIntoDetailMap(detailByType,planDetailByType);
  mergePlannedIntoDetailMap(detailByLiterature,planDetailByLiterature);
  mergePlannedIntoDetailMap(detailBySimpleIndicator,planDetailBySimpleIndicator);
  typeEntries=Array.from(detailByType.values())
    .map(d=>({key:d.key,label:d.label,count:getVisibleStatusCount(d)}))
    .sort((a,b)=>(b.count-a.count)||String(a.label).localeCompare(String(b.label),'ru'));
  literatureEntries=Array.from(detailByLiterature.values())
    .map(d=>({key:d.key,label:d.label,count:getVisibleStatusCount(d)}))
    .sort((a,b)=>(b.count-a.count)||String(a.label).localeCompare(String(b.label),'ru'));

  {
    const summaryEl=$('statsSummary');
    if(summaryEl){
      summaryEl.innerHTML='';
      summaryEl.style.display='none';
    }
  }

  const planPctSummary=renderPlanPctBox(yearVal,period,teacherFilter,workTypesSel,allowedIndicators,articleTypesSel,literatureTypesSel,monthFilters,quarterFilter,fH1,fH2);
  const simpleIndicatorEntries=indEntries.filter(e=>e.key==='CITATIONS'||e.key==='PATENTS');
  renderAggIndicatorChips(
    indEntries,
    String(t('ui.stats.agg.noneByIndicators')),
    typeEntries,
    literatureEntries,
    simpleIndicatorEntries,
    detailByType,
    detailByLiterature,
    detailBySimpleIndicator,
    detailByType,
    detailByLiterature,
    planPctSummary&&typeof planPctSummary.totalCreditedPct==='number' ? planPctSummary.totalCreditedPct : null
  );

  const aggCo=$('statsAggCoauthor'); aggCo.innerHTML='';
  const coSp=document.createElement('span'); coSp.className='statsChip';
  coSp.innerHTML=`<span>${esc(String(t('ui.stats.agg.coauthorSumLabel')))}</span> <b>${fmtPoints(creditedCoauthorSum)}</b>`;
  aggCo.appendChild(coSp);

  // Hint
  {
    const sum=fmtPoints(creditedCoauthorSum);
    const fn=t('ui.stats.agg.hint');
    $('statsAggHint').textContent=(typeof fn==='function')?fn(creditedTotal,sum):String(fn);
  }
  $('statsAggBox').style.display='block';

  // Table
  const tbody=$('statsTbody'); tbody.innerHTML='';
  if(!displayRows.length){
    const emptyText=searchQuery?(currentLang==='uz'?"Qidiruv bo'yicha hech narsa topilmadi":'По запросу ничего не найдено'):String(t('ui.stats.noData'));
    tbody.innerHTML=`<tr><td colspan="${STATS_XLS_COLUMNS.length}" class="muted">${esc(emptyText)}</td></tr>`;
  }else{
    displayRows.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML=STATS_XLS_COLUMNS.map(c=>{
        const val=r[c.key];
        if(c.key==='pdf'&&typeof val==='string'&&val!=='—')return `<td data-col="pdf">${val}</td>`;
        return `<td data-col="${c.key}">${esc(String(val != null ? val : ''))}</td>`;
      }).join('');
      tbody.appendChild(tr);
    });
  }
  statsApplyColsToTable();
  renderPlanStatsTable();
  requestAnimationFrame(()=>updateStatsStickyScrollbar());
}

function renderPlanPctBox(yearVal,period,teacherFilter,workTypesSel,allowedIndicators,articleTypesSel,literatureTypesSel,monthFilters,quarterFilter,fH1,fH2){
  const box=$('statsPlanPctBox');
  const list=$('statsPlanPctList');
  const hint=$('statsPlanPctHint');
  const scheme=$('statsPlanScheme');
  if(!yearVal){box.style.display='none';return;}
  box.style.display='block';
  if(list){
    list.innerHTML='';
    list.style.display='none';
  }

  const citationsMin=0;
  const isPlanItemInScope=(p)=>{
    if(period==='academic'){
      if(String(p.academicYear||'')!==yearVal)return false;
      if(!isMonthInAcademicYear(p.plannedMonth))return false;
    }else{
      const cy=calendarYearForWork({academicYear:p.academicYear,month:p.plannedMonth});
      if(!cy||String(cy)!==yearVal)return false;
    }
    if(teacherFilter&&Number(p.teacherId)!==teacherFilter)return false;
    if(!workTypesSel.length||!allowedIndicators.has(p.indicator))return false;
    if(citationsMin>0&&p.indicator!=='CITATIONS')return false;
    const pArt=normalizeArticleType(p.articleType||'');
    if(p.indicator==='ARTICLE_TYPE'){
      if(articleTypesSel.length===0)return false;
      if(articleTypesSel.length<ARTICLE_TYPES.length&&!articleTypesSel.includes(pArt))return false;
    }
    if(STATS_LITERATURE_SET.has(p.indicator)){
      // Если выбрана "Литература" в workTypesSel, но не выбраны конкретные типы литературы - показываем все типы
      // Если выбраны конкретные типы - фильтруем по ним
      const hasLiteratureWorkType=workTypesSel.includes('LITERATURE');
      if(hasLiteratureWorkType&&literatureTypesSel.length===0){
        // Выбрана "Литература", но не выбраны конкретные типы - показываем все (не пропускаем)
      }else{
        // Если "Литература" не выбрана ИЛИ выбраны конкретные типы - применяем фильтр
        if(!literatureTypesSel.length)return false;
        if(literatureTypesSel.length<STATS_LITERATURE_TYPES.length&&!literatureTypesSel.includes(p.indicator))return false;
      }
    }
    if(!matchesStatsMonthFilter(Number(p.plannedMonth||0),monthFilters))return false;
    const q=quarterFromMonth(p.plannedMonth);
    if(quarterFilter&&q!==quarterFilter)return false;
    const pmm=Number(p.plannedMonth||0);
    if(pmm&&!(fH1&&isH1Month(pmm))&&!(fH2&&isH2Month(pmm)))return false;
    return true;
  };
  const planInScope=[];
  for(const p of statsPlansCache){ if(isPlanItemInScope(p)) planInScope.push(p); }
  const planTotal=planInScope.reduce((sum,p)=>sum+getPlanUnitCount(p),0);

  const inPlanOn=$('statsPlanChkInPlan') ? $('statsPlanChkInPlan').checked : true;
  const outOn=$('statsPlanChkOutPlan') ? $('statsPlanChkOutPlan').checked : true;

  let inPlanDone=0,inPlanPartial=0,inPlanNotDone=0;
  let outDone=0,outPartial=0,outNotDone=0;
  const isWorkInScopeForPct=(w)=>{
    if(teacherFilter){
      const baseTid=Number(w.teacherId||0);
      if(baseTid!==Number(teacherFilter))return false;
    }
    const monthUsed=Number(w.plannedMonth||w.month||0);
    if(period==='academic'){
      if(!isMonthInAcademicYear(monthUsed))return false;
      if(String(w.academicYear||'')!==yearVal)return false;
    }else{
      const cy=calendarYearForWork(w);
      if(!cy||String(cy)!==yearVal)return false;
    }
    if(!workTypesSel.length||!allowedIndicators.has(w.indicator))return false;
    if(citationsMin>0){
      if(w.indicator!=='CITATIONS')return false;
      if(getCitationsCount(w)<citationsMin)return false;
    }
    if(w.indicator==='ARTICLE_TYPE'){
      if(articleTypesSel.length===0)return false;
      const wArt=normalizeArticleType(w.articleType||'').trim();
      if(articleTypesSel.length<ARTICLE_TYPES.length&&!articleTypesSel.includes(wArt))return false;
    }
    if(STATS_LITERATURE_SET.has(w.indicator)){
      // Если выбрана "Литература" в workTypesSel, но не выбраны конкретные типы литературы - показываем все типы
      // Если выбраны конкретные типы - фильтруем по ним
      const hasLiteratureWorkType=workTypesSel.includes('LITERATURE');
      if(hasLiteratureWorkType&&literatureTypesSel.length===0){
        // Выбрана "Литература", но не выбраны конкретные типы - показываем все (не пропускаем)
      }else{
        // Если "Литература" не выбрана ИЛИ выбраны конкретные типы - применяем фильтр
        if(!literatureTypesSel.length)return false;
        if(literatureTypesSel.length<STATS_LITERATURE_TYPES.length&&!literatureTypesSel.includes(w.indicator))return false;
      }
    }
    if(!matchesStatsMonthFilter(monthUsed,monthFilters))return false;
    const q=quarterFromMonth(monthUsed);
    if(quarterFilter&&q!==quarterFilter)return false;
    if(monthUsed&&!(fH1&&isH1Month(monthUsed))&&!(fH2&&isH2Month(monthUsed)))return false;
    return true;
  };
  statsWorksCache.forEach(w=>{
    if(!isWorkInScopeForPct(w))return;
    const st=isDoneWork(w)?'DONE':(w.completionStatus==='PARTIAL'?'PARTIAL':'NOT_DONE');
    const units=getWorkCreditUnits(w);
    if(w.source==='PLAN'){
      if(st==='DONE')inPlanDone+=units;
      else if(st==='PARTIAL')inPlanPartial+=units;
      else inPlanNotDone+=units;
    }else if(w.source==='OUT_OF_PLAN'){
      if(st==='DONE')outDone+=units;
      else if(st==='PARTIAL')outPartial+=units;
      else outNotDone+=units;
    }
  });
  // For "planned" block, derive "not done" from plan balance:
  // planned total minus credited (done + partial), not from explicit NOT_DONE status.
  const inPlanNotDoneFromPlan=Math.max(0,planTotal-(inPlanDone+inPlanPartial));

  const pctFromPlan=n=>planTotal?Math.round((n/planTotal)*100):0;
  if(list)list.innerHTML='';
  const primaryWrap=document.createElement('div');
  primaryWrap.className='statsAggPrimary';
  const secondaryWrap=document.createElement('div');
  secondaryWrap.className='statsAggSecondary';
  if(list){
    list.appendChild(primaryWrap);
    list.appendChild(secondaryWrap);
  }
  const buildPlanBreakdownHtml=(done,partial,notDone)=>{
    const includeNotDone=(notDone != null);
    const total=(Number(done)||0)+(Number(partial)||0)+(includeNotDone?(Number(notDone)||0):0);
    const pct=(n)=>total>0?Math.round((Number(n||0)/total)*100):0;
    const doneTotal=(Number(done)||0)+(Number(partial)||0);
    const doneTotalLabel=String(t('ui.planPct.doneTotal')||'Всего выполнено');
    const items=[];
    if(includeNotDone){
      const planPrefixLabel=String(t('ui.planPct.planPrefix')||'По плану:');
      items.push(`<span class="statsAggBreakdownPrefix">${esc(planPrefixLabel)}</span>`);
      items.push(`<span class="statsAggBreakdownItem is-totaldone"><span>${esc(doneTotalLabel)}</span><b>${doneTotal} (${pct(doneTotal)}%)</b></span>`);
    }
    items.push(
      `<span class="statsAggBreakdownItem is-done"><span>${esc(String(t('ui.stats.statusDone')))}</span><b>${done} (${pct(done)}%)</b></span>`,
      `<span class="statsAggBreakdownItem is-partial"><span>${esc(String(t('ui.stats.statusPartial')))}</span><b>${partial} (${pct(partial)}%)</b></span>`
    );
    if(includeNotDone){
      items.push(`<span class="statsAggBreakdownItem is-notdone"><span>${esc(String(t('ui.stats.statusNotDone')))}</span><b>${notDone} (${pct(notDone)}%)</b></span>`);
    }
    return items.join('');
  };
  
  const addLine=(lbl,cnt,pctVal,subText,breakdown,options={})=>{
    const div=document.createElement('div');
    const isPrimary=!!options.isPrimary;
    const isTotalCredited=!!options.isTotalCredited;
    const hidePct=!!options.hidePct;
    div.className=`statsAggLine ${isPrimary?'is-primary':'is-dependent'}${isTotalCredited?' is-total-credited':''}`;
    const pctText=pctVal===null?'—':`${pctVal}%`;
    div.innerHTML=`<div class="statsAggLineRow"><div class="statsAggLineLeft">${esc(lbl)}</div><div class="statsAggLineRight"><b>${cnt}</b>${hidePct?'':` <span class="muted">(${pctText})</span>`}</div></div>`;
    if(breakdown){
      const sub=document.createElement('div');
      sub.className='statsAggBreakdown';
      sub.innerHTML=buildPlanBreakdownHtml(breakdown.done,breakdown.partial,breakdown.notDone);
      div.appendChild(sub);
    }else if(subText){
      const sub=document.createElement('div');
      sub.className='statsAggLineSub';
      sub.textContent=subText;
      div.appendChild(sub);
    }
    (isPrimary?primaryWrap:secondaryWrap).appendChild(div);
  };
  // Статусные строки (как в оригинале)
  const subPlannedFn=t('ui.planPct.subPlanned');
  const subPlanned=(done,partial,notDone)=> (typeof subPlannedFn==='function' ? subPlannedFn(done,partial,notDone) : String(subPlannedFn));
  const subStatusFn=t('ui.planPct.subStatus');
  const subStatus=(done,partial,notDone)=> (typeof subStatusFn==='function' ? subStatusFn(done,partial,notDone) : String(subStatusFn));
  
  // В плане (запланировано)
  addLine(
    String(t('ui.planPct.planned')),
    planTotal,
    planTotal?100:null,
    planTotal?subPlanned(inPlanDone,inPlanPartial,inPlanNotDoneFromPlan):'',
    planTotal?{done:inPlanDone,partial:inPlanPartial,notDone:inPlanNotDoneFromPlan}:null,
    { isPrimary:true, hidePct:true }
  );

  // "По плану выполнено" block removed by request.
  const inPlanCredited=inPlanDone+inPlanPartial;

  // Выполнено вне плана
  const outTotal=outDone+outPartial+outNotDone;
  if(outOn)addLine(
    String(t('ui.planPct.doneOutPlan')),
    outTotal,
    pctFromPlan(outTotal),
    outTotal?subStatus(outDone,outPartial,outNotDone):'',
    outTotal?{done:outDone,partial:outPartial,notDone:null}:null
  );

  // Total credited (done + partial) by sources
  const totalCredited=(inPlanOn?inPlanCredited:0)+(outOn?outTotal:0);
  let totalSub='';
  if(inPlanOn&&outOn){
    const fn=t('ui.planPct.subSourcesBoth');
    totalSub=typeof fn==='function'?fn(inPlanCredited,outTotal):String(fn);
  }else if(inPlanOn){
    const fn=t('ui.planPct.subSourcesPlan');
    totalSub=typeof fn==='function'?fn(inPlanCredited):String(fn);
  }else if(outOn){
    const fn=t('ui.planPct.subSourcesOut');
    totalSub=typeof fn==='function'?fn(outTotal):String(fn);
  }
  const totalCreditedPct=(inPlanOn||outOn)?pctFromPlan(totalCredited):null;
  if(inPlanOn||outOn)addLine(String(t('ui.planPct.totalCredited')),totalCredited,totalCreditedPct,totalSub,null,{ isTotalCredited:true });

  // Подсказка если план пуст
  secondaryWrap.style.display=secondaryWrap.childElementCount?'grid':'none';
  if(planTotal){
    hint.textContent='';
    hint.style.display='none';
  }else{
    hint.textContent=String(t('ui.planPct.hintNoPlan'));
    hint.style.display='block';
  }

  // Visual scheme block under "Выполнение относительно плана"
  if(scheme){
    const safePct=(n,base)=>{
      const d=Number(base)||0;
      if(!d)return 0;
      return Math.round(((Number(n)||0)/d)*100);
    };
    const fmtPct=(n,base)=>`${safePct(n,base)}%`;
    const inPlanCredited=inPlanDone+inPlanPartial;
    const outTotal=outDone+outPartial+outNotDone;
    const totalDone=inPlanCredited+outTotal;
    const donePlanShare=safePct(inPlanDone,planTotal);
    const partialPlanShare=safePct(inPlanPartial,planTotal);
    const now=new Date();
    const overdueTeacherIds=new Set();
    let inProgressCount=0;
    for(const p of planInScope){
      const useCoauthorForDebtorStatus=true;
      const useYearWideMonthCredit=
        p.indicator==='ARTICLE_TYPE'&&normalizeArticleType(p.articleType||'').trim()==='WOS_SCOPUS';
      const st=getPlanItemStatus(
        p,
        statsWorksCache,
        teacherFilter||null,
        useCoauthorForDebtorStatus,
        useYearWideMonthCredit
      );
      if(st!=='not')continue;
      if(isPlanItemOverdueByCurrentDate(p, now)){
        const tid=Number(p.teacherId||0);
        if(tid>0)overdueTeacherIds.add(tid);
      }else{
        inProgressCount++;
      }
    }
    const debtorsCount=overdueTeacherIds.size;
    const debtPlanShare=safePct(debtorsCount,planTotal);
    const inProgressShare=safePct(inProgressCount,planTotal);
    const inPlanDoneLabel=currentLang==='uz'?'Reja bo‘yicha':'По плану';
    const outPlanDoneLabel=currentLang==='uz'?'Rejadan tashqari':'Вне плана';
    const doneLabel=String(t('ui.stats.statusDone')||'Выполнено');
    const partialLabel=String(t('ui.stats.statusPartial')||'Частично');
    const debtLabel=currentLang==='uz'?'Qarzdorlar':'Задолжников';
    const progressLabel=currentLang==='uz'?'Jarayonda':'В процессе';
    const planLabel=currentLang==='uz'?'Reja':'План';
    const byPlanLabel=String(t('ui.stats.sourcePlan')||'По плану');
    scheme.hidden=false;
    scheme.innerHTML=`
      <div class="statsPlanSchemeTop">
        <div class="statsPlanMetric">
          <span class="statsPlanMetricLabel">${esc(planLabel)}</span>
          <span class="statsPlanMetricValue">${planTotal}</span>
        </div>
        <div class="statsPlanMetric">
          <span class="statsPlanMetricLabel">${esc(doneLabel)}</span>
          <span class="statsPlanMetricValue">${totalDone}</span>
          <span class="statsPlanMetricMeta">(${fmtPct(totalDone,planTotal)})</span>
        </div>
        <div class="statsPlanMetric statsPlanMetricCompact">
          <span class="statsPlanMetricLabel">${esc(inPlanDoneLabel)}</span>
          <span class="statsPlanMetricValue">${inPlanCredited}</span>
          <span class="statsPlanMetricMeta">(${fmtPct(inPlanCredited,planTotal)})</span>
        </div>
        <div class="statsPlanMetric statsPlanMetricCompact">
          <span class="statsPlanMetricLabel">${esc(outPlanDoneLabel)}</span>
          <span class="statsPlanMetricValue">${outTotal}</span>
          <span class="statsPlanMetricMeta">(${fmtPct(outTotal,planTotal)})</span>
        </div>
      </div>
      <div class="statsPlanPanel">
        <div class="statsPlanPanelTitle">${esc(byPlanLabel)}</div>
        <div class="statsPlanBadges">
          <div class="statsPlanBadge is-done"><span class="statsPlanBadgeLabel">${esc(doneLabel)}</span><span class="statsPlanBadgeMeta"><span class="statsPlanBadgeMetaValue">${inPlanDone}</span><span class="statsPlanBadgeMetaPct">(${donePlanShare}%)</span></span></div>
          <div class="statsPlanBadge is-partial"><span class="statsPlanBadgeLabel">${esc(partialLabel)}</span><span class="statsPlanBadgeMeta"><span class="statsPlanBadgeMetaValue">${inPlanPartial}</span><span class="statsPlanBadgeMetaPct">(${partialPlanShare}%)</span></span></div>
          <div class="statsPlanBadge is-debt"><span class="statsPlanBadgeLabel">${esc(debtLabel)}</span><span class="statsPlanBadgeMeta"><span class="statsPlanBadgeMetaValue">${debtorsCount}</span><span class="statsPlanBadgeMetaPct">(${debtPlanShare}%)</span></span></div>
          <div class="statsPlanBadge is-progress"><span class="statsPlanBadgeLabel">${esc(progressLabel)}</span><span class="statsPlanBadgeMeta"><span class="statsPlanBadgeMetaValue">${inProgressCount}</span><span class="statsPlanBadgeMetaPct">(${inProgressShare}%)</span></span></div>
        </div>
      </div>`;
  }
  return { totalCreditedPct };
}

const statsChange=()=>{saveUIState();renderStats();};
if($('statsPeriod'))$('statsPeriod').onchange=()=>{fillStatsYearOptions();saveUIState();renderStats();};
if($('statsYearSel'))$('statsYearSel').onchange=statsChange;
if($('statsTeacherSel'))$('statsTeacherSel').onchange=statsChange;
if($('statsQuarter'))$('statsQuarter').onchange=statsChange;
if($('statsMonth'))$('statsMonth').onchange=statsChange;
if($('statsHalf1'))$('statsHalf1').onchange=statsChange;
if($('statsHalf2'))$('statsHalf2').onchange=statsChange;
if($('statsSourcePlan'))$('statsSourcePlan').onchange=statsChange;
if($('statsSourceOut'))$('statsSourceOut').onchange=statsChange;
if($('statsStatusDone'))$('statsStatusDone').onchange=statsChange;
if($('statsStatusPartial'))$('statsStatusPartial').onchange=statsChange;
if($('statsStatusNotDone'))$('statsStatusNotDone').onchange=statsChange;
if($('statsPlanChkInPlan'))$('statsPlanChkInPlan').onchange=statsChange;
if($('statsPlanChkOutPlan'))$('statsPlanChkOutPlan').onchange=statsChange;
if($('statsResetBtn'))$('statsResetBtn').onclick=()=>{
  $('statsPeriod').value='academic';fillStatsYearOptions();
  $('statsYearSel').value='';$('statsTeacherSel').value='';$('statsQuarter').value='';$('statsMonth').value='';
  $('statsHalf1').checked=true;$('statsHalf2').checked=true;
  $('statsSourcePlan').checked=true;$('statsSourceOut').checked=true;
  $('statsStatusDone').checked=true;$('statsStatusPartial').checked=true;$('statsStatusNotDone').checked=true;
  document.querySelectorAll('#statsWorkTypeChecks input,#statsArticleTypeChecks input,#statsLiteratureTypeChecks input').forEach(cb=>cb.checked=true);
  statsAggDetailMode='';syncStatsTypeUi();syncSidebarToMain();saveUIState();renderStats();
};
if($('statsExportXlsBtn'))$('statsExportXlsBtn').onclick=()=>{
  const cols=statsGetSelectedXlsCols();
  if(!cols.length){alert(String(t('ui.alerts.needSelectCols')));return;}
  const headers=cols.map(k=>String(colLabel(k)));
  const dataRows=statsLastRows.map(r=>cols.map(k=>{
    if(k==='pdf')return (r[k]&&String(r[k]).includes('previewPdf'))?'PDF':'—';
    return String(r[k] != null ? r[k] : '');
  }));
  const xml=buildExcelXml(headers,dataRows,currentLang==='uz'?'Statistika':'Статистика');
  downloadExcel(xml,`${currentLang==='uz'?'Statistika':'Статистика'}_${(statsLastMeta&&statsLastMeta.yearVal)||'all'}.xls`);
  const fn=t('ui.toasts.exportStats');
  toast(typeof fn==='function'?fn(dataRows.length):String(fn));
};
async function exportStatsPdfs(folderMode){
  const btn=folderMode==='indicator-first' ? $('statsExportPdfByIndicatorBtn') : $('statsExportPdfBtn');
  const loadingLabel=String(t('ui.toasts.exportPdfLoading')||'Загрузка...');
  const defaultBtnLabel=folderMode==='indicator-first'
    ? String(t('ui.stats.exportPdfByIndicatorBtn')||'Экспорт по показателям')
    : String(t('ui.stats.exportPdfBtn')||'Экспорт научных публикаций');
  const getExportIndicatorFolderName=(row,work)=>{
    const indicator=String((work&&work.indicator) || (row&&row.indicator) || '').trim();
    const articleType=normalizeArticleType((work&&work.articleType) || (row&&row.articleType) || '');
    const exactMap={
      TEXTBOOK:"1. Darslik",
      TUTORIAL:"2. O'quv qo'llanma",
      MONOGRAPH:'3. Monografiya',
      CITATIONS:'8. Iqtiboslik',
      GRANT_PROJECTS:'9. Grant loyiha',
      PATENTS:"10. Mualliflik guvohnoma",
      DSC_PROFESSOR_UNVON:'11. Professor',
      PHD_DOTSENT_UNVON:'12. Dotsent',
      TOP1000_TRAINING:"13. Top 1000 OTMda mahorat darsi_malaka oshirish",
      XORIJIY_TIL_MASHGULOT:'14. Xorijiy tillarda dars olib borish'
    };
    if(indicator==='ARTICLE_TYPE'){
      if(articleType==='WOS_SCOPUS') return '4. Scopus';
      if(articleType==='INTL_ARTICLE') return '5. Xalqaro impakt-faktor jurnallar';
      if(articleType==='VAK') return '6. OAK respublika jurnaldagi maqolalar';
      if(articleType==='INTL_CONF') return '7. Xalqaro konferensiyalar';
      return `15. Boshqa - ${artName(articleType)}`;
    }
    if(exactMap[indicator]) return exactMap[indicator];
    return `15. Boshqa - ${indName(indicator) || indicator || 'unknown'}`;
  };
  const worksWithPdf=statsLastRows.filter(r=>{
    const w=statsWorksCache&&statsWorksCache.find(x=>x.id===r.id);
    return w&&getWorkPdfs(w).length>0;
  }).map(r=>({row:r,work:statsWorksCache.find(x=>x.id===r.id)}));
  if(!worksWithPdf.length){toast(String(t('ui.toasts.exportPdfNoFiles')||'Нет PDF-файлов по выбранным фильтрам'));return;}
  if(btn){btn.disabled=true;btn.textContent=loadingLabel;}
  try{
    const period=statsLastMeta&&statsLastMeta.period||'academic';
    const translit=s=>{
      const m={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya','ў':'o','ғ':'gh','қ':'q','ҳ':'h'};
      const M={'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','Ў':'O','Ғ':'Gh','Қ':'Q','Ҳ':'H'};
      return String(s||'').split('').map(c=>M[c]||m[c]||(/[\u0400-\u04FF]/.test(c)?'':c)).join('');
    };
    const sanitizeFolder=s=>{
      const t=translit(String(s||'').trim());
      return (t.replace(/[/\\:*?"<>|]/g,'_').replace(/\s+/g,'_')||'unknown').replace(/_+/g,'_').replace(/^_|_$/g,'');
    };
    const sanitizeFilename=s=>{
      const t=String(s||'').trim().replace(/[/\\:*?"<>|]/g,'_');
      return t||'document';
    };
    const usedPaths=new Map();
    const zip=new JSZip();
    const token=getAuthToken();
    let done=0,err=0;
    for(const {row,work} of worksWithPdf){
      const pdfs=getWorkPdfs(work);
      const participantNames=(()=>{
        const names=[];
        const mainAuthorName=String(row.author||'').trim();
        if(mainAuthorName)names.push(mainAuthorName);
        const coIds=Array.isArray(work&&work.coAuthorTeacherIds)?work.coAuthorTeacherIds.map(Number):[];
        coIds.forEach(id=>{
          const name=teachers.find(t=>Number(t.id)===id)?.fullName||'';
          if(name && !names.includes(name))names.push(name);
        });
        return names.length?names:[String(row.author||'').trim()||'unknown'];
      })();
      for(let i=0;i<pdfs.length;i++){
        try{
          const p=pdfs[i];
          const yearFolder=sanitizeFolder(period==='academic'?row.academicYear:(row.calendarYear||row.year||''));
          const typeFolder=sanitizeFolder(folderMode==='indicator-first' ? getExportIndicatorFolderName(row,work) : row.indicator);
          let url=`${API}/upload.php?action=file&workId=${work.id}&departmentId=${departmentId}`;
          if(typeof p.id==='number')url+=`&fileId=${p.id}`;
          const res=await fetch(url,{headers:{'Authorization':'Bearer '+token}});
          if(!res.ok)throw new Error('HTTP '+res.status);
          const blob=await res.blob();
          let fname=parseFilenameFromContentDisposition(res.headers.get('Content-Disposition'))||p.name||work.originalFileName||work.title||'';
          fname=sanitizeFilename(fixMojibakeFilename(fname))||'work_'+work.id+(pdfs.length>1?'_'+i:'');
          const extMatch=fname.match(/\.(pdf|jpg|jpeg|png|tiff|tif)$/i);
          const ext=extMatch?extMatch[1].toLowerCase():'pdf';
          if(!extMatch)fname+='.pdf';
          participantNames.forEach(authorName=>{
            const authorFolder=sanitizeFolder(authorName);
            let zipPath=folderMode==='indicator-first'
              ? `${yearFolder}/${typeFolder}/${authorFolder}/${fname}`
              : `${yearFolder}/${authorFolder}/${typeFolder}/${fname}`;
            if(usedPaths.has(zipPath)){
              const base=fname.replace(/\.(pdf|jpg|jpeg|png|tiff|tif)$/i,'');
              let n=1;
              while(usedPaths.has(zipPath)){
                zipPath=folderMode==='indicator-first'
                  ? `${yearFolder}/${typeFolder}/${authorFolder}/${base}_${n}.${ext}`
                  : `${yearFolder}/${authorFolder}/${typeFolder}/${base}_${n}.${ext}`;
                n++;
              }
            }
            usedPaths.set(zipPath,1);
            zip.file(zipPath,blob);
          });
          done++;
        }catch(e){err++;console.error('Export PDF work '+work.id,e);}
      }
    }
    if(done===0){toast(String(t('ui.toasts.exportPdfError')||'Ошибка загрузки PDF'));return;}
    const content=await zip.generateAsync({type:'blob'});
    const url=URL.createObjectURL(content);
    const a=document.createElement('a');
    a.href=url;
    const suffix=folderMode==='indicator-first' ? 'by_indicator' : 'by_author';
    a.download=`PDF_${suffix}_${(statsLastMeta&&statsLastMeta.yearVal)||'all'}.zip`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),200);
    const fn=t('ui.toasts.exportPdf');
    toast(typeof fn==='function'?fn(done,err):`Экспортировано PDF: ${done}${err?' (ошибок: '+err+')':''}`);
  }finally{
    if(btn){btn.disabled=false;btn.textContent=defaultBtnLabel;}
  }
}
if($('statsExportPdfBtn'))$('statsExportPdfBtn').onclick=async()=>{ await exportStatsPdfs('author-first'); };
if($('statsExportPdfByIndicatorBtn'))$('statsExportPdfByIndicatorBtn').onclick=async()=>{ await exportStatsPdfs('indicator-first'); };

// ── План научных работ (таблица в Статистике) ────────────────

const PLAN_TABLE_COLS = [
  { code:'INTL_ARTICLE', indicator:'ARTICLE_TYPE', articleType:'INTL_ARTICLE' },
  { code:'VAK',          indicator:'ARTICLE_TYPE', articleType:'VAK' },
  { code:'INTL_CONF',    indicator:'ARTICLE_TYPE', articleType:'INTL_CONF' },
  { code:'WOS_SCOPUS',   indicator:'ARTICLE_TYPE', articleType:'WOS_SCOPUS' },
  { code:'CITATIONS', indicator:'CITATIONS', articleType:null },
  { code:'GRANT_PROJECTS', indicator:'GRANT_PROJECTS', articleType:null, departmentLevel:true },
  { code:'TOP1000_TRAINING', indicator:'TOP1000_TRAINING', articleType:null },
  { code:'DSC_PROFESSOR_UNVON', indicator:'DSC_PROFESSOR_UNVON', articleType:null },
  { code:'PHD_DOTSENT_UNVON', indicator:'PHD_DOTSENT_UNVON', articleType:null },
  { code:'XORIJIY_TIL_MASHGULOT', indicator:'XORIJIY_TIL_MASHGULOT', articleType:null },
  { code:'XORIJIY_TIL_SERTIFIKAT', indicator:'XORIJIY_TIL_SERTIFIKAT', articleType:null }
];

function renderPlanStatsTable(){
  const pt=$('planTableTitle');
  if(pt)pt.textContent=String(t('ui.stats.statsPlanTableSectionTitle')||pt.textContent);
  const yearVal=$('statsYearSel').value;
  const teacherFilter=+$('statsTeacherSel').value||0;
  const monthFilters=getSelectedStatsMonths();
  const showDone=$('statsStatusDone').checked;
  const showPartial=$('statsStatusPartial').checked;
  const showNotDone=$('statsStatusNotDone').checked;
  const fH1=$('statsHalf1').checked;
  const fH2=$('statsHalf2').checked;
  const planItems=statsPlansCache;
  const allWorks=statsWorksCache;

  const thead=$('planStatsHead');
  const tbody=$('planStatsTbody');
  const tfoot=$('planStatsTfoot');
  const colgroup=$('planStatsColgroup');
  thead.innerHTML=''; tbody.innerHTML=''; tfoot.innerHTML='';
  if(colgroup)colgroup.innerHTML='';

  const colHeaders=PLAN_TABLE_COLS.map(c=>c.indicator==='ARTICLE_TYPE'?artName(c.code):indName(c.code));
  if(colgroup){
    const fioCol=document.createElement('col');
    fioCol.setAttribute('data-col','fio');
    fioCol.setAttribute('data-default-w','180');
    colgroup.appendChild(fioCol);
    PLAN_TABLE_COLS.forEach(col=>{
      const el=document.createElement('col');
      el.setAttribute('data-col',col.code);
      el.setAttribute('data-default-w','132');
      colgroup.appendChild(el);
    });
  }
  const hRow=document.createElement('tr');
  hRow.innerHTML=`<th data-col="fio"><span class="th-label">${esc(t('planTable.fio'))}</span><span class="th-resize" aria-hidden="true"></span></th>`
    + colHeaders.map((h,i)=>`<th data-col="${esc(PLAN_TABLE_COLS[i].code)}"><span class="th-label">${esc(h)}</span><span class="th-resize" aria-hidden="true"></span></th>`).join('');
  thead.appendChild(hRow);
  applyPlanTableColWidths();

  const teacherList = teacherFilter
    ? teachers.filter(te=>te.id===teacherFilter)
    : [...teachers].sort((a,b)=>String(a.fullName||'').localeCompare(String(b.fullName||''),'ru'));

  const totals = PLAN_TABLE_COLS.map(()=>({ done:0, partial:0, notDone:0 }));
  const grantColIdx = PLAN_TABLE_COLS.findIndex(c=>c.indicator==='GRANT_PROJECTS');
  const getPlanItemStatusForParticipant=(p,participantId)=>{
    const pid=Number(participantId||0);
    if(!pid)return 'not';
    let relevant=getPlanItemRelevantWorks(p, allWorks, null, true, true);
    relevant=relevant.filter(w=>{
      const wt=Number(w.teacherId||0);
      const co=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(Number):[];
      return wt===pid||co.includes(pid);
    });
    if(relevant.some(w=>isDoneWork(w))) return 'done';
    if(relevant.some(w=>w.completionStatus==='PARTIAL')) return 'partial';
    return 'not';
  };
  // Pre-compute GRANT_PROJECTS cell (department-level, one value for all)
  let grantCellHtml = '';
  if(grantColIdx>=0){
    const grantRelevant = planItems.filter(p=>{
      if(p.teacherId!=null && p.teacherId!=='' && Number(p.teacherId)!==0) return false;
      if(yearVal && String(p.academicYear||'')!==yearVal) return false;
      if(p.indicator!=='GRANT_PROJECTS') return false;
      if(!matchesStatsMonthFilter(Number(p.plannedMonth||0),monthFilters)) return false;
      const pm=Number(p.plannedMonth||0);
      if(pm && !(fH1&&isH1Month(pm)) && !(fH2&&isH2Month(pm))) return false;
      return true;
    });
    const grantParts=[];
    for(const p of grantRelevant){
      const pm=Number(p.plannedMonth||0);
      const mLabel=pm ? monthShort(pm)+' ' : '';
      const st=getPlanItemStatus(p, allWorks, null, true);
      if(st==='done'&&!showDone) continue;
      if(st==='partial'&&!showPartial) continue;
      if(st==='not'&&!showNotDone) continue;
      if(st==='done') totals[grantColIdx].done++;
      else if(st==='partial') totals[grantColIdx].partial++;
      else totals[grantColIdx].notDone++;
      const color=st==='done'?'var(--success)':st==='partial'?'#ef6c00':'var(--danger)';
      const icon=st==='done'?'&#10003;':st==='partial'?'&#9679;':'&#10007;';
      const hint=st==='done'?t('planTable.done'):st==='partial'?t('planTable.partial'):t('planTable.notDone');
      grantParts.push(`<span style="color:${color};font-weight:700" title="${esc(hint)}">${mLabel}${icon}</span>`);
    }
    grantCellHtml = grantParts.length
      ? `<td rowspan="${teacherList.length}" style="vertical-align:middle;text-align:center">${grantParts.join(', ')}</td>`
      : `<td rowspan="${teacherList.length}" class="muted" style="vertical-align:middle;text-align:center">—</td>`;
  }

  for(const te of teacherList){
    const tr=document.createElement('tr');
    let cells=`<td style="font-weight:600">${esc(te.fullName)}</td>`;
    const isFirstTeacher = (te===teacherList[0]);

    PLAN_TABLE_COLS.forEach((col,ci)=>{
      if(col.indicator==='GRANT_PROJECTS'){
        if(isFirstTeacher) cells+=grantCellHtml;
        return;
      }
      const relevant = planItems.filter(p=>{
        const pTid=Number(p.teacherId||0);
        if(pTid!==te.id) return false;
        if(yearVal && String(p.academicYear||'')!==yearVal) return false;
        if(p.indicator!==col.indicator) return false;
        if(col.articleType && normalizeArticleType(p.articleType||'')!==col.articleType) return false;
        if(!matchesStatsMonthFilter(Number(p.plannedMonth||0),monthFilters)) return false;
        const pm=Number(p.plannedMonth||0);
        if(pm && !(fH1&&isH1Month(pm)) && !(fH2&&isH2Month(pm))) return false;
        return true;
      });
      const coauthorRelevant = (col.code==='WOS_SCOPUS')
        ? planItems.filter(p=>{
            const pTid=Number(p.teacherId||0);
            if(!pTid||pTid===te.id) return false;
            if(yearVal && String(p.academicYear||'')!==yearVal) return false;
            if(p.indicator!==col.indicator) return false;
            if(col.articleType && normalizeArticleType(p.articleType||'')!==col.articleType) return false;
            if(!matchesStatsMonthFilter(Number(p.plannedMonth||0),monthFilters)) return false;
            const pm=Number(p.plannedMonth||0);
            if(pm && !(fH1&&isH1Month(pm)) && !(fH2&&isH2Month(pm))) return false;
            const coIds=Array.isArray(p.coAuthorTeacherIds)?p.coAuthorTeacherIds.map(Number):[];
            if(!coIds.includes(Number(te.id))) return false;
            return true;
          })
        : [];
      if(!relevant.length && !coauthorRelevant.length){ cells+=`<td class="muted" style="text-align:center">—</td>`; return; }

      const statusRank={not:0,partial:1,done:2};
      const mergedByMonth=new Map();
      const useWosLogic=(col.code==='WOS_SCOPUS');
      const upsertMerged=(entry)=>{
        const key=entry.key;
        const prev=mergedByMonth.get(key);
        if(!prev || statusRank[entry.st]>statusRank[prev.st]){
          mergedByMonth.set(key,entry);
        }
      };
      for(const p of relevant){
        const pm=Number(p.plannedMonth||0);
        const mLabel=pm ? monthShort(pm) : '?';
        const repWork=getPlanItemRepresentativeWork(
          p,
          allWorks,
          null,
          true,
          useWosLogic
        );
        const coauthorNames=getWorkCoauthorTooltipNames(repWork, Number(te.id));
        const coauthorHint=coauthorNames.length
          ? ` — ${currentLang==='uz'?'Hammualliflar':'Соавторы'}: ${coauthorNames.join(', ')}`
          : '';
        const st=getPlanItemStatus(
          p,
          allWorks,
          null,
          true,
          useWosLogic
        );
        const progress=p.indicator==='CITATIONS'
          ? getPlanItemUnitProgress(p,allWorks,null,true,useWosLogic)
          : null;
        const progressLabel=progress&&progress.target>0?` ${progress.done}/${progress.target}`:'';
        upsertMerged({
          key:`${String(p.academicYear||'')}|${pm}`,
          pm,mLabel,st,isCo:false,mainAuthor:'',hintSuffix:coauthorHint,progressLabel
        });
      }
      for(const p of coauthorRelevant){
        const pm=Number(p.plannedMonth||0);
        const mLabel=pm ? monthShort(pm) : '?';
        const st=getPlanItemStatusForParticipant(p, te.id);
        const repWork=getPlanItemRepresentativeWork(p, allWorks, null, true, true);
        const mainTeacher=teachers.find(tt=>Number(tt.id)===Number(p.teacherId||0));
        const mainAuthor=(mainTeacher&&mainTeacher.fullName)||'—';
        const coauthorNames=getWorkCoauthorTooltipNames(repWork, Number(te.id));
        const coauthorHint=coauthorNames.length
          ? `; ${currentLang==='uz'?'Hammualliflar':'Соавторы'}: ${coauthorNames.join(', ')}`
          : '';
        upsertMerged({
          key:`${String(p.academicYear||'')}|${pm}`,
          pm,mLabel,st,isCo:true,mainAuthor,
          hintSuffix:` — ${mainAuthor}${coauthorHint}`
        });
      }
      const merged=Array.from(mergedByMonth.values()).sort((a,b)=>academicMonthIndex(a.pm)-academicMonthIndex(b.pm));
      const parts=[];
      for(const e of merged){
        if(e.st==='done'&&!showDone) continue;
        if(e.st==='partial'&&!showPartial) continue;
        if(e.st==='not'&&!showNotDone) continue;
        if(e.st==='done') totals[ci].done++;
        else if(e.st==='partial') totals[ci].partial++;
        else totals[ci].notDone++;
        const color=e.st==='done'
          ? (e.isCo?'#4ea86b':'var(--success)')
          : e.st==='partial'
            ? (e.isCo?'#d28a3d':'#ef6c00')
            : (e.isCo?'#d07a88':'var(--danger)');
        const icon=e.st==='done'?'&#10003;':e.st==='partial'?'&#9679;':'&#10007;';
        const hintBase=e.st==='done'?t('planTable.done'):e.st==='partial'?t('planTable.partial'):t('planTable.notDone');
        const hint=`${hintBase}${e.hintSuffix||''}`;
        const label=e.isCo?`${e.mLabel} (${e.mainAuthor})`:e.mLabel;
        const displayLabel=`${label}${e.progressLabel||''}`;
        parts.push(`<span style="color:${color};font-weight:700" title="${esc(hint)}">${esc(displayLabel)} ${icon}</span>`);
      }
      if(!parts.length){ cells+=`<td class="muted" style="text-align:center">—</td>`; return; }
      cells+=`<td>${parts.join(', ')}</td>`;
    });

    tr.innerHTML=cells;
    tbody.appendChild(tr);
  }

  const fRow=document.createElement('tr');
  fRow.style.fontWeight='700';
  fRow.style.background='var(--soft)';
  let fCells=`<td>${esc(t('planTable.total'))}</td>`;
  totals.forEach(tot=>{
    const items=[];
    if(showDone) items.push(`<span style="color:var(--success)">&#10003; ${tot.done}</span>`);
    if(showPartial) items.push(`<span style="color:#ef6c00">&#9679; ${tot.partial}</span>`);
    if(showNotDone) items.push(`<span style="color:var(--danger)">&#10007; ${tot.notDone}</span>`);
    const parts=items.length ? items.join(' &nbsp; ') : '<span class="muted">&mdash;</span>';
    fCells+=`<td>${parts}</td>`;
  });
  fRow.innerHTML=fCells;
  tfoot.appendChild(fRow);
  fitPlanTableHeightToContent();
  initPlanTableResize();
}

function getPlanItemRelevantWorks(p, allWorks, filterByTeacherId, includeCoauthors=true, includeEarlyForWos=false){
  let relevant=allWorks.filter(w=>w.source==='PLAN'&&w.indicator===p.indicator);
  const tid=Number(p.teacherId||0);
  const useFilter=filterByTeacherId!=null?Number(filterByTeacherId):0;
  if(tid) relevant=relevant.filter(w=>{
    const wt=Number(w.teacherId||0);
    if(wt===tid) return true;
    if(!includeCoauthors) return false;
    const co=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(Number):[];
    return co.includes(tid);
  });
  else if(useFilter) relevant=relevant.filter(w=>{
    const wt=Number(w.teacherId||0);
    if(wt===useFilter) return true;
    if(!includeCoauthors) return false;
    const co=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(Number):[];
    return co.includes(useFilter);
  });
  if(p.academicYear) relevant=relevant.filter(w=>w.academicYear===p.academicYear);
  if(p.indicator==='ARTICLE_TYPE'){
    const pType=normalizeArticleType(p.articleType||'');
    relevant=relevant.filter(w=>normalizeArticleType(w.articleType||'')===pType);
  }
  const pm=Number(p.plannedMonth||0);
  if(pm) relevant=relevant.filter(w=>{
    const wp=Number(w.plannedMonth||0);
    const wm=Number(w.month||0);
    const monthUsed=wp||wm;
    if(!monthUsed)return false;
    const fullYearWos=includeEarlyForWos
      && p.indicator==='ARTICLE_TYPE'
      && normalizeArticleType(p.articleType||'')==='WOS_SCOPUS';
    // For WOS/Scopus one credited work in the same academic year can close
    // the plan item regardless of the specific planned month.
    if(fullYearWos){
      return true;
    }
    return monthUsed===pm;
  });
  return relevant;
}

function getPlanItemUnitProgress(p, allWorks, filterByTeacherId, includeCoauthors=true, includeEarlyForWos=false){
  const relevant=getPlanItemRelevantWorks(p, allWorks, filterByTeacherId, includeCoauthors, includeEarlyForWos);
  const target=getPlanUnitCount(p);
  const done=relevant.reduce((sum,w)=>sum+(isDoneWork(w)?getWorkCreditUnits(w):0),0);
  const partial=relevant.reduce((sum,w)=>sum+(w.completionStatus==='PARTIAL'?getWorkCreditUnits(w):0),0);
  return { done, partial, target };
}

function getPlanItemPerformer(p, allWorks, filterByTeacherId){
  const relevant=getPlanItemRelevantWorks(p, allWorks, filterByTeacherId);
  const picked=relevant.find(w=>isDoneWork(w))||relevant.find(w=>w.completionStatus==='PARTIAL');
  if(!picked) return { short:'', full:'' };
  const mainTid=Number(picked.teacherId||0);
  const mainTeacher=mainTid?teachers.find(t=>Number(t.id)===mainTid):null;
  const full=(mainTeacher&&mainTeacher.fullName)||(picked.teacher&&picked.teacher.fullName)||'';
  return full ? { short:getInitials(full), full } : { short:'', full:'' };
}

function getPlanItemRepresentativeWork(p, allWorks, filterByTeacherId, includeCoauthors=true, includeEarlyForWos=false){
  const relevant=getPlanItemRelevantWorks(p, allWorks, filterByTeacherId, includeCoauthors, includeEarlyForWos);
  return relevant.find(w=>isDoneWork(w))||relevant.find(w=>w.completionStatus==='PARTIAL')||null;
}

function getWorkCoauthorTooltipNames(work, participantId){
  if(!work)return [];
  const pid=Number(participantId||0);
  const names=[];
  const mainTid=Number(work.teacherId||0);
  const mainName=teachers.find(t=>Number(t.id)===mainTid)?.fullName||'';
  if(mainTid && mainTid!==pid && mainName)names.push(mainName);
  const coIds=Array.isArray(work.coAuthorTeacherIds)?work.coAuthorTeacherIds.map(Number):[];
  coIds.forEach(id=>{
    if(id===pid)return;
    const name=teachers.find(t=>Number(t.id)===id)?.fullName||'';
    if(name && !names.includes(name))names.push(name);
  });
  return names;
}

// Returns 'done' | 'partial' | 'not'
// filterByTeacherId: for department-level plans (teacherId=null), only count works for this teacher.
// includeCoauthors: when false, count only main-author works.
function getPlanItemStatus(p, allWorks, filterByTeacherId, includeCoauthors=true, includeEarlyForWos=false){
  const relevant=getPlanItemRelevantWorks(p, allWorks, filterByTeacherId, includeCoauthors, includeEarlyForWos);
  if(p&&p.indicator==='CITATIONS'){
    const target=getPlanUnitCount(p);
    const doneUnits=relevant.reduce((sum,w)=>sum+(isDoneWork(w)?getCitationsCount(w):0),0);
    const partialUnits=relevant.reduce((sum,w)=>sum+(w.completionStatus==='PARTIAL'?getCitationsCount(w):0),0);
    if(target>0){
      if(doneUnits>=target)return 'done';
      if(doneUnits>0||partialUnits>0||relevant.some(w=>w.completionStatus==='PARTIAL'))return 'partial';
      return 'not';
    }
    if(doneUnits>0||relevant.some(w=>isDoneWork(w)))return 'done';
    if(partialUnits>0||relevant.some(w=>w.completionStatus==='PARTIAL'))return 'partial';
    return 'not';
  }
  if(p&&p.indicator==='PATENTS'){
    const target=Number(p.patentsCount||0);
    const doneCount=relevant.filter(w=>isDoneWork(w)).length;
    if(target>0){
      if(doneCount>=target)return 'done';
      if(doneCount>0||relevant.some(w=>w.completionStatus==='PARTIAL'))return 'partial';
      return 'not';
    }
  }
  if(relevant.some(w=>isDoneWork(w))) return 'done';
  if(relevant.some(w=>w.completionStatus==='PARTIAL')) return 'partial';
  return 'not';
}

function isPlanItemOverdueByCurrentDate(p, now=new Date()){
  const pm=Number(p&&p.plannedMonth||0);
  if(!pm)return false;
  const py=Number((p&&p.plannedYear)||plannedCalendarYearFromAcademic(p&&p.academicYear,pm)||0);
  if(!py)return false;
  const dueYearMonth=(py*100)+pm;
  const currentYearMonth=(now.getFullYear()*100)+(now.getMonth()+1);
  if(dueYearMonth<currentYearMonth)return true;
  if(dueYearMonth>currentYearMonth)return false;
  return now.getDate()>15;
}

const PLAN_TABLE_COLLAPSED_KEY='IlmiyStat_planTableCollapsed';
function initPlanTableCollapsible(){
  const section=$('planTableSection');
  const header=$('planTableHeader');
  const wrap=$('planTableWrap');
  if(!section||!header||!wrap)return;
  try{
    const saved=localStorage.getItem(PLAN_TABLE_COLLAPSED_KEY);
    if(saved==='1'){ section.classList.add('collapsed'); header.setAttribute('aria-expanded','false'); }
  }catch(_e){}
  const toggle=()=>{
    const isCollapsed=section.classList.toggle('collapsed');
    header.setAttribute('aria-expanded',isCollapsed?'false':'true');
    try{ localStorage.setItem(PLAN_TABLE_COLLAPSED_KEY,isCollapsed?'1':'0'); }catch(_e){}
  };
  header.onclick=toggle;
  header.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } };
  header.title=t('planTable.collapseHint')||'';
}

const STATS_FILTER_CARDS_KEY='IlmiyStat_statsFilterCards_v1';
function initStatsFilterCardCollapsibles(){
  let saved={};
  try{ saved=JSON.parse(localStorage.getItem(STATS_FILTER_CARDS_KEY)||'{}')||{}; }catch(_e){}
  const cards=Array.from(document.querySelectorAll('#panel-stats .statsFilterGrid .statsFilterCard, #statsExcelDock .statsFilterCard'));
  cards.forEach((card,index)=>{
    const header=card.querySelector('.statsFilterCardHeader');
    if(!header)return;
    let body=card.querySelector('.statsFilterCardBody');
    if(!body){
      body=document.createElement('div');
      body.className='statsFilterCardBody';
      while(header.nextSibling)body.appendChild(header.nextSibling);
      card.appendChild(body);
    }
    const labelEl=header.querySelector('[id]')||header.firstElementChild;
    const cardKey=(labelEl&&labelEl.id)||`statsFilterCard_${index}`;
    if(!body.id)body.id=`statsFilterCardBody_${cardKey}`;
    const applyCollapsed=(collapsed)=>{
      card.classList.toggle('is-collapsed',!!collapsed);
      header.setAttribute('aria-expanded',collapsed?'false':'true');
    };
    applyCollapsed(saved[cardKey]===1);
    if(header.dataset.collapsibleReady==='1')return;
    header.dataset.collapsibleReady='1';
    header.setAttribute('role','button');
    header.setAttribute('tabindex','0');
    header.setAttribute('aria-controls',body.id);
    header.title=t('ui.stats.tooltips.doubleClickTitleHint')||header.title||'';
    const toggle=()=>{
      const next=!card.classList.contains('is-collapsed');
      applyCollapsed(next);
      saved[cardKey]=next?1:0;
      try{ localStorage.setItem(STATS_FILTER_CARDS_KEY,JSON.stringify(saved)); }catch(_e){}
    };
    let clickTimer=0;
    header.addEventListener('click',e=>{
      if(e.detail>1)return;
      if(clickTimer)clearTimeout(clickTimer);
      clickTimer=setTimeout(()=>{
        clickTimer=0;
        toggle();
      },220);
    });
    header.addEventListener('dblclick',e=>{
      if(clickTimer){
        clearTimeout(clickTimer);
        clickTimer=0;
      }
      e.preventDefault();
      e.stopPropagation();
      statsToggleAllInCard(card);
    });
    header.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        toggle();
      }
    });
  });
}

const STATS_TABLE_COLLAPSED_KEY='IlmiyStat_statsTableCollapsed_v2';
function initStatsTableCollapsible(){
  const section=$('statsTableSection');
  const header=$('statsTableHeader');
  const wrap=$('statsTableWrap');
  if(!section||!header||!wrap)return;
  try{
    const saved=localStorage.getItem(STATS_TABLE_COLLAPSED_KEY);
    if(saved==='1'){ section.classList.add('collapsed'); header.setAttribute('aria-expanded','false'); }
  }catch(_e){}
  const toggle=()=>{
    const isCollapsed=section.classList.toggle('collapsed');
    header.setAttribute('aria-expanded',isCollapsed?'false':'true');
    try{ localStorage.setItem(STATS_TABLE_COLLAPSED_KEY,isCollapsed?'1':'0'); }catch(_e){}
    requestAnimationFrame(()=>{ updateStatsStickyScrollbar(); });
  };
  header.onclick=toggle;
  header.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } };
  header.title=t('planTable.collapseHint')||'';
}

async function loadStats(){
  await loadStatsData();
  if($('statsYearSel'))$('statsYearSel').dataset.pendingValue=$('statsYearSel').value||'';
  fillYears($('planYearSel'), $('planYearSel').value);
  fillYears($('workYearSel'), $('workYearSel').value);
  fillYears($('statsYearSel'), $('statsYearSel').value);
  fillStatsYearOptions();
  fillStatsMonth();
  initStatsTypeCheckboxes();
  initStatsExportCols();
  initStatsDashboardControls();
  initStatsFilterCardCollapsibles();
  initStatsTableCollapsible();
  initPlanTableCollapsible();
  initPlanTableHeightResize();
  if($('statsMonth') && $('sfMonth'))syncSidebarToMain();
  renderStats();
}

// ===== BACKUP =====
let exportBlobUrl=null;
if($('exportBtn'))$('exportBtn').onclick=async()=>{
  if(!canEditTab('backup'))return;
  try{
    $('exportBtn').disabled=true;
    $('exportArea').value=String(t('ui.common.loading'));
    $('exportHint').textContent='';
    
    // Загружаем данные с обработкой ошибок для каждого запроса
    const [teachersList, plansList, worksList]=await Promise.all([
      api(`/departments/${departmentId}/teachers`).catch(e=>{console.error('Ошибка загрузки педагогов:',e); return [];}),
      api(`/departments/${departmentId}/plan-items`).catch(e=>{console.error('Ошибка загрузки планов:',e); return [];}),
      api(`/departments/${departmentId}/scientific-works`).catch(e=>{console.error('Ошибка загрузки работ:',e); return [];})
    ]);
    
    const data={teachers:teachersList,plan_items:plansList,scientific_works:worksList};
    const json=JSON.stringify(data,null,2);
    $('exportArea').value=json;
    {
      const fn=t('ui.backup.exportResult');
      $('exportHint').textContent=(typeof fn==='function') ? fn(teachersList.length, plansList.length, worksList.length) : String(fn);
    }
    
    // Освобождаем старый Blob URL если есть
    if(exportBlobUrl)URL.revokeObjectURL(exportBlobUrl);
    
    // Создаём новый Blob URL для скачивания
    exportBlobUrl=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    $('downloadBtn').disabled=false;
    toast(String(t('ui.toasts.exportReady')));
  }catch(e){
    console.error('Ошибка экспорта:',e);
    $('exportArea').value='';
    {
      const fn=t('ui.backup.exportError');
      const msg=(typeof fn==='function') ? fn(e.message) : String(fn);
      $('exportHint').textContent=msg;
      toast(msg);
    }
  }finally{
    $('exportBtn').disabled=false;
  }
};
if($('downloadBtn'))$('downloadBtn').onclick=()=>{
  if(!canEditTab('backup')||!exportBlobUrl)return;
  const a=document.createElement('a'); a.href=exportBlobUrl; a.download=`IlmiyStatDB_dept${departmentId}_backup.json`;
  document.body.appendChild(a); a.click(); a.remove();
};
if($('importBtn'))$('importBtn').onclick=async()=>{
  const hint=$('importHint'); const btn=$('importBtn');
  if(hint)hint.textContent='';
  const file=$('importFile').files&&$('importFile').files[0];
  if(!file){ toast(String(t('ui.alerts.chooseJson'))); return; }
  let text=''; try{text=await file.text();}catch{ toast(String(t('ui.alerts.readFail'))); return; }
  let data=null; try{data=JSON.parse(text);}catch{ toast(String(t('ui.alerts.badJson'))); return; }
  const wipe=$('importWipe').checked;
  const tArr=Array.isArray(data.teachers)?data.teachers:[];
  const pArr=Array.isArray(data.plan_items)?data.plan_items:[];
  const wArr=Array.isArray(data.scientific_works)?data.scientific_works:[];
  
  // Проверка структуры данных
  if(tArr.length===0&&pArr.length===0&&wArr.length===0){
    toast(String(t('ui.alerts.emptyImport')));
    return;
  }
  
  const setStatus=(s)=>{ if(hint)hint.textContent=s; };
  const setBtn=(s)=>{ if(btn){ btn.disabled=!!s; btn.textContent=s||String(t('ui.backup.importBtn')||'Импортировать'); } };
  setBtn(String(t('ui.common.loading')||'Загрузка...'));
  setStatus(currentLang==='uz'?'Import boshlandi...':'Импорт начат...');
  
  if(wipe){
    if(!confirm(String(t('ui.dialogs.confirmClearBeforeImport'))))return setBtn('');
    try{
      setStatus(currentLang==='uz'?'Baza tozalanmoqda...':'Очистка базы...');
      await api(`/departments/${departmentId}/clear-all`,{method:'POST'});
      await loadTeachers();
      setStatus(currentLang==='uz'?'Baza tozalandi. Import qilinmoqda...':'База очищена. Импорт...');
    }catch(e){
      console.error('Ошибка очистки базы:',e);
      const fn=t('ui.backup.wipeError');
      const msg=(typeof fn==='function') ? fn(e&&e.message||e) : String(fn);
      if(hint){ hint.textContent=msg; hint.style.color='var(--danger)'; }
      toast(msg);
      return setBtn('');
    }
  }
  
  // Маппинг старых ID педагогов на новые
  const oldToNewTeacherId=new Map();
  const planIssues=[];
  const workIssues=[];
  const itemLabel=(item,fallback)=>{
    if(!item||typeof item!=='object')return fallback;
    return String(item.title||item.grantName||item.fullName||item.indicator||fallback).trim();
  };
  const pushIssue=(bucket,prefix,item,index,reason)=>{
    bucket.push(`${prefix} ${index+1}: ${itemLabel(item,prefix)} - ${reason}`);
  };
  const renderIssueDetails=(title,items)=>{
    if(!items.length)return '';
    return `<details style="margin-top:8px"><summary>${esc(title)} (${items.length})</summary><ul style="margin:8px 0 0 18px;padding:0">${items.map(msg=>`<li>${esc(msg)}</li>`).join('')}</ul></details>`;
  };
  
  try{
    const tValid=tArr.filter(t=>t.fullName);
    for(let i=0;i<tValid.length;i++){
      const t=tValid[i];
      setStatus(currentLang==='uz' ? `Pedagoglar: ${i+1}/${tValid.length}` : `Педагоги: ${i+1}/${tValid.length}`);
      try{
        const created=await api(`/departments/${departmentId}/teachers`,{method:'POST',body:JSON.stringify({fullName:t.fullName})});
        if(created&&created.id&&t.id) oldToNewTeacherId.set(t.id,created.id);
      }catch(e){
        const existing=teachers.find(x=>x.fullName===t.fullName);
        if(existing&&t.id) oldToNewTeacherId.set(t.id,existing.id);
      }
    }
    await loadTeachers();
    
    // Обновим маппинг для педагогов которые уже были
    for(const t of tArr){
      if(t.id&&!oldToNewTeacherId.has(t.id)){
        const existing=teachers.find(x=>x.fullName===t.fullName);
        if(existing)oldToNewTeacherId.set(t.id,existing.id);
      }
    }
    
    console.log('Teacher ID mapping:',Object.fromEntries(oldToNewTeacherId));
    
    pArr.forEach((p,index)=>{
      if(!(p&&p.academicYear&&p.indicator)){
        pushIssue(planIssues,currentLang==='uz'?'Reja':'План',p,index,currentLang==='uz'?'academicYear yoki indicator yo‘q':'нет academicYear или indicator');
      }
    });
    const pValid=pArr.filter(p=>p.academicYear&&p.indicator);
    let plansImported=0, plansSkipped=0;
    for(let i=0;i<pValid.length;i++){
      const p=pValid[i];
      setStatus(currentLang==='uz' ? `Rejalar: ${i+1}/${pValid.length}` : `Планы: ${i+1}/${pValid.length}`);
      const newTeacherId=oldToNewTeacherId.get(p.teacherId)||p.teacherId;
      const planData={...p,teacherId:newTeacherId}; delete planData.id;
      try{
        await api(`/departments/${departmentId}/plan-items`,{method:'POST',body:JSON.stringify(planData)});
        plansImported++;
      }catch(e){
        console.warn('Plan import error:',e);
        pushIssue(planIssues,currentLang==='uz'?'Reja':'План',p,i,e&&e.message?e.message:String(e));
        plansSkipped++;
      }
    }
    plansSkipped+=pArr.length-pValid.length;
    
    wArr.forEach((w,index)=>{
      if(!(w&&w.academicYear&&w.indicator)){
        pushIssue(workIssues,currentLang==='uz'?'Ish':'Работа',w,index,currentLang==='uz'?'academicYear yoki indicator yo‘q':'нет academicYear или indicator');
      }
    });
    const wValid=wArr.filter(w=>w.academicYear&&w.indicator);
    let worksImported=0, worksSkipped=0;
    for(let i=0;i<wValid.length;i++){
      const w=wValid[i];
      setStatus(currentLang==='uz' ? `Ishlar: ${i+1}/${wValid.length}` : `Работы: ${i+1}/${wValid.length}`);
      const newTeacherId=oldToNewTeacherId.get(w.teacherId)||w.teacherId;
      const newCoAuthors=Array.isArray(w.coAuthorTeacherIds)?w.coAuthorTeacherIds.map(id=>oldToNewTeacherId.get(id)||id):[];
      const workData={...w,teacherId:newTeacherId,coAuthorTeacherIds:newCoAuthors};
      if(w.publishYear&&!workData.year) workData.year=w.publishYear;
      delete workData.id; delete workData.publishYear;
      try{
        await api(`/departments/${departmentId}/scientific-works`,{method:'POST',body:JSON.stringify(workData)});
        worksImported++;
      }catch(e){
        console.warn('Work import error:',e);
        pushIssue(workIssues,currentLang==='uz'?'Ish':'Работа',w,i,e&&e.message?e.message:String(e));
        worksSkipped++;
      }
    }
    worksSkipped+=wArr.length-wValid.length;
    
    const teachersAdded=oldToNewTeacherId.size;
    const tSkipped=tArr.length-tValid.length;
    const fn=t('ui.backup.importResultDetail');
    const details=(typeof fn==='function') ? fn(teachersAdded,tArr.length,tSkipped,plansImported,plansSkipped,worksImported,worksSkipped) : `Импорт успешен. Педагоги: ${teachersAdded}, планы: ${plansImported}/${plansSkipped}, работы: ${worksImported}/${worksSkipped}.`;
    if(hint){
      hint.innerHTML =
        `${esc(details)}`
        + renderIssueDetails(currentLang==='uz'?'Rejalar bo‘yicha xatolar':'Ошибки по планам',planIssues)
        + renderIssueDetails(currentLang==='uz'?'Ishlar bo‘yicha xatolar':'Ошибки по работам',workIssues);
      hint.style.color='';
    }
    toast(String(t('ui.toasts.importDone')));
    await loadTeachers(); await loadPlans(); await loadWorks(); await loadStats();
  }catch(e){
    console.error(e);
    const errMsg=e&&e.message?String(e.message):String(e);
    const fn=t('ui.backup.importError');
    const msg=(typeof fn==='function') ? fn(errMsg) : String(fn);
    if(hint){ hint.textContent=msg; hint.style.color='var(--danger)'; }
    toast(msg);
  }finally{
    setBtn('');
  }
};

if($('clearAllDataBtn'))$('clearAllDataBtn').onclick=async()=>{
  if(!canEditTab('backup'))return;
  if(!departmentId){ toast(String(t('ui.toasts.noDepartment')||'Не указана кафедра')); return; }
  if(!confirm(String(t('ui.dialogs.confirmClearAll1'))))return;
  if(!confirm(String(t('ui.dialogs.confirmClearAll2'))))return;
  const btn=$('clearAllDataBtn'); if(btn){ btn.disabled=true; btn.textContent=String(t('ui.common.loading')||'Загрузка...'); }
  try{
    const res=await api(`/departments/${departmentId}/clear-all`,{method:'POST'});
    const clearedFn=t('ui.toasts.clearedAll');
    toast(typeof clearedFn==='function' ? clearedFn(res.deletedWorks||0,res.deletedPlans||0,res.deletedTeachers||0) : (res.message||String(clearedFn)));
    await loadTeachers(); await loadPlans(); await loadWorks(); await loadStats();
  }catch(e){
    console.error(e);
    toast('Ошибка удаления: '+(e&&e.message||e));
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=String(t('ui.backup.clearAllBtn')||'Очистить все данные кафедры'); }
  }
};

// ===== EXCEL EXPORT =====
function buildExcelXml(headers,rows,sheetName){
  const xmlEsc=s=>String(s != null ? s : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const cell=(v,t)=>`<Cell><Data ss:Type="${t||'String'}">${xmlEsc(v)}</Data></Cell>`;
  const row=cells=>`<Row>${cells.join('')}</Row>`;
  const hRow=row(headers.map(h=>cell(h,'String')));
  const dRows=rows.map(r=>row(r.map(c=>cell(c,'String'))));
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlEsc(sheetName)}"><Table>${hRow}${dRows.join('')}</Table></Worksheet></Workbook>`;
}
function downloadExcel(xml,filename){
  const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
if($('planExportBtn'))$('planExportBtn').onclick=async()=>{
  const headers=[t('ui.cols.id'),t('ui.cols.teacher'),t('ui.cols.academicYear'),t('ui.cols.indicator'),t('ui.cols.articleType'),t('ui.cols.citations'),t('ui.cols.patents'),t('ui.cols.month'),t('ui.cols.status')];
  // Экспортируем то, что сейчас отфильтровано на вкладке "План"
  const { filtered, reason } = await getFilteredPlansForCurrentFilters();
  if(reason==='needHalfYear'){
    return alert(String(t('ui.plan.needHalfYear')));
  }
  const rows=filtered.map(p=>[
    p.id,
    (p.teacher&&p.teacher.fullName)||'',
    p.academicYear,
    indName(p.indicator),
    p.indicator==='ARTICLE_TYPE'?artName(p.articleType):'',
    p.citationsCount||'',
    p.patentsCount||'',
    p.plannedMonth?monthText(p.plannedMonth):'',
    p._status==='DONE'?t('meta.statuses.DONE'):p._status==='PARTIAL'?t('meta.statuses.PARTIAL'):t('meta.statuses.NOT_DONE')
  ]);
  downloadExcel(buildExcelXml(headers,rows,currentLang==='uz'?'Reja':'План'),`Plan_${$('planYearSel').value}.xls`);
  toast(typeof t('ui.toasts.exportPlan')==='function'?t('ui.toasts.exportPlan')(rows.length):String(t('ui.toasts.exportPlan')));
};
if($('workExportBtn'))$('workExportBtn').onclick=()=>{
  const headers=[t('ui.cols.id'),t('ui.cols.teacher'),t('ui.cols.source'),t('ui.cols.indicator'),t('ui.works.grantNameCol'),t('ui.works.grantDurationCol'),t('ui.works.grantPartnerCol'),t('ui.works.grantParticipantsDeptCol'),t('ui.works.grantParticipantsOtherCol'),t('ui.works.grantAmountCol'),t('ui.cols.citations'),t('ui.works.hIndexCol'),t('ui.works.profileCol'),t('ui.workModal.scientificPlatform'),t('ui.cols.articleType'),t('ui.cols.title'),t('ui.cols.publisher'),t('ui.workModal.top1000DirectionCode'),t('ui.workModal.top1000SpecialtyCode'),t('ui.workModal.top1000Hours'),t('ui.workModal.top1000CertNumbers'),t('ui.cols.ilmiyDaraja'),t('ui.cols.ilmiyUnvon'),t('ui.cols.educationDirectionCode'),t('ui.cols.specialtyCode'),t('ui.cols.diplomRaqami'),t('ui.cols.degreeDate'),t('ui.cols.fanNomi'),t('ui.cols.fanYonalish'),t('ui.cols.mashgulotTuri'),t('ui.cols.xorijiyTil'),t('ui.cols.mashgulotSoati'),t('ui.cols.certForeignLang'),t('ui.cols.certDarajasi'),t('ui.cols.certUmumiyBali'),t('ui.cols.month'),t('ui.cols.year'),t('ui.cols.coAuthors'),t('ui.cols.site'),t('ui.cols.file'),t('ui.cols.status')];
  const { filtered } = getFilteredWorksForCurrentFilters();
  const rows=filtered.map(w=>[
    w.id,
    (w.teacher&&w.teacher.fullName)||'',
    w.source==='PLAN'?t('meta.sources.PLAN'):t('meta.sources.OUT_OF_PLAN'),
    indName(w.indicator),
    w.indicator==='GRANT_PROJECTS'?(w.grantName||''):'',
    w.indicator==='GRANT_PROJECTS'?(w.grantDuration||''):'',
    w.indicator==='GRANT_PROJECTS'?(w.grantPartnerForeign||''):'',
    w.indicator==='GRANT_PROJECTS'?getGrantParticipantsDept(w):'',
    w.indicator==='GRANT_PROJECTS'?getGrantParticipantsOther(w):'',
    w.indicator==='GRANT_PROJECTS'?(w.grantAmountUsd?(w.grantAmountUsd+' USD'):''):'',
    w.indicator==='CITATIONS'?(w.citationsCount!=null&&w.citationsCount!==''?String(w.citationsCount):''):'',
    w.indicator==='CITATIONS'?(w.hIndex!=null&&w.hIndex!==''?String(w.hIndex):''):'',
    w.indicator==='CITATIONS'?(w.profileLink||''):'',
    w.indicator==='CITATIONS'?(w.scientificPlatform?profilePlatformName(w.scientificPlatform):''):'',
    w.indicator==='ARTICLE_TYPE'?artName(w.articleType):'',
    w.title||'',
    w.publisher||'',
    w.indicator==='TOP1000_TRAINING'?(w.top1000DirectionName||''):'',
    w.indicator==='TOP1000_TRAINING'?(w.top1000SpecialtyCode||''):'',
    w.indicator==='TOP1000_TRAINING'?(w.top1000TrainingHours||''):'',
    w.indicator==='TOP1000_TRAINING'?(w.top1000CertNumbers||''):'',
    (w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?ilmiyDarajaName(w.ilmiyDaraja):'',
    (w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?ilmiyUnvonName(w.ilmiyUnvon):'',
    (w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.educationDirectionCode||''):'',
    (w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.specialtyCode||''):'',
    (w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.diplomRaqami||''):'',
    (w.indicator==='DSC_PROFESSOR_UNVON'||w.indicator==='PHD_DOTSENT_UNVON')?(w.degreeDate||''):'',
    w.indicator==='XORIJIY_TIL_MASHGULOT'?(w.xorijiyTilFanNomi||''):'',
    w.indicator==='XORIJIY_TIL_MASHGULOT'?(w.xorijiyTilFanYonalish||''):'',
    w.indicator==='XORIJIY_TIL_MASHGULOT'?mashgulotTuriName(w.xorijiyTilMashgulotTuri):'',
    w.indicator==='XORIJIY_TIL_MASHGULOT'?xorijiyTilName(w.xorijiyTilTil):'',
    w.indicator==='XORIJIY_TIL_MASHGULOT'?(w.xorijiyTilMashgulotSoati||''):'',
    w.indicator==='XORIJIY_TIL_SERTIFIKAT'?xorijiyTilName(w.certForeignLang):'',
    w.indicator==='XORIJIY_TIL_SERTIFIKAT'?(w.certDarajasi||''):'',
    w.indicator==='XORIJIY_TIL_SERTIFIKAT'?(w.certUmumiyBali||''):'',
    w.month?monthText(w.month):'',
    w.year||'',
    w.coAuthorsCount||1,
    w.siteUrl||'',
    w.fileUrl||'',
    w.completionStatus==='DONE'?t('meta.statuses.DONE'):w.completionStatus==='PARTIAL'?t('meta.statuses.PARTIAL'):t('meta.statuses.NOT_DONE')
  ]);
  downloadExcel(buildExcelXml(headers,rows,currentLang==='uz'?'Ilmiy ishlar':'Научные работы'),`Works_${$('workYearSel').value}.xls`);
  toast(typeof t('ui.toasts.exportWorks')==='function'?t('ui.toasts.exportWorks')(rows.length):String(t('ui.toasts.exportWorks')));
};

// ===== INIT =====
function hydrateAuthTokenFromHash(){
  try{
    const raw=(location.hash||'').replace(/^#/,'').trim();
    if(!raw) return;
    const params=new URLSearchParams(raw);
    const hashToken=params.get('authToken')||params.get('t');
    if(!hashToken) return;
    setAuthToken(hashToken);
    history.replaceState(null,'',location.pathname+location.search);
  }catch(_e){}
}

function runInit(){
  if(location.protocol==='file:'){
    document.body.innerHTML='<div style="padding:40px;font-family:system-ui;max-width:500px;margin:0 auto"><h2>IlmiySTAT</h2><p style="color:#b00020">Страница открыта как файл (file://). Запустите приложение через веб-сервер.</p><p>Например: <code>npx serve .</code> или откройте через <code>http://localhost/...</code></p></div>';
    return;
  }
(async()=>{
  hydrateAuthTokenFromHash();
  const token=getAuthToken();
  if(!token){ toast(String(t('ui.toasts.noAuth'))); const base=location.pathname.replace(/\/[^/]*$/, '')||''; setTimeout(()=>location.href=base+'/login.html?mode=user',1000); return; }
  try{
    // Обработчики переключения языка
    if($('langRuBtn'))$('langRuBtn').onclick=()=>setLang('ru');
    if($('langUzBtn'))$('langUzBtn').onclick=()=>setLang('uz');

    currentUser = await api('/auth/me');
    const accessLevel = currentUser.accessLevel || 'department';
    const isMinistry = accessLevel==='ministry';
    const allowedDepts = (currentUser.departmentIds && currentUser.departmentIds.length) ? currentUser.departmentIds : (currentUser.departmentId != null ? [currentUser.departmentId] : []);
    const hasAccess = currentUser.role==='admin' || isMinistry || accessLevel==='institute' || (departmentId && allowedDepts.some(d=>String(d)===String(departmentId)));
    if(!hasAccess){ toast(String(t('ui.toasts.forbidden'))); return; }
    if(!departmentId && !isMinistry){ toast(String(t('ui.toasts.noDepartment'))); return; }
    
    initTabs();
    restoreActiveTab(); // Сразу восстанавливаем вкладку — без мигания на «Педагоги»
    initMainNavSidebar();
    window.addEventListener('resize', initMainNavSidebar);
    window.addEventListener('resize', ()=>{ requestAnimationFrame(syncStatsSidebarsForViewport); });
    window.addEventListener('resize', ()=>{ requestAnimationFrame(()=>{ updateWorksStickyScrollbar(); updateStatsStickyScrollbar(); }); });
    updateNotificationBadge();
    if(isMinistry){
      await initMinistryHeaderFilter();
      const btn=$('notificationCreateBtn'); if(btn)btn.style.display='';
    }
    
    if(!isMinistry){
      // Загружаем данные кафедры для получения названия
      departmentData = null;
      try{
        try{
          const department = await api(`/departments/${departmentId}`);
          departmentData = department ? {name: department.name, nameUz: department.nameUz} : null;
        }catch(e1){
          const departments = await api('/departments');
          const dept = Array.isArray(departments) ? departments.find(d => String(d.id) === String(departmentId)) : null;
          departmentData = dept ? {name: dept.name, nameUz: dept.nameUz} : null;
        }
      }catch(e){ console.warn('Не удалось загрузить название кафедры:', e.message); }
      updateMainTitle();
      const deptName = getDepartmentName();
      if(deptName){ document.title = `IlmiySTAT — ${deptName}`; }
      else{ document.title = currentLang==='uz' ? 'IlmiySTAT — Kafedra kabineti' : 'IlmiySTAT — Кабинет кафедры'; }
      await loadTeachers();
      try{ works = await api(`/departments/${departmentId}/scientific-works`); plans = await api(`/departments/${departmentId}/plan-items`); allPlans = [...plans]; }catch(e){ console.warn('Ошибка загрузки данных для сбора годов:', e.message); }
      if($('planYearSel'))fillYears($('planYearSel')); if($('workYearSel'))fillYears($('workYearSel')); if($('statsYearSel'))fillYears($('statsYearSel'));
      restoreUIState();
      await loadWorks();
      await loadPlans();
      await loadStats();
    }else{
      updateMainTitle();
    }
    
    if($('userInfo')){
      const roleLbl=getUserRoleLabel(currentUser);
      $('userInfo').textContent=`${String(t('ui.userLabel'))}: ${currentUser.username}${roleLbl?` (${roleLbl})`:''}`;
    }
    if($('importBtn'))$('importBtn').style.display=canEditTab('backup')?'':'none';
    if($('clearAllDataBtn'))$('clearAllDataBtn').style.display=canEditTab('backup')?'':'none';
    if($('importFile'))$('importFile').disabled=!canEditTab('backup');
    if($('importWipeLabel'))$('importWipeLabel').style.display=canEditTab('backup')?'':'none';
    if($('importWipe'))$('importWipe').disabled=!canEditTab('backup');
    if($('exportBtn')){ $('exportBtn').style.display=canEditTab('backup')?'':'none'; $('exportBtn').disabled=!canEditTab('backup'); }
    if($('downloadBtn')){ $('downloadBtn').style.display=canEditTab('backup')?'':'none'; if(!canEditTab('backup'))$('downloadBtn').disabled=true; }
    if($('workFilterInd'))fillIndicatorSelect($('workFilterInd'),true);
    if($('workFilterArticleType')){ const wa=$('workFilterArticleType'); if(wa){ const prev=String(wa.value||''); fillArticleTypeSelect(wa,true); wa.value=prev; } }
    // Восстанавливаем фильтры после перестроения UI (вкладка уже восстановлена выше)
    restoreUIState();
    initSidebarSync();
    syncStatsSidebarsForViewport();
    initStatsAssistant();
    applyLanguage();
    restoreUIState();
    syncStatsTypeUi();
    syncSidebarToMain();
    renderStats();
    initStatsTableResize();
    statsApplyColsToTable();
  }catch(e){
    console.error(e);
    toast('Ошибка: '+e.message);
    if(e.message&&(e.message.includes('401')||e.message.includes('Unauthorized'))){ clearAuthToken(); const base=location.pathname.replace(/\/[^/]*$/, '')||''; setTimeout(()=>location.href=base+'/login.html?mode=user',1000); }
  }
})();
}
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',runInit); }
else{ runInit(); }
