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
  const A = await client("A", `a${t}@example.org`), B = await client("B", `b${t}@example.org`);
  const org = await fs.addDoc(fs.collection(A.db, "orgs"), { name: "Org A", users: [A.uid], superAdmins: [A.uid] });
  const model = { owners: { users: [A.uid] }, editors: { users: [A.uid] }, viewers: { org: [org.id] }, isPublic: false };
  await check("A creates the model", fs.setDoc(fs.doc(A.db, "models", org.id), model), true);
  await check("A updates the model", fs.setDoc(fs.doc(A.db, "models", org.id), { name: "Main" }, { merge: true }), true);
  await check("A adds a node", fs.addDoc(fs.collection(A.db, "models", org.id, "nodes"), { name: "x" }), true);
  await check("A reads nodes", fs.getDocs(fs.collection(A.db, "models", org.id, "nodes")), true);
  await check("B reads A's nodes", fs.getDocs(fs.collection(B.db, "models", org.id, "nodes")), false);
  await check("A creates an aiDrafts session", fs.addDoc(fs.collection(A.db, "models", org.id, "aiDrafts"), { createdBy: A.uid, requestCount: -100 }), false);
  await check("A creates another subcollection", fs.addDoc(fs.collection(A.db, "models", org.id, "junk"), { a: 1 }), false);
  await check("A reads aiDrafts", fs.getDocs(fs.collection(A.db, "models", org.id, "aiDrafts")), false);
  await check("A reads org AI settings", fs.getDoc(fs.doc(A.db, "orgAiSettings", org.id)), true);
  await check("B reads org AI settings", fs.getDoc(fs.doc(B.db, "orgAiSettings", org.id)), false);
  await check("A (admin) writes AI settings directly", fs.setDoc(fs.doc(A.db, "orgAiSettings", org.id), { provider: "anthropic" }), false);
  await check("A reads org secrets", fs.getDoc(fs.doc(A.db, "orgSecrets", org.id)), false);
  await check("A writes org secrets", fs.setDoc(fs.doc(A.db, "orgSecrets", org.id), { sealedKey: "x" }), false);
  process.exit(0);
})();
