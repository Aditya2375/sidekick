'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseProcessNames, findExamProcesses, ExamGuard } = require('../src/main/guard');

const CSV = [
  '"SafeExamBrowser.exe","1234","Console","1","100,000 K"',
  '"chrome.exe","2222","Console","1","200,000 K"',
  '"svchost.exe","333","Services","0","10,000 K"'
].join('\r\n');

test('parses tasklist csv', () => {
  const names = parseProcessNames(CSV);
  assert.deepStrictEqual(names, ['safeexambrowser.exe', 'chrome.exe', 'svchost.exe']);
});

test('detects exam processes', () => {
  assert.ok(findExamProcesses(['safeexambrowser.exe', 'chrome.exe']).length === 1);
  assert.ok(findExamProcesses(['mettlsecure.exe']).length === 1);
  assert.ok(findExamProcesses(['chrome.exe', 'code.exe']).length === 0);
});

test('guard fires on change only', (t, done) => {
  let procs = ['chrome.exe'];
  const g = new ExamGuard({ listProcesses: (cb) => cb(null, procs) });
  let fires = 0;
  g.onChange((detected) => {
    fires++;
    assert.strictEqual(detected, true);
    assert.strictEqual(g.isExamDetected(), true);
    done();
  });
  g.checkNow();
  g.checkNow(); // no change -> no fire
  procs = ['SafeExamBrowser.exe'];
  g.checkNow();
});
