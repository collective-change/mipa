// Firebase (modular SDK) initialization.
// Import Firestore/Auth functions directly from "firebase/firestore" and
// "firebase/auth" where needed; this module only provides the instances.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.apiKey,
  authDomain: import.meta.env.authDomain,
  databaseURL: import.meta.env.databaseURL,
  projectId: import.meta.env.projectId,
  storageBucket: import.meta.env.storageBucket,
  messagingSenderId: import.meta.env.messagingSenderId,
  appId: import.meta.env.appId
};

const isTest = import.meta.env.MODE === "test";
const useEmulators = isTest || import.meta.env.useEmulators === "true";

// In tests .env is not loaded; Firebase needs at least an api key and project id.
if (isTest) {
  firebaseConfig.apiKey = "fake-api-key";
  firebaseConfig.projectId = "fake-project-id";
}

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
// Callable Cloud Functions (functions/src); same region as their deployment.
const firebaseFunctions = getFunctions(firebaseApp, "us-central1");

// Offline persistence (shared across tabs) in production builds.
const firebaseDb = initializeFirestore(firebaseApp, {
  localCache:
    import.meta.env.PROD && !useEmulators
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache()
});

if (useEmulators) {
  console.log("Using Firebase emulators");
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", {
    disableWarnings: true
  });
  connectFirestoreEmulator(firebaseDb, "127.0.0.1", 5002);
  connectFunctionsEmulator(firebaseFunctions, "127.0.0.1", 5001);
}

export {
  firebaseApp,
  firebaseAuth,
  firebaseDb,
  firebaseFunctions,
  firebaseConfig,
  useEmulators
};

// Quasar boot entry (instances are created on import above).
export default () => {};
