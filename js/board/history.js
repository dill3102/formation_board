// 元に戻す / やり直し
// 変更する直前の状態 (スナップショット) を積んでおく方式。配置1件分のデータは小さいので丸ごと持つ
// 画面を開いている間だけ (03_data_design 6章)

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** 変更する直前に呼ぶ */
  push(snapshot) {
    this.undoStack.push(structuredClone(snapshot));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** @returns 戻した後の状態。戻せなければ null */
  undo(current) {
    if (!this.canUndo) return null;
    this.redoStack.push(structuredClone(current));
    return this.undoStack.pop();
  }

  /** @returns やり直した後の状態。できなければ null */
  redo(current) {
    if (!this.canRedo) return null;
    this.undoStack.push(structuredClone(current));
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
