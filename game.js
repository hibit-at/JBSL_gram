'use strict';
// 座標はすべてBlenderモデルの1単位=1マス。yは画面に合わせて下向き。
const W = 16, H = 12;
const COL = { o: '#ed7629', w: '#ffffff', k: '#232a34' };
// logo_original.blend の Cube 〜 Cube.005 の前面形状(回転中心を原点にしたもの)
const PIECES = [
  { c: 'o', p: [[0,2],[-2,0],[0,-2],[2,-2],[0,0]] },
  { c: 'o', p: [[-2,2],[0,0],[0,-2],[2,0],[0,2]] },
  { c: 'w', p: [[1,1],[1,-1],[-1,1]] },
  { c: 'w', p: [[-1,-1],[-1,1],[1,-1]] },
  { c: 'k', p: [[-2,1],[1,-2],[2,-1],[0,1]] },
  { c: 'k', p: [[-1,2],[-2,1],[0,-1],[2,-1]] },
];
// Quiz_Panels/geometry.json の輪郭(y上向き)
const QUIZ = [
  ['swan','白鳥',[[4,0],[2,0],[2,2],[-2,2],[0,4],[0,6],[-2,6],[0,8],[2,6],[2,4],[3,5],[4,4],[5,5],[6,4],[4,2]]],
  ['snowboard','スノーボード',[[6,-4],[4,-2],[4,0],[2,0],[0,2],[4,2],[4,4],[6,2],[8,2],[6,0],[6,-2],[7,-3],[9,-3],[6,-6],[5,-5]]],
  ['cat','ねこ',[[2,0],[4,2],[2,2],[4,4],[4,6],[2,6],[4,8],[6,6],[8,6],[6,4],[6,2],[8,2],[5,-1],[4,0],[3,-1]]],
  ['australia','オーストラリア',[[8,-2],[6,0],[4,0],[3,-1],[1,1],[3,3],[5,3],[4,2],[6,2],[6,4],[8,2],[10,2],[10,0]]],
  ['wave','波',[[6,2],[2,2],[5,5],[6,4],[6,6],[4,6],[3,5],[2,6],[4,8],[6,8],[8,6],[8,0]]],
  ['iguanodon','イグアノドン',[[6,2],[2,2],[3,3],[1,3],[3,5],[5,5],[6,4],[7,5],[8,4],[10,4],[12,2],[12,0],[10,2],[8,2],[8,0]]],
].map(([name, jp, o]) => {
  const p = o.map(([x, y]) => [x, -y]), b = bbox(p);
  const dx = Math.round(W/2 - (b[0]+b[2])/2), dy = Math.round(H/2 - (b[1]+b[3])/2);
  return { name, jp, p: p.map(([x, y]) => [x+dx, y+dy]) };
});

function $(id) { return document.getElementById(id); }
function bbox(p) {
  const x = p.map(v => v[0]), y = p.map(v => v[1]);
  return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
}
function pts(p) { return p.map(v => v.join()).join(' '); }
function rotated(i, r) {
  let p = PIECES[i].p;
  for (; r > 0; r--) p = p.map(([x, y]) => [-y, x]);
  return p;
}
function at(i, s) { return rotated(i, s.r).map(([x, y]) => [x+s.x, y+s.y]); }
function inside(p, x, y) {
  let r = false;
  for (let i = 0, j = p.length-1; i < p.length; j = i++) {
    const [a, b] = p[i], [c, d] = p[j];
    if ((b > y) !== (d > y) && x < (c-a)*(y-b)/(d-b)+a) r = !r;
  }
  return r;
}
// 辺は格子線か45度線だけなので、1マスを対角線で4分割した三角形の集合として厳密に表せる
const TRI = [[.5,.17],[.83,.51],[.5,.83],[.17,.49]];
function cells(p) {
  const [x0, y0, x1, y1] = bbox(p), out = [];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++)
    TRI.forEach(([a, b], t) => { if (inside(p, x+a, y+b)) out.push([x, y, t]); });
  return out;
}
// 置き場所によらず比べられるよう左上に寄せた文字列にする
function shapeKey(cs) {
  const x0 = Math.min(...cs.map(c => c[0])), y0 = Math.min(...cs.map(c => c[1]));
  return cs.map(([x, y, t]) => [x-x0, y-y0, t].join()).sort().join(' ');
}

let quiz = null, placed, order = [], shownAt = 0, rot, held = null, hover = null, lastPlaced = 0, done = false, msgTimer;

// スピードラン。最初のお題を選んだ時刻t0から実時間で計り、全クリアまで(お題選択中や再読み込みの間も)止めない
// splitsは完成順の [お題名, 到達時間ミリ秒]
let run = { t0: null, splits: [] };
try {
  const r = JSON.parse(localStorage.getItem('jbsl-gram-run'));
  if (r && typeof r.t0 === 'number' && Array.isArray(r.splits)) run = r;
} catch {}
function saveRun() { try { localStorage.setItem('jbsl-gram-run', JSON.stringify(run)); } catch {} }
function isCleared(q) { return run.splits.some(s => s[0] === q.name); }
function allCleared() { return run.splits.length === QUIZ.length; }
function elapsed() {
  if (run.t0 === null) return 0;
  return allCleared() ? run.splits[QUIZ.length-1][1] : Math.max(0, Date.now() - run.t0);
}
function fmt(ms) {
  const c = Math.floor(ms/10), h = Math.floor(c/360000), m = Math.floor(c/6000) % 60, z = n => String(n).padStart(2, '0');
  return (h ? `${h}:${z(m)}` : m) + `:${z(Math.floor(c/100) % 60)}.${z(c % 100)}`;
}
function drawSplits(flash) {
  const n = run.splits.length;
  $('splitRows').innerHTML = QUIZ.map((_, i) => {
    const s = run.splits[i], now = i === n && run.t0 !== null;
    const jp = s ? QUIZ.find(q => q.name === s[0]).jp : now && quiz && !isCleared(quiz) ? quiz.jp : '';
    // 上段が到達時間、下段がその区間にかかった時間
    const tm = s ? `${fmt(s[1])}<small>+${fmt(s[1] - (i ? run.splits[i-1][1] : 0))}</small>` : '–';
    return `<li class="${now ? 'now' : ''}${flash && i === n-1 ? ' flash' : ''}"><i>${i+1}</i><span class="nm">${jp}</span><span class="tm">${tm}</span></li>`;
  }).join('');
  $('timer').className = run.t0 === null ? 'idle' : allCleared() ? 'fin' : '';
}
function frame() {
  const t = fmt(elapsed());
  if ($('timerV').textContent !== t) $('timerV').textContent = t;
  requestAnimationFrame(frame);
}

function silSvg(svg, p) {
  const [a, b, c, d] = bbox(p);
  svg.setAttribute('viewBox', `${a} ${b} ${c-a} ${d-b}`);
  svg.innerHTML = `<polygon points="${pts(p)}"/>`;
}
function showTitle() {
  $('game').hidden = true; $('clear').hidden = true; $('title').hidden = false;
  held = null; quiz = null; done = false;
  endCutIn();
  drawSplits();
  $('cards').innerHTML = '';
  $('result').hidden = !allCleared();
  $('wipe').hidden = run.t0 === null;
  $('notice').hidden = run.t0 !== null;
  for (const q of QUIZ) {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<b>${q.name}</b><small>${q.jp}</small><span class="pic"><svg></svg><img src="img/${q.name}.jpg" alt=""></span>`
      + (isCleared(q) ? '<span class="done">完成</span>' : '');
    silSvg(b.querySelector('svg'), q.p);
    b.onclick = () => start(q);
    $('cards').append(b);
  }
}
function start(q) {
  const first = run.t0 === null;
  if (first) { run.t0 = Date.now(); saveRun(); }
  quiz = q; placed = Array(6).fill(null); order = []; rot = Array(6).fill(0); held = hover = null; done = false;
  $('title').hidden = true; $('clear').hidden = true; $('game').hidden = false;
  $('en').textContent = q.name; $('jp').textContent = q.jp;
  $('art').src = $('clearArt').src = `img/${q.name}.jpg`;
  silSvg($('sil'), q.p);
  drawSplits(); draw();
  scrollTo(0, 0);
  if (first) cutIn();
}
// 計測開始のカットイン。計測はすでに動いているので、操作は妨げない(CSSでpointer-events:none)
let cutTimer;
function endCutIn() {
  clearTimeout(cutTimer);
  $('cutin').hidden = true; $('cutin').innerHTML = '';
  $('splits').classList.remove('go');
}
function cutIn() {
  endCutIn();
  $('cutin').innerHTML = '<div class="band"><div class="stream">' + PIECES.map((pc, i) =>
    `<svg class="piece" viewBox="-2.2 -2.2 4.4 4.4" style="--i:${i}"><polygon points="${pts(pc.p)}" fill="${COL[pc.c]}"/></svg>`).join('')
    + '</div><div class="words"><b>START!</b><span>計測開始</span></div></div>';
  $('cutin').hidden = false;
  $('splits').classList.add('go');
  cutTimer = setTimeout(endCutIn, 700);
}
function say(t, bad) {
  clearTimeout(msgTimer);
  $('msg').className = bad ? 'bad' : '';
  $('msg').innerHTML = t ? `<span>${t}</span>` : '';
  if (bad) msgTimer = setTimeout(hint, 1600);
}
function hint() {
  if (done) say('');
  else if (held) say('クリックで決定 / 右クリックでキャンセル / ホイールで回転');
  else if (hover !== null) say('クリックで使用パネルに戻す');
  else say(placed.every(Boolean) ? 'お題とちがうようです。盤面のパネルをクリックすると戻せます' : '使用パネルから未使用のパネルを選んでください');
}

function clampHeld() {
  const [a, b, c, d] = bbox(rotated(held.i, rot[held.i]));
  held.x = Math.min(W-c, Math.max(-a, held.x));
  held.y = Math.min(H-d, Math.max(-b, held.y));
}
function snap() { return { x: Math.round(held.x), y: Math.round(held.y), r: rot[held.i] }; }
function canPlace() {
  const used = new Set();
  placed.forEach((s, i) => { if (s) cells(at(i, s)).forEach(c => used.add(c.join())); });
  return !cells(at(held.i, snap())).some(c => used.has(c.join()));
}

function draw() { drawBoard(); drawTray(); hint(); }
function drawBoard() {
  let h = '<g fill="#b9c1bb">';
  for (let x = 0; x <= W; x++) for (let y = 0; y <= H; y++) h += `<circle cx="${x}" cy="${y}" r=".04"/>`;
  h += '</g>';
  placed.forEach((s, i) => {
    if (s) h += `<g class="piece placed${hover === i ? ' hover' : ''}"><polygon points="${pts(at(i, s))}" fill="${COL[PIECES[i].c]}"/></g>`;
  });
  if (held) {
    const bad = canPlace() ? '' : ' bad', s = { x: held.x, y: held.y, r: rot[held.i] };
    h += `<g class="piece drag${bad}"><polygon points="${pts(at(held.i, s))}" fill="${COL[PIECES[held.i].c]}"/></g>`
       + `<polygon class="ghost${bad}" points="${pts(at(held.i, snap()))}"/>`;
  }
  $('board').innerHTML = h;
}
function drawTray() {
  $('tray').innerHTML = '';
  PIECES.forEach((pc, i) => {
    const b = document.createElement('button'), p = rotated(i, rot[i]), [x0, y0, x1, y1] = bbox(p);
    b.className = 'slot' + (placed[i] ? ' used' : '') + (held && held.i === i ? ' held' : '');
    b.disabled = !!placed[i] || done;
    b.setAttribute('aria-label', `パネル${i+1}${placed[i] ? '(使用中)' : ''}`);
    b.innerHTML = `<svg viewBox="${(x0+x1)/2-2.2} ${(y0+y1)/2-2.2} 4.4 4.4" class="piece slotpic"><polygon points="${pts(p)}" fill="${COL[pc.c]}"/></svg>`;
    b.onclick = () => select(i);
    $('tray').append(b);
  });
  $('count').textContent = `残り ${placed.filter(s => !s).length}`;
  for (const id of ['rotL','rotR','cancel','ok']) $(id).disabled = !held;
  $('undo').disabled = done || !order.length;
}

function select(i) {
  if (done || placed[i]) return;
  if (held) rot[held.i] = held.r0; // 持ち替えは前のパネルのキャンセル扱い
  held = { i, x: W/2, y: H/2, r0: rot[i] }; hover = null;
  clampHeld(); draw();
}
function rotate(d) {
  if (!held) return;
  rot[held.i] = (rot[held.i] + d + 4) % 4;
  clampHeld(); draw();
}
function cancel() {
  if (!held) return;
  rot[held.i] = held.r0; held = null; draw();
}
function decide() {
  if (!held) return;
  if (!canPlace()) { say('ほかのパネルと重なっています', true); return; }
  placed[held.i] = snap(); order.push(held.i); held = null; lastPlaced = Date.now();
  draw(); check();
}
function remove(i) { placed[i] = null; order = order.filter(k => k !== i); hover = null; draw(); }
// 最後に置いたパネルから順に未使用へ戻す
function undo() { if (quiz && !done && order.length) remove(order[order.length-1]); }
function check() {
  if (!placed.every(Boolean)) return;
  if (shapeKey(placed.flatMap((s, i) => cells(at(i, s)))) !== shapeKey(cells(quiz.p))) return;
  const t = elapsed(); // 完成した瞬間の時間
  const isNew = !isCleared(quiz);
  if (isNew) { run.splits.push([quiz.name, t]); saveRun(); drawSplits(true); }
  done = true; draw();
  $('clearName').textContent = `${quiz.name} ${quiz.jp}`;
  if (isNew && allCleared()) { showAll(); return; }
  shownAt = Date.now();
  $('clear').hidden = false; $('next').focus();
}

// 全クリア演出
function showAll() {
  if ($('all').open) return;
  const calm = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const total = elapsed();
  $('allArts').innerHTML = run.splits.map(([name, t], i) => `<figure><img src="img/${name}.jpg" alt="${QUIZ.find(q => q.name === name).jp}" style="animation-delay:${.5+i*.15}s">`
    + `<figcaption>${i+1}<b>${fmt(t)}</b></figcaption></figure>`).join('');
  let h = '';
  if (!calm) for (let n = 0; n < 90; n++) {
    const pc = PIECES[n % 6], size = 16 + Math.random()*22;
    h += `<svg class="piece" viewBox="-2.2 -2.2 4.4 4.4" width="${size}" height="${size}" style="left:${Math.random()*100}%;`
      + `--dx:${Math.random()*200-100}px;--r:${Math.random()*1440-720}deg;animation-duration:${2.5+Math.random()*3}s;animation-delay:${Math.random()*3}s">`
      + `<polygon points="${pts(pc.p)}" fill="${COL[pc.c]}"/></svg>`;
  }
  $('confetti').innerHTML = h;
  $('shareMsg').textContent = '';
  prepareImage();
  $('allTime').className = '';
  $('allTime').textContent = fmt(calm ? total : 0);
  shownAt = Date.now();
  $('all').showModal();
  $('allBack').focus();
  if (calm) return;
  const t0 = performance.now();
  requestAnimationFrame(function step(now) {
    if (!$('all').open) return;
    const k = Math.min(1, Math.max(0, (now - t0)/1500));
    $('allTime').textContent = fmt(total * (1 - (1-k)**3));
    if (k < 1) requestAnimationFrame(step); else $('allTime').className = 'fin';
  });
}
// 結果の共有。Xの投稿画面はURLから画像を渡せないので、画像はクリップボード経由で貼ってもらう
let resultImg = null, resultReady = null;
function prepareImage() {
  resultImg = null;
  resultReady = makeImage().then(b => {
    resultImg = b && new File([b], 'jbsl-gram.png', { type: 'image/png' });
  }).catch(() => {});
}
// img要素を描くとfile://で開いたとき書き出せなくなるため、図形と文字だけで描く
async function makeImage() {
  const fam = getComputedStyle(document.body).fontFamily, splits = run.splits.slice(), total = fmt(elapsed());
  const jp = name => QUIZ.find(q => q.name === name);
  const all = 'JBSL-gram全クリア！クリアタイム0123456789:.' + splits.map(s => jp(s[0]).jp).join('');
  try {
    await Promise.race([Promise.all(['400', '700', '800'].map(w => document.fonts.load(`${w} 40px "M PLUS Rounded 1c"`, all))),
      new Promise(r => setTimeout(r, 3000))]);
  } catch {}
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = 1200; c.height = 675;
  const text = (t, x, y, font, color) => { g.font = `${font} ${fam}`; g.fillStyle = color; g.fillText(t, x, y); };
  const logo = (x, y, k) => {
    g.save(); g.translate(x, y); g.scale(k, k);
    for (const [col, d] of [['#ed7629', 'M2 4 0 2 2 0H4L2 2ZM6 0V2L4 4H6L8 2Z'], ['#fff', 'M6 2V0L4 2ZM2 2V4L4 2Z'],
      ['#232a34', 'M2 2 5-1 6 0 4 2ZM4 2H6L3 5 2 4Z']]) { g.fillStyle = col; g.fill(new Path2D(d)); }
    g.restore();
  };
  g.fillStyle = '#f2f3ee'; g.fillRect(0, 0, 1200, 675);
  g.globalAlpha = .1;
  for (let y = 0; y < 6; y++) for (let x = -1; x < 6; x++) logo(x*240 + (y % 2)*120, y*125, 14);
  g.globalAlpha = 1;
  logo(64, 66, 18);
  text('JBSL-gram', 240, 120, '800 54px', '#192f32');
  g.textAlign = 'right';
  text('全クリア！', 1140, 120, '800 48px', '#b94d0b');
  g.textAlign = 'center';
  text('クリアタイム', 600, 210, '400 28px', '#667474');
  text(total, 600, 330, '800 120px', '#192f32');
  splits.forEach(([name, t], i) => {
    const q = jp(name), x = 60 + i*182, [a, b, r, d] = bbox(q.p), k = Math.min(130/(r-a), 120/(d-b));
    g.fillStyle = '#fff'; g.fillRect(x, 390, 170, 235);
    g.fillStyle = '#192f32'; g.beginPath();
    q.p.forEach(([px, py]) => g.lineTo(x + 85 + (px-(a+r)/2)*k, 470 + (py-(b+d)/2)*k));
    g.fill();
    text(q.jp, x + 85, 570, '700 18px', '#667474');
    text(fmt(t), x + 85, 605, '700 26px', '#192f32');
  });
  return new Promise(r => c.toBlob(r, 'image/png'));
}
function shareText() {
  return `JBSL-gramを全クリア！\nクリアタイム ${fmt(elapsed())}\n#JBSLgram`
    + (location.protocol.startsWith('http') ? `\n${location.origin}${location.pathname}` : '');
}
async function copyImage() {
  try {
    await resultReady;
    if (!resultImg) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': resultImg })]);
    return true;
  } catch { return false; }
}
async function tweet() {
  const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText());
  const copied = await copyImage();
  $('shareMsg').textContent = copied ? '結果画像をコピーしました。投稿画面で貼り付け（Ctrl+V）すると画像つきになります。'
    : '画像を自動コピーできませんでした。「画像を保存」して投稿に添付してください。';
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  else {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' 投稿画面を開く';
    $('shareMsg').append(a);
  }
}
async function saveImage() {
  await resultReady;
  if (!resultImg) { $('shareMsg').textContent = '画像を作成できませんでした。'; return; }
  const a = document.createElement('a'), u = URL.createObjectURL(resultImg);
  a.href = u; a.download = resultImg.name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
function wipe() {
  if (!confirm('記録とタイムをリセットして、最初から始めますか？')) return;
  run = { t0: null, splits: [] };
  try { localStorage.removeItem('jbsl-gram-run'); } catch {}
  if ($('all').open) $('all').close();
  showTitle();
}

const board = $('board');
board.setAttribute('viewBox', `0 0 ${W} ${H}`);
function toBoard(e) {
  const v = new DOMPoint(e.clientX, e.clientY).matrixTransform(board.getScreenCTM().inverse());
  return [v.x, v.y];
}
function pick([x, y]) {
  const i = placed.findIndex((s, k) => s && inside(at(k, s), x, y));
  return i < 0 ? null : i;
}
function move(e) {
  if (done || !quiz) return;
  const v = toBoard(e);
  if (held) { [held.x, held.y] = v; clampHeld(); drawBoard(); }
  else {
    const h = pick(v);
    if (h !== hover) { hover = h; drawBoard(); hint(); }
  }
}
board.addEventListener('pointermove', move);
board.addEventListener('pointerleave', () => { if (hover !== null) { hover = null; drawBoard(); hint(); } });
board.addEventListener('pointerdown', e => {
  if (done || e.button !== 0) return;
  move(e);
  if (held) { if (e.pointerType !== 'touch') { e.preventDefault(); decide(); } } // タッチは指で動かし、決定ボタンで確定
  else if (hover !== null && Date.now() - lastPlaced > 350) remove(hover); // 決定のダブルクリックで消えないように
});
board.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); });
let lastWheel = 0;
board.addEventListener('wheel', e => {
  if (!held) return;
  e.preventDefault();
  if (Date.now() - lastWheel < 120 || !e.deltaY) return;
  lastWheel = Date.now(); rotate(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
// 完成と同時に画面を出すので、最後の一手の連打や押しっぱなしでボタンを押してしまわないようにする
addEventListener('click', e => {
  if (Date.now() - shownAt < 400 && e.target.closest('#clear,#all')) { e.preventDefault(); e.stopPropagation(); }
}, true);
addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.repeat) { e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && quiz) { e.preventDefault(); undo(); return; }
  if (!held || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase(), m = { arrowleft:[-1,0], arrowright:[1,0], arrowup:[0,-1], arrowdown:[0,1] }[k];
  if (m) { const s = snap(); held.x = s.x+m[0]; held.y = s.y+m[1]; clampHeld(); drawBoard(); }
  else if (k === 'q') rotate(-1);
  else if (k === 'e') rotate(1);
  else if (k === 'escape') cancel();
  else if (k === 'enter' && e.target.tagName !== 'BUTTON') decide();
  else return;
  e.preventDefault();
});
$('rotL').onclick = () => rotate(-1);
$('rotR').onclick = () => rotate(1);
$('cancel').onclick = cancel;
$('ok').onclick = decide;
$('undo').onclick = undo;
$('reset').onclick = () => start(quiz);
$('back').onclick = $('next').onclick = showTitle;
$('see').onclick = () => { $('clear').hidden = true; };
$('result').onclick = showAll;
$('wipe').onclick = $('again').onclick = wipe;
$('tweet').onclick = tweet;
$('saveImg').onclick = saveImage;
$('copyImg').onclick = async () => {
  $('shareMsg').textContent = await copyImage() ? '結果画像をコピーしました。' : '画像をコピーできませんでした。「画像を保存」をお使いください。';
};
$('allBack').onclick = () => $('all').close();
$('all').addEventListener('close', () => { $('confetti').innerHTML = ''; showTitle(); });
showTitle();
frame();
