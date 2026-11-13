// Firebase (modular SDK) initialization.
// Import Firestore/Auth functions directly from "firebase/firestore" and
// "firebase/auth" where needed; this module only provides the instances.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId
};

const isTest = process.env.NODE_ENV === "test";
const useEmulators = isTest || process.env.useEmulators === "true";

// In tests .env is not loaded; Firebase needs at least an api key and project id.
if (isTest) {
  firebaseConfig.apiKey = "fake-api-key";
  firebaseConfig.projectId = "fake-project-id";
}

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

// Offline persistence (shared across tabs) in production builds.
const firebaseDb = initializeFirestore(firebaseApp, {
  localCache:
    process.env.PROD && !useEmulators
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache()
});

if (useEmulators) {
  console.log("Using Firebase emulators");
  connectAuthEmulator(firebaseAuth, "http://localhost:9099", {
    disableWarnings: true
  });
  connectFirestoreEmulator(firebaseDb, "localhost", 5002);
}

export { firebaseApp, firebaseAuth, firebaseDb, firebaseConfig, useEmulators };

// Quasar boot entry (instances are created on import above).
export default () => {};
