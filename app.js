const $ = s => document.querySelector(s);

const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const strip = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/* Regionais (nome e estado) */
const REGS = [
  ['Norte',        'MA'],
  ['Noroeste',     'MA'],
  ['Sul',          'MA'],
  ['Leste',        'MA'],
  ['Metropolitana','PI'],
  ['Parnaíba',     'PI'],
  ['Sul',          'PI'],
].map(([n, e]) => ({
  n,
  e,
  k: n + '|' + e,
  l: n + ' · ' + e,
}));

const canon = {};
REGS.forEach(r => canon[strip(r.n)] = r.n);

/* Periodos convertidos*/
const num = v =>
  typeof v === 'number'
    ? v
    : parseFloat(String(v ?? '0').replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

function pm(v) {
  if (v instanceof Date) return new Date(v.getTime() + 432e5).toISOString().slice(0, 7);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 7);
  v = String(v);
  const m = v.match(/^(\d{1,2})\/(\d{4})$/);
  return m ? m[2] + '-' + m[1].padStart(2, '0') : v.slice(0, 7);
}

/* Normaliza uma linha da planilha */
function norm(o) {
  const g = {};
  for (const k in o) g[strip(k)] = o[k];
  return {
    reg:  canon[strip(g.regional)] || String(g.regional).trim(),
    e:    strip(g.estado).startsWith('ma') ? 'MA' : 'PI',
    p:    String(g.processo).trim(),
    m:    pm(g.periodo),
    meta: num(g.meta),
    dpl:  num(g.medicaodpl),
    val:  num(g.medicaovalidada),
    bol:  num(g.boletim),
  };
}

/* ESTADO GLOBAL */
let rows = [], loadErr = false,
    F = { ano: '', mes: '', est: '', reg: '', set: '' },
    page = 0, charts = [];

/* AGREGAÇÕES */
const S = a =>
  a.reduce(
    (t, r) => (t.meta += r.meta, t.dpl += r.dpl, t.val += r.val, t.bol += r.bol, t),
    { meta: 0, dpl: 0, val: 0, bol: 0 }
  );

const G = (a, f) => {
  const m = new Map();
  a.forEach(r => {
    const k = f(r);
    (m.get(k) || m.set(k, []).get(k)).push(r);
  });
  return m;
};

const pct = (b, m) => m > 0 ? b / m : null;
const fp  = v => v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%';

const col = v => v == null ? '#8fa1bd' : v >= 1 ? '#22c55e' : v >= .85 ? '#f5b301' : '#ef4444';

const fM = v => {
  const a = Math.abs(v);
  return (v < 0 ? '-' : '') + 'R$ ' + (
    a >= 1e6 ? (a / 1e6).toFixed(2).replace('.', ',') + ' mi'
    : a >= 1e3 ? (a / 1e3).toFixed(0) + ' mil'
    : a.toFixed(0)
  );
};

const fR = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fm = m => MES[+m.slice(5) - 1] + '/' + m.slice(2, 4);

function filt(skip) {
  return rows.filter(r =>
       (skip == 'ano' || !F.ano || r.m.slice(0, 4) == F.ano)
    && (!F.mes || r.m.slice(5) == F.mes)
    && (!F.est || r.e == F.est)
    && (skip == 'reg' || !F.reg || r.reg + '|' + r.e == F.reg)
    && (!F.set || r.p == F.set)
  );
}

/* COMPONENTES HTML */
const pill = p =>
  `<span class="pill" style="background:${col(p)}22;color:${col(p)}">${fp(p)}</span>`;

const q  = (t, b, c = '') => `<section class="q ${c}"><h3>${t}</h3><div class="b">${b}</div></section>`;
const cv = id => `<canvas id="${id}"></canvas>`;

function table(h, b) {
  return `<table>
    <thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead>
    <tbody>
      ${b.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>`;
}

const trow = (k, t) =>
  [k, fR(t.meta), fR(t.dpl), fR(t.val), fR(t.bol), pill(pct(t.bol, t.meta))];

const TH = ['', 'Meta', 'Medição DPL', 'Validada', 'Boletim', '% Meta'];

/* CHART.JS — criação de gráficos */
function mk(id, type, data, o = {}) {
  const sc = o.scales || {};
  charts.push(new Chart(document.getElementById(id), {
    type, data,
    options: {
      maintainAspectRatio: false,
      responsive: true,
      indexAxis: o.ix,
      cutout: o.cut,
      plugins: {
        legend: {
          display: o.leg !== false,
          position: o.lp || 'top',
          labels: { boxWidth: 10, color: '#8fa1bd' },
        },
        tooltip: { callbacks: o.tt || {} },
      },
      scales: type == 'doughnut' ? {} : {
        x: { grid: { color: '#1f2b44' }, ticks: { color: '#8fa1bd' }, ...sc.x },
        y: { grid: { color: '#1f2b44' }, ticks: { color: '#8fa1bd' }, ...sc.y },
        ...(sc.y2 ? { y2: sc.y2 } : {}),
      },
    },
  }));
}

const mT = { callback: v => fM(v) };
const pT = { callback: v => (v * 100).toFixed(0) + '%' };

function monthChart(a) {
  const g = [...G(a, r => r.m)].sort((x, y) => x[0] < y[0] ? -1 : 1);
  const t = g.map(x => S(x[1]));
  mk('c1', 'bar', {
    labels: g.map(x => fm(x[0])),
    datasets: [
      { label: 'Meta', data: t.map(x => x.meta), backgroundColor: '#3b82f666', borderColor: '#3b82f6', borderWidth: 1 },
      { label: 'Boletim (recebido)', data: t.map(x => x.bol), backgroundColor: '#ff9100' },
      { type: 'line', label: '% da meta', data: t.map(x => pct(x.bol, x.meta)),
        yAxisID: 'y2', borderColor: '#22d3ee', backgroundColor: '#22d3ee', tension: .3 },
    ],
  }, {
    scales: {
      y: { ticks: mT },
      y2: { position: 'right', grid: { display: false }, ticks: { ...pT, color: '#22d3ee' } },
    },
    tt: { label: c => c.dataset.label + ': ' + (c.dataset.yAxisID ? fp(c.raw) : fR(c.raw)) },
  });
}

function setores(a) {
  return [...G(a, r => r.p)].map(([k, v]) => {
    const t = S(v);
    return { k, ...t, p: pct(t.bol, t.meta) };
  });
}

/* MAPA — polígonos e SVG */
const POLY = {
  'Noroeste|MA':     [[-46.1,-1.05],[-45.4,-1.7],[-44.9,-1.8],[-44.6,-2.35],[-45,-3.2],[-45,-4.4],[-47.5,-4.8],[-47.4,-3.2]],
  'Norte|MA':        [[-44.6,-2.35],[-44.3,-2.45],[-42.8,-2.7],[-42.27,-2.76],[-41.8,-2.85],[-42,-3.5],[-42.5,-4.3],[-45,-4.4],[-45,-3.2]],
  'Leste|MA':        [[-42.5,-4.3],[-42.68,-4.7],[-42.85,-5.1],[-43.2,-6],[-43.63,-7],[-44.2,-7.3],[-45,-6.6],[-45.3,-5.4],[-45,-4.4]],
  'Sul|MA':          [[-44.2,-7.3],[-45,-8],[-45.9,-9.1],[-46.1,-10],[-46.3,-10.25],[-47.4,-9.5],[-47.6,-7.5],[-47.4,-6],[-47.5,-4.8],[-45,-4.4],[-45.3,-5.4],[-45,-6.6]],
  'Parnaíba|PI':     [[-41.8,-2.85],[-41,-3],[-41.3,-4.2],[-41.1,-4.7],[-42.68,-4.7],[-42.5,-4.3],[-42,-3.5]],
  'Metropolitana|PI':[[-42.68,-4.7],[-41.1,-4.7],[-41,-5],[-40.6,-5.9],[-40.52,-7],[-43.63,-7],[-43.2,-6],[-42.85,-5.1]],
  'Sul|PI':          [[-43.63,-7],[-40.52,-7],[-40.8,-8],[-40.4,-9],[-41.3,-9.8],[-42.5,-10.3],[-43.6,-10.9],[-44.6,-10.5],[-45.3,-10.5],[-45.9,-9.1],[-45,-8],[-44.2,-7.3]],
};

function mapSvg(a) {
  const by = G(a, r => r.reg + '|' + r.e);
  const any = F.reg || F.est;
  let s = '<svg viewBox="0 0 780 1010" style="width:100%;height:100%">'
        + '<text x="10" y="960" fill="#2a3a5a" font-size="34" font-weight="700">MARANHÃO</text>'
        + '<text x="770" y="990" fill="#2a3a5a" font-size="34" font-weight="700" text-anchor="end">PIAUÍ</text>';

  REGS.forEach(R => {
    const P  = POLY[R.k].map(([x, y]) => [(x + 48) * 100, (-1 - y) * 100]);
    const rs = by.get(R.k);
    const t  = rs && S(rs);
    const p  = t && pct(t.bol, t.meta);
    const sel = F.reg ? R.k == F.reg : F.est ? R.e == F.est : true;
    const cx = P.reduce((s, x) => s + x[0], 0) / P.length;
    const cy = P.reduce((s, x) => s + x[1], 0) / P.length;

    s += `<path data-k="${R.k}" d="M${P.map(x => x.map(n => n.toFixed(0)).join(',')).join('L')}Z"
            fill="${p == null ? '#1b2438' : col(p)}"
            fill-opacity="${sel ? (any ? .8 : .55) : .1}"
            stroke="${sel && F.reg ? '#ff9100' : '#0a101c'}"
            stroke-width="${sel && F.reg ? 5 : 3}" stroke-linejoin="round"/>
          <text x="${cx}" y="${cy}" text-anchor="middle" fill="#fff" font-size="22" font-weight="600" opacity="${sel ? 1 : .4}">${R.n}</text>
          <text x="${cx}" y="${cy + 24}" text-anchor="middle" fill="#fff" font-size="20" opacity="${sel ? .9 : .3}">${p == null ? 'sem dados' : fp(p)}</text>`;
  });

  return s + '</svg>';
}

/* PÁGINAS */
const PAGES = [

  /* Visão Geral */
  ['Visão Geral', a => {
    const s   = setores(a).filter(x => x.meta > 0).sort((x, y) => y.p - x.p).slice(0, 10);
    const b   = setores(a).sort((x, y) => y.bol - x.bol);
    const top = b.slice(0, 7);
    const oth = b.slice(7).reduce((t, x) => t + x.bol, 0);
    const R   = [...G(a, r => r.reg + '|' + r.e)].map(([k, v]) => [REGS.find(r => r.k == k)?.l || k, S(v)]);

    $('#pg').innerHTML = '<div class="grid">'
      + q('Evolução mensal: Meta × Recebido', cv('c1'))
      + q('Top 10 setores · % da meta', cv('c2'))
      + q('Participação dos setores no recebido', cv('c3'))
      + q('Regionais · Meta × Recebido', cv('c4'))
      + '</div>';

    monthChart(a);

    mk('c2', 'bar', {
      labels: s.map(x => x.k),
      datasets: [{ data: s.map(x => x.p), backgroundColor: s.map(x => col(x.p)) }],
    }, { ix: 'y', leg: false, scales: { x: { ticks: pT } }, tt: { label: c => fp(c.raw) } });

    mk('c3', 'doughnut', {
      labels: [...top.map(x => x.k), 'Outros'],
      datasets: [{
        data: [...top.map(x => x.bol), oth],
        backgroundColor: ['#3b82f6','#ff9100','#22c55e','#a78bfa','#22d3ee','#f472b6','#f5b301','#475569'],
        borderColor: '#131c2f',
      }],
    }, { cut: '60%', lp: 'right', tt: { label: c => c.label + ': ' + fR(c.raw) } });

    mk('c4', 'bar', {
      labels: R.map(x => x[0]),
      datasets: [
        { label: 'Meta', data: R.map(x => x[1].meta), backgroundColor: '#3b82f666', borderColor: '#3b82f6', borderWidth: 1 },
        { label: 'Recebido', data: R.map(x => x[1].bol), backgroundColor: '#ff9100' },
      ],
    }, { scales: { y: { ticks: mT } }, tt: { label: c => c.dataset.label + ': ' + fR(c.raw) } });
  }],

  /* Regionais */
  ['Regionais', a => {
    const s = setores(a).sort((x, y) => y.meta - x.meta || y.bol - x.bol);
    const T = S(a);

    $('#pg').innerHTML = '<div class="grid" style="grid-template-rows:430px 500px auto">'
      + q('Mapa · clique para filtrar a regional', '<div id="map" style="height:100%">' + mapSvg(filt('reg')) + '</div>')
      + q('Evolução mensal da seleção', cv('c1'))
      + q('Setor × Meta · todos os setores, da maior para a menor meta', cv('c2'), 'full')
      + q('Detalhamento por setor',
          table(['Setor', ...TH.slice(1)], [...s.map(x => trow(x.k, x)), trow('<b>Total</b>', T)]),
          'full auto')
      + '</div>';

    monthChart(a);

    mk('c2', 'bar', {
      labels: s.map(x => x.k),
      datasets: [
        { type: 'line', label: 'Meta', data: s.map(x => x.meta),
          borderColor: '#3b82f6', backgroundColor: '#3b82f6', pointRadius: 4, borderWidth: 3, tension: .25, order: 0 },
        { label: 'Boletim (recebido)', data: s.map(x => x.bol), backgroundColor: '#ff9100', order: 1 },
      ],
    }, {
      scales: { x: { ticks: { autoSkip: false, maxRotation: 50, minRotation: 50 } }, y: { ticks: mT } },
      tt: { label: c => c.dataset.label + ': ' + fR(c.raw) },
    });

    $('#map').onclick = e => {
      const k = e.target.dataset?.k;
      if (!k) return;
      F.reg = F.reg == k ? '' : k;
      if (F.reg) F.est = k.split('|')[1];
      sync(); render();
    };
  }],

  /* Setores & Funil */
  ['Setores & Funil', a => {
    const T    = S(a);
    const s    = setores(a).sort((x, y) => y.meta - x.meta || y.bol - x.bol);
    const all  = filt('reg');
    const names = setores(all).sort((x, y) => y.meta - x.meta || y.bol - x.bol).map(x => x.k);
    const by   = G(all, r => r.p + '|' + r.reg + '|' + r.e);

    const heat = table(
      ['Setor', ...REGS.map(r => r.l)],
      names.map(n => [n, ...REGS.map(R => {
        const x = by.get(n + '|' + R.k);
        if (!x) return '<span style="color:#475569">·</span>';
        const t = S(x);
        return pill(pct(t.bol, t.meta));
      })])
    );

    const R = [...G(a, r => r.reg + '|' + r.e)].map(([k, x]) =>
      trow(REGS.find(r => r.k == k)?.l || k, S(x))
    );
    R.push(trow('<b>Total</b>', T));

    $('#pg').innerHTML = '<div class="grid" style="grid-template-rows:540px 480px auto auto">'
      + q('Funil por setor · Meta (linha) → Medição DPL → Validada → Boletim', cv('c1'), 'full')
      + q('Saldo vs. meta por setor · Boletim − Meta (maior meta → menor)', cv('c2'), 'full')
      + q('Mapa de calor · % da meta por setor e regional', heat, 'full auto')
      + q('Comparativo por regional', table(['Regional', ...TH.slice(1)], R), 'full auto')
      + '</div>';

    const lb = s.map(x => x.k);
    const X  = { ticks: { autoSkip: false, maxRotation: 50, minRotation: 50 } };

    mk('c1', 'bar', {
      labels: lb,
      datasets: [
        { type: 'line', label: 'Meta', data: s.map(x => x.meta),
          borderColor: '#3b82f6', backgroundColor: '#3b82f6', pointRadius: 4, borderWidth: 3, tension: .25, order: 0 },
        { label: 'Medição DPL',      data: s.map(x => x.dpl), backgroundColor: '#a78bfa', order: 1 },
        { label: 'Validada',         data: s.map(x => x.val), backgroundColor: '#22d3ee', order: 1 },
        { label: 'Boletim (recebido)', data: s.map(x => x.bol), backgroundColor: '#ff9100', order: 1 },
      ],
    }, { scales: { x: X, y: { ticks: mT } }, tt: { label: c => c.dataset.label + ': ' + fR(c.raw) } });

    mk('c2', 'bar', {
      labels: lb,
      datasets: [{
        label: 'Saldo (Boletim − Meta)',
        data: s.map(x => x.bol - x.meta),
        backgroundColor: s.map(x => x.bol >= x.meta ? '#22c55e' : '#ef4444'),
      }],
    }, { leg: false, scales: { x: X, y: { ticks: mT } }, tt: { label: c => fR(c.raw) } });
  }],
];

/* CARDS DE RESUMO */
function cards(a) {
  const t = S(a);
  const p = pct(t.bol, t.meta);
  return [
    ['Meta',               fM(t.meta),      'Total dimensionado',            '#3b82f6'],
    ['Medição DPL',        fM(t.dpl),       fp(pct(t.dpl, t.meta)) + ' da meta',    '#a78bfa'],
    ['Validada',           fM(t.val),       fp(pct(t.val, t.dpl)) + ' do enviado',  '#22d3ee'],
    ['Recebido (Boletim)', fM(t.bol),       fp(pct(t.bol, t.val)) + ' do validado', '#ff9100'],
    ['% da Meta',          fp(p),           'Boletim ÷ Meta',               col(p)],
    ['Saldo vs. Meta',     fM(t.bol - t.meta), t.bol >= t.meta ? 'Acima da meta' : 'Abaixo da meta',
                                                  t.bol >= t.meta ? '#22c55e' : '#ef4444'],
  ].map(([l, v, s, c]) =>
    `<div class="card" style="border-top-color:${c}">
      <small>${l}</small>
      <b${l == '% da Meta' || l == 'Saldo vs. Meta' ? ` style="color:${c}"` : ''}>${v}</b>
      <i>${s}</i>
    </div>`
  ).join('');
}

/* RENDERIZAÇÃO */
function render() {
  charts.forEach(c => c.destroy());
  charts = [];

  const a = filt();

  document.querySelectorAll('#nav button').forEach((b, i) => b.className = i == page ? 'on' : '');
  $('#ttl').textContent = PAGES[page][0];

  const per = [...new Set(a.map(r => r.m))].sort();
  $('#sub').textContent = a.length
    ? `${a.length} registros · ${per.length ? fm(per[0]) + (per.length > 1 ? ' a ' + fm(per[per.length - 1]) : '') : ''}`
    : '';

  if (!a.length) {
    $('#cards').innerHTML = '';
    $('#pg').innerHTML = loadErr
      ? '<div class="empty">Não foi possível ler o arquivo dados_boletim.xlsx. Abra a pasta com a extensão Live Server do VS Code (não clicando duas vezes no index.html) ou use o botão Carregar Excel.</div>'
      : '<div class="empty">Nenhum dado para os filtros selecionados. Esta base ainda não tem registros dessa combinação.</div>';
    return;
  }

  $('#cards').innerHTML = cards(a);
  PAGES[page][1](a);
}

/* FILTROS */
const opt = (id, l, items) =>
  $(id).innerHTML = `<option value="">${l}</option>`
    + items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

function build() {
  const ms = [...new Set(rows.map(r => r.m))];
  opt('#f-ano', 'Todos', [...new Set(ms.map(m => m.slice(0, 4)))].sort().map(x => [x, x]));
  opt('#f-mes', 'Todos', MES.map((m, i) => [String(i + 1).padStart(2, '0'), m]));
  opt('#f-est', 'Todos', [['MA', 'Maranhão'], ['PI', 'Piauí']]);
  opt('#f-set', 'Todos', [...new Set(rows.map(r => r.p))].sort().map(x => [x, x]));
  sync();
}

function sync() {
  opt('#f-reg', 'Todas', REGS.filter(r => !F.est || r.e == F.est).map(r => [r.k, r.l]));
  $('#f-ano').value = F.ano;
  $('#f-mes').value = F.mes;
  $('#f-est').value = F.est;
  $('#f-reg').value = F.reg;
  $('#f-set').value = F.set;
}

[['ano', '#f-ano'], ['mes', '#f-mes'], ['est', '#f-est'], ['reg', '#f-reg'], ['set', '#f-set']]
  .forEach(([k, id]) => $(id).onchange = e => {
    F[k] = e.target.value;
    if (k == 'est' && F.reg && F.reg.split('|')[1] != F.est) F.reg = '';
    if (k == 'reg' && F.reg) F.est = F.reg.split('|')[1];
    sync(); render();
  });

$('#clr').onclick = () => { F = { ano: '', mes: '', est: '', reg: '', set: '' }; sync(); render(); };

/* NAVEGAÇÃO */
$('#nav').innerHTML = PAGES.map(p => `<button>${p[0]}</button>`).join('');
document.querySelectorAll('#nav button').forEach((b, i) => b.onclick = () => { page = i; render(); });

/* EXPORTAR CSV */
$('#csv').onclick = () => {
  const c = 'Regional;Estado;Processo;Periodo;Meta;Medicao_dpl;Medicao_validada;Boletim\n'
    + filt().map(r => [r.reg, r.e, r.p, r.m, r.meta, r.dpl, r.val, r.bol].join(';').replace(/\./g, ',')).join('\n');
  const l = document.createElement('a');
  l.href = URL.createObjectURL(new Blob(['\ufeff' + c], { type: 'text/csv' }));
  l.download = 'dados_filtrados.csv';
  l.click();
};

/* UPLOAD MANUAL */
$('#up').onchange = async e => {
  try {
    const w = XLSX.read(await e.target.files[0].arrayBuffer(), { cellDates: true });
    rows = XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]]).map(norm);
    F = { ano: '', mes: '', est: '', reg: '', set: '' };
    build(); render();
  } catch (x) {
    alert('Não foi possível ler o arquivo.');
  }
};

/* INICIALIZAÇÃO */
Chart.defaults.font.family = 'Inter,system-ui,sans-serif';

async function init() {
  try {
    const r = await fetch('dados_boletim.xlsx');
    if (!r.ok) throw 0;
    const w = XLSX.read(await r.arrayBuffer(), { cellDates: true });
    rows = XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]]).map(norm);
  } catch (x) {
    loadErr = true;
  }
  build(); render();
}

init();