/**
 * ics — iCalendar (RFC 5545) builder for the run page's calendar exports.
 *
 * 2026-08-19 (客戶回報「下載後存成打不開的陌生格式」): the two client-side
 * exports (multi-day series + bulk content calendar) hand-assembled their
 * VCALENDAR inline and both omitted DTSTAMP, which RFC 5545 §3.6.1 lists as
 * REQUIRED in every VEVENT. Google Calendar tolerates the omission; Outlook /
 * Windows「行事曆」reject the file outright, so the download lands on the
 * desktop as a file nothing will open. They also emitted whole captions on a
 * single unfolded line — §3.1 caps a content line at 75 octets.
 *
 * The server's outputRouter.scheduleIcs already got DTSTAMP right; this is the
 * same calendar written properly, in one place, for the client paths.
 */

export interface IcsAllDayEvent {
  /** Globally unique per event. Callers namespace it (e.g. `${outputId}-series-${i}`). */
  uid: string;
  /** Local calendar day the post goes out on. Time-of-day is ignored. */
  date: Date;
  summary: string;
  description?: string;
}

/** RFC 5545 §3.3.11 TEXT escaping. Order matters — backslash first. */
function escapeText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 content-line folding: no line exceeds 75 octets, continuations
 * begin with a single space. Measured in UTF-8 octets, never splitting a
 * multi-byte character — a caption is mostly CJK, where one glyph is 3 octets.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentOctets = 0;
  // First line gets 75 octets; continuations lose one to the leading space.
  let limit = 75;
  for (const char of Array.from(line)) {
    const charOctets = encoder.encode(char).length;
    if (currentOctets + charOctets > limit) {
      out.push(current);
      current = "";
      currentOctets = 0;
      limit = 74;
    }
    current += char;
    currentOctets += charOctets;
  }
  if (current) out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

function utcStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

function localDay(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, "0")}` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/**
 * Build a VCALENDAR of all-day events, one per post.
 *
 * @param events   posts to export, in display order
 * @param options  `now` is injectable so tests don't depend on the clock
 */
export function buildAllDayIcs(
  events: IcsAllDayEvent[],
  options: { prodId?: string; now?: Date } = {},
): string {
  const prodId = options.prodId ?? "-//OnBrand//Content Calendar//ZH";
  const dtstamp = utcStamp(options.now ?? new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    // Outlook treats a METHOD-less calendar as a subscription feed rather than
    // something to import; PUBLISH is what makes double-click work there.
    "METHOD:PUBLISH",
  ];

  for (const ev of events) {
    const end = new Date(ev.date);
    end.setDate(ev.date.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${localDay(ev.date)}`,
      `DTEND;VALUE=DATE:${localDay(end)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      `DESCRIPTION:${escapeText(ev.description ?? "")}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // A content line includes its terminating CRLF (RFC 5545 §3.1), including
  // the final END:VCALENDAR line. Outlook is stricter about this than Google.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Save a built calendar to disk under `filename`. */
export function downloadIcs(ics: string, filename: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser consume the object URL before releasing it. Immediate
  // revocation is racy in Safari/Firefox and can produce an empty download.
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
