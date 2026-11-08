'use strict';

// Exam-software guard. Detects SEB / Mettl processes so the app can (1) force
// capture-exclusion OFF and (2) show a banner. This is one-directional: we
// only ever restrict ourselves. We never kill, hide, patch, or inspect those
// processes beyond their names.
const { execFile } = require('child_process');
const { EXAM_PROCESS_FRAGMENTS } = require('../shared/constants');

function parseProcessNames(tasklistCsv) {
  const names = [];
  for (const line of String(tasklistCsv).split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)"/);
    if (m) names.push(m[1].toLowerCase());
  }
  return names;
}

function findExamProcesses(processNames) {
  return processNames.filter((name) => {
    const lower = String(name).toLowerCase();
    return EXAM_PROCESS_FRAGMENTS.some((frag) => lower.includes(frag));
  });
}

function defaultListProcesses(cb) {
  if (process.platform !== 'win32') return cb(null, []);
  execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
    if (err) return cb(err); // caller fails closed for capture exclusion
    cb(null, parseProcessNames(stdout));
  });
}

class ExamGuard {
  constructor({ listProcesses } = {}) {
    this.listProcesses = listProcesses || defaultListProcesses;
    this.examDetected = false;
    this.uncertain = false;
    this.listeners = new Set();
    this.timer = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  checkNow() {
    this.listProcesses((err, names) => {
      this.uncertain = !!err;
      const detected = !err && findExamProcesses(names || []).length > 0;
      if (detected !== this.examDetected) {
        this.examDetected = detected;
        for (const fn of this.listeners) fn(detected);
      }
    });
  }

  start(intervalMs = 15000) {
    this.checkNow();
    this.timer = setInterval(() => this.checkNow(), intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isExamDetected() {
    return this.examDetected;
  }

  isUncertain() {
    return this.uncertain;
  }
}

module.exports = { ExamGuard, parseProcessNames, findExamProcesses };
