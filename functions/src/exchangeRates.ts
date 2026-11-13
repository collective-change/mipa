import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

// Configuration (replaces the removed `functions.config()`):
//  - functions/.env: UPDATE_EXCHANGE_RATES_REGION, _SCHEDULE, _TIME_ZONE
//    (see .env.example)
//  - secret: firebase functions:secrets:set FIXER_IO_ACCESS_KEY
const fixerAccessKey = defineSecret("FIXER_IO_ACCESS_KEY");

interface FixerResponse {
  success: boolean;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
  error?: unknown;
}

export const updateExchangeRates = onSchedule(
  {
    schedule: process.env.UPDATE_EXCHANGE_RATES_SCHEDULE ?? "every 24 hours",
    timeZone: process.env.UPDATE_EXCHANGE_RATES_TIME_ZONE ?? "Etc/UTC",
    region: process.env.UPDATE_EXCHANGE_RATES_REGION ?? "us-central1",
    secrets: [fixerAccessKey]
  },
  async () => {
    const exchangeRates = await getExchangeRates(fixerAccessKey.value());
    if (exchangeRates) await saveExchangeRates(exchangeRates);
  }
);

async function getExchangeRates(
  accessKey: string
): Promise<FixerResponse | null> {
  // fixer.io's free plan only serves plain http.
  const url = `http://data.fixer.io/api/latest?access_key=${encodeURIComponent(
    accessKey
  )}&format=1`;
  try {
    const response = await fetch(url);
    const data = (await response.json()) as FixerResponse;
    if (data.success) {
      logger.info("Retrieved exchange rates");
    } else {
      logger.error("Failed to retrieve exchange rates", data.error);
    }
    return data;
  } catch (error) {
    logger.error("Error requesting exchange rates", error);
    return null;
  }
}

async function saveExchangeRates(exchangeRates: FixerResponse) {
  if (!exchangeRates.rates) {
    logger.error("Missing exchangeRates.rates");
    return;
  }
  await getFirestore()
    .collection("adHocDocs")
    .doc("exchangeRates")
    .set(exchangeRates);
}
