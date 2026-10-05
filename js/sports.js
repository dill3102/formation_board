// スポーツ定義 (data/sports/*.json) の読み込み

// 対応スポーツ (表示順)
// futsal / basketball / volleyball はポジションのみ定義済み。コート・テンプレートは M6 で追加
export const SPORT_IDS = ['soccer', 'basketball', 'futsal', 'volleyball'];

const sports = new Map();

export async function loadSports() {
  const list = await Promise.all(SPORT_IDS.map(async (id) => {
    const res = await fetch(`data/sports/${id}.json`);
    if (!res.ok) throw new Error(`スポーツ定義を読み込めませんでした: ${id}`);
    return res.json();
  }));
  for (const sport of list) sports.set(sport.id, sport);
}

export function getSport(id) {
  return sports.get(id) ?? null;
}

export function listSports() {
  return SPORT_IDS.map((id) => sports.get(id)).filter(Boolean);
}
