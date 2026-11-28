import { defineStore } from "pinia";
import { uid, Notify } from "quasar";
import { unref } from "vue";
import { firebaseDb, firebaseAuth, firebaseFunctions } from "@/boot/firebase";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { firestoreAction } from "./firestore-bind";
import { showErrorMessage } from "@/utils/util-show-error-message";
import { slugify } from "@/utils/util-slugify";
import { i18n } from "@/boot/i18n";
import { buildSampleOrg, sampleCurrencyFor } from "@/utils/sample-org";
import { compileDraftNodes, roleNodesOf, isCurrencyRoleNode } from "@/utils/util-model-draft";
import { calculateActionsInWorker } from "@/utils/util-trialCalc";
import { useAdHocDocsStore } from "./store-adHocDocs";
import { useCalcResultsStore } from "./store-calcResults";

const SAMPLE_SIMULATION_PARAMS = {
  finalTimeNumber: 120,
  finalTimeUnit: "months",
  numTimeSteps: 120,
  orgWeightingFactor: 1,
  timeStepGrowthRate: 0,
  timeStepNumber: 1,
  timeStepUnit: "months",
  worldToOrgWeightingRatio: 0.5,
  worldWeightingFactor: 1
};

export const useOrgsStore = defineStore("orgs", {
  state: () => ({
    currentOrg: null,
    orgs: null
  }),

  actions: {
    clearOrgs() {
      this.orgs = null;
    },

    updateOrg(payload) {
      console.log(payload);
      if (payload.updates.name) {
        payload.updates.nameSlug = slugify(payload.updates.name);
      }
      const newCurrency = payload.updates.currency;
      const pinia = this.$pinia;
      return setDoc(doc(firebaseDb, "orgs", payload.id), payload.updates, {
        merge: true
      })
        .then(async function () {
          Notify.create(i18n.global.t("toastOrgUpdated"));
          if (newCurrency) {
            const modelMod = await import("./store-model");
            if (modelMod.useModelStore) {
              const modelStore = modelMod.useModelStore(pinia);
              if (modelStore.currentModel?.id) {
                const modelId = modelStore.currentModel.id;
                const roleNodes = modelStore.currentModel.roleNodes || {};
                const nodes = modelStore.nodes || [];
                const changedNodes = [];
                nodes.forEach((node) => {
                  if (isCurrencyRoleNode(node, roleNodes) && node.unit !== newCurrency) {
                    changedNodes.push({ id: node.id, changes: { unit: newCurrency } });
                  }
                });
                if (changedNodes.length > 0) {
                  await modelStore.updateNodes({
                    modelId,
                    changedNodes,
                    orgCurrency: newCurrency
                  });
                }
              }
            }
          }
        })
        .catch(function (error) {
          showErrorMessage("Error updating organization", error.message);
        });
    },

    async deleteOrg(orgId) {
      try {
        const deleteOrgFn = httpsCallable(firebaseFunctions, "deleteOrganization");
        await deleteOrgFn({ orgId });
        Notify.create(i18n.global.t("toastOrgDeleted"));
      } catch (error) {
        console.warn("deleteOrganization callable failed, falling back to direct delete:", error);
        try {
          await deleteDoc(doc(firebaseDb, "orgs", orgId));
          Notify.create(i18n.global.t("toastOrgDeleted"));
        } catch (directError) {
          showErrorMessage("Error deleting organization", directError.message || error.message);
          throw directError;
        }
      }

      const modelMod = await import("./store-model");
      if (modelMod.useModelStore) {
        modelMod.useModelStore(this.$pinia).deleteModel(orgId);
      }
    },

    addOrg(org) {
      org.users = [firebaseAuth.currentUser.uid];
      org.superAdmins = [firebaseAuth.currentUser.uid];
      org.createTime = serverTimestamp();
      org.createdBy = firebaseAuth.currentUser.uid;
      org.nameSlug = slugify(org.name);
      const pinia = this.$pinia;
      return addDoc(collection(firebaseDb, "orgs"), org)
        .then(async function (docRef) {
          const user = firebaseAuth.currentUser;
          setDoc(doc(firebaseDb, "orgs", docRef.id, "members", user.uid), {
            email: user.email,
            displayName: user.displayName || user.email.split("@")[0]
          });
          const modelMod = await import("./store-model");
          if (modelMod.useModelStore) {
            await modelMod.useModelStore(pinia).addOrgMainModel({
              orgId: docRef.id,
              modelId: docRef.id,
              currency: org.currency
            });
          }
          Notify.create(i18n.global.t("toastOrgAdded"));
        })
        .catch(function (error) {
          showErrorMessage("Error adding organization", error.message);
        });
    },

    // Creates the person's own copy of the sample organization, with its model
    // and actions. Returns the new org's id and name slug.
    async createSampleOrg() {
      const user = firebaseAuth.currentUser;
      const t = (key) => i18n.global.t(key);
      // In the app bundle the global locale is a ref, not a plain string.
      const locale = unref(i18n.global.locale);
      const sample = buildSampleOrg(t, sampleCurrencyFor(locale));
      const nodesRef = (modelId) => collection(firebaseDb, "models", modelId, "nodes");

      const org = {
        ...sample.org,
        users: [user.uid],
        superAdmins: [user.uid],
        createTime: serverTimestamp(),
        createdBy: user.uid,
        nameSlug: slugify(sample.org.name)
      };
      const orgRef = await addDoc(collection(firebaseDb, "orgs"), org);
      const orgId = orgRef.id;
      await setDoc(doc(firebaseDb, "orgs", orgId, "members", user.uid), {
        email: user.email,
        displayName: user.displayName || user.email.split("@")[0]
      });
      const modelMod = await import("./store-model");
      if (modelMod.useModelStore) {
        await modelMod.useModelStore(this.$pinia).addOrgMainModel({
          orgId,
          modelId: orgId,
          currency: sample.org.currency,
          withoutStarterNodes: true
        });
      }

      const nodes = compileDraftNodes(sample, () => doc(nodesRef(orgId)).id);
      const idOf = Object.fromEntries(nodes.map((n) => [n.symbol, n.id]));
      const roleNodes = roleNodesOf(nodes);
      const batch = writeBatch(firebaseDb);
      nodes.forEach(({ id, ...node }) =>
        batch.set(doc(nodesRef(orgId), id), {
          ...node,
          createTime: serverTimestamp(),
          createdBy: user.uid
        })
      );
      batch.set(
        doc(firebaseDb, "models", orgId),
        { roleNodes, updateTime: serverTimestamp(), updatedBy: user.uid },
        { merge: true }
      );

      const preparedActions = sample.actions.map((action) => {
        const ref = doc(collection(firebaseDb, "actions"));
        return {
          ref,
          data: {
            orgId,
            title: action.title,
            notes: action.notes,
            isProject: false,
            actionMchState: { value: "initiating" },
            useSimpleEstimateMethod: false,
            impacts: action.impacts.map(({ symbol, ...impact }) => ({
              ...impact,
              id: uid(),
              nodeId: idOf[symbol]
            })),
            estEffortHrs: action.estEffortHrs,
            effortCompletionPercentage: 0,
            effortCostPerHrType: action.effortCostSymbol ? "use_factor" : "use_average",
            effortCostNodeId: action.effortCostSymbol ? idOf[action.effortCostSymbol] : null,
            customEffortCostPerHr: null,
            estSpending: action.estSpending,
            spentAmount: 0,
            outstandingSpending: action.estSpending,
            totalDirectCost: 0,
            marginalTotalBenefitNpv: 0,
            marginalNetTotalBenefitNpv: 0,
            marginalTotalCostNpv: 0,
            actionLeverage: null,
            initiator: user.uid,
            responsiblePerson: user.uid,
            accountablePerson: user.uid
          }
        };
      });

      const adHocDocsStore = useAdHocDocsStore(this.$pinia);
      const exchangeRates = adHocDocsStore.exchangeRates || {
        base: sample.org.currency,
        rates: { USD: 1, TWD: 30, [sample.org.currency]: 1 }
      };
      const calc = await calculateActionsInWorker({
        nodes,
        actions: preparedActions.map((a) => ({ id: a.ref.id, ...a.data })),
        simulationParams: SAMPLE_SIMULATION_PARAMS,
        roleNodes,
        exchangeRates,
        orgId,
        modelId: orgId,
        orgCurrency: sample.org.currency,
        currentUserId: user.uid
      });
      if (!calc.ok) {
        throw new Error(calc.errorMessage || "Failed to calculate sample actions");
      }

      const resultsById = Object.fromEntries((calc.actionsResults || []).map((r) => [r.id, r]));
      preparedActions.forEach(({ ref, data }) => {
        const matchedResult = resultsById[ref.id];
        const calculatedFields = matchedResult
          ? {
              ...matchedResult.effectiveResultsNumbers,
              effectiveResultsNumbers: matchedResult.effectiveResultsNumbers,
              branchAndBlockeesResultsNumbers: matchedResult.branchAndBlockeesResultsNumbers,
              effectiveChainedCostsAndImpacts: matchedResult.effectiveChainedCostsAndImpacts,
              effectiveChainedCostsAndImpactsExcludingSelf:
                matchedResult.effectiveChainedCostsAndImpactsExcludingSelf,
              ...(matchedResult.inheritedResultsNumbers
                ? { inheritedResultsNumbers: matchedResult.inheritedResultsNumbers }
                : {})
            }
          : {};
        batch.set(ref, {
          ...data,
          ...calculatedFields,
          createTime: serverTimestamp(),
          createdBy: user.uid,
          updateTime: serverTimestamp(),
          updatedBy: user.uid
        });
      });

      await batch.commit();
      if (calc.baseline) {
        const calcResultsStore = useCalcResultsStore(this.$pinia);
        await Promise.resolve(calcResultsStore.saveBaseline(calc.baseline)).catch(() => {});
      }
      Notify.create(t("toastSampleCreated"));
      return { orgId, nameSlug: org.nameSlug };
    },

    bindOrgs: firestoreAction(({ bindFirestoreRef }) => {
      const userId = firebaseAuth.currentUser.uid;
      return bindFirestoreRef(
        "orgs",
        query(
          collection(firebaseDb, "orgs"),
          where("users", "array-contains", userId),
          orderBy("name", "asc"),
          orderBy("goal", "asc")
        ),
        {
          wait: true // this also forces reset: false
        }
      );
    }),
    unbindOrgs: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("orgs", false); // don't reset data when unbinding
    }),

    bindCurrentOrg: firestoreAction(({ bindFirestoreRef }, orgId) => {
      return bindFirestoreRef(
        "currentOrg",
        doc(firebaseDb, "orgs", orgId),
        {
          wait: true // this also forces reset: false
        }
      );
    }),

    unbindCurrentOrg: firestoreAction(({ unbindFirestoreRef }) => {
      unbindFirestoreRef("currentOrg", true);
    })
  }
});

export default useOrgsStore;
