import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse,parse,toNum} from '../src/lib/lt50.js';

// The sample shown on the tool page: merged header cells, replicate labels, unequal N and temperatures.
const SAMPLE = `Genotype\tCol-0\t\t\t\tCol-0\t\t\tmutant1\t\t\t\t\tmutant1\t\t
処理\t低温馴化\t\t\t\t無処理\t\t\t低温馴化\t\t\t\t\t無処理\t\t
温度 (℃)\trep1\trep2\trep3\trep4\trep1\trep2\trep3\trep1\trep2\trep3\trep4\trep5\trep1\trep2\trep3
-2\t\t\t\t\t100\t95\t80\t\t\t\t\t\t100\t100\t80
-3\t\t\t\t\t90\t95\t95\t\t\t\t\t\t\t\t
-4\t100\t95\t90\t100\t65\t75\t70\t80\t100\t95\t90\t100\t50\t65\t40
-5\t\t\t\t\t45\t60\t45\t\t\t\t\t\t\t\t
-6\t90\t85\t95\t100\t20\t30\t15\t80\t65\t75\t80\t\t10\t15\t25
-7\t\t\t\t\t5\t10\t5\t\t\t\t\t\t\t\t
-8\t75\t70\t80\t80\t0\t5\t15\t30\t40\t30\t40\t45\t5\t0\t0
-10\t40\t35\t40\t45\t\t\t\t0\t10\t5\t\t\t\t\t
-12\t0\t10\t0\t0\t\t\t\t0\t0\t0\t0\t\t\t\t
-14\t0\t0\t0\t5\t\t\t\t\t\t\t\t\t\t\t`;

// Reference values from R 4 (nls; delta method for the 50% crossing), checked on 2026-11-10.
const R = {
 'fixed/mid':{'Col-0 / 低温馴化':[-9.373462,0.102574],'Col-0 / 無処理':[-4.903167,0.092870],'mutant1 / 低温馴化':[-7.303554,0.110153],'mutant1 / 無処理':[-4.172087,0.177246]},
 'free/mid':{'Col-0 / 低温馴化':[-9.616963,0.136743],'Col-0 / 無処理':[-4.933776,0.160820],'mutant1 / 低温馴化':[-7.490926,0.193736],'mutant1 / 無処理':[-3.561428,1.344210]},
 'free/abs':{'Col-0 / 低温馴化':[-9.462953,0.100076],'Col-0 / 無処理':[-4.914657,0.104553],'mutant1 / 低温馴化':[-7.360416,0.123806],'mutant1 / 無処理':[-4.076603,0.244756]},
};

for (const [key, groups] of Object.entries(R)) {
 test(`LT50 and SE match R (${key})`, () => {
  const [mode, def] = key.split('/');
  const {results} = analyse(SAMPLE, mode, def);
  assert.deepEqual(results.map(r => r.g), Object.keys(groups));
  for (const r of results) {
   const [lt, se] = groups[r.g];
   assert.ok(Math.abs(r.lt - lt) < 1e-4, `${r.g} LT50 ${r.lt} vs ${lt}`);
   assert.ok(Math.abs(r.se - se) < 1e-4, `${r.g} SE ${r.se} vs ${se}`);
  }
 });
}

test('wide sheets: merged headers fill right, replicate labels are dropped, blanks are missing values', () => {
 const {rows, format} = parse(SAMPLE);
 assert.equal(format, 'wide');
 assert.equal(rows.filter(r => r.g === 'Col-0 / 無処理').length, 21);
 assert.equal(rows.filter(r => r.g === 'mutant1 / 低温馴化').length, 21);
});

test('long sheets and full-width input', () => {
 const {rows, format} = parse('温度,生存率,系統\n－２,１００,A\n-4,50％,A\n-6,0,A');
 assert.equal(format, 'long');
 assert.deepEqual(rows.map(r => [r.x, r.y, r.g]), [[-2,100,'A'],[-4,50,'A'],[-6,0,'A']]);
 assert.equal(toNum('－３．５℃'), -3.5);
});

test('unnamed groups are left empty for the page to label', () => {
 const {results} = analyse('-2\t100\n-4\t80\n-6\t30\n-8\t0', 'fixed', 'mid');
 assert.equal(results[0].g, '');
 assert.ok(Number.isFinite(results[0].lt));
});

test('too few temperatures is reported as a code, not a sentence', () => {
 const {results} = analyse('-2\t100\n-4\t0', 'fixed', 'mid');
 assert.equal(results[0].error, 'too-few');
});
