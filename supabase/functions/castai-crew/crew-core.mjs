// The crew's decisions, with no imports, so the Deno function and the node
// tests run the same code.

// Coach types a number the way he has it in his phone. Everything here has to
// land on one account, because the account IS the phone number.
export function normalizePhone(raw) {
  const digits = String(raw == null ? "" : raw).replace(/\D+/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  throw new Error("that does not look like a US phone number");
}

// Only the owner adds people. Everyone else is along for the ride.
export function canInvite(member) {
  return !!member && member.role === "owner";
}

// An invited number may already have a CastAI account. Attach it; never make
// a second account for the same person.
export function inviteOutcome({ user, member }) {
  if (member) return "already";
  return user ? "attach" : "create";
}
