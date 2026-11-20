import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import enUs from "../../src/i18n/en-us";
import DraftModelDialog from "../../src/components/Model/Modals/DraftModelDialog.vue";

const mockRequestDraft = vi.fn();
const mockWriteDraft = vi.fn();
const mockTrialCalculate = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ provider: "anthropic", model: "claude-sonnet-4-6" })
  }))
}));

vi.mock("@/boot/firebase", () => ({
  firebaseDb: {}
}));

vi.mock("@/utils/util-aiDraft", async () => {
  const actual = await vi.importActual("@/utils/util-aiDraft");
  return {
    ...actual,
    requestDraft: (...args) => mockRequestDraft(...args),
    writeDraft: (...args) => mockWriteDraft(...args)
  };
});

vi.mock("@/utils/util-trialCalc", () => ({
  trialCalculate: (...args) => mockTrialCalculate(...args)
}));

describe("DraftModelDialog.vue (MIPA-55 limit gate)", () => {
  let i18n;

  beforeEach(() => {
    vi.clearAllMocks();
    i18n = createI18n({
      legacy: true,
      locale: "en-us",
      messages: { "en-us": enUs }
    });
  });

  const existingNodes = [
    { id: "r1", symbol: "averageEffortCostPerHour", name: "Avg Hourly Cost", symbolFormula: "20", sysFormula: "20", unit: "USD", influencers: [], influencees: [], class: "input" },
    { id: "r2", symbol: "oneTimeEffort", name: "One-time Effort", symbolFormula: "0", sysFormula: "0", unit: "workhours", influencers: [], influencees: [], class: "input" },
    { id: "r3", symbol: "oneTimeSpending", name: "One-time Spending", symbolFormula: "0", sysFormula: "0", unit: "USD", influencers: [], influencees: [], class: "input" },
    { id: "r4", symbol: "costToOrganizationDuringInterval", name: "Org Cost", symbolFormula: "oneTimeSpending + oneTimeEffort / (1 workhour) * averageEffortCostPerHour", sysFormula: "$r3 + $r2 / (1 workhour) * $r1", unit: "USD", influencers: ["r3", "r2", "r1"], influencees: [], class: "output" },
    { id: "r5", symbol: "benefitToOrganizationDuringInterval", name: "Org Benefit", symbolFormula: "0", sysFormula: "0", unit: "USD", influencers: [], influencees: [], class: "unlinked" },
    { id: "r6", symbol: "costToWorldDuringInterval", name: "World Cost", symbolFormula: "0", sysFormula: "0", unit: "USD", influencers: [], influencees: [], class: "unlinked" },
    { id: "r7", symbol: "benefitToWorldDuringInterval", name: "World Benefit", symbolFormula: "0", sysFormula: "0", unit: "USD", influencers: [], influencees: [], class: "unlinked" }
  ];

  function createWrapper() {
    const store = createStore({
      modules: {
        model: {
          namespaced: true,
          state: {
            currentModel: {
              id: "model-1",
              simulationParams: { finalTimeNumber: 120, finalTimeUnit: "months", numTimeSteps: 4 },
              roleNodes: {}
            }
          },
          getters: {
            nodes: () => existingNodes
          }
        },
        adHocDocs: {
          namespaced: true,
          state: {
            exchangeRates: { base: "USD", rates: { USD: 1 } }
          }
        }
      }
    });

    return mount(DraftModelDialog, {
      global: {
        plugins: [store, i18n],
        mocks: {
          $route: { params: { orgId: "org-1", modelId: "model-1", orgNameSlug: "bakery" } },
          $q: { notify: vi.fn() }
        },
        directives: { "close-popup": {} },
        stubs: {
          "q-card": { template: "<div><slot /></div>" },
          "q-card-section": { template: "<div><slot /></div>" },
          "q-card-actions": { template: "<div><slot /></div>" },
          "q-separator": { template: "<hr />" },
          "q-space": { template: "<span />" },
          "q-icon": { template: "<i></i>" },
          "q-spinner": { template: "<span>...</span>" },
          "q-spinner-dots": { template: "<span>...</span>" },
          "q-banner": { template: "<div><slot name='avatar' /><slot /></div>" },
          "q-list": { template: "<div><slot /></div>" },
          "q-item": { template: "<div><slot /></div>" },
          "q-item-section": { template: "<div><slot /></div>" },
          "q-item-label": { template: "<div><slot /></div>" },
          "q-checkbox": { template: "<input type='checkbox' />" },
          "q-tooltip": { template: "<span />" },
          "q-badge": { props: ["label"], template: "<span>{{ label }}</span>" },
          "q-btn": {
            props: ["label", "disable", "loading"],
            emits: ["click"],
            template: "<button :disabled='disable' @click='$emit(\"click\")'>{{ label }}</button>"
          },
          "q-input": {
            props: ["modelValue", "label"],
            emits: ["update:modelValue"],
            template: "<label>{{ label }}<input :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' /></label>"
          },
          "router-link": { template: "<a><slot /></a>" }
        }
      }
    });
  }

  it("runs one automatic repair round via requestDraft when trial graph fails limits or connectivity, and preserves Accept anyway with reason", async () => {
    const initialUnboundedDraft = {
      draftId: "draft-1",
      reply: {
        kind: "draft",
        message: "Initial draft",
        questions: [],
        summary: "Bakery growth model",
        groups: ["Sales"],
        factors: [
          {
            name: "Customers",
            symbol: "customers",
            formula: "delay(customers, dt, 10) + referrals",
            unit: "",
            group: "Sales",
            explanation: "Total customers",
            isEstimate: false,
            estimateReasoning: "",
            isHourlyCost: false
          },
          {
            name: "Referrals",
            symbol: "referrals",
            formula: "customers * 0.2",
            unit: "",
            group: "Sales",
            explanation: "Customer word of mouth",
            isEstimate: true,
            estimateReasoning: "20%",
            isHourlyCost: false
          }
        ],
        changesToExisting: [
          { symbol: "benefitToOrganizationDuringInterval", newFormula: "customers * 10", explanation: "Sales benefit" }
        ]
      }
    };

    // Repair round still leaves world cost unlinked -> triggers no 2nd limit repair loop, allows Accept anyway
    mockRequestDraft
      .mockResolvedValueOnce(initialUnboundedDraft)
      .mockResolvedValueOnce(initialUnboundedDraft);

    mockTrialCalculate.mockResolvedValue({
      ok: true,
      baseline: {
        timeSPoints: [0, 1, 2, 3],
        nodesValues: {
          r5: [100, 200, 400, 800]
        }
      }
    });
    mockWriteDraft.mockResolvedValue(undefined);

    const wrapper = createWrapper();
    await flushPromises();

    wrapper.vm.description = "We run a bakery serving 200 customers per month with 4 staff.";
    await wrapper.vm.send({ text: wrapper.vm.description });
    await flushPromises();

    // Expect initial request + exactly 1 automatic repair request through repairText channel
    expect(mockRequestDraft).toHaveBeenCalledTimes(2);
    const repairCall = mockRequestDraft.mock.calls[1][0];
    expect(Array.isArray(repairCall.errors)).toBe(true);
    expect(repairCall.errors.some((e) => e.includes("no bounding balancing limit") || e.includes("unconnected"))).toBe(true);

    // UI shows checklist & Accept anyway button
    expect(wrapper.text()).toContain(enUs.aiLimitsCheckTitle);
    expect(wrapper.find("[data-testid='accept-anyway-btn']").exists()).toBe(true);

    const reasonInput = wrapper.find("[data-testid='accept-anyway-reason'] input");
    await reasonInput.setValue("Deliberate first-pass baseline before adding oven limit");
    await wrapper.find("[data-testid='accept-anyway-btn']").trigger("click");
    await flushPromises();

    expect(mockWriteDraft).toHaveBeenCalledTimes(1);
    const writeArg = mockWriteDraft.mock.calls[0][0];
    expect(writeArg.limitOverride).toBeDefined();
    expect(writeArg.limitOverride.reason).toBe("Deliberate first-pass baseline before adding oven limit");
  });

  it("displays named limits and passes without triggering auto-repair when balancing limits bound growth and no factors are unlinked", async () => {
    const completeDraft = {
      draftId: "draft-2",
      reply: {
        kind: "draft",
        message: "Complete draft",
        questions: [],
        summary: "Balanced bakery model",
        groups: ["Operations"],
        factors: [
          {
            name: "Active Customers",
            symbol: "activeCustomers",
            formula: "wordOfMouth - kitchenCapConstraint",
            unit: "",
            group: "Operations",
            explanation: "Net customer throughput",
            isEstimate: false,
            estimateReasoning: "",
            isHourlyCost: false
          },
          {
            name: "Word of Mouth",
            symbol: "wordOfMouth",
            formula: "activeCustomers * 1.1",
            unit: "",
            group: "Operations",
            explanation: "Positive referral growth",
            isEstimate: false,
            estimateReasoning: "",
            isHourlyCost: false
          },
          {
            name: "Oven Capacity Limit",
            symbol: "kitchenCapConstraint",
            formula: "activeCustomers * 0.4",
            unit: "",
            group: "Operations",
            explanation: "Physical oven saturation cap",
            isEstimate: true,
            estimateReasoning: "4 ovens max",
            isHourlyCost: false
          }
        ],
        changesToExisting: [
          { symbol: "benefitToOrganizationDuringInterval", newFormula: "activeCustomers * 10 + benefitToWorldDuringInterval * 0", explanation: "Org benefit" },
          { symbol: "benefitToWorldDuringInterval", newFormula: "activeCustomers * 2", explanation: "Community bread value" },
          { symbol: "costToWorldDuringInterval", newFormula: "kitchenCapConstraint * 1", explanation: "Oven emissions" }
        ]
      }
    };

    mockRequestDraft.mockResolvedValueOnce(completeDraft);
    mockTrialCalculate.mockResolvedValue({
      ok: true,
      baseline: {
        timeSPoints: [0, 1, 2, 3, 4],
        nodesValues: {
          r5: [100, 140, 160, 170, 174]
        }
      }
    });

    const wrapper = createWrapper();
    await flushPromises();

    await wrapper.vm.send({ text: "Complete bakery description with 4 ovens." });
    await flushPromises();

    expect(mockRequestDraft).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.limitAssessment.passed).toBe(true);
    expect(wrapper.text()).toContain("Oven Capacity Limit");
    expect(wrapper.find("[data-testid='accept-draft-btn']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='accept-anyway-btn']").exists()).toBe(false);
  });
});
