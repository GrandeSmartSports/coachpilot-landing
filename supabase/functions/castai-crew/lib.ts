// Shared by every part of the crew function: the one database client, how an
// answer or a refusal is sent, and who the caller is on their crew.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isUuid, todayIn } from "./crew-core.mjs";

// The crew tables carry no policies, so this service-role client is the only
// way in. It never signs in as anyone, so it stays the service role.
export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export type Body = Record<string, unknown>;

// A refusal with a real status and words a person can read. Anything else
// that gets thrown is a fault of ours: it is logged and answered with a 500
// that says nothing about why.
export class Refuse extends Error {
  status: number;
  constructor(status: number, words: string) {
    super(words);
    this.status = status;
  }
}
export function refuse(status: number, words: string): never {
  throw new Refuse(status, words);
}

// Run one of crew-core's cleaners. Its plain-word Error becomes a 400. A real
// bug (a TypeError, say) is not plain words and goes on to be a 500.
export function clean<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Error && e.constructor === Error) throw new Refuse(400, e.message);
    throw e;
  }
}

// A database answer, or a fault.
export function must<T>(res: { data: T; error: unknown }, what: string): T {
  if (res.error) throw new Error("db " + what + ": " + JSON.stringify(res.error));
  return res.data;
}

export const has = (o: Body, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// An id from the caller. It is checked before it goes near a query, so a
// mangled one is a 400 and never a database error.
export function uuid(value: unknown, what: string): string {
  if (!isUuid(value)) refuse(400, "That " + what + " id does not look right.");
  return (value as string).toLowerCase();
}

// The sender's own id for a write, so the same write sent twice lands once.
export function clientId(body: Body): string | null {
  if (body.clientId === undefined || body.clientId === null) return null;
  return uuid(body.clientId, "client");
}

// Long lists of ids go in pieces, so a request line never gets too long.
export function pieces<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export type Member = { crew_id: string; user_id: string; role: string; display_name: string; joined_at: string };
export type Ctx = {
  me: string;
  member: Member;
  owner: boolean;
  crew: { id: string; name: string };
  members: Member[];
  names: Map<string, string>;
  today: string;
};

const MEMBER_COLS = "crew_id, user_id, role, display_name, joined_at";

// The owner first, then in the order people joined. Two people added in the
// same instant still come out the same way every time.
function inOrder(rows: Member[]): Member[] {
  return [...rows].sort((a, b) =>
    Number(b.role === "owner") - Number(a.role === "owner") ||
    Date.parse(a.joined_at) - Date.parse(b.joined_at) ||
    a.user_id.localeCompare(b.user_id)
  );
}

// One crew per person for now. If someone is ever on two, it is always the
// one they joined first, never whichever row the database hands back.
export async function context(userId: string): Promise<Ctx | null> {
  const mine = must(
    await db.from("castai_crew_members").select(MEMBER_COLS).eq("user_id", userId)
      .order("joined_at").order("crew_id").limit(1),
    "membership",
  ) as Member[] | null;
  const member = mine && mine[0];
  if (!member) return null;
  const [crewRes, membersRes] = await Promise.all([
    db.from("castai_crew").select("id, name").eq("id", member.crew_id).maybeSingle(),
    db.from("castai_crew_members").select(MEMBER_COLS).eq("crew_id", member.crew_id),
  ]);
  const crew = must(crewRes, "crew") as { id: string; name: string } | null;
  if (!crew) return null;
  const members = inOrder((must(membersRes, "members") || []) as Member[]);
  return {
    me: userId,
    member,
    owner: member.role === "owner",
    crew,
    members,
    names: new Map(members.map((m) => [m.user_id, m.display_name])),
    today: todayIn(),
  };
}

// Whose token is this? null means there is no good token (a 401). A sign-in
// service that is down is a fault, not a reason to sign the phone out.
export async function caller(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("authorization") || "";
  const token = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error) {
    const status = (error as { status?: number }).status;
    if (error.name === "AuthRetryableFetchError" || (typeof status === "number" && status >= 500)) {
      throw new Error("auth check failed: " + error.name + " " + status);
    }
    return null;
  }
  return data?.user ? { id: data.user.id } : null;
}

// Is texting switched on? Only when the settings row says exactly 'on'.
export async function smsOn(): Promise<boolean> {
  const { data } = await db.from("castai_crew_settings").select("value").eq("key", "sms").maybeSingle();
  return !!data && data.value === "on";
}
