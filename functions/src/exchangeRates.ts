import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

"use strict";

const db = admin.firestore();

export const updateExchangeRates = functions
  .region(functions.config().update_exchange_rates.region)
  .pubsub.schedule(functions.config().update_exchange_rates.schedule)
  .timeZone(functions.config().update_exchange_rates.time_zone)
  .onRun(async context => {
    const exchangeRates = await getExchangeRates();
    await saveExchangeRates(exchangeRates);
  });

async function getExchangeRates() {
  const axios = require("axios").default;
  return axios
    .get(
      "http://data.fixer.io/api/latest?access_key=" +
        functions.config().fixer_io.access_key +
        "&format=1"
    )
    .then((response: { data: any }) => {
      console.log("Retrieved exchange rates");
      return response.data;
    })
    .catch(function(error: any) {
      if (error.response) {
        // Request made and server responded
        console.log(
          "fixer.io access_key",
          functions.config().fixer_io.access_key
        );
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else if (error.request) {
        // The request was made but no response was received
        console.log(error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.log("Error", error.message);
      }
    });
}

async function saveExchangeRates(exchangeRates: any) {
  return db
    .collection("adHocDocs")
    .doc("exchangeRates")
    .set(exchangeRates);
}
