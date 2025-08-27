// Calendar – Golden Version (no charts; 7 headers + 6 rows grid; re-renders on imports)

import { parseDateLocal } from './script.js';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function qs(s){ return document.querySelector(s); }

let currentMonthDate = parseDateLocal(new Date().toISOString().slice(0,10));

function toDateParts(iso){
  const [y,m,d] = iso.split('-').map(Number);
  return { y, m, d };
}
function toISO(y,m,d){
  const date = new Date(y, m-1, d);
  const off = date.getTimezoneOffset();
  const local = new Date(date.getTime() - off*60000);
  return local.toISOString().slice(0,10);
}

export function renderCalendar(selectedISO){
  const sel = parseDateLocal(selectedISO);
  const { y, m } = toDateParts(sel);

  // render title
  const monthTitle = new Date(y, m-1, 1).toLocaleString(undefined, {month:'long', year:'numeric'});
  const titleEl = qs('#calTitle');
  if (titleEl) titleEl.textContent = monthTitle;

  const cal = qs('#calendar');
  if (!cal) return;
  cal.innerHTML = '';

  // headers
  for (let i=0;i<7;i++){
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.textContent = DAYS[i];
    cal.appendChild(h);
  }

  // month math
  const firstOfMonth = new Date(y, m-1, 1);
  const startDay = firstOfMonth.getDay(); // 0-6
  const daysInMonth = new Date(y, m, 0).getDate();

  // previous month days to fill leading
  const prevMonthDays = new Date(y, m-1, 0).getDate();

  const cells = 42; // 6 rows x 7 columns
  let dayNum = 1;
  let nextMonthDay = 1;

  for (let i=0; i<cells; i++){
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    let displayNum = '';
    let dateISO = '';

    if (i < startDay) {
      // leading days from previous month
      displayNum = String(prevMonthDays - (startDay - i - 1));
      const d = prevMonthDays - (startDay - i - 1);
      const prevISO = toISO(m===1?y-1:y, m===1?12:m-1, d);
      dateISO = prevISO;
      cell.classList.add('muted');
    } else if (i >= startDay && dayNum <= daysInMonth) {
      displayNum = String(dayNum);
      dateISO = toISO(y, m, dayNum);
      dayNum++;
    } else {
      // trailing days from next month
      displayNum = String(nextMonthDay);
      const nextISO = toISO(m===12?y+1:y, m===12?1:m+1, nextMonthDay);
      dateISO = nextISO;
      nextMonthDay++;
      cell.classList.add('muted');
    }

    const n = document.createElement('div');
    n.className = 'num';
    n.textContent = displayNum;
    cell.appendChild(n);

    // mark selected
    if (dateISO === sel) cell.classList.add('selected');

    // mark has-data
    try {
      const hist = JSON.parse(localStorage.getItem('wt_history') || '{}');
      if (Array.isArray(hist[dateISO]) && hist[dateISO].length) {
        cell.classList.add('has-data');
      }
    } catch {}

    // click -> select and re-render day
    cell.addEventListener('click', ()=>{
      renderCalendar(dateISO);
      const evt = new CustomEvent('calendar:change', { detail: { date: dateISO }});
      window.dispatchEvent(evt);
    });

    cal.appendChild(cell);
  }
}

export function initCalendarNav({ onChange } = {}){
  const todayISO = parseDateLocal(new Date().toISOString().slice(0,10));
  currentMonthDate = todayISO;

  function setMonthFor(iso){
    currentMonthDate = parseDateLocal(iso);
    renderCalendar(currentMonthDate);
    onChange?.(currentMonthDate);
  }

  // Hook external change
  window.addEventListener('calendar:change', (e)=>{
    const d = e.detail?.date || currentMonthDate;
    currentMonthDate = parseDateLocal(d);
    onChange?.(currentMonthDate);
  });

  // Prev / Next
  document.querySelector('#calPrev')?.addEventListener('click', ()=>{
    const { y, m } = toDateParts(currentMonthDate);
    const prev = (m===1) ? toISO(y-1,12,1) : toISO(y, m-1, 1);
    setMonthFor(prev);
  });
  document.querySelector('#calNext')?.addEventListener('click', ()=>{
    const { y, m } = toDateParts(currentMonthDate);
    const next = (m===12) ? toISO(y+1,1,1) : toISO(y, m+1, 1);
    setMonthFor(next);
  });

  // Today
  document.querySelector('#calToday')?.addEventListener('click', ()=>{
    setMonthFor(todayISO);
  });

  // Goto date
  const gotoInput = document.querySelector('#calGoto');
  const goBtn = document.querySelector('#calGo');

  function validateGoto(){
    const v = (gotoInput?.value || '').trim();
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (goBtn) goBtn.disabled = !ok;
    return ok ? v : null;
  }
  gotoInput?.addEventListener('input', validateGoto);

  goBtn?.addEventListener('click', ()=>{
    const v = validateGoto();
    if (!v) return;
    setMonthFor(parseDateLocal(v));
  });
}
