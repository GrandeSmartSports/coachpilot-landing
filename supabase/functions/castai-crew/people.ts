// Who is on the crew and how they get in: the open questions (hello, join),
// what a signed-in person sees (state), and the owner's three moves (add
// someone, a new link, remove someone).
//
// A member's phone number or email never leaves this file. Names only.
import {
  addDays, canInvite, cleanText, DEAD_LINK, ghostAccount, hashToken, inviteOutcome, joinLink, joinToken, LINK_DAYS,
  newToken, normalizePhone, placeholderEmail,
} from "./crew-core.mjs";
import { Body, clean, context, Ctx, db, must, refuse, smsOn, uuid } from "./lib.ts";
import { forgetOnTrips, tripsSince } from "./trips.ts";

const INVITES = "castai_crew_invites", MEMBERS = "castai_crew_members";

// ---- no sign-in needed -----------------------------------------------------

export async function hello() {
  return { ok: true, sms: await smsOn() };
}

// A join link is the way in. With peek it only says who it is for and which
// crew, and nothing is minted: message previews load pages, and a preview
// must not burn or open anything. Without peek it mints a one-time sign-in
// for that one account, which the page trades for a session.
export async function join(body: Body) {
  if (typeof body.token !== "string" || !body.token.trim()) refuse(400, "A link is needed.");
  const token = joinToken(body.token);
  if (!token) refuse(410, DEAD_LINK);
  const hash = await hashToken(token);
  const inv = must(await db.from(INVITES).select("*").eq("token_hash", hash).maybeSingle(), "link") as Record<string, any> | null;
  if (!inv || inv.revoked || Date.parse(inv.expires_at) <= Date.now()) refuse(410, DEAD_LINK);
  const [crewRes, memberRes, byRes] = await Promise.all([
    db.from("castai_crew").select("name").eq("id", inv!.crew_id).maybeSingle(),
    db.from(MEMBERS).select("display_name").eq("crew_id", inv!.crew_id).eq("user_id", inv!.user_id).maybeSingle(),
    inv!.created_by && inv!.created_by !== inv!.user_id
      ? db.from(MEMBERS).select("display_name").eq("crew_id", inv!.crew_id).eq("user_id", inv!.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const crew = must(crewRes, "link crew") as { name: string } | null;
  const member = must(memberRes, "link member") as { display_name: string } | null;
  const by = must(byRes, "link maker") as { display_name: string } | null;
  // A link for someone who is no longer on the crew opens nothing.
  if (!crew || !member) refuse(410, DEAD_LINK);
  const answer = { ok: true, name: member!.display_name, crew: crew!.name, by: by ? by.display_name : null };
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
  return {
    me: { id: userId, name: ctx.member.display_name },
    crew: { id: ctx.crew.id, name: ctx.crew.name, role: ctx.member.role },
    members: ctx.members.map((m) => ({ id: m.user_id, name: m.display_name, role: m.role })),
    trips: await tripsSince(ctx, addDays(ctx.today, -30)),
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
export async function invite(ctx: Ctx, body: Body) {
  if (!canInvite(ctx.member)) refuse(403, "Only the owner can add someone.");
  const name = clean(() => cleanText(body.name, 60, "name"));
  const blank = body.phone === undefined || body.phone === null || (typeof body.phone === "string" && !body.phone.trim());
  const phone = blank ? null : clean(() => normalizePhone(body.phone) as string);

  let userId = phone ? await userByPhone(phone) : null;
  const onCrew = userId ? ctx.members.find((m) => m.user_id === userId) : null;
  let outcome = inviteOutcome({ user: userId ? { id: userId } : null, member: onCrew || null });
  if (outcome === "already") {
    // Nothing changes but one more link to hand over. The ones already sent still work.
    return { ok: true, created: false, name: onCrew!.display_name, userId, link: await freshLink(ctx.crew.id, userId!, ctx.me, false) };
  }
  let made = false;
  if (outcome === "create") {
    userId = await createAccount(phone);
    made = !!userId;
    if (!userId) { userId = await userByPhone(phone!); outcome = "attach"; }
    if (!userId) throw new Error("create account failed and the number is still free");
  }
  try {
    if (outcome === "attach") {
      // One crew per person for now. Someone on another crew stays there.
      const elsewhere = must(
        await db.from(MEMBERS).select("crew_id").eq("user_id", userId).neq("crew_id", ctx.crew.id).limit(1),
        "other crews",
      ) as unknown[] | null;
      if (elsewhere && elsewhere.length) refuse(400, "That number is already on another crew.");
    }
    // A phone account, new or already there, may have no address to sign in with.
    if (phone) await emailFor(userId!);
    const ins = await db.from(MEMBERS).insert({ crew_id: ctx.crew.id, user_id: userId, role: "member", display_name: name, invited_by: ctx.me });
    if (ins.error && ins.error.code !== "23505") throw new Error("db add member: " + JSON.stringify(ins.error));
    const link = await freshLink(ctx.crew.id, userId!, ctx.me, true);
    return { ok: true, created: !ins.error, name, userId, link };
  } catch (e) {
    // Do not leave an account behind that is on no crew and has no link.
    if (made) await db.auth.admin.deleteUser(userId!).catch(() => {});
    throw e;
  }
}

// The owner for anyone on the crew, or anyone for themselves. Every older link
// for that person stops working.
export async function link(ctx: Ctx, body: Body) {
  const userId = uuid(body.userId, "person");
  if (!ctx.owner && userId !== ctx.me) refuse(403, "Only the owner can make a link for someone else.");
  const target = ctx.members.find((m) => m.user_id === userId);
  if (!target) refuse(404, "That person is not on the crew.");
  return { ok: true, name: target!.display_name, link: await freshLink(ctx.crew.id, userId, ctx.me, true) };
}

// Owner only, and never the owner himself. Their links stop working, they are
// off every trip's going list, and nothing on a list is theirs any more.
export async function memberRemove(ctx: Ctx, body: Body) {
  if (!canInvite(ctx.member)) refuse(403, "Only the owner can remove someone.");
  const userId = uuid(body.userId, "person");
  const target = ctx.members.find((m) => m.user_id === userId);
  if (!target) refuse(404, "That person is not on the crew.");
  if (target!.role === "owner" || userId === ctx.me) refuse(403, "The owner stays on the crew.");
  must(await db.from(INVITES).update({ revoked: true }).eq("crew_id", ctx.crew.id).eq("user_id", userId), "revoke links");
  await forgetOnTrips(ctx.crew.id, userId);
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
