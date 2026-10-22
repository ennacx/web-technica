import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { copyReleaseSources } from '../scripts/verify-release.mjs';

test('release snapshot includes working changes but excludes dependencies and even tracked generated files', (t) => {
    const temporary = mkdtempSync(path.join(tmpdir(), 'web-technica-snapshot-test-'));
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    const repository = path.join(temporary, 'repository');
    const snapshot = path.join(temporary, 'snapshot');
    mkdirSync(repository);
    mkdirSync(snapshot);
    const write = (file, text) => {
        const filename = path.join(repository, file);
        mkdirSync(path.dirname(filename), { recursive: true });
        writeFileSync(filename, text);
    };
    write('.gitignore', 'node_modules/\ndist/\nignored-local.txt\n');
    write('package.json', '{"name":"snapshot-fixture","version":"1.0.0"}');
    write('package-lock.json', '{}');
    write('src/_data/tools.json', '[{"slug":"keygen","url":"/keygen/"}]');
    write('src/example.js', 'old tracked source');
    write('src/deleted.js', 'tracked source to delete');
    write('src/assets/css/style.scss', 'body { color: red; }');
    write('src/assets/css/style.css', 'stale tracked compiled CSS');
    write('src/assets/css/style.css.map', '{}');
    write('src/assets/img/brand/icon-192.png', 'stale tracked icon');
    write('src/assets/img/brand/social-card.png', 'stale tracked social image');
    write('src/tools/keygen/js/app.js', 'stale tracked bundle');
    write('src/tools/keygen/js/app.js.LEGAL.txt', 'stale licenses');
    write('src/tools/keygen/js/THIRD-PARTY-LICENSES.txt', 'stale licenses');
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '.'], { cwd: repository });
    write('src/example.js', 'current working source');
    unlinkSync(path.join(repository, 'src/deleted.js'));
    write('src/new-module.js', 'untracked new source');
    write('node_modules/fake/index.js', 'old dependency');
    write('dist/index.html', 'old build');
    write('ignored-local.txt', 'local-only file');

    copyReleaseSources(repository, snapshot);
    assert.equal(readFileSync(path.join(snapshot, 'src/example.js'), 'utf8'), 'current working source');
    assert.equal(readFileSync(path.join(snapshot, 'src/new-module.js'), 'utf8'), 'untracked new source');
    assert.ok(existsSync(path.join(snapshot, 'src/assets/css/style.scss')));
    for(const file of [
        '.git', 'node_modules', 'dist', 'ignored-local.txt', 'src/deleted.js',
        'src/assets/css/style.css', 'src/assets/css/style.css.map', 'src/assets/img/brand/icon-192.png',
        'src/assets/img/brand/social-card.png',
        'src/tools/keygen/js/app.js', 'src/tools/keygen/js/app.js.LEGAL.txt',
        'src/tools/keygen/js/THIRD-PARTY-LICENSES.txt'
    ]){
        assert.equal(existsSync(path.join(snapshot, file)), false, file);
    }
    assert.ok(existsSync(path.join(repository, 'src/tools/keygen/js/app.js')), 'original generated files are preserved');
    assert.ok(existsSync(path.join(repository, 'node_modules/fake/index.js')), 'original dependencies are preserved');
});
