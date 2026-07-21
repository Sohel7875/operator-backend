// Translate the backoffice filter presets into a UTC date range. tz is accepted
// and forwarded to Mongo $dateTrunc (mapped to an IANA name); range boundaries
// are computed in UTC (good enough; full tz-localised boundaries would need a tz lib).
const TZ_MAP = {
  UTC: 'UTC',
  IST: 'Asia/Kolkata',
  EST: 'America/New_York',
  PST: 'America/Los_Angeles',
  CET: 'Europe/Paris',
};

export function mongoTz(tz) {
  return TZ_MAP[tz] || (String(tz).includes('/') ? tz : 'UTC');
}

export function resolveDateRange({ filter = 'TODAY', from, to, tz = 'UTC' } = {}) {
  const now = new Date();
  let start;
  let end = now;

  const startOfUTCDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  switch (String(filter).toUpperCase()) {
    case 'TODAY':
      start = startOfUTCDay(now);
      break;
    case 'YESTERDAY': {
      const y = new Date(now.getTime() - 86400000);
      start = startOfUTCDay(y);
      end = startOfUTCDay(now);
      break;
    }
    case 'CURRENT_MONTH':
    case 'CURRENT MONTH':
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    case 'LAST_MONTH':
    case 'LAST MONTH':
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    case 'ALL_TIME':
    case 'ALL TIME':
      start = new Date(0);
      break;
    case 'CUSTOM':
      start = from ? new Date(from) : new Date(0);
      end = to ? new Date(to) : now;
      break;
    default:
      start = startOfUTCDay(now);
  }

  const days = Math.max(1, Math.ceil((end - start) / 86400000));
  return { start, end, days, tz, mongoTz: mongoTz(tz) };
}

export default { resolveDateRange, mongoTz };
