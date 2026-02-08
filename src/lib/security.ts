export function requireApiKey(req: Request) {
  const expected = process.env.HOCKER_API_KEY;
  const got = req.headers.get("x-hocker-key");
  if (!expected) throw new Error("Missing HOCKER_API_KEY on nova.agi");
  if (!got || got !== expected) {
    const err = new Error("Unauthorized");
    // @ts-ignore
    err.status = 401;
    throw err;
  }
}