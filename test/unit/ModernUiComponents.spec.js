import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import SkeletonLoader from "@/components/Shared/SkeletonLoader.vue";
import EmptyState from "@/components/Shared/EmptyState.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

describe("SkeletonLoader.vue", () => {
  it("renders card skeleton variant by default", () => {
    const wrapper = mount(SkeletonLoader, {
      global: {
        plugins: [[Quasar, { components }]]
      }
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.findAll(".q-card")).toHaveLength(3);
  });

  it("renders table skeleton variant", () => {
    const wrapper = mount(SkeletonLoader, {
      props: {
        type: "table",
        count: 4
      },
      global: {
        plugins: [[Quasar, { components }]]
      }
    });
    expect(wrapper.findAll(".border-bottom")).toHaveLength(4);
  });

  it("renders graph and detail skeleton variants", () => {
    const wrapperGraph = mount(SkeletonLoader, {
      props: { type: "graph" },
      global: { plugins: [[Quasar, { components }]] }
    });
    expect(wrapperGraph.findAll(".q-skeleton--type-QAvatar").length).toBeGreaterThan(0);

    const wrapperDetail = mount(SkeletonLoader, {
      props: { type: "detail" },
      global: { plugins: [[Quasar, { components }]] }
    });
    expect(wrapperDetail.exists()).toBe(true);
  });
});

describe("EmptyState.vue", () => {
  it("renders with title, description, and triggers action event", async () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: "No factors in model",
        description: "Add a factor or draft a starter model with AI.",
        actionLabel: "Add factor",
        actionIcon: "add"
      },
      global: {
        plugins: [[Quasar, { components }]]
      }
    });

    expect(wrapper.text()).toContain("No factors in model");
    expect(wrapper.text()).toContain("Add a factor or draft a starter model with AI.");
    expect(wrapper.text()).toContain("Add factor");

    const btn = wrapper.find(".q-btn");
    await btn.trigger("click");
    expect(wrapper.emitted().action).toBeTruthy();
  });

  it("renders secondary action and emits secondary-action event", async () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: "No actions created",
        actionLabel: "New Action",
        secondaryActionLabel: "Import Ideas"
      },
      global: {
        plugins: [[Quasar, { components }]]
      }
    });

    const btns = wrapper.findAll(".q-btn");
    expect(btns).toHaveLength(2);
    await btns[1].trigger("click");
    expect(wrapper.emitted()["secondary-action"]).toBeTruthy();
  });
});
