import { dupNipt } from './_perm.js';

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function prepareApplicationConversion({ clientsValue, applicationsValue, applicationId, nipt, approvalDate, prepaid, now, nextId }) {
  let clients, applications;
  try {
    clients = JSON.parse(clientsValue || '[]');
    applications = JSON.parse(applicationsValue || '[]');
  } catch {
    return { error: 'Të dhënat e klientëve ose aplikimeve nuk janë JSON i vlefshëm.', status: 400 };
  }
  if (!Array.isArray(clients) || !Array.isArray(applications)) return { error: 'Struktura e klientëve ose aplikimeve është e pavlefshme.', status: 400 };

  const normalizedNipt = String(nipt || '').trim().toUpperCase();
  if (!/^[A-Z][0-9]{8}[A-Z]$/.test(normalizedNipt)) return { error: 'NIPT-i nuk është në format të vlefshëm.', status: 400 };
  if (!validDate(approvalDate)) return { error: 'Data e aprovimit nuk është datë kalendarike e vlefshme.', status: 400 };

  const application = applications.find((item) => String(item.id) === String(applicationId));
  if (!application) return { error: 'Aplikimi nuk ekziston.', status: 404 };
  if (application.statusAplikim !== 'pritje') return { error: 'Aplikimi është përpunuar më parë.', status: 409 };
  const fee = Number(application.tarifaMujoreAplikim);
  const revenue = Number(application.xhiroBiznesAplikim || 0);
  if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(revenue) || revenue < 0) return { error: 'Tarifa ose xhiroja e aplikimit nuk është e vlefshme.', status: 400 };
  if (!/^\S+@\S+\.\S+$/.test(String(application.emailAplikim || ''))) return { error: 'Email-i i aplikimit nuk është i vlefshëm.', status: 400 };

  const id = nextId();
  const client = {
    id,
    emriKompanise: application.emriKompaniseAplikim,
    nipt: normalizedNipt,
    administratori: application.administratoriAplikim,
    nrKontakti: application.nrKontaktiAplikim,
    emailBiznes: application.emailAplikim,
    adresaBiznes: application.adresaAplikim,
    tarifaMujore: String(application.tarifaMujoreAplikim),
    xhiroBiznes: String(application.xhiroBiznesAplikim || 0),
    dataKontrate: approvalDate,
    statusKlient: 'aktiv',
    statusTVSH: 'me_tvsh',
    statusTatimFitim: 'me_tatim',
    statusPagese: 'paguan',
    payPrepaid: Boolean(prepaid),
    dataFaturesFundit: approvalDate,
    ortaket: application.ortaket || [],
    shenimet: `Konvertuar nga aplikimi. ${application.shenimetAplikim || ''}`,
    dataKrijimit: now,
  };
  const duplicate = dupNipt(clientsValue, JSON.stringify([...clients, client]));
  if (duplicate) return { error: duplicate, status: 409 };

  const nextApplications = applications.map((item) => String(item.id) === String(applicationId)
    ? { ...item, statusAplikim: 'aprovuar', niptAprovuar: normalizedNipt, dataAprovimit: approvalDate }
    : item);
  return { client, clientsValue: JSON.stringify([...clients, client]), applicationsValue: JSON.stringify(nextApplications) };
}
