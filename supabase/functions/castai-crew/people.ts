// Who is on the crew and how they get in: the open questions (hello, join),
// what a signed-in person sees (state), the owner's three moves (add
// someone, a new link, remove someone), and names (your own, the crew's, and
// whether the crew's is still open for whoever joins to pick).
//
// A join link signs a person in with no code, so one is only ever made, and
// only ever honoured, for an account the invite itself created. An account
// that belonged to someone first signs in with its number and a texted code.
//
// A member's phone number or email never leaves this file. Names only.
import {
  addDays, canInvite, cleanOpen, cleanText, crewRenameRefusal, DEAD_LINK, ghostAccount, hashToken, hears, inviteAnswer, inviteOutcome,
  joinLink, joinToken, LINK_DAYS, linkRefusal, NAME_TAKEN, newToken, normalizePhone, placeholderEmail, signInWith,
} from "./crew-core.mjs";
import { forgetAlerts, prefsFor } from "./alerts.ts";
import { accounts, Body, clean, context, Ctx, db, must, refuse, smsOn, uuid } from "./lib.ts";
import { forgetOnTrips, tripsSince } from "./trips.ts";

const INVITES = "castai_crew_invites", MEMBERS = "castai_crew_members";

// ---- no sign-in needed -----------------------------------------------------

// Whether texted codes work, and the public key a phone needs to ask for alerts.
export async function hello() {
  return { ok: true, sms: await smsOn(), vapidKey: Deno.env.get("VAPID_PUBLIC_KEY") || null };
}

// Did an invite make this account? Not knowing is a no.
async function inviteMadeIt(userId: string): Promise<boolean> {
  return (await accounts([userId])).get(userId)?.invited === true;
}

// A join link is the way in for someone the owner added by name. With peek it
// only says who it is for, which crew, and whether its name is still open (so
// the page shows no stand-in name), and nothing is minted: message
// previews load pages, and a preview must not burn or open anything. Without
// peek it mints a one-time sign-in for that one account, which the page trades
// for a session. A link that points at any other kind of account is dead,
// whenever and however it was made.
export async function join(body: Body) {
  if (typeof body.token !== "string" || !body.token.trim()) refuse(400, "A link is needed.");
  const token = joinToken(body.token);
  if (!token) refuse(410, DEAD_LINK);
  const hash = await hashToken(token);
  const inv = must(await db.from(INVITES).select("*").eq("token_hash", hash).maybeSingle(), "link") as Record<string, any> | null;
  if (!inv || inv.revoked || Date.parse(inv.expires_at) <= Date.now()) refuse(410, DEAD_LINK);
  const [crewRes, memberRes, byRes] = await Promise.all([
    db.from("castai_crew").select("name, name_open").eq("id", inv!.crew_id).maybeSingle(),
    db.from(MEMBERS).select("display_name").eq("crew_id", inv!.crew_id).eq("user_id", inv!.user_id).maybeSingle(),
    inv!.created_by && inv!.created_by !== inv!.user_id
      ? db.from(MEMBERS).select("display_name").eq("crew_id", inv!.crew_id).eq("user_id", inv!.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const crew = must(crewRes, "link crew") as { name: string; name_open: boolean } | null;
  const member = must(memberRes, "link member") as { display_name: string } | null;
  const by = must(byRes, "link maker") as { display_name: string } | null;
  // A link for someone who is no longer on the crew opens nothing.
  if (!crew || !member) refuse(410, DEAD_LINK);
  if (!(await inviteMadeIt(inv!.user_id))) refuse(410, DEAD_LINK);
  const answer = { ok: true, name: member!.display_name, crew: crew!.name, by: by ? by.display_name : null, nameOpen: crew!.name_open === true };
  if (body.peek) return answer;

  const email = await emailFor(inv!.user_id);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const minted = data?.properties?.hashed_token;
  if (error || !minted) throw new Error("mint sign-in failed: " + (error?.name || "no token"));
  must(await db.from(INVITES).update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash), "link used");
  return { ...answer, token_hash: minted };
}

// ---- signed in -------------------------------------------------------------

export async function state(userId: string) {
  const [ctx, sms] = await Promise.all([context(userId), smsOn()]);
  if (!ctx) return { me: { id: userId, name: "You" }, crew: null, members: [], trips: [], sms };
  const ids = ctx.members.map((m) => m.user_id);
  const [facts, prefs, trips] = await Promise.all([accounts(ids), prefsFor(ids), tripsSince(ctx, addDays(ctx.today, -30))]);
  return {
    me: { id: userId, name: ctx.member.display_name },
    // nameOpen: nobody has named the crew yet, and anyone on it may.
    crew: { id: ctx.crew.id, name: ctx.crew.name, role: ctx.member.role, nameOpen: ctx.crew.name_open === true },
    // alerts: this person has a channel on, so they can be told. signIn: how they get in.
    members: ctx.members.map((m) => ({
      id: m.user_id, name: m.display_name, role: m.role,
      alerts: hears(prefs.get(m.user_id)) as boolean,
      signIn: signInWith(facts.get(m.user_id)?.invited) as string,
    })),
    trips,
    sms,
  };
}

// The address an account signs in with. An account that has none (a phone
// only CastAI account, say) is given a stand-in, which no answer ever carries.
async function emailFor(userId: string): Promise<string> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error("account lookup failed: " + (error?.name || "no user"));
  if (data.user.email) return data.user.email;
  const email = placeholderEmail();
  const up = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (up.error) throw new Error("stand-in address failed: " + up.error.name);
  return email;
}

// One exact lookup in the database, so a number can never be missed and
// given a second account.
async function userByPhone(phone: string): Promise<string | null> {
  return (must(await db.rpc("castai_crew_user_by_phone", { p_phone: phone }), "phone lookup") as string | null) || null;
}

// A new account for someone the owner added. Marked in app_metadata, which
// only the service role can write, so it can be told apart later. With a phone
// the account is the phone number, and its stand-in address is added by
// emailFor, the same way as for a phone account that was already there. null
// means the number was taken in the meantime: look it up again and attach.
async function createAccount(phone: string | null): Promise<string | null> {
  const mark = { app_metadata: { crew_invited: true } };
  const { data, error } = await db.auth.admin.createUser(
    phone ? { phone, phone_confirm: true, ...mark } : { email: placeholderEmail(), email_confirm: true, ...mark },
  );
  if (data?.user) return data.user.id;
  if (phone) return null;
  throw new Error("create account failed: " + (error?.name || "no user"));
}

// A fresh personal link. Rows that are already dead (revoked or run out) are
// cleared first, so nothing piles up. With replace, whatever was live is
// revoked: that is the owner's New link. Without it the older links keep
// working, so adding someone twice by mistake never kills a link already sent.
async function freshLink(crewId: string, userId: string, by: string, replace: boolean): Promise<string> {
  const theirs = () => db.from(INVITES);
  must(await theirs().delete().eq("crew_id", crewId).eq("user_id", userId).eq("revoked", true), "clear revoked links");
  must(await theirs().delete().eq("crew_id", crewId).eq("user_id", userId).lt("expires_at", new Date().toISOString()), "clear old links");
  if (replace) must(await theirs().update({ revoked: true }).eq("crew_id", crewId).eq("user_id", userId), "revoke links");
  const token = newToken();
  must(await theirs().insert({
    token_hash: await hashToken(token), crew_id: crewId, user_id: userId, created_by: by,
    expires_at: new Date(Date.now() + LINK_DAYS * 864e5).toISOString(),
  }), "new link");
  return joinLink(token);
}

// Owner only. With a phone, an account that already has that number is
// attached, never doubled. Without one, a new account that only its link opens.
// The answer carries a link only for an account an invite made. Someone who
// already had an account is added with link null and signIn "code".
export async function invite(ctx: Ctx, body: Body) {
  if (!canInvite(ctx.member)) refuse(403, "Only the owner can add someone.");
  const name = clean(() => cleanText(body.name, 60, "name"));
  const blank = body.phone === undefined || body.phone === null || (typeof body.phone === "string" && !body.phone.trim());
  const phone = blank ? null : clean(() => normalizePhone(body.phone) as string);

  let userId = phone ? await userByPhone(phone) : null;
  const onCrew = userId ? ctx.members.find((m) => m.user_id === userId) : null;
  let outcome = inviteOutcome({ user: userId ? { id: userId } : null, member: onCrew || null });
  if (outcome === "already") {
    // Nothing changes. Someone the invite made gets one more link to hand over,
    // and the ones already sent still work.
    const invited = await inviteMadeIt(userId!);
    const link = invited ? await freshLink(ctx.crew.id, userId!, ctx.me, false) : null;
    return inviteAnswer({ created: false, name: onCrew!.display_name, userId, invited, link });
  }
  let made = false;
  if (outcome === "create") {
    userId = await createAccount(phone);
    made = !!userId;
    if (!userId) { userId = await userByPhone(phone!); outcome = "attach"; }
    if (!userId) throw new Error("create account failed and the number is still free");
  }
  try {
    // An account just made here is the invite's own. One that was already
    // there is asked about: it may be someone's real account.
    const invited = made || (await inviteMadeIt(userId!));
    if (outcome === "attach") {
      // One crew per person for now. Someone on another crew stays there.
      const elsewhere = must(
        await db.from(MEMBERS).select("crew_id").eq("user_id", userId).neq("crew_id", ctx.crew.id).limit(1),
        "other crews",
      ) as unknown[] | null;
      if (elsewhere && elsewhere.length) refuse(400, "That number is already on another crew.");
    }
    // A link's sign-in is minted from an address, and a phone account the
    // invite made may have none yet. A real account is never touched.
    if (invited && phone) await emailFor(userId!);
    const ins = await db.from(MEMBERS).insert({ crew_id: ctx.crew.id, user_id: userId, role: "member", display_name: name, invited_by: ctx.me });
    if (ins.error && ins.error.code !== "23505") throw new Error("db add member: " + JSON.stringify(ins.error));
    const link = invited ? await freshLink(ctx.crew.id, userId!, ctx.me, true) : null;
    return inviteAnswer({ created: !ins.error, name, userId, invited, link });
  } catch (e) {
    // Do not leave an account behind that is on no crew and has no link.
    if (made) await db.auth.admin.deleteUser(userId!).catch(() => {});
    throw e;
  }
}

// The owner for anyone on the crew, or anyone for themselves, and only for an
// account an invite made. Every older link for that person stops working.
export async function link(ctx: Ctx, body: Body) {
  const userId = uuid(body.userId, "person");
  const self = userId === ctx.me;
  const target = ctx.members.find((m) => m.user_id === userId);
  // Asked only once it could matter, so a member learns nothing about anyone else.
  const invited = !!target && (ctx.owner || self) ? await inviteMadeIt(userId) : false;
  const no = linkRefusal({ owner: ctx.owner, self, onCrew: !!target, invited }) as { status: number; words: string } | null;
  if (no) refuse(no.status, no.words);
  return { ok: true, name: target!.display_name, link: await freshLink(ctx.crew.id, userId, ctx.me, true) };
}

// Owner only, and never the owner himself. Their links stop working, they are
// off every trip's going list, nothing on a list is theirs any more, and no
// alert still waiting from this crew will reach them.
// A person is called what the crew calls them, and that is theirs to set.
// (Coach is "Coach" to his team, not to his fishing buddy or his dad.)
export async function meRename(ctx: Ctx, body: Body) {
  const name = clean(() => cleanText(body.name, 60, "name"));
  must(await db.from(MEMBERS).update({ display_name: name }).eq("crew_id", ctx.crew.id).eq("user_id", ctx.me), "rename member");
  return { ok: true, name };
}

// The crew's name. The owner sets it whenever he likes. While its name is
// open, anyone on the crew may name it, once: the first name saved closes it,
// and from then on only the owner renames it. A member's name only lands
// while it is still open, checked in the same statement that writes it, so of
// two people naming it at the same instant only the first one counts.
export async function crewRename(ctx: Ctx, body: Body) {
  const no = crewRenameRefusal({ owner: ctx.owner, nameOpen: ctx.crew.name_open === true }) as { status: number; words: string } | null;
  if (no) refuse(no.status, no.words);
  const name = clean(() => cleanText(body.name, 60, "crew name"));
  if (ctx.owner) {
    must(await db.from("castai_crew").update({ name, name_open: false }).eq("id", ctx.crew.id), "rename crew");
  } else {
    const named = must(
      await db.from("castai_crew").update({ name, name_open: false }).eq("id", ctx.crew.id).eq("name_open", true).select("id"),
      "name crew",
    ) as unknown[] | null;
    if (!named || !named.length) refuse(403, NAME_TAKEN);
  }
  return { ok: true, name };
}

// Owner only: open the crew's name, so the next person on it names it, or
// close it again.
export async function crewNameOpen(ctx: Ctx, body: Body) {
  if (!canInvite(ctx.member)) refuse(403, "Only the owner decides who names the crew.");
  const open = clean(() => cleanOpen(body.open) as boolean);
  must(await db.from("castai_crew").update({ name_open: open }).eq("id", ctx.crew.id), "name open");
  return { ok: true, nameOpen: open };
}

export async function memberRemove(ctx: Ctx, body: Body) {
  if (!canInvite(ctx.member)) refuse(403, "Only the owner can remove someone.");
  const userId = uuid(body.userId, "person");
  const target = ctx.members.find((m) => m.user_id === userId);
  if (!target) refuse(404, "That person is not on the crew.");
  if (target!.role === "owner" || userId === ctx.me) refuse(403, "The owner stays on the crew.");
  must(await db.from(INVITES).update({ revoked: true }).eq("crew_id", ctx.crew.id).eq("user_id", userId), "revoke links");
  await forgetOnTrips(ctx.crew.id, userId);
  await forgetAlerts(ctx.crew.id, userId);
  must(await db.from(MEMBERS).delete().eq("crew_id", ctx.crew.id).eq("user_id", userId), "remove member");
  await dropGhost(userId);
  return { ok: true };
}

// Un-inviting someone who never joined leaves no empty account behind. The
// rule is ghostAccount in crew-core; every other kind of account is kept.
// The person is already off the crew, so a failure here is logged, not sent.
async function dropGhost(userId: string) {
  try {
    const [{ data }, crews, owned] = await Promise.all([
      db.auth.admin.getUserById(userId),
      db.from(MEMBERS).select("crew_id").eq("user_id", userId).limit(1),
      db.from("castai_crew").select("id").eq("owner", userId).limit(1),
    ]);
    if (crews.error || owned.error) return;
    const ghost = ghostAccount({ user: data?.user || null, otherCrews: (crews.data || []).length, ownsCrew: (owned.data || []).length > 0 });
    if (!ghost) return;
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) console.error("crew: empty account not deleted:", error.name);
  } catch (e) {
    console.error("crew: empty account check failed:", (e as Error).name);
  }
}
