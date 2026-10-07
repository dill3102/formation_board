// MCP のプロトコルで server.js を起動して呼ぶ (Claude Desktop / Claude Code と同じ stdio のつなぎ方)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

test('stdio: ツール一覧と呼び出し', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER],
    env: { ...process.env, FORMATION_BOARD_URL: 'http://localhost:8000/' },
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['create_board', 'list_sports', 'read_board']);

    const list = await client.callTool({ name: 'list_sports', arguments: {} });
    const sports = JSON.parse(list.content[0].text).sports;
    assert.deepEqual(sports.map((s) => s.id), ['soccer', 'basketball', 'futsal', 'volleyball']);

    const created = await client.callTool({
      name: 'create_board',
      arguments: { sport: 'basketball', name: 'テスト', home: { formation: '1-3-1', players: [{ name: 'A', position: 'PG' }] }, ball: { x: 0.6, y: 0.5 } },
    });
    assert.ok(!created.isError, created.content[0].text);
    const url = /共有 URL: (\S+)/.exec(created.content[0].text)[1];
    assert.match(url, /^http:\/\/localhost:8000\/#\/view\/z/);

    const read = await client.callTool({ name: 'read_board', arguments: { url } });
    const board = JSON.parse(read.content[0].text);
    assert.equal(board.name, 'テスト');
    assert.equal(board.home.players[0].name, 'A');

    const bad = await client.callTool({ name: 'create_board', arguments: { sport: 'rugby' } });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
});
