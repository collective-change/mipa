const req = require("module").createRequire(require("path").join(__dirname, "../../package.json"));
const { initializeApp, deleteApp } = req("firebase/app");
const A_ = req("firebase/auth"), fs = req("firebase/firestore"), fn = req("firebase/functions");
const cfg = { projectId: "demo-mipa", apiKey: "demo" };
let failures = 0;
const check = async (label, p, expectOk) => {
  try { await p; console.log((expectOk ? "PASS" : "FAIL"), label, "(ok)"); if (!expectOk) failures++; }
  catch (e) { console.log((expectOk ? "FAIL" : "PASS"), label, "(" + (e.code || e.message) + ")"); if (expectOk) failures++; }
};
const expectEq = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? "PASS" : "FAIL", label, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) failures++; };
async function client(name, email) {
  const app = initializeApp(cfg, name);
  const auth = A_.getAuth(app); A_.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = fs.getFirestore(app); fs.connectFirestoreEmulator(db, "127.0.0.1", 5002);
  const f = fn.getFunctions(app, "us-central1"); fn.connectFunctionsEmulator(f, "127.0.0.1", 5001);
  await A_.createUserWithEmailAndPassword(auth, email, "correct-horse-42");
  return { app, auth, db, uid: auth.currentUser.uid, email, call: (n, d) => fn.httpsCallable(f, n)(d) };
}
async function verify(c) {
  await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId: c.uid, emailVerified: true }) });
  await c.auth.currentUser.reload(); await c.auth.currentUser.getIdToken(true);
}
(async () => {
  const t = Date.now();
  const A = await client("A", `a${t}@example.org`), B = await client("B", `B${t}@Example.org`), C = await client("C", `c${t}@example.org`);
  // A creates an org the way the app does
  await check("create org with someone else as member is refused",
    fs.addDoc(fs.collection(A.db, "orgs"), { name: "X", users: [A.uid, C.uid], superAdmins: [A.uid] }), false);
  const org = await fs.addDoc(fs.collection(A.db, "orgs"), { name: "Org A", goal: "g", users: [A.uid], superAdmins: [A.uid] });
  await fs.setDoc(fs.doc(A.db, "orgs", org.id, "members", A.uid), { email: A.email, displayName: "a" });
  await fs.setDoc(fs.doc(A.db, "models", org.id), { owners: { users: [A.uid] }, editors: { users: [A.uid] }, viewers: { org: [org.id] }, isPublic: false, name: "Main" });
  // invitations
  const inv = { email: B.email.toLowerCase(), role: "member", orgId: org.id, orgName: "Org A", invitedBy: A.uid, invitedByName: A.email, createTime: fs.serverTimestamp() };
  await check("C (not admin) cannot invite", fs.addDoc(fs.collection(C.db, "orgs", org.id, "invitations"), { ...inv, invitedBy: C.uid }), false);
  await check("A cannot invite with mixed-case email", fs.addDoc(fs.collection(A.db, "orgs", org.id, "invitations"), { ...inv, email: B.email }), false);
  const invRef = await fs.addDoc(fs.collection(A.db, "orgs", org.id, "invitations"), inv);
  console.log("PASS A invites B");
  const mine = await fs.getDocs(fs.query(fs.collectionGroup(B.db, "invitations"), fs.where("email", "==", B.email.toLowerCase())));
  expectEq("B finds its invitation (mixed-case login email)", mine.docs.map(d => d.get("orgName")), ["Org A"]);
  await check("C cannot see B's invitation", fs.getDoc(invRef.withConverter ? fs.doc(C.db, invRef.path) : null), false);
  await check("C cannot query B's invitations", fs.getDocs(fs.query(fs.collectionGroup(C.db, "invitations"), fs.where("email", "==", B.email.toLowerCase()))), false);
  await check("B cannot add itself to org directly", fs.updateDoc(fs.doc(B.db, "orgs", org.id), { users: fs.arrayUnion(B.uid) }), false);
  await check("B accepts before verifying email", B.call("acceptInvitation", { orgId: org.id, invitationId: invRef.id }), false);
  await verify(B);
  await check("C (verified, wrong email) cannot accept B's invitation", (async () => { await verify(C); return C.call("acceptInvitation", { orgId: org.id, invitationId: invRef.id }); })(), false);
  await check("B accepts after verifying", B.call("acceptInvitation", { orgId: org.id, invitationId: invRef.id }), true);
  const orgAfter = (await fs.getDoc(fs.doc(A.db, "orgs", org.id))).data();
  expectEq("B is a member, not admin", [orgAfter.users.includes(B.uid), orgAfter.superAdmins.includes(B.uid)], [true, false]);
  const model = (await fs.getDoc(fs.doc(B.db, "models", org.id))).data();
  expectEq("B can open the model and is an editor", model.editors.users.includes(B.uid), true);
  expectEq("invitation removed", (await fs.getDocs(fs.collection(A.db, "orgs", org.id, "invitations"))).size, 0);
  expectEq("B listed in members", (await fs.getDocs(fs.collection(B.db, "orgs", org.id, "members"))).docs.map(d => d.id).sort(), [A.uid, B.uid].sort());
  await check("B (member) can rename org", fs.updateDoc(fs.doc(B.db, "orgs", org.id), { goal: "new goal" }), true);
  await check("B (member) cannot make itself admin directly", fs.updateDoc(fs.doc(B.db, "orgs", org.id), { superAdmins: fs.arrayUnion(B.uid) }), false);
  await check("B (member) cannot change roles", B.call("setMemberRole", { orgId: org.id, memberId: B.uid, role: "admin" }), false);
  await check("B (member) cannot remove A", B.call("removeMember", { orgId: org.id, memberId: A.uid }), false);
  await check("A cannot leave as the only admin", A.call("removeMember", { orgId: org.id, memberId: A.uid }), false);
  await check("A makes B admin", A.call("setMemberRole", { orgId: org.id, memberId: B.uid, role: "admin" }), true);
  await check("B (now admin) removes A", B.call("removeMember", { orgId: org.id, memberId: A.uid }), true);
  await check("A can no longer read the org", fs.getDoc(fs.doc(A.db, "orgs", org.id)), false);
  await check("A can no longer read the model", fs.getDoc(fs.doc(A.db, "models", org.id)), false);
  await check("B cannot demote itself as the only admin", B.call("setMemberRole", { orgId: org.id, memberId: B.uid, role: "member" }), false);
  console.log(failures ? `${failures} FAILURES` : "ALL PASSED");
  for (const c of [A, B, C]) await deleteApp(c.app);
  process.exit(0);
})().catch(e => { console.error("SCRIPT ERROR", e); process.exit(1); });
