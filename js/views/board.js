// 配置ボード (02_wireframe 4章)
// URL: #/board/<配置ID>。ID なしで開いた時は最後に開いた配置へ
// 編集すると自動保存。何も設定されていない配置は離れる時に削除 (03_data_design 6章)
import { h } from '../util/dom.js';
import { createId } from '../util/id.js';
import { debounce } from '../util/debounce.js';
import { formatShort } from '../util/date.js';
import * as storage from '../storage.js';
import { KEYS, StorageFullError } from '../storage.js';
import { getSport } from '../sports.js';
import { listPlayers, savePlayer } from '../models/players.js';
import { listBoards, getBoard, saveBoard, deleteBoard, duplicateBoard, isEmptyBoard } from '../models/boards.js';
import { listTemplates, getTemplateSlots, saveMyTemplate } from '../models/templates.js';
import { getDay, filterByAttendance } from '../models/attendance.js';
import { showToast } from '../ui/toast.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { createAvatar } from '../ui/avatar.js';
import { Viewport } from '../board/viewport.js';
import { drawCourt, courtSize } from '../board/court.js';
import { PieceLayer } from '../board/pieces.js';
import { attachStageInput } from '../board/input.js';
import { mirrorSlots } from '../board/formation.js';
import { drawStrokes, drawStroke, hitStroke, roundPoint, PEN_MIN_DISTANCE } from '../board/drawing.js';
import { History } from '../board/history.js';
import { createToolbar } from '../board/toolbar.js';
import { createDetailCard } from '../board/detail-card.js';
import { makeDraggable } from '../board/drag-ghost.js';
import { shortcutTable } from './help.js';
import { toShareData, encodeShare, shareUrl } from '../share.js';
import {
  locate, movePlayer, moveSlot, removePlayer, applyTemplate, autoFill, placedPlayers,
  guestsNeeded, fillWithGuests, pruneGuests, guestAsPlayer,
} from '../board/lineup.js';

const ZOOM_STEP = 1.25;
const MIN_ARROW_LENGTH = 8; // これより短い矢印 (px) はクリックとみなして描かない
const SNAP_RADIUS = 28; // 空き枠・他の選手に吸い付く距離 (px)
const SAVE_DELAY = 1000; // 自動保存: 最後の操作からこれだけ待って保存 (ms)
const COURT_MARGIN = 0.03; // コートの外に少しだけ出せる

const ATTENDANCE_FILTERS = [
  { id: 'all', label: '全員' },
  { id: 'yes', label: '参加' },
  { id: 'arrived', label: '現着' },
];

const clampCourt = (v) => Math.min(1 + COURT_MARGIN, Math.max(-COURT_MARGIN, v));

function updateSettings(change) {
  storage.write(KEYS.settings, { ...storage.read(KEYS.settings, {}), ...change });
}

export function render(root, [boardId]) {
  if (!boardId) {
    // 最後に開いた配置 → 無ければ最近更新した配置
    const lastId = storage.read(KEYS.settings, {}).lastBoardId;
    const last = (lastId && getBoard(lastId)) ||
      listBoards().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (last) {
      location.replace(`#/board/${encodeURIComponent(last.id)}`);
      return;
    }
    root.append(h('section', { class: 'card' },
      h('h1', {}, '配置ボード'),
      h('p', { class: 'empty' }, 'ホームから配置を選ぶか、新しく作ってください'),
      h('p', { style: 'text-align:center' }, h('a', { class: 'btn btn-primary', href: '#/home' }, 'ホームへ')),
    ));
    return;
  }

  let board = getBoard(boardId);
  const sport = board && getSport(board.sportId);
  if (!board || !sport) {
    root.append(h('section', { class: 'card' },
      h('h1', {}, '配置ボード'),
      h('p', { class: 'empty' }, 'この配置は見つかりませんでした (削除された可能性があります)'),
      h('p', { style: 'text-align:center' }, h('a', { class: 'btn btn-primary', href: '#/home' }, 'ホームへ')),
    ));
    return;
  }
  updateSettings({ lastBoardId: board.id });

  const [courtLength, courtWidth] = courtSize(sport);
  const viewport = new Viewport(courtLength / courtWidth);
  const history = new History();
  const settings = storage.read(KEYS.settings, {});
  viewport.orientation = settings.boardOrientation ?? 'auto';

  let players = listPlayers();
  let playersById = new Map(players.map((p) => [p.id, p]));
  let attendanceFilter = settings.boardAttendanceFilter ?? 'all';
  let selectedId = null; // 選択中の駒ID ("p:<選手ID>" / "m:<マーカーID>")

  /** 描いている途中の書き込み */
  let current = null;
  let lastPenPoint = null;
  let eraseRecorded = false;
  let spaceHeld = false;

  // ---- 保存 ----
  // 自動保存なので普段は何も出さない。失敗した時だけ表示する
  const saveStatus = h('span', { class: 'save-status save-error', role: 'status' });
  let saveFailed = false;

  function saveNow() {
    try {
      board = saveBoard(board);
      saveFailed = false;
      saveStatus.textContent = '';
    } catch (err) {
      saveFailed = true;
      saveStatus.textContent = '⚠ 保存できませんでした';
      showToast(err instanceof StorageFullError
        ? '保存容量がいっぱいです。写真や古い配置を削除してください'
        : '保存できませんでした', 'error', 4000);
    }
  }
  const scheduleSave = debounce(saveNow, SAVE_DELAY);

  /** 選手を ID で探す (選手名簿 → この配置の仮の選手) */
  function playerOf(id) {
    const player = playersById.get(id);
    if (player) return player;
    const guest = board.home.guests?.find((g) => g.id === id);
    return guest ? guestAsPlayer(guest, sport.id) : null;
  }

  /** データを変えたら呼ぶ: 画面を更新して自動保存を予約 */
  function commit() {
    board.home = pruneGuests(board.home);
    scheduleSave();
    renderAll();
  }

  // ---- ヘッダー (名前・日付・テンプレート・メニュー) ----
  const nameInput = h('input', {
    type: 'text', class: 'input board-name', value: board.name, maxlength: 60, 'aria-label': '配置の名前',
  });
  nameInput.addEventListener('input', () => {
    board.name = nameInput.value.trim() || board.name;
    scheduleSave();
  });

  const dateInput = h('input', { type: 'date', class: 'input', value: board.date, 'aria-label': '日付' });
  dateInput.addEventListener('change', () => {
    if (!dateInput.value) {
      dateInput.value = board.date;
      return;
    }
    board.date = dateInput.value;
    commit();
  });

  const homeSelect = h('select', { class: 'input', 'aria-label': '自チームのフォーメーション' });
  const awaySelect = h('select', { class: 'input', 'aria-label': '敵チームのフォーメーション' });

  function renderTemplateOptions() {
    const templates = listTemplates(sport);
    for (const [select, value] of [[homeSelect, board.home.templateId], [awaySelect, board.away.templateId]]) {
      const builtIn = templates.filter((t) => !t.mine);
      const mine = templates.filter((t) => t.mine);
      select.replaceChildren(...[
        h('option', { value: '' }, 'なし'),
        builtIn.length > 0 && h('optgroup', { label: '定番' }, builtIn.map((t) => h('option', { value: t.id }, t.name))),
        mine.length > 0 && h('optgroup', { label: 'マイテンプレート' }, mine.map((t) => h('option', { value: t.id }, t.name))),
      ].filter(Boolean));
      // 使っていたテンプレートが削除されていたら「なし」と表示
      select.value = templates.some((t) => t.id === value) ? value : '';
    }
  }

  homeSelect.addEventListener('change', () => {
    const templateId = homeSelect.value || null;
    record();
    const guests = (board.home.guests ?? []).map((g) => guestAsPlayer(g, sport.id));
    board.home = applyTemplate(board.home, templateId, getTemplateSlots(templateId, sport), [...players, ...guests], sport.id);
    commit();
  });
  awaySelect.addEventListener('change', () => {
    const templateId = awaySelect.value || null;
    const slots = getTemplateSlots(templateId, sport);
    record();
    board.away = {
      templateId,
      markers: slots ? mirrorSlots(slots).map((s) => ({ id: createId(), position: s.position, x: s.x, y: s.y })) : [],
    };
    commit();
  });

  const menu = h('div', { class: 'menu', hidden: true },
    h('button', { class: 'menu-item', type: 'button', onclick: () => { closeMenu(); openShare(); } }, '🔗 URL で共有'),
    h('button', { class: 'menu-item', type: 'button', onclick: () => { closeMenu(); duplicate(); } }, '複製'),
    h('button', { class: 'menu-item', type: 'button', onclick: () => { closeMenu(); openSaveTemplate(); } }, 'テンプレートとして保存'),
    h('a', { class: 'menu-item', href: '#/help/board' }, '📖 使い方'),
    h('button', { class: 'menu-item', type: 'button', onclick: () => { closeMenu(); showShortcuts(); } }, 'キーボードショートカット (?)'),
    h('button', { class: 'menu-item menu-danger', type: 'button', onclick: () => { closeMenu(); removeBoard(); } }, 'この配置を削除'),
  );
  const menuButton = h('button', { class: 'tool-button', type: 'button', 'aria-label': 'メニュー', 'aria-haspopup': 'true' }, '⋮');
  menuButton.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  function closeMenu() { menu.hidden = true; }

  const header = h('div', { class: 'board-header' },
    h('div', { class: 'board-title-row' },
      h('a', { class: 'tool-button back-link', href: '#/home', 'aria-label': 'ホームへ戻る' }, '‹'),
      h('span', { class: 'board-sport', title: sport.name }, sport.icon),
      nameInput,
      saveStatus,
      h('div', { class: 'menu-wrap' }, menuButton, menu),
    ),
    h('div', { class: 'board-settings' },
      h('label', { class: 'board-field' }, h('span', {}, '日付'), dateInput),
      h('label', { class: 'board-field' }, h('span', {}, '自'), homeSelect),
      h('label', { class: 'board-field' }, h('span', {}, '敵'), awaySelect),
    ),
  );

  async function duplicate() {
    scheduleSave.flush();
    try {
      const copy = duplicateBoard(board.id);
      showToast('複製しました');
      location.hash = `#/board/${encodeURIComponent(copy.id)}`;
    } catch {
      showToast('複製できませんでした (保存容量がいっぱいの可能性があります)', 'error', 4000);
    }
  }

  async function removeBoard() {
    if (!(await confirmDialog(`「${board.name}」を削除しますか?\nこの操作は元に戻せません。`, { title: '配置を削除', okLabel: '削除', danger: true }))) return;
    scheduleSave.cancel();
    deleteBoard(board.id);
    board = null; // 離れる時に保存しないように
    showToast('削除しました');
    location.hash = '#/home';
  }

  /** URL で共有: 配置を圧縮して URL にする */
  async function openShare() {
    scheduleSave.flush();
    let url;
    try {
      url = shareUrl(await encodeShare(toShareData(board, sport, playerOf)));
    } catch (err) {
      console.error(err);
      showToast('共有 URL を作れませんでした', 'error');
      return;
    }
    const field = h('textarea', { class: 'input share-url', rows: 4, readonly: true, 'aria-label': '共有 URL' }, url);
    const copy = h('button', { class: 'btn btn-primary', type: 'button' }, 'コピー');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        showToast('コピーしました');
      } catch {
        field.select();
        showToast('コピーできませんでした。選択されている URL を手動でコピーしてください', 'error', 4000);
      }
    });
    const footer = [copy];
    if (navigator.share) {
      const share = h('button', { class: 'btn', type: 'button' }, '送る (LINE など)');
      share.addEventListener('click', () => navigator.share({ title: board.name, url }).catch(() => {}));
      footer.unshift(share);
    }
    openModal({
      title: 'URL で共有',
      body: h('div', { class: 'form' },
        h('p', {}, 'この URL を開くと、同じ配置 (選手の位置・敵・ボール・書き込み) が見られます。'),
        field,
        h('p', { class: 'note' }, `${url.length}文字。写真・出欠は含まれません。URL を送った後に配置を変えても、送った URL の内容は変わりません。`),
      ),
      footer,
    });
    field.addEventListener('focus', () => field.select());
  }

  function showShortcuts() {
    openModal({
      title: 'キーボードショートカット',
      body: h('div', {}, shortcutTable(), h('p', { class: 'note' }, h('a', { href: '#/help' }, '📖 使い方をすべて見る'))),
    });
  }

  function openSaveTemplate() {
    const homePoints = [
      ...board.home.slots.map(({ position, x, y }) => ({ position, x, y })),
      ...board.home.free.map((f) => ({
        position: playerOf(f.playerId)?.sports?.[sport.id]?.positions?.[0] || '?', x: f.x, y: f.y,
      })),
    ];
    const awayPoints = board.away.markers.map(({ position, x, y }) => ({ position, x, y }));
    let side = homePoints.length > 0 ? 'home' : 'away';

    const nameField = h('input', { type: 'text', class: 'input', maxlength: 40, value: '', placeholder: '例: うちの 3-4-3', id: 'template-name' });
    const error = h('p', { class: 'field-error', hidden: true });
    const sideField = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': '保存する並び' },
      [['home', `自チーム (${homePoints.length})`], ['away', `敵チーム (${awayPoints.length})`]].map(([id, label]) => {
        const input = h('input', { type: 'radio', name: 'template-side', value: id, checked: side === id });
        input.addEventListener('change', () => { side = id; });
        return h('label', {}, input, h('span', {}, label));
      }),
    );
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, '保存');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'キャンセル');
    const modal = openModal({
      title: 'テンプレートとして保存',
      body: h('div', { class: 'form' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'template-name' }, '名前'), nameField),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, '保存する並び'), sideField),
        h('p', { class: 'note' }, 'ポジションの位置だけを保存します (選手は保存しません)。自チーム・敵チームのどちらにも使えます'),
        error,
      ),
      footer: [cancel, save],
    });
    cancel.addEventListener('click', () => modal.close());
    save.addEventListener('click', () => {
      const points = side === 'home' ? homePoints : awayPoints;
      if (!nameField.value.trim()) {
        error.textContent = '名前を入力してください';
        error.hidden = false;
        return;
      }
      if (points.length === 0) {
        error.textContent = 'コートに何も置かれていません';
        error.hidden = false;
        return;
      }
      try {
        saveMyTemplate(sport.id, nameField.value, points, side);
      } catch {
        error.textContent = '保存できませんでした (保存容量がいっぱいの可能性があります)';
        error.hidden = false;
        return;
      }
      modal.close();
      renderTemplateOptions();
      showToast('テンプレートを保存しました');
    });
    nameField.focus();
  }

  // ---- ツールバー ----
  const tool = {
    mode: 'move',
    color: sport.penColors.includes(settings.lastPenColor) || settings.lastPenColor?.startsWith('#')
      ? settings.lastPenColor : sport.penColors[1],
    width: settings.lastPenWidth ?? 2,
  };
  const toolbar = createToolbar({
    colors: sport.penColors,
    initial: tool,
    onChange: (state) => {
      const styleChanged = state.color !== tool.color || state.width !== tool.width;
      Object.assign(tool, state);
      updateCursor();
      if (styleChanged) updateSettings({ lastPenColor: tool.color, lastPenWidth: tool.width });
    },
    onUndo: undo,
    onRedo: redo,
    onClear: clearDrawings,
    onToggleBall: toggleBall,
  });

  // ---- コート ----
  const canvas = h('canvas', { class: 'board-court', 'aria-hidden': 'true' });
  const pieceContainer = h('div', { class: 'board-pieces' });
  const detailCard = createDetailCard();
  const zoomLabel = h('button', { class: 'zoom-button zoom-label', type: 'button', title: '100% に戻す' }, '100%');
  const zoomControls = h('div', { class: 'zoom-controls', dataset: { stageIgnore: '' } },
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '拡大', onclick: () => zoomStep(ZOOM_STEP) }, '＋'),
    zoomLabel,
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '縮小', onclick: () => zoomStep(1 / ZOOM_STEP) }, '−'),
    h('button', { class: 'zoom-button', type: 'button', 'aria-label': '全体表示', title: '全体表示', onclick: fitAll }, '⛶'),
  );
  const rotateButton = h('button', { class: 'zoom-button', type: 'button', onclick: rotate }, '⟳');
  const maximizeButton = h('button', { class: 'zoom-button', type: 'button', onclick: () => setMaximized(!maximized) });
  zoomControls.append(rotateButton, maximizeButton);

  /** 回転: 横長 (自陣が左) ⇔ 縦長 (自陣が手前=下)。選んだ向きは次に開いた時も使う */
  function rotate() {
    const orientation = viewport.portrait ? 'landscape' : 'portrait';
    viewport.setOrientation(orientation);
    updateSettings({ boardOrientation: orientation });
    updateRotateButton();
    requestDraw();
  }

  function updateRotateButton() {
    const label = viewport.portrait ? '横向きにする (自陣が左) (R)' : '縦向きにする (自陣が手前) (R)';
    rotateButton.setAttribute('aria-label', label);
    rotateButton.title = label;
  }
  const stage = h('div', { class: 'board-stage' }, canvas, pieceContainer, detailCard.el, zoomControls);

  // ---- ベンチ ----
  const benchList = h('div', { class: 'bench-list' });
  const bench = h('div', { class: 'bench', 'aria-label': 'ベンチ' }, h('span', { class: 'bench-label' }, 'ベンチ'), benchList);

  // ---- 選手一覧パネル (PC: 左、スマホ: 下から引き出す) ----
  const panelToggle = h('button', { class: 'panel-toggle', type: 'button', 'aria-expanded': 'false' });
  const panelBody = h('div', { class: 'panel-body' });
  const panel = h('aside', { class: 'board-panel', 'aria-label': '選手一覧' }, panelToggle, panelBody);
  panelToggle.addEventListener('click', () => setPanelOpen(!panel.classList.contains('is-open')));
  function setPanelOpen(open) {
    panel.classList.toggle('is-open', open);
    panelToggle.setAttribute('aria-expanded', String(open));
    panelToggle.textContent = panelToggle.textContent.replace(/^[▲▼]/, open ? '▼' : '▲');
  }

  root.append(h('div', { class: 'board' },
    header,
    toolbar.el,
    h('div', { class: 'board-body' },
      panel,
      h('div', { class: 'board-main' }, stage, bench),
    ),
  ));

  // ---- 表示 ----
  const pieces = new PieceLayer(pieceContainer, viewport);

  function sportPlayers() {
    return players.filter((p) => sport.id in (p.sports ?? {}));
  }

  function renderAll() {
    renderPieces();
    renderBench();
    renderPanel();
    renderTemplateOptions();
    updateHistoryButtons();
    requestDraw();
  }

  function renderPieces() {
    pieces.clear();
    board.home.slots.forEach((slot, i) => {
      const player = slot.playerId && playerOf(slot.playerId);
      if (player) pieces.addPlayer(`p:${player.id}`, player, sport.id, slot.x, slot.y);
      else pieces.addSlot(`s:${i}`, slot.position, slot.x, slot.y);
    });
    for (const f of board.home.free) {
      const player = playerOf(f.playerId);
      if (player) pieces.addPlayer(`p:${player.id}`, player, sport.id, f.x, f.y);
    }
    for (const m of board.away.markers) pieces.addMarker(`m:${m.id}`, m.position, m.x, m.y);
    if (board.ball) pieces.addBall('b:ball', board.ball.x, board.ball.y);
    toolbar.setBallState(!!board.ball);
    pieces.layout();
    if (selectedId && !pieces.get(selectedId)) {
      selectedId = null;
      detailCard.hide();
    }
    pieces.select(selectedId);
  }

  function renderBench() {
    const items = board.home.bench.map((id) => playerOf(id)).filter(Boolean);
    benchList.replaceChildren(...items.map((player) => {
      const item = h('button', { class: `bench-item${player.guest ? ' is-guest' : ''}`, type: 'button', title: player.name, dataset: { playerId: player.id } },
        createAvatar(player, { sportId: sport.id, size: 36 }),
        h('span', { class: 'bench-name' }, player.name),
      );
      bindPlayerDrag(item, player);
      return item;
    }));
    if (items.length === 0) benchList.append(h('span', { class: 'bench-empty' }, 'ここにドロップで控えに'));
  }

  function renderPanel() {
    const day = getDay(board.date);
    const all = sportPlayers();
    const visible = filterByAttendance(all, day, attendanceFilter);
    const placed = new Set(placedPlayers(board.home));
    const unregistered = players.filter((p) => !(sport.id in (p.sports ?? {})));
    const hasEmptySlot = board.home.slots.some((s) => !s.playerId);
    const shortage = guestsNeeded(board.home, sport.teamSize);

    panelToggle.textContent = `${panel.classList.contains('is-open') ? '▼' : '▲'} 選手一覧 (${visible.length}人)`;

    const filterButtons = h('div', { class: 'segmented segmented-small', role: 'radiogroup', 'aria-label': '出欠で絞り込み' },
      ATTENDANCE_FILTERS.map((f) => {
        const input = h('input', { type: 'radio', name: 'attendance-filter', value: f.id, checked: attendanceFilter === f.id });
        input.addEventListener('change', () => {
          attendanceFilter = f.id;
          updateSettings({ boardAttendanceFilter: f.id });
          renderPanel();
        });
        return h('label', {}, input, h('span', {}, f.label));
      }),
    );

    const list = h('ul', { class: 'panel-list' }, visible.map((player) => {
      const info = player.sports[sport.id];
      const where = locate(board.home, player.id);
      const item = h('li', {},
        h('button', { class: `panel-player${placed.has(player.id) ? ' is-placed' : ''}`, type: 'button', dataset: { playerId: player.id } },
          createAvatar(player, { sportId: sport.id, size: 32 }),
          h('span', { class: 'panel-player-name' }, player.name),
          h('span', { class: 'panel-player-pos' }, info.positions.join(',')),
          where && h('span', { class: 'panel-player-where' }, where.kind === 'bench' ? 'ベンチ' : 'コート'),
        ),
      );
      bindPlayerDrag(item.firstChild, player);
      return item;
    }));
    if (visible.length === 0) {
      let message = '条件に合う選手がいません';
      if (all.length === 0) message = `${sport.name}に登録された選手がいません。下の「未登録」から追加できます`;
      else if (Object.keys(day).length === 0) message = `${formatShort(board.date)} の出欠が未登録です。「出欠」タブで登録すると絞り込めます`;
      list.append(h('li', { class: 'note panel-empty' }, message));
    }

    const unregisteredList = h('details', { class: 'panel-section' },
      h('summary', {}, `未登録 (${unregistered.length}人)`),
      unregistered.length === 0
        ? h('p', { class: 'note' }, 'いません')
        : h('ul', { class: 'panel-list' }, unregistered.map((player) => h('li', { class: 'panel-unregistered' },
          createAvatar(player, { size: 28 }),
          h('span', { class: 'panel-player-name' }, player.name),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => addToSport(player) }, '＋追加'),
        ))),
    );

    const markers = h('div', { class: 'marker-chips' }, sport.positions.map((pos) => {
      const chip = h('button', { class: 'marker-chip', type: 'button', title: `敵 ${pos.name}` }, pos.short);
      makeDraggable(chip, {
        createGhost: () => h('span', { class: 'marker' }, pos.short),
        onStart: () => setPanelOpen(false),
        onDrop: (cx, cy) => {
          const p = stagePoint(cx, cy);
          if (p) addMarker(pos.id, viewport.screenToCourt(p.x, p.y));
        },
        onTap: () => addMarker(pos.id, defaultMarkerPoint()),
      });
      return chip;
    }));

    panelBody.replaceChildren(
      h('div', { class: 'panel-section' },
        h('div', { class: 'panel-heading' }, h('h2', {}, '自チーム'), filterButtons),
        hasEmptySlot && h('button', { class: 'btn btn-small panel-autofill', type: 'button', onclick: autoFillSlots },
          '空き枠をおまかせで埋める'),
        shortage > 0 && h('button', {
          class: 'btn btn-small panel-autofill', type: 'button', onclick: fillShortage,
          title: 'その配置の中だけの「仮の選手」を置きます (選手名簿には追加されません)',
        }, `足りない${shortage}人を仮の選手で埋める`),
        list,
      ),
      unregisteredList,
      h('div', { class: 'panel-section' },
        h('h2', {}, '敵マーカー'),
        h('p', { class: 'note' }, 'ドラッグ or タップで置く。コートの外へドラッグで削除'),
        markers,
      ),
    );
  }

  function addToSport(player) {
    const updated = { ...player, sports: { ...player.sports, [sport.id]: { number: '', positions: [] } } };
    try {
      savePlayer(updated);
    } catch {
      showToast('保存できませんでした', 'error');
      return;
    }
    refreshPlayers();
    renderAll();
    showToast(`${player.name} を${sport.name}に追加しました`);
  }

  function refreshPlayers() {
    players = listPlayers();
    playersById = new Map(players.map((p) => [p.id, p]));
  }

  /** 足りない人数を仮の選手で埋める */
  function fillShortage() {
    const need = guestsNeeded(board.home, sport.teamSize);
    if (need === 0) return;
    record();
    board.home = fillWithGuests(board.home, { teamSize: sport.teamSize, createId, spots: openSpots(need) });
    commit();
    showToast(`仮の選手を${need}人置きました (外すと消えます)`);
  }

  function autoFillSlots() {
    const candidates = filterByAttendance(sportPlayers(), getDay(board.date), attendanceFilter);
    record();
    board.home = autoFill(board.home, candidates, sport.id);
    commit();
  }

  // ---- 描画 ----
  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let renderQueued = false;

  function draw() {
    renderQueued = false;
    drawCourt(ctx, sport, viewport, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrokes(ctx, board.drawings, viewport);
    if (current) drawStroke(ctx, current, viewport);
    pieces.layout();
    zoomLabel.textContent = `${Math.round(viewport.zoom * 100)}%`;
  }

  // requestAnimationFrame でまとめて描く。タブが裏にある等で rAF が止まっている時のために setTimeout も併用
  function requestDraw() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => renderQueued && draw());
    setTimeout(() => renderQueued && draw(), 50);
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    viewport.resize(rect.width, rect.height);
    updateRotateButton();
    draw();
  }

  function zoomStep(factor) {
    viewport.zoomBy(factor);
    requestDraw();
  }

  function fitAll() {
    viewport.fit();
    requestDraw();
  }

  zoomLabel.addEventListener('click', () => {
    viewport.setZoom(1);
    requestDraw();
  });

  // ---- 元に戻す / やり直し ----
  function snapshot() {
    return { home: board.home, away: board.away, ball: board.ball ?? null, drawings: board.drawings };
  }

  function record() {
    history.push(snapshot());
  }

  function restore(state) {
    Object.assign(board, state);
    commit();
  }

  function undo() {
    const state = history.undo(snapshot());
    if (state) restore(state);
  }

  function redo() {
    const state = history.redo(snapshot());
    if (state) restore(state);
  }

  function updateHistoryButtons() {
    toolbar.setHistoryState(history.canUndo, history.canRedo, board.drawings.length > 0);
  }

  function clearDrawings() {
    if (board.drawings.length === 0) return;
    record();
    board.drawings = [];
    commit();
    showToast('書き込みを全消去しました (↶ で戻せます)');
  }

  // ---- 書き込み ----
  function startDrawing(sx, sy) {
    if (tool.mode === 'eraser') {
      eraseRecorded = false;
      eraseAt(sx, sy);
      return;
    }
    const point = roundPoint(viewport.screenToCourt(sx, sy));
    current = {
      id: createId(),
      type: tool.mode === 'arrow' ? 'arrow' : 'pen',
      color: tool.color,
      width: tool.width,
      points: tool.mode === 'arrow' ? [point, point] : [point],
    };
    lastPenPoint = { x: sx, y: sy };
    requestDraw();
  }

  function continueDrawing(sx, sy) {
    if (tool.mode === 'eraser') {
      eraseAt(sx, sy);
      return;
    }
    if (!current) return;
    const point = roundPoint(viewport.screenToCourt(sx, sy));
    if (current.type === 'arrow') {
      current.points[1] = point;
    } else {
      if (Math.hypot(sx - lastPenPoint.x, sy - lastPenPoint.y) < PEN_MIN_DISTANCE) return;
      current.points.push(point);
      lastPenPoint = { x: sx, y: sy };
    }
    requestDraw();
  }

  function finishDrawing() {
    if (!current) return;
    const stroke = current;
    current = null;
    if (stroke.type === 'arrow') {
      const [a, b] = stroke.points.map(([x, y]) => viewport.courtToScreen(x, y));
      if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_ARROW_LENGTH) {
        requestDraw();
        return;
      }
    }
    record();
    board.drawings = [...board.drawings, stroke];
    commit();
  }

  function cancelDrawing() {
    current = null;
    requestDraw();
  }

  function eraseAt(sx, sy) {
    const remaining = board.drawings.filter((s) => !hitStroke(s, sx, sy, viewport));
    if (remaining.length === board.drawings.length) return;
    if (!eraseRecorded) {
      record();
      eraseRecorded = true;
    }
    board.drawings = remaining;
    commit();
  }

  // ---- 選手・マーカーの配置 ----

  /** 画面 (client) 座標 → ステージ座標。ステージの外なら null */
  function stagePoint(cx, cy) {
    const r = stage.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    return { x: cx - r.left, y: cy - r.top };
  }

  function overBench(cx, cy) {
    const r = bench.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }

  /** ベンチのどの位置に入れるか (x 座標から) */
  function benchIndexAt(cx, excludeId) {
    const items = [...benchList.querySelectorAll('.bench-item')].filter((el) => el.dataset.playerId !== excludeId);
    const index = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return cx < r.left + r.width / 2;
    });
    return index < 0 ? items.length : index;
  }

  /**
   * 選手をコート上の (sx, sy) に置く
   * 近くに他の選手 → 入れ替え / 空き枠 → 枠に入る / それ以外 → その位置 (枠の選手なら枠ごと移動)
   */
  function dropPlayerOnCourt(playerId, sx, sy) {
    const self = `p:${playerId}`;
    const other = pieces.nearest(sx, sy, SNAP_RADIUS, (id) => id.startsWith('p:') && id !== self);
    const emptySlot = pieces.nearest(sx, sy, SNAP_RADIUS, (id) => id.startsWith('s:'));
    const c = viewport.screenToCourt(sx, sy);
    const where = locate(board.home, playerId);
    if (other) {
      board.home = movePlayer(board.home, playerId, { kind: 'player', playerId: other.slice(2) });
    } else if (emptySlot) {
      board.home = movePlayer(board.home, playerId, { kind: 'slot', index: Number(emptySlot.slice(2)) });
    } else if (where?.kind === 'slot') {
      board.home = moveSlot(board.home, where.index, clampCourt(c.x), clampCourt(c.y));
    } else {
      board.home = movePlayer(board.home, playerId, { kind: 'free', x: clampCourt(c.x), y: clampCourt(c.y) });
    }
  }

  /** 一覧・ベンチの選手にドラッグとタップを付ける */
  function bindPlayerDrag(el, player) {
    makeDraggable(el, {
      createGhost: () => createAvatar(player, { sportId: sport.id, size: 44 }),
      onStart: () => {
        setPanelOpen(false);
        showPlayerCard(player, null);
      },
      onDrop: (cx, cy) => {
        detailCard.hide();
        const p = stagePoint(cx, cy);
        const where = locate(board.home, player.id);
        if (p) {
          record();
          dropPlayerOnCourt(player.id, p.x, p.y);
        } else if (overBench(cx, cy)) {
          record();
          board.home = movePlayer(board.home, player.id, { kind: 'bench', index: benchIndexAt(cx, player.id) });
        } else if (where?.kind === 'bench') {
          record();
          board.home = removePlayer(board.home, player.id);
        } else {
          return;
        }
        commit();
      },
      onTap: () => {
        selectedId = `p:${player.id}`;
        pieces.select(selectedId);
        showPlayerCard(player, playerActions(player));
      },
    });
  }

  function playerActions(player) {
    const where = locate(board.home, player.id);
    const act = (label, fn) => ({
      label,
      onClick: () => {
        record();
        fn();
        detailCard.hide();
        commit();
      },
    });
    const toCourt = act('コートに出す', () => {
      const empty = board.home.slots.findIndex((s) => !s.playerId);
      board.home = empty >= 0
        ? movePlayer(board.home, player.id, { kind: 'slot', index: empty })
        : movePlayer(board.home, player.id, { kind: 'free', ...openSpot() });
    });
    const toBench = act('ベンチへ', () => {
      board.home = movePlayer(board.home, player.id, { kind: 'bench' });
    });
    const remove = act('外す', () => {
      board.home = removePlayer(board.home, player.id);
    });
    if (!where) return [toCourt, toBench];
    if (where.kind === 'bench') return [toCourt, remove];
    return [toBench, remove];
  }

  /** 自陣で、他の選手と重ならない場所 */
  function openSpot() {
    return openSpots(1)[0];
  }

  /** 自陣で、他の選手とも互いにも重ならない場所を count 個 */
  function openSpots(count) {
    const taken = [...pieces.items.values()].map(({ x, y }) => ({ x, y }));
    const result = [];
    for (let i = 0; i < 30 && result.length < count; i++) {
      const spot = { x: 0.2 + (i % 5) * 0.06, y: 0.2 + Math.floor(i / 5) * 0.12 };
      if (!taken.some((t) => Math.hypot(t.x - spot.x, (t.y - spot.y) / 2) < 0.04)) {
        result.push(spot);
        taken.push(spot);
      }
    }
    while (result.length < count) result.push({ x: 0.25, y: 0.5 });
    return result;
  }

  function showPlayerCard(player, actions) {
    detailCard.showPlayer({ player, sport, date: board.date, attendance: getDay(board.date)[player.id], actions });
  }

  /** ボールを出す (画面の中央、コートの外なら中央) / しまう */
  function toggleBall() {
    record();
    if (board.ball) {
      board.ball = null;
    } else {
      const c = viewport.screenToCourt(viewport.width / 2, viewport.height / 2);
      const inside = c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1;
      const ball = inside ? { x: c.x, y: c.y } : { x: 0.5, y: 0.5 };
      // バレーはセンター = ネットの上で見えにくいので、自陣のネット手前に出す
      if (sport.id === 'volleyball' && Math.abs(ball.x - 0.5) < 0.05) ball.x = 0.42;
      board.ball = ball;
    }
    commit();
  }

  function addMarker(position, c) {
    record();
    board.away = {
      ...board.away,
      markers: [...board.away.markers, { id: createId(), position, x: clampCourt(c.x), y: clampCourt(c.y) }],
    };
    commit();
  }

  /** タップで敵マーカーを置く場所: 敵陣の空いている所 */
  function defaultMarkerPoint() {
    const spot = openSpot();
    return { x: 1 - spot.x, y: spot.y };
  }

  function markerById(id) {
    return board.away.markers.find((m) => m.id === id);
  }

  function removeMarker(id) {
    board.away = { ...board.away, markers: board.away.markers.filter((m) => m.id !== id) };
  }

  // ---- ステージの操作 ----
  function currentMode() {
    return spaceHeld ? 'hand' : tool.mode;
  }

  function updateCursor() {
    stage.dataset.mode = currentMode();
  }

  function onTapPiece(id) {
    selectedId = id;
    pieces.select(id);
    if (!id) {
      detailCard.hide();
    } else if (id.startsWith('p:')) {
      const player = playerOf(id.slice(2));
      if (player) showPlayerCard(player, playerActions(player));
    } else if (id.startsWith('m:')) {
      const marker = markerById(id.slice(2));
      detailCard.showMarker({
        marker, sport,
        actions: [{
          label: '削除',
          onClick: () => {
            record();
            removeMarker(marker.id);
            detailCard.hide();
            commit();
          },
        }],
      });
    } else {
      detailCard.hide();
    }
  }

  const detach = attachStageInput(stage, {
    getMode: currentMode,
    hitPiece: (target) => pieces.pieceIdFrom(target),
    pieceScreenPosition: (id) => {
      const item = pieces.get(id);
      return viewport.courtToScreen(item.x, item.y);
    },
    onPieceDragStart: (id) => {
      record();
      selectedId = id;
      pieces.select(id);
      pieces.setDragging(id, true);
      if (id.startsWith('p:')) {
        const player = playerOf(id.slice(2));
        if (player) showPlayerCard(player, null);
      } else {
        detailCard.hide();
      }
    },
    onPieceDrag: (id, sx, sy) => {
      const c = viewport.screenToCourt(sx, sy);
      pieces.move(id, clampCourt(c.x), clampCourt(c.y));
    },
    onPieceDragEnd: (id, px, py) => {
      pieces.setDragging(id, false);
      detailCard.hide();
      const r = stage.getBoundingClientRect();
      const cx = r.left + px;
      const cy = r.top + py;
      const inStage = stagePoint(cx, cy);
      const item = pieces.get(id);
      const center = viewport.courtToScreen(item.x, item.y);

      if (id === 'b:ball') {
        board.ball = inStage ? { x: item.x, y: item.y } : null;
      } else if (id.startsWith('m:')) {
        const markerId = id.slice(2);
        if (!inStage) removeMarker(markerId);
        else {
          board.away = {
            ...board.away,
            markers: board.away.markers.map((m) => (m.id === markerId ? { ...m, x: item.x, y: item.y } : m)),
          };
        }
      } else {
        const playerId = id.slice(2);
        if (overBench(cx, cy)) {
          board.home = movePlayer(board.home, playerId, { kind: 'bench', index: benchIndexAt(cx, playerId) });
        } else if (!inStage) {
          board.home = removePlayer(board.home, playerId);
        } else {
          dropPlayerOnCourt(playerId, center.x, center.y);
        }
      }
      commit();
    },
    onTap: onTapPiece,
    onDrawStart: startDrawing,
    onDrawMove: continueDrawing,
    onDrawEnd: finishDrawing,
    onDrawCancel: cancelDrawing,
    onPan: (dx, dy) => {
      viewport.panBy(dx, dy);
      requestDraw();
    },
    onZoom: (factor, x, y) => {
      viewport.zoomBy(factor, x, y);
      requestDraw();
    },
  });

  // ---- 最大化 (コートだけを画面いっぱいに) ----
  // ヘッダー・タブバー・選手一覧・ベンチを隠し、ツールバーはコートの上に浮かせる
  // ブラウザの全画面表示にも対応していれば一緒に使う (Esc で全画面を抜けたら最大化も戻す)
  let maximized = false;

  function setMaximized(on) {
    maximized = on;
    document.body.classList.toggle('board-maximized', on);
    maximizeButton.textContent = on ? '⤡' : '⤢';
    maximizeButton.setAttribute('aria-label', on ? '最大化を戻す (F)' : '最大化 (F)');
    maximizeButton.title = on ? '最大化を戻す (F)' : '最大化 (F)';
    maximizeButton.setAttribute('aria-pressed', String(on));
    if (on) {
      setPanelOpen(false);
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function onFullscreenChange() {
    if (!document.fullscreenElement && maximized) setMaximized(false);
  }

  // キーボード: Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)、スペースを押している間は手のひら、V/P/A/E/H でモード切替
  // F で最大化 / 戻す、? でショートカット一覧、Delete / Backspace で選択中の敵マーカーを削除、Esc で選択解除 (最大化中は戻す)
  function onKeyDown(e) {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!spaceHeld) {
        spaceHeld = true;
        updateCursor();
      }
    } else if (e.key === 'Escape') {
      onTapPiece(null);
      closeMenu();
      if (maximized) setMaximized(false);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId === 'b:ball') {
      record();
      board.ball = null;
      commit();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId?.startsWith('m:')) {
      record();
      removeMarker(selectedId.slice(2));
      detailCard.hide();
      commit();
    } else if (!mod && !e.altKey && e.key.toLowerCase() === 'b') {
      toggleBall();
    } else if (!mod && !e.altKey && e.key.toLowerCase() === 'r') {
      rotate();
    } else if (e.key === '?') {
      e.preventDefault();
      showShortcuts();
    } else if (!mod && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setMaximized(!maximized);
    } else if (!mod && !e.altKey) {
      const mode = toolbar.modeForKey(e.key);
      if (mode) toolbar.setMode(mode);
    }
  }

  function onKeyUp(e) {
    if (e.key === ' ') {
      spaceHeld = false;
      updateCursor();
    }
  }

  // ポップアップ (色・太さパネル、⋮ メニュー) は外を触ったら閉じる
  function onDocumentPointerDown(e) {
    if (!e.target.closest?.('.style-group')) toolbar.closePanel();
    if (!e.target.closest?.('.menu-wrap')) closeMenu();
  }

  // タブを閉じる・別のアプリに切り替える時も保存
  function onPageHide() {
    if (board) scheduleSave.flush();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  updateCursor();
  setMaximized(false);
  renderAll();
  resize();

  return () => {
    observer.disconnect();
    detach();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (maximized) setMaximized(false);
    if (!board) return; // 削除済み
    if (isEmptyBoard(board)) {
      scheduleSave.cancel();
      deleteBoard(board.id);
      updateSettings({ lastBoardId: null });
    } else {
      scheduleSave.flush();
    }
  };
}
