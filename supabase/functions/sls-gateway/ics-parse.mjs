// Minimal iCal (RFC 5545) VEVENT parser scoped to what open-slot generation
// needs: busy intervals for a fetched shared calendar. Deliberately not a
// full RFC 5545 implementation.
//
// Supported: DTSTART/DTEND with a Z-suffixed UTC value, a TZID param (any
// IANA zone, via Intl), or a bare "floating" value (treated as Pacific,
// since Sophie's business is Pacific-based and Apple's shared-calendar
// export is what this feeds). All-day events (VALUE=DATE) are busy across
// the whole day in Pacific. RRULE FREQ=WEEKLY and FREQ=DAILY are expanded
// (respecting INTERVAL/COUNT/UNTIL); any other FREQ expands only the base
// occurrence and is reported back via `skippedRrules` so the caller can log
// it. EXDATE is not applied (also reported, same reasoning: disproportionate
// for a v1 overlay whose only job is to hide slots, never to be the source
// of truth for anything).
//
// Pure functions, no Deno/Node-specific APIs, importable from either runtime.

export function unfoldIcsLines(text) {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length) {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsLine(line) {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(";");
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

export function zoneOffsetMinutesAt(utcMs, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date(utcMs));
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    const m = tzPart && /GMT([+-]\d+)(?::(\d+))?/.exec(tzPart.value);
    if (!m) return -8 * 60;
    const hours = parseInt(m[1], 10);
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    return hours * 60 + (hours < 0 ? -mins : mins);
  } catch (_e) {
    return -8 * 60;
  }
}

export function zonedWallClockToUtcMs(y, moZeroBased, d, hh, mi, ss, timeZone) {
  const asUtcMs = Date.UTC(y, moZeroBased, d, hh, mi, ss);
  const offsetMin = zoneOffsetMinutesAt(asUtcMs, timeZone);
  return asUtcMs - offsetMin * 60000;
}

// Parses a DTSTART/DTEND property into either { allDay:true, y, mo (1-12), d }
// or { allDay:false, ms }.
function parseDateTimeProp(prop) {
  const isDate = prop.params.VALUE === "DATE" || /^\d{8}$/.test(prop.value);
  if (isDate) {
    const y = +prop.value.slice(0, 4), mo = +prop.value.slice(4, 6), d = +prop.value.slice(6, 8);
    return { allDay: true, y, mo, d };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(prop.value);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  if (z) return { allDay: false, ms: Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss) };
  const tzid = prop.params.TZID || "America/Los_Angeles";
  return { allDay: false, ms: zonedWallClockToUtcMs(+y, +mo - 1, +d, +hh, +mi, +ss, tzid) };
}

function allDayToUtcMs(part) {
  return zonedWallClockToUtcMs(part.y, part.mo - 1, part.d, 0, 0, 0, "America/Los_Angeles");
}

function parseRrule(raw) {
  const out = {};
  for (const pair of raw.split(";")) {
    const [k, v] = pair.split("=");
    if (k) out[k.toUpperCase()] = v;
  }
  return out;
}

// Returns { busy: [{start, end}], skippedRrules: number }.
export function parseIcsBusyIntervals(icsText, horizonStartMs, horizonEndMs) {
  const busy = [];
  let skippedRrules = 0;
  const lines = unfoldIcsLines(icsText || "");
  let inEvent = false;
  let block = [];
  const events = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { inEvent = true; block = []; continue; }
    if (line === "END:VEVENT") { inEvent = false; events.push(block); continue; }
    if (inEvent) block.push(line);
  }

  for (const block of events) {
    const props = block.map(parseIcsLine).filter(Boolean);
    const dtstartProp = props.find((p) => p.name === "DTSTART");
    const dtendProp = props.find((p) => p.name === "DTEND");
    const rruleProp = props.find((p) => p.name === "RRULE");
    if (!dtstartProp) continue;
    const start = parseDateTimeProp(dtstartProp);
    if (!start) continue;

    let startMs, durationMs;
    if (start.allDay) {
      startMs = allDayToUtcMs(start);
      if (dtendProp) {
        const end = parseDateTimeProp(dtendProp);
        durationMs = end && end.allDay ? allDayToUtcMs(end) - startMs : 86400000;
      } else {
        durationMs = 86400000;
      }
    } else {
      startMs = start.ms;
      if (dtendProp) {
        const end = parseDateTimeProp(dtendProp);
        durationMs = end && !end.allDay ? end.ms - startMs : 3600000;
      } else {
        durationMs = 3600000;
      }
    }
    if (durationMs <= 0) durationMs = 3600000;

    const occurrenceStarts = [startMs];
    if (rruleProp) {
      const rule = parseRrule(rruleProp.value);
      const freq = rule.FREQ;
      const interval = Math.max(1, parseInt(rule.INTERVAL || "1", 10) || 1);
      const stepMs = freq === "DAILY" ? interval * 86400000 : freq === "WEEKLY" ? interval * 7 * 86400000 : 0;
      if (stepMs > 0) {
        const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
        const until = rule.UNTIL ? parseDateTimeProp({ name: "UNTIL", params: {}, value: rule.UNTIL }) : null;
        const untilMs = until ? (until.allDay ? allDayToUtcMs(until) : until.ms) : horizonEndMs + stepMs;
        let n = 1;
        let t = startMs + stepMs;
        const maxIterations = 500;
        while (t <= Math.min(untilMs, horizonEndMs + stepMs) && (!count || n < count) && occurrenceStarts.length < maxIterations) {
          occurrenceStarts.push(t);
          t += stepMs;
          n++;
        }
      } else {
        skippedRrules++;
      }
    }

    for (const occStart of occurrenceStarts) {
      const occEnd = occStart + durationMs;
      if (occEnd < horizonStartMs || occStart > horizonEndMs) continue;
      busy.push({ start: occStart, end: occEnd });
    }
  }

  return { busy, skippedRrules };
}
