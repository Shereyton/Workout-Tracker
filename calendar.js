/**
 * Lightweight calendar/history renderer injected without HTML changes.
 * Provides collapsible day cards with inline editing, quick add,
 * delete and undo. Everything is mounted dynamically.
 */

const LINE_RE = /^(.*?):\s*(\d+(?:\.\d+)?)\s*lbs\s*[×x]\s*(\d+)\s*reps\s*$/i;
function parseHistoryLine(str){
  const m = String(str||'').match(LINE_RE);
  if(!m) return null;
  return { name: m[1].trim(), weight: +m[2], reps: +m[3] };
}

function parseDateLocal(str){
  const [y,m,d] = String(str).split('-').map(Number);
  return new Date(y, m-1, d);
}

function parseAiText(text, selectedDate){
  const lines = String(text||'').split(/\r?\n/);
  let target = selectedDate;
  const header = lines[0] && lines[0].match(/WORKOUT DATA - (\d{4}-\d{2}-\d{2})/i);
  if(header) target = header[1];
  if(!target) return null;
  const out = [];
  let currentExercise = null;
  lines.forEach(l => {
    const trimmed = l.trim();
    if(!trimmed) return;
    const exHeader = trimmed.match(/^([^:]+):\s*$/);
    if(exHeader){
      currentExercise = exHeader[1].trim();
      return;
    }
    const setMatch = trimmed.match(/^(?:Set\s+\d+\s*[-–:]?\s*)?(.*?):\s*(\d+(?:\.\d+)?)\s*(lbs|kg)\s*[×xX]\s*(\d+)\s*reps/i);
    if(setMatch){
      let name = setMatch[1].trim();
      if(!name && currentExercise) name = currentExercise;
      if(name){
        out.push(`${name}: ${setMatch[2]} ${setMatch[3]} × ${setMatch[4]} reps`);
      }
    }
  });
  if(out.length){
    return {[target]: out};
  }
  return null;
}

function snapshotToLines(snapshot){
  const lines = [];
  (snapshot||[]).forEach(ex => {
    if(ex.isSuperset){
      ex.sets.forEach((set, setIdx) => {
        (set.exercises||[]).forEach(sub => {
          lines.push(`${sub.name}: Set ${setIdx+1} - ${sub.weight} lbs × ${sub.reps} reps`);
        });
      });
    } else {
      (ex.sets||[]).forEach((set, setIdx) => {
        lines.push(`${ex.name}: Set ${setIdx+1} - ${set.weight} lbs × ${set.reps} reps`);
      });
    }
  });
  return lines;
}
function computeDayTotals(lines){
  let sets=0, volume=0;
  (Array.isArray(lines)?lines:[]).forEach(l=>{
    const p=parseHistoryLine(l);
    if(p){ sets++; volume += p.weight*p.reps; }
  });
  return { sets, volume };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // mount
    let mount = document.getElementById('calendar') || document.getElementById('calendarRoot') || document.querySelector('section[data-role="calendar"]');
    if(!mount){
      mount = document.createElement('section');
      mount.id = 'calendar';
      const h1 = document.querySelector('h1');
      if(h1 && h1.parentNode){ h1.insertAdjacentElement('afterend', mount); }
      else document.body.insertBefore(mount, document.body.firstChild);
    }
    mount.classList.add('wt-cal');

    // style
    const style = document.createElement('style');
    style.textContent = `
.wt-cal{font-family:sans-serif;}
.wt-cal .wt-cal-controls{display:flex;gap:8px;margin-bottom:8px;}
.wt-cal-day{border:1px solid #ccc;border-radius:6px;margin-bottom:8px;}
.wt-cal-day-header{width:100%;background:none;border:0;padding:8px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;text-align:left;font-size:1rem;}
.wt-cal-day-header:focus{outline:2px solid #09f;}
.wt-cal-chevron{transition:transform .2s ease;}
.wt-cal-day-header[aria-expanded="false"] .wt-cal-chevron{transform:rotate(-90deg);}
.wt-cal-day-body{padding:0 8px 8px;}
.wt-cal-entry{display:flex;justify-content:space-between;align-items:center;padding:4px 0;}
.wt-cal-entry .actions{display:flex;gap:4px;}
.wt-cal-entry button{font-size:.8rem;}
.wt-cal-add .add-row{display:flex;flex-direction:column;gap:4px;margin-top:4px;}
.wt-cal-add input{width:100%;}
.wt-cal-error{color:#d00;font-size:.75rem;}
.wt-cal-live{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
`;
    document.head.appendChild(style);

    // live region
    const live = document.createElement('div');
    live.className='wt-cal-live';
    live.setAttribute('role','status');
    live.setAttribute('aria-live','polite');
    document.body.appendChild(live);
    function announce(msg){ live.textContent=''; setTimeout(()=>{ live.textContent=msg; },10); }

    // data
    const STORAGE_KEY='wt_history';
    let rawHistory={};
    try{ rawHistory = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch(e){ rawHistory = {}; }
    let undoSnapshot=null;
    let saveTimer=null;
    function scheduleSave(){
      clearTimeout(saveTimer);
      saveTimer = setTimeout(()=>{
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rawHistory));
        if (typeof renderVolumeChart === 'function') renderVolumeChart();
      },80);
    }
    function getEntries(date){
      const v = rawHistory[date];
      return Array.isArray(v)? v.slice() : [];
    }

    // helpers
    function formatHuman(dateStr){ return parseDateLocal(dateStr).toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'}); }

    const cards=[];

    function offerUndo(message, snapshot){
      undoSnapshot = snapshot;
      if(typeof showToast === 'function'){
        showToast(message, { actionLabel:'Undo', onAction: undo });
        setTimeout(()=>{ undoSnapshot=null; },8000);
      } else {
        const bar = document.createElement('div');
        bar.style.position='fixed';bar.style.bottom='10px';bar.style.left='50%';bar.style.transform='translateX(-50%)';
        bar.style.background='#333';bar.style.color='#fff';bar.style.padding='8px';bar.style.borderRadius='4px';
        const btn=document.createElement('button');btn.textContent='Undo';btn.style.marginLeft='8px';
        btn.addEventListener('click',()=>{ undo(); document.body.removeChild(bar); });
        bar.textContent=message; bar.appendChild(btn);
        document.body.appendChild(bar);
        setTimeout(()=>{ if(bar.parentNode) bar.parentNode.removeChild(bar); undoSnapshot=null; },8000);
      }
    }
    function undo(){
      if(!undoSnapshot) return;
      rawHistory = JSON.parse(undoSnapshot);
      undoSnapshot=null;
      scheduleSave();
      renderDays();
      announce('Undo complete.');
    }

    document.addEventListener('keydown', e=>{
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
        if(undoSnapshot){ e.preventDefault(); undo(); }
      }
    });

    // controls
    mount.innerHTML='';
    const controls = document.createElement('div');
    controls.className='wt-cal-controls';
    const expandAll = document.createElement('button');
    expandAll.type='button'; expandAll.textContent='Expand All';
    const collapseAll = document.createElement('button');
    collapseAll.type='button'; collapseAll.textContent='Collapse All';
    controls.appendChild(expandAll); controls.appendChild(collapseAll);
    mount.appendChild(controls);

    const container = document.createElement('div');
    mount.appendChild(container);

    expandAll.addEventListener('click', ()=>{
      cards.forEach(c=>{ c.header.setAttribute('aria-expanded','true'); c.body.style.display=''; c.build(true); });
    });
    collapseAll.addEventListener('click', ()=>{
      cards.forEach(c=>{ c.header.setAttribute('aria-expanded','false'); c.body.style.display='none'; });
    });

    function renderDays(){
      container.innerHTML='';
      cards.length=0;
      const dates = Object.keys(rawHistory).sort((a,b)=>b.localeCompare(a)).slice(0,90);
      if(dates.length===0){
        container.textContent='No history';
        if (typeof renderVolumeChart === 'function') renderVolumeChart();
        return;
      }
      dates.forEach((date, idx)=>{
        const card = createDayCard(date, idx<7, idx<14);
        container.appendChild(card.el);
        cards.push(card);
      });
      if (typeof renderVolumeChart === 'function') renderVolumeChart();
    }

    function createDayCard(date, expandedDefault, buildNow){
      const cardEl = document.createElement('div'); cardEl.className='wt-cal-day';
      const header = document.createElement('button');
      header.type='button';
      header.className='wt-cal-day-header';
      header.setAttribute('aria-expanded', expandedDefault? 'true':'false');
      const dateSpan=document.createElement('span'); dateSpan.textContent=formatHuman(date);
      const totalsSpan=document.createElement('span'); totalsSpan.className='wt-cal-totals';
      const chev=document.createElement('span'); chev.className='wt-cal-chevron'; chev.textContent='▾';
      header.appendChild(dateSpan); header.appendChild(totalsSpan); header.appendChild(chev);
      cardEl.appendChild(header);
      const body=document.createElement('div'); body.className='wt-cal-day-body';
      if(!expandedDefault) body.style.display='none';
      cardEl.appendChild(body);

      function refreshTotals(){
        const t = computeDayTotals(getEntries(date));
        totalsSpan.textContent = `Sets: ${t.sets} • Volume: ${t.volume} lbs`;
      }

      let built=false;
      function build(force=false){
        if(built && !force) return;
        body.innerHTML='';
        const ul=document.createElement('ul');
        getEntries(date).forEach((line,i)=>{ ul.appendChild(createEntry(date,line,i)); });
        body.appendChild(ul);
        body.appendChild(createAddRow(date));
        built=true;
      }

      if(expandedDefault && buildNow) build();

      header.addEventListener('click', ()=>{
         const exp = header.getAttribute('aria-expanded')==='true';
         header.setAttribute('aria-expanded', exp? 'false':'true');
         if(exp){ body.style.display='none'; }
         else { body.style.display=''; build(); }
      });

      const card={ el:cardEl, header, body, build, refreshTotals };
      refreshTotals();
      return card;

      function createEntry(date,line,index){
        const li=document.createElement('li'); li.className='wt-cal-entry';
        const span=document.createElement('span'); span.textContent=line; li.appendChild(span);
        const actions=document.createElement('span'); actions.className='actions'; li.appendChild(actions);
        const edit=document.createElement('button'); edit.type='button'; edit.textContent='Edit'; edit.setAttribute('aria-label','Edit entry'); actions.appendChild(edit);
        const del=document.createElement('button'); del.type='button'; del.textContent='Del'; del.setAttribute('aria-label','Delete entry'); actions.appendChild(del);

        edit.addEventListener('click', ()=>enterEdit());
        del.addEventListener('click', ()=>{
          const prev = JSON.stringify(rawHistory);
          const arr = getEntries(date);
          arr.splice(index,1);
          if(arr.length) rawHistory[date]=arr; else delete rawHistory[date];
          scheduleSave();
          announce('Deleted entry.');
          offerUndo('Entry deleted', prev);
          build(true);
          refreshTotals();
        });

        function enterEdit(){
          const input=document.createElement('input'); input.type='text'; input.value=line;
          input.className='wt-cal-edit';
          li.insertBefore(input, span); li.removeChild(span);
          edit.style.display='none';
          const err=document.createElement('div'); err.className='wt-cal-error'; li.appendChild(err);
          input.focus();
          function save(){
            const val=input.value.trim();
            if(!val){ err.textContent='Required'; return; }
            const parsed=parseHistoryLine(val);
            if(!parsed){
              err.textContent='Invalid format';
              if(!confirm('Invalid format. Keep as free text?')) return;
            }
            const prev = JSON.stringify(rawHistory);
            const arr = getEntries(date);
            arr[index]=val;
            rawHistory[date]=arr;
            scheduleSave();
            announce('Edited entry on '+formatHuman(date)+'.');
            offerUndo('Entry updated', prev);
            build(true);
            refreshTotals();
          }
          function cancel(){ err.remove(); build(true); }
          input.addEventListener('keydown', e=>{
            if(e.key==='Enter'){ e.preventDefault(); save(); }
            else if(e.key==='Escape'){ e.preventDefault(); cancel(); }
          });
        }

        return li;
      }

      function createAddRow(date){
        const wrap=document.createElement('div'); wrap.className='wt-cal-add';
        const btn=document.createElement('button'); btn.type='button'; btn.textContent='+ Add'; wrap.appendChild(btn);
        let row=null;
        btn.addEventListener('click', ()=>{
          if(row) return;
          btn.style.display='none';
          row=document.createElement('div'); row.className='add-row';
          const input=document.createElement('input'); input.type='text'; input.placeholder='Exercise: 100 lbs × 5 reps';
          const err=document.createElement('div'); err.className='wt-cal-error';
          row.appendChild(input); row.appendChild(err); wrap.appendChild(row); input.focus();
          function save(){
            const val=input.value.trim();
            if(!val){ err.textContent='Required'; return; }
            const parsed=parseHistoryLine(val);
            if(!parsed){
              err.textContent='Invalid format';
              if(!confirm('Invalid format. Keep as free text?')) return;
            }
            const prev = JSON.stringify(rawHistory);
            const arr=getEntries(date);
            arr.push(val);
            rawHistory[date]=arr;
            scheduleSave();
            announce('Added entry.');
            offerUndo('Entry added', prev);
            build(true);
            refreshTotals();
            row.remove(); row=null; btn.style.display='';
            setTimeout(()=>{
              const items=body.querySelectorAll('li');
              if(items.length) items[items.length-1].scrollIntoView({behavior:'smooth',block:'center'});
            },50);
          }
          function cancel(){ row.remove(); row=null; btn.style.display=''; }
          input.addEventListener('keydown', e=>{
            if(e.key==='Enter'){ e.preventDefault(); save(); }
            else if(e.key==='Escape'){ e.preventDefault(); cancel(); }
          });
        });
        return wrap;
      }
    }

    renderDays();
  });
}

// for tests
if(typeof module !== 'undefined'){ module.exports = { parseHistoryLine, computeDayTotals, parseDateLocal, parseAiText, snapshotToLines }; }
