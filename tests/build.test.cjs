const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
test('public build excludes development files and versions every local script and stylesheet', () => {
  const build = () => {
    const result = spawnSync(process.execPath, ['scripts/build.cjs'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  };
  build();
  const output = path.join(root, 'dist');
  for (const name of ['tests', 'samples', 'docs', 'node_modules', '.git', 'AGENTS.md', 'package.json']) {
    assert.equal(fs.existsSync(path.join(output, name)), false, name);
  }
  for (const page of ['player/index.html', 'editor/index.html']) {
    const filename = path.join(output, page);
    const html = fs.readFileSync(filename, 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))\?v=([a-f0-9]{12})"/g)];
    assert.ok(assets.length > 0);
    for (const [, asset, hash] of assets) {
      assert.equal(createHash('sha256').update(fs.readFileSync(path.resolve(path.dirname(filename), asset))).digest('hex').slice(0,12), hash);
    }
    assert.equal((html.match(/(?:src|href)="[^"?]+\.(?:js|css)(?:\?[^"]*)?"/g) || []).length, assets.length);
  }
  assert.ok(fs.statSync(path.join(output, 'editor/vendor/lang/jpn.traineddata.gz')).size > 0);
  fs.writeFileSync(path.join(output, 'obsolete.txt'), 'build test');
  build();
  assert.equal(fs.existsSync(path.join(output, 'obsolete.txt')), false);
});
