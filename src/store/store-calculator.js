import { defineStore } from "pinia";
import { Notify } from "quasar";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { toPlain } from "@/utils/util-toPlain";
import { i18n } from "@/boot/i18n";
import { firebaseAuth, firebaseConfig, useEmulators } from "@/boot/firebase";
import { useUiStore } from "./store-ui";
import { useCalcResultsStore } from "./store-calcResults";
import { useActionsStore } from "./store-actions";

// Plain-language titles and advice for the calculator's error types
// (the types themselves stay as the worker sends them).
const FRIENDLY_ERRORS = {
  "Unit mismatch": { title: "errUnitTitle", advice: "errUnitAdvice" },
  "Circular dependency detected": { title: "errLoopTitle", advice: "errLoopAdvice" },
  "Parse error": { title: "errParseTitle", advice: "errParseAdvice" },
  "Evaluation error": { title: "errEvalTitle", advice: "errEvalAdvice" },
  "Unit loading error": { title: "errUnknownUnitTitle", advice: "errUnknownUnitAdvice" },
  "Latest value loading error": { title: "errValueTitle", advice: "errValueAdvice" }
};

export const useCalculatorStore = defineStore("calculator", {
  state: () => ({
    calculatorIsRunning: false,
    calculationProgress: 0
  }),

  actions: {
    setCalculatorIsRunning(value) {
      this.calculatorIsRunning = value;
    },

    setCalculationProgress(value) {
      this.calculationProgress = value;
    },

    getNewCalcWorker() {
      if (!window.Worker) {
        showErrorMessage(
          "Web worker not supported by browser. Aborting calculations.",
          ""
        );
        return;
      }
      if (this.calculatorIsRunning) {
        showErrorMessage(
          "Error updating Calculator is currently busy. Please retry in a bit, or reload the page if you believe the calculator has crashed.",
          ""
        );
        return;
      }
      this.setCalculatorIsRunning(true);
      this.setCalculationProgress(0);

      return new Worker(new URL("../workers/calcWorker.js", import.meta.url), {
        type: "module"
      });
    },

    async calculate(payload) {
      let done = false;
      const calcWorker = this.getNewCalcWorker();
      if (!calcWorker) return;

      calcWorker.postMessage(
        toPlain({
          firebaseConfig,
          useEmulators,
          calculationType: payload.calculationType,
          orgId: payload.orgId,
          modelId: payload.modelId,
          modelNodes: payload.nodes,
          exchangeRates: payload.exchangeRates,
          simulationParams: payload.simulationParams,
          roleNodes: payload.roleNodes,
          orgCurrency: payload.orgCurrency,
          customVariables:
            payload.customVariables ||
            (payload.model && payload.model.customVariables) ||
            null,
          actions: payload.actions ? payload.actions : null,
          currentUserId: firebaseAuth.currentUser.uid
        })
      );

      calcWorker.onmessage = async (e) => {
        const uiStore = useUiStore(this.$pinia);
        const calcResultsStore = useCalcResultsStore(this.$pinia);
        const actionsStore = useActionsStore(this.$pinia);

        if (typeof e.data == "string") {
          showErrorMessage("Calculation error", e.data);
          uiStore.setCircularNodeIds([]);
        } else if ("errorType" in e.data) {
          const data = e.data;
          const friendly = FRIENDLY_ERRORS[data.errorType];
          let adviceText = friendly ? i18n.global.t(friendly.advice) : "";

          // If evaluation failed on an affected node whose referenced factors are already linked,
          // do not misleadingly advise the user to link factors that are already linked.
          if (
            data.errorType === "Evaluation error" &&
            data.errorData &&
            data.errorData.nodeId &&
            Array.isArray(payload.nodes)
          ) {
            const affectedNode = payload.nodes.find(
              (n) => n.id === data.errorData.nodeId
            );
            if (affectedNode) {
              const formulaText =
                affectedNode.symbolFormula || affectedNode.sysFormula || "";
              const referencedNodes = payload.nodes.filter(
                (n) =>
                  n.id !== affectedNode.id &&
                  ((affectedNode.sysFormula &&
                    affectedNode.sysFormula.includes("$" + n.id)) ||
                    (n.symbol &&
                      new RegExp(
                        `(?<![\\$\\p{L}\\p{N}_])${n.symbol.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
                        "u"
                      ).test(formulaText)))
              );
              const influencers = Array.isArray(affectedNode.influencers)
                ? affectedNode.influencers
                : [];
              const allLinked =
                referencedNodes.length > 0 &&
                referencedNodes.every((n) => influencers.includes(n.id));
              if (allLinked) {
                adviceText = i18n.global.t("errEvalAdviceAlreadyLinked");
              }
            }
          }

          showErrorMessage(
            friendly ? i18n.global.t(friendly.title) : data.errorType,
            friendly
              ? `${adviceText}<br/><br/><small>${i18n.global.t("Details")}: ${data.errorMessage || ""}</small>`
              : data.errorMessage,
            true // useHtml
          );
          calcWorker.terminate();
          this.setCalculatorIsRunning(false);
          if (data.errorType == "Circular dependency detected") {
            uiStore.setCircularNodeIds(data.errorData.map((node) => node.id));
          } else {
            uiStore.setCircularNodeIds([]);
            if (data.errorData && data.errorData.nodeId) {
              uiStore.setSelectedNodeId(null);
              uiStore.setSelectedNodeId(data.errorData.nodeId);
            }
          }
        } else if ("resultsType" in e.data) {
          uiStore.setCircularNodeIds([]);
          switch (e.data.resultsType) {
            case "baseline":
              await calcResultsStore.saveBaseline(e.data);
              if (payload.calculationType == "baseline") {
                await calcResultsStore.loadBaseline(payload.modelId);
                done = true;
              }
              break;
            case "actions":
              await actionsStore.updateActionsResults(e.data);
              console.log(e.data);
              if (payload.calculationType == "actions") {
                if (e.data.actionsResults.length == 1) {
                  await calcResultsStore.loadResultsOfAction(
                    e.data.actionsResults[0].id
                  );
                }
                done = true;
              }
              break;
          }

          if (done) {
            calcWorker.terminate();
            this.setCalculatorIsRunning(false);
            this.setCalculationProgress(0);
            Notify.create({
              type: "positive",
              message: i18n.global.t("Calculation finished"),
              timeout: 2000
            });
            console.log("Calculation time", e.data.calcTimeMs / 1000, "s");
            console.table(e.data.calcTimeStages);
          }
        } else if ("progressValue" in e.data) {
          this.setCalculationProgress(e.data.progressValue);
        } else {
          uiStore.setCircularNodeIds([]);
          console.log("Error message received from worker: ", e.data);
          showErrorMessage(
            "Error message received from worker. Please see console log.",
            ""
          );
        }
      };
    }
  }
});

export default useCalculatorStore;
