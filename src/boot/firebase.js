// Firebase App (the core Firebase SDK) is always required and must be listed first
import * as firebase from "firebase/app";

// Add the Firebase products that you want to use
import "firebase/auth";
import "firebase/firestore";

import { showErrorMessage } from "src/functions/function-show-error-message";

// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: "AIzaSyAdeJJGRZwCSeE-hc0uALhMrrrInUWHqyY",
  authDomain: "mipa-1.firebaseapp.com",
  databaseURL: "https://mipa-1.firebaseio.com",
  projectId: "mipa-1",
  storageBucket: "",
  messagingSenderId: "960836598374",
  appId: "1:960836598374:web:063890d614348251"
};
// Initialize Firebase
let firebaseApp = firebase.initializeApp(firebaseConfig);
let firebaseAuth = firebaseApp.auth();
let firebaseDb = firebaseApp.firestore();

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

// Export types that exists in Firestore
// This is not always necessary, but it's used in other examples in Vuefire docs
const { TimeStamp, GeoPoint } = firebase.firestore;
export { TimeStamp, GeoPoint };

export { firebase, firebaseApp, firebaseAuth, firebaseDb };
