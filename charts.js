const LINE_RE = /^(.*?):\s*(\d+(?:\.\d+)?)\s*\w*\s*[×x]\s*(\d+)\s*reps/i;

function readHistory(){
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('wt_history')) || {};
  } catch(e){
    return {};
  }
}

function computeDay(lines){
  let volume = 0; let sets = 0;
  (Array.isArray(lines)? lines: []).forEach(line => {
    const m = String(line).match(LINE_RE);
    if (m){
      const weight = parseFloat(m[2]);
      const reps = parseInt(m[3],10);
      if (!isNaN(weight) && !isNaN(reps)){
        volume += weight * reps;
        sets += 1;
      }
    }
  });
  return { volume, sets };
}

function buildDatasets(history){
  const labels = Object.keys(history||{}).sort();
  const volumes = [];
  const sets = [];
  labels.forEach(date => {
    const stats = computeDay(history[date]);
    volumes.push(stats.volume);
    sets.push(stats.sets);
  });
  return { labels, volumes, sets };
}

function renderVolumeChart(){
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('volumeChart');
  if (!canvas) return;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  const data = buildDatasets(readHistory());
  const width = canvas.width = 300;
  const height = canvas.height = 150;
  ctx.clearRect(0,0,width,height);
  if (data.volumes.length === 0) return;
  const max = Math.max(...data.volumes);
  const barWidth = width / data.volumes.length;
  data.volumes.forEach((v,i) => {
    const barHeight = max? (v/max)*(height-20):0;
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(i*barWidth + 1, height - barHeight, barWidth - 2, barHeight);
  });
}

if (typeof window !== 'undefined') {
  window.renderVolumeChart = renderVolumeChart;
}

if (typeof module !== 'undefined') {
  module.exports = { readHistory, buildDatasets, renderVolumeChart };
}
