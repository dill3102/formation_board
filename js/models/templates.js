// テンプレート (同梱フォーメーション + マイテンプレート) (03_data_design 3章 / 4.5)
// テンプレートID: 同梱 = "<sportId>:<formationId>"、マイテンプレート = "my:<id>"
import * as storage from '../storage.js';
import { KEYS } from '../storage.js';
import { createId } from '../util/id.js';
import { mirrorSlots } from '../board/formation.js';

export function listMyTemplates(sportId = null) {
  const all = storage.read(KEYS.templates, []);
  return sportId ? all.filter((t) => t.sportId === sportId) : all;
}

/** スポーツで使えるテンプレート一覧 { id, name, mine } */
export function listTemplates(sport) {
  return [
    ...sport.formations.map((f) => ({ id: `${sport.id}:${f.id}`, name: f.name, mine: false })),
    ...listMyTemplates(sport.id).map((t) => ({ id: `my:${t.id}`, name: t.name, mine: true })),
  ];
}

/** テンプレートの枠 (自陣側の座標)。見つからなければ null */
export function getTemplateSlots(templateId, sport) {
  if (!templateId) return null;
  if (templateId.startsWith('my:')) {
    return listMyTemplates().find((t) => `my:${t.id}` === templateId)?.slots ?? null;
  }
  const formation = sport.formations.find((f) => `${sport.id}:${f.id}` === templateId);
  return formation?.slots ?? null;
}

export function templateName(templateId, sport) {
  if (!templateId) return null;
  return listTemplates(sport).find((t) => t.id === templateId)?.name ?? null;
}

/**
 * マイテンプレートとして保存する。敵チーム側から保存する時は自陣側に反転してから保存
 * @param {{ position: string, x: number, y: number }[]} slots
 * @param {'home' | 'away'} side
 * @throws {StorageFullError}
 */
export function saveMyTemplate(sportId, name, slots, side = 'home') {
  const normalized = (side === 'away' ? mirrorSlots(slots) : slots)
    .map(({ position, x, y }) => ({ position, x, y }));
  const template = {
    id: createId(),
    sportId,
    name: name.trim(),
    slots: normalized,
    createdAt: new Date().toISOString(),
  };
  storage.write(KEYS.templates, [...listMyTemplates(), template]);
  return { ...template, templateId: `my:${template.id}` };
}

export function deleteMyTemplate(id) {
  storage.write(KEYS.templates, listMyTemplates().filter((t) => t.id !== id));
}
