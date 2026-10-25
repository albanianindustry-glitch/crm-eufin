import { html } from '../../core/html.js';
import { chip } from '../../core/ui.js';

export const STATUS = [['aktiv', 'Aktiv'], ['inaktiv', 'Inaktiv']];
export const PAYMENT = [['paguan', 'Paguan në rregull'], ['vonese', 'Me vonesë'], ['spaguan', 'Nuk paguan']];
export const VAT = [['me_tvsh', 'Me TVSH'], ['pa_tvsh', 'Pa TVSH']];
export const TAX = [['me_tatim', 'Me tatim fitimi'], ['pa_tatim', 'Pa tatim fitimi']];
export const KIND = [['biznes', 'Biznes'], ['individ', 'Individ']];
export const LEGAL = ['SHPK', 'PF', 'SHA', 'OJF', 'Degë e huaj', 'Tjetër'];
export const label = (list, v) => (list.find(([k]) => k === v) || [, v || '—'])[1];
export const paymentChip = (v) => chip(label(PAYMENT, v), v === 'paguan' ? 'ok' : v === 'vonese' ? 'warn' : 'bad');
export const statusChip = (v) => chip(label(STATUS, v), v === 'aktiv' ? 'ok' : 'bad');
export const initial = (name) => String(name || '?').trim().charAt(0).toUpperCase();
