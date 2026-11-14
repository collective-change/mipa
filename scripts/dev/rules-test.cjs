const req = require("module").createRequire(require("path").join(__dirname, "../../package.json"));
const { initializeApp, deleteApp } = req("firebase/app");
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } = req("firebase/auth");
const fs = req("firebase/firestore");
const cfg = { projectId: "demo-mipa", apiKey: "demo" };
const check = async (label, p, expectOk) => {
  try { await p; console.log((expectOk ? "PASS" : "FAIL"), label, "(allowed)"); }
  catch (e) { console.log((expectOk ? "FAIL" : "PASS"), label, "(" + e.code + ")"); }
};
async function client(name, email) {
  const app = initializeApp(cfg, name);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = fs.getFirestore(app); fs.connectFirestoreEmulator(db, "127.0.0.1", 5002);
  if (email) await createUserWithEmailAndPassword(auth, email, "correct-horse-42");
  return { app, auth, db, uid: auth.currentUser?.uid };
}
(async () => {
  const t = Date.now();
  const A = await client("A", `a${t}@example.org`), B = await client("B", `b${t}@example.org`), anon = await client("anon");
  await fs.setDoc(fs.doc(A.db, "users", A.uid), { email: `a${t}@example.org` });
  await fs.setDoc(fs.doc(B.db, "users", B.uid), { email: `b${t}@example.org` });
  const org = await fs.addDoc(fs.collection(A.db, "orgs"), { name: "Org A", users: [A.uid], superAdmins: [A.uid] });
  await check("A writes own member entry", fs.setDoc(fs.doc(A.db, "orgs", org.id, "members", A.uid), { email: "a", displayName: "a" }), true);
  await check("A lists own org members", fs.getDocs(fs.collection(A.db, "orgs", org.id, "members")), true);
  await check("B lists org A members", fs.getDocs(fs.collection(B.db, "orgs", org.id, "members")), false);
  await check("B adds itself to org A members", fs.setDoc(fs.doc(B.db, "orgs", org.id, "members", B.uid), { email: "b" }), false);
  await check("A reads own profile", fs.getDoc(fs.doc(A.db, "users", A.uid)), true);
  await check("B reads A's profile", fs.getDoc(fs.doc(B.db, "users", A.uid)), false);
  await check("B lists all users", fs.getDocs(fs.collection(B.db, "users")), false);
  const chat = await fs.addDoc(fs.collection(A.db, "chats"), { orgId: org.id, members: [A.uid], membersOnly: true, newestMessages: ["secret"] });
  const open = await fs.addDoc(fs.collection(A.db, "chats"), { orgId: org.id, members: [A.uid], membersOnly: false, newestMessages: [] });
  await check("A reads own chat", fs.getDoc(fs.doc(A.db, "chats", chat.id)), true);
  await check("A queries own unread chats", fs.getDocs(fs.query(fs.collection(A.db, "chats"), fs.where("members", "array-contains", A.uid))), true);
  await check("A reads org's open chat", fs.getDoc(fs.doc(A.db, "chats", open.id)), true);
  await check("B reads A's chat", fs.getDoc(fs.doc(B.db, "chats", chat.id)), false);
  await check("B reads org A's open chat", fs.getDoc(fs.doc(B.db, "chats", open.id)), false);
  await check("signed-out reads chat", fs.getDoc(fs.doc(anon.db, "chats", chat.id)), false);
  await check("signed-out edits chat", fs.updateDoc(fs.doc(anon.db, "chats", chat.id), { newestMessages: [] }), false);
  for (const c of [A, B, anon]) await deleteApp(c.app);
  process.exit(0);
})();
