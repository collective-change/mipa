// Firebase App (the core Firebase SDK) is always required and must be listed first
import firebase from "firebase/app";

// Add the Firebase products that you want to use
require("firebase/auth").default;
require("firebase/firestore").default;

import { showErrorMessage } from "src/utils/util-show-error-message";

// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId
};

// in test environment, .env is not loaded, so the properties
// in firebaseConfig are all undefined. To initialize firebase
// we need to put in at least a fake api key and fake project id.
if (process.env.NODE_ENV == "test") {
  firebaseConfig.apiKey = "fake-api-key";
  firebaseConfig.projectId = "fake-project-id";
}

// Initialize Firebase
let firebaseApp = firebase.initializeApp(firebaseConfig);
let firebaseAuth = firebaseApp.auth();
let firebaseDb = firebaseApp.firestore();

// Use Firebase emulator for development and testing
if (process.env.NODE_ENV == "development" || process.env.NODE_ENV == "test") {
  console.log("process.env.NODE_ENV", process.env.NODE_ENV);
  console.log("Using Firebase emulators");
  firebaseApp.auth().useEmulator("http://localhost:9099/");
  firebaseDb.useEmulator("localhost", 5002);
}

// set unlimited cache size
/* firebase.firestore().settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
}); */

// enable offline persistence if in production or dev environments
if (
  process.env.NODE_ENV == "production" ||
  process.env.NODE_ENV == "development"
) {
  firebase
    .firestore()
    .enablePersistence({ synchronizeTabs: true })
    .catch(function(err) {
      if (err.code == "failed-precondition") {
        showErrorMessage(
          "Error enabling persistence (failed precondition)",
          error.message
        );
      } else if (err.code == "unimplemented") {
        showErrorMessage(
          "Error enabling persistence (unimplemented)",
          error.message
        );
      }
    });
}

// Export types that exists in Firestore
// This is not always necessary, but it's used in other examples in Vuexfire docs
const { TimeStamp, GeoPoint } = firebase.firestore;
export { TimeStamp, GeoPoint };

export { firebase, firebaseApp, firebaseAuth, firebaseDb };
