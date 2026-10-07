#!/usr/bin/env node
// Formation Board の MCP サーバー (stdio)
// AI (Claude Desktop / Claude Code など) から配置を作らせ、サイトで開ける共有 URL を返す
// サイトのデータ (ブラウザの localStorage) には触らない。URL を開いて「自分の配置として保存」で取り込む
//
// 環境変数 FORMATION_BOARD_URL: 共有 URL のサイトの場所 (既定: https://dill3102.github.io/formation_board/)
//   ローカルで試す時は http://localhost:8000/
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadSports, createShareUrl, readShareUrl, DEFAULT_BASE_URL } from './builder.js';

const BASE_URL = process.env.FORMATION_BOARD_URL || DEFAULT_BASE_URL;
const sports = loadSports();

const COORDINATES = [
  '座標はコートを 0〜1 で表す: x = 自チームのゴールライン 0 → 相手のゴールライン 1 (自チームは x が大きい方へ攻める)、',
  'y = 横方向 0〜1 (相手ゴールを向いて左のライン = 0、右 = 1)。センターは (0.5, 0.5)。',
  '少しだけコートの外 (-0.03〜1.03) にも置ける。',
].join('');

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

const server = new McpServer({ name: 'formation-board', version: '1.0.0' });

// ---- list_sports ----
server.registerTool('list_sports', {
  title: '対応スポーツ・ポジション・フォーメーションの一覧',
  description: [
    'Formation Board が対応しているスポーツの一覧を返す。各スポーツのポジション (id と名前)、定番フォーメーション (テンプレート) とその枠の座標、',
    'コートの寸法 (メートル)、ペンの色を含む。create_board を呼ぶ前に、使えるポジション名・フォーメーション名を確かめるのに使う。',
    COORDINATES,
  ].join(''),
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => text({
  coordinates: COORDINATES,
  sports: sports.map((s) => ({
    id: s.id,
    name: s.name,
    teamSize: s.teamSize,
    courtMeters: s.court.size,
    positions: s.positions.map((p) => ({ id: p.id, name: p.name })),
    formations: s.formations.map((f) => ({ id: f.id, name: f.name, slots: f.slots })),
    penColors: s.penColors,
    note: s.id === 'basketball' ? 'バスケのフォーメーションはオフェンスの並びなので、攻めるゴール側 (x が 0.65〜0.97) に並ぶ' : undefined,
  })),
}));

// ---- create_board ----
const point = z.tuple([z.number(), z.number()]);
const playerSchema = z.object({
  name: z.string().describe('選手の名前'),
  number: z.union([z.string(), z.number()]).optional().describe('背番号'),
  position: z.string().optional().describe('ポジション id (list_sports の positions。例: GK, DF, PG)'),
  x: z.number().optional().describe('座標 x。省略するとフォーメーションの枠に自動で入る'),
  y: z.number().optional().describe('座標 y'),
});
const moveSchema = z.object({
  target: z.string().describe('動かす対象: 自チームの選手名 / "#背番号" (例 "#10") / "away:番号" (敵マーカー。0 始まり、フォーメーションの分が先) / "ball"'),
  x: z.number(),
  y: z.number(),
});
const frameSchema = z.object({ moves: z.array(moveSchema).describe('このコマで位置が変わる駒 (書かない駒は前のコマのまま)') });

server.registerTool('create_board', {
  title: '配置を作って共有 URL を返す',
  description: [
    'スポーツの配置 (自チームの選手、敵、ボール、矢印などの書き込み、コマ送りの動き、案 (ルート)) を組み立てて、',
    'Formation Board で開ける共有 URL を返す。ユーザーは URL を開いて確認し、「自分の配置として保存」で取り込める。',
    COORDINATES,
    ' フォーメーションを指定すると、座標を省略した選手はポジションに合う枠へ自動で入る。',
    ' コマ送り: frames (または routes[].frames) の1つ目がコマ2。各コマには動いた駒だけを書く。',
    ' 案: routes で「案1 = …、案2 = …」のように同じ開始配置から別々の動きを作れる (note に説明を書くとコートの左上に表示される)。',
  ].join(''),
  inputSchema: {
    sport: z.string().describe('スポーツ id (soccer / basketball / futsal / volleyball)'),
    name: z.string().optional().describe('配置の名前 (例: 右コーナーキック 守備)'),
    date: z.string().optional().describe('日付 YYYY-MM-DD (省略で今日)'),
    home: z.object({
      formation: z.string().optional().describe('自チームのフォーメーション id (例: 4-4-2)。list_sports で確認'),
      players: z.array(playerSchema).optional().describe('コート上の自チームの選手'),
      bench: z.array(playerSchema.omit({ x: true, y: true })).optional().describe('ベンチの選手'),
    }).optional(),
    away: z.object({
      formation: z.string().optional().describe('敵のフォーメーション id (自チームと反対側に並ぶ)'),
      markers: z.array(z.object({ position: z.string(), x: z.number(), y: z.number() })).optional().describe('敵マーカーを個別に置く'),
    }).optional(),
    ball: z.object({ x: z.number(), y: z.number() }).optional().describe('ボールの位置'),
    drawings: z.array(z.object({
      type: z.enum(['arrow', 'dashArrow', 'line', 'circle', 'pen', 'text']).describe('arrow = 矢印 (パス)、dashArrow = 点線矢印 (ラン)、line = 直線、circle = 円 (中心と円周上の点)、pen = 折れ線、text = 文字'),
      points: z.array(point).describe('arrow / dashArrow / line: [始点, 終点]。circle: [中心, 円周上の点]。pen: 点の列。text: [位置]'),
      color: z.string().optional().describe('色: white / black / red / blue / yellow / green / orange か "#rrggbb"'),
      width: z.number().int().min(1).max(3).optional().describe('太さ 1 = 細 / 2 = 中 / 3 = 太 (テキストは文字の大きさ)'),
      text: z.string().optional().describe('type = text の文字'),
    })).optional(),
    frames: z.array(frameSchema).optional().describe('コマ送り (案が1つの時)。1つ目がコマ2'),
    routes: z.array(z.object({
      name: z.string().optional().describe('案の名前 (例: 案1)'),
      note: z.string().optional().describe('案の説明 (例: 相手が中を固めたら右サイドへ)'),
      frames: z.array(frameSchema).describe('この案のコマ (1つ目がコマ2)'),
    })).optional().describe('案 (ルート) を複数作る時。指定すると frames は使わない'),
    baseUrl: z.string().optional().describe('共有 URL のサイトの場所 (通常は省略)'),
  },
}, async (spec) => {
  try {
    const { url, board, warnings } = createShareUrl(spec, { baseUrl: spec.baseUrl || BASE_URL, sports });
    const onCourt = board.home.slots.filter((s) => s.playerId).length + board.home.free.length;
    const lines = [
      `共有 URL: ${url}`,
      '',
      `「${board.name}」(${spec.sport}) — 自チーム ${onCourt}人 / ベンチ ${board.home.bench.length}人 / 敵 ${board.away.markers.length} / ` +
        `ボール ${board.ball ? 'あり' : 'なし'} / 書き込み ${board.drawings.length} / ` +
        `案 ${board.plays.length} (コマ ${board.plays.map((p) => p.steps.length + 1).join(', ')})`,
      'URL を開くと見るだけの画面になります。「自分の配置として保存」で自分のボードに取り込めます (名簿に同じ名前の選手がいればその選手につながります)。',
    ];
    if (warnings.length) lines.push('', '注意:', ...warnings.map((w) => `- ${w}`));
    return text(lines.join('\n'));
  } catch (err) {
    return { ...text(`配置を作れませんでした: ${err.message}`), isError: true };
  }
});

// ---- read_board ----
server.registerTool('read_board', {
  title: '共有 URL の配置を読む',
  description: [
    'Formation Board の共有 URL (#/view/... を含む) を読み、選手・敵・ボール・書き込み・案とコマの動きを JSON で返す。',
    '既存の配置を説明したり、少し変えた配置を create_board で作り直したりする時に使う。',
    COORDINATES,
  ].join(''),
  inputSchema: { url: z.string().describe('共有 URL、または #/view/ 以降の文字列') },
  annotations: { readOnlyHint: true },
}, async ({ url }) => {
  try {
    return text(readShareUrl(url, sports));
  } catch (err) {
    return { ...text(`共有 URL を読めませんでした: ${err.message}`), isError: true };
  }
});

await server.connect(new StdioServerTransport());
