// Calculates a model that isn't saved (such as an AI draft) in the
// calculation worker, to find out whether it calculates, without storing
// any results.

import { firebaseAuth, firebaseConfig, useEmulators } from "@/boot/firebase";
import { toPlain } from "@/utils/util-toPlain";

const TIMEOUT_MS = 60000;

// Resolves { ok: true, baseline } or { ok: false, errorType, errorMessage }.
export function trialCalculate({ nodes, simulationParams, roleNodes, exchangeRates, orgId, modelId, customVariables }) {
  return new Promise(resolve => {
    const worker = new Worker(new URL("../workers/calcWorker.js", import.meta.url), {
      type: "module"
    });
    const finish = result => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, errorType: "Timeout", errorMessage: "The calculation took too long." }),
      TIMEOUT_MS
    );
    worker.onmessage = e => {
      const data = e.data;
      if (typeof data == "string") finish({ ok: false, errorType: "Error", errorMessage: data });
      else if (data && "errorType" in data)
        finish({ ok: false, errorType: data.errorType, errorMessage: plain(data.errorMessage) });
      else if (data && data.resultsType == "baseline") finish({ ok: true, baseline: data });
    };
    worker.onerror = e => finish({ ok: false, errorType: "Error", errorMessage: e.message });
    worker.postMessage(
      toPlain({
        firebaseConfig,
        useEmulators,
        calculationType: "baseline",
        orgId,
        modelId,
        modelNodes: nodes,
        exchangeRates,
        simulationParams,
        roleNodes,
        orgCurrency: simulationParams?.currency || (exchangeRates && exchangeRates.base) || "USD",
        customVariables: customVariables || null,
        actions: null,
        currentUserId: firebaseAuth.currentUser.uid
      })
    );
  });
}

// Resolves { ok: true, baseline, actionsResults } or { ok: false, errorType, errorMessage }.
// Accepts an optional workerFactory for unit tests running outside a browser Web Worker.
export function calculateActionsInWorker({
  nodes,
  actions,
  simulationParams,
  roleNodes,
  exchangeRates,
  orgId,
  modelId,
  orgCurrency,
  customVariables,
  currentUserId,
  workerFactory
}) {
  return new Promise(resolve => {
    const worker = workerFactory
      ? workerFactory()
      : new Worker(new URL("../workers/calcWorker.js", import.meta.url), {
          type: "module"
        });
    let baseline = null;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof worker.terminate === "function") worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, errorType: "Timeout", errorMessage: "The calculation took too long." }),
      TIMEOUT_MS
    );
    worker.onmessage = e => {
      const data = e.data;
      if (typeof data == "string") {
        finish({ ok: false, errorType: "Error", errorMessage: data });
      } else if (data && "errorType" in data) {
        finish({ ok: false, errorType: data.errorType, errorMessage: plain(data.errorMessage) });
      } else if (data && data.resultsType == "baseline") {
        baseline = data;
      } else if (data && data.resultsType == "actions") {
        finish({ ok: true, baseline, actionsResults: data.actionsResults || [] });
      }
    };
    worker.onerror = e => finish({ ok: false, errorType: "Error", errorMessage: e.message });
    worker.postMessage(
      toPlain({
        firebaseConfig,
        useEmulators,
        calculationType: "actions",
        orgId,
        modelId,
        modelNodes: nodes,
        exchangeRates,
        simulationParams,
        roleNodes,
        orgCurrency: orgCurrency || simulationParams?.currency || (exchangeRates && exchangeRates.base) || "USD",
        customVariables: customVariables || null,
        actions,
        currentUserId: currentUserId || (firebaseAuth.currentUser && firebaseAuth.currentUser.uid) || "sample"
      })
    );
  });
}

// The worker's messages use <br/> as line breaks and no other markup. The
// result is shown as text (escaped by Vue) and sent to the AI as text, never
// inserted as HTML.
function plain(message) {
  return String(message || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
