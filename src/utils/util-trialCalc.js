// Calculates a model that isn't saved (such as an AI draft) in the
// calculation worker, to find out whether it calculates, without storing
// any results.

import { firebaseAuth, firebaseConfig, useEmulators } from "@/boot/firebase";
import { toPlain } from "@/utils/util-toPlain";

const TIMEOUT_MS = 60000;

// Resolves { ok: true, baseline } or { ok: false, errorType, errorMessage }.
export function trialCalculate({ nodes, simulationParams, roleNodes, exchangeRates, orgId, modelId }) {
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
        actions: null,
        currentUserId: firebaseAuth.currentUser.uid
      })
    );
  });
}

function plain(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
