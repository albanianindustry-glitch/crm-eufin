import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, transition, updateTask, addComment, nextTitle, addMonths, DomainError, permissions, validateTaskInput } from '../api/_v2-tasks-domain.js';

const admin = { name: 'Administratori', role: 'admin' }, ana = { name: 'Ana', role: 'accountant' }, beni = { name: 'Beni', role: 'accountant' }, kleo = { name: 'Kleo', role: 'accountant' };
let n = 0; const uid = () => 't' + (++n);
const at = (s) => ({ now: new Date(s), uid });
const mk = (extra = {}, actor = admin) => createTask({ title: 'Raport', assignees: ['Ana'], due: '2026-10-25', ...extra }, actor, { now: new Date('2026-10-20T08:00:00Z'), uid, users: ['Ana', 'Beni', 'Kleo', 'Administratori'] });

test('krijimi: vlera default, përgjegjësi kryesor, review vetëm me 2 përgjegjës', () => {
  const t = mk({ assignees: ['Ana'], review: true });
  assert.equal(t.st, 'todo'); assert.equal(t.u, 'Ana'); assert.equal(t.rev, false); assert.equal(t.by, 'Administratori'); assert.equal(t.prio, 'n');
  assert.equal(mk({ assignees: ['Ana', 'Beni'], review: true }).rev, true);
});

test('validimi: titulli, afati, përgjegjës i panjohur, më shumë se 2 përgjegjës', () => {
  assert.throws(() => mk({ title: ' ' }), /Titulli/);
  assert.throws(() => mk({ due: '2026-13-45' }), /Afati/);
  assert.throws(() => mk({ assignees: ['Nuk Ekziston'] }), /ekziston/);
  assert.throws(() => mk({ assignees: ['Ana', 'Beni', 'Kleo'] }), /maksimumi 2/);
  assert.throws(() => validateTaskInput({ prio: 'x' }), DomainError);
});

test('fillo → kryer: koha matet nga fillimi, afati i kaluar shënohet si vonesë', () => {
  let t = mk({ due: '2026-10-21' });
  t = transition(t, 'start', ana, at('2026-10-20T09:00:00Z')).task; assert.equal(t.st, 'prog'); assert.equal(t.pst, '2026-10-20T09:00:00.000Z');
  const r = transition(t, 'complete', ana, at('2026-10-22T10:30:00Z'));
  assert.equal(r.task.st, 'done'); assert.equal(r.task.mins, 2 * 24 * 60 + 90); assert.equal(r.task.doneBy, 'Ana'); assert.equal(r.task.late, 1); assert.equal(r.task.doneAt, '2026-10-22');
});

test('jo-përgjegjësi nuk e ndryshon statusin; admini po', () => {
  const t = mk();
  assert.throws(() => transition(t, 'start', beni, at('2026-10-20T09:00:00Z')), (e) => e.status === 403);
  assert.equal(transition(t, 'start', admin, at('2026-10-20T09:00:00Z')).task.st, 'prog');
});

test('mbyllja në dy hapa: i pari kërkon aprovim, i dyti aprovon; vetë nuk e aprovon dot', () => {
  let t = mk({ assignees: ['Ana', 'Beni'], review: true });
  t = transition(t, 'complete', ana, at('2026-10-20T09:00:00Z')).task; assert.equal(t.st, 'prog'); assert.equal(t.pend.by, 'Ana');
  assert.throws(() => transition(t, 'complete', ana, at('2026-10-20T09:05:00Z')), /Pret aprovimin/);
  assert.throws(() => transition(t, 'approve', ana, at('2026-10-20T09:05:00Z')), /Aprovimin e jep kolegu/);
  const done = transition(t, 'approve', beni, at('2026-10-20T11:00:00Z')).task;
  assert.equal(done.st, 'done'); assert.equal(done.doneBy, 'Ana'); assert.equal(done.apprBy, 'Beni'); assert.equal(done.pend, null);
});

test('kthimi pa aprovuar heq pritjen dhe shton koment me arsyen', () => {
  let t = mk({ assignees: ['Ana', 'Beni'], review: true });
  t = transition(t, 'complete', ana, at('2026-10-20T09:00:00Z')).task;
  t = transition(t, 'reject', beni, { ...at('2026-10-20T10:00:00Z'), reason: 'mungon faturë' }).task;
  assert.equal(t.pend, null); assert.match(t.cm.at(-1).tx, /mungon faturë/); assert.equal(t.st, 'prog');
});

test('rihapja rinis orën dhe ruan kohën e mëparshme', () => {
  let t = mk(); t = transition(t, 'complete', ana, at('2026-10-20T09:30:00Z')).task; const mins = t.mins;
  t = transition(t, 'reopen', ana, at('2026-10-21T09:00:00Z')).task;
  assert.equal(t.st, 'todo'); assert.equal(t.mp, mins); assert.equal(t.doneBy, '');
  t = transition(t, 'complete', ana, at('2026-10-21T09:20:00Z')).task; assert.equal(t.mins, mins + 20);
});

test('detyra e përsëritur: krijon të ardhshmen me afat dhe titull të ri (fund muaji pa tejkalim)', () => {
  let t = mk({ title: 'Raport Janar 2026', due: '2026-01-31', rec: 'm' });
  const r = transition(t, 'complete', ana, at('2026-02-01T09:00:00Z'));
  assert.equal(r.created.due, '2026-02-28'); assert.equal(r.created.title, 'Raport Shkurt 2026'); assert.equal(r.created.st, 'todo'); assert.deepEqual(r.created.cm, []);
  assert.equal(transition(mk({ due: '2026-10-25', rec: 'w' }), 'complete', ana, at('2026-10-25T09:00:00Z')).created.due, '2026-11-01');
  assert.equal(transition(mk({ title: 'Deklarata 2026', due: '2026-12-31', rec: 'y' }), 'complete', ana, at('2027-01-02T09:00:00Z')).created.title, 'Deklarata 2027');
});

test('nextTitle: dhjetori kalon vitin; fjalët që përmbajnë emër muaji nuk preken', () => {
  assert.equal(nextTitle('Raport Dhjetor 2026', 'm'), 'Raport Janar 2027');
  assert.equal(nextTitle('Majtas djathtas', 'm'), 'Majtas djathtas');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
});

test('modifikimi vetëm nga krijuesi/admini; komenti nga pjesëmarrësit', () => {
  const t = mk({}, ana);
  assert.equal(updateTask(t, { title: 'Titull i ri' }, ana).title, 'Titull i ri');
  assert.throws(() => updateTask(t, { title: 'X1' }, beni), (e) => e.status === 403);
  assert.throws(() => addComment(t, 'pershendetje', kleo, { uid }), (e) => e.status === 403);
  assert.equal(addComment(t, ' ok ', ana, { uid }).cm[0].tx, 'ok');
  assert.throws(() => addComment(t, '  ', ana, { uid }), /bosh/);
  assert.equal(permissions(t, admin).del, true);
});
