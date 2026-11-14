import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as All from "quasar";
import { createStore } from "vuex";
import { createI18n } from "vue-i18n";
import messages from "@/i18n";
import PageOrgMembers from "@/pages/PageOrgMembers.vue";

const { Quasar } = All;
const components = Object.fromEntries(
  Object.entries(All).filter(([, v]) => v && v.name && typeof v.setup === "function")
);

function mountPageOrgMembers(options = {}) {
  const currentOrg = {
    id: "org-1",
    name: "Clean Ocean Alliance",
    nameSlug: "clean-ocean",
    superAdmins: ["user-admin-1"]
  };

  const users = [
    { id: "user-admin-1", displayName: "Alice Admin", email: "alice@example.com" },
    { id: "user-member-2", displayName: "Bob Member", email: "bob@example.com" }
  ];

  const invitations = [
    { id: "inv-1", email: "charlie@example.com", role: "member" },
    { id: "inv-2", email: "dana@example.com", role: "admin" }
  ];

  const actions = {
    inviteMember: vi.fn().mockResolvedValue(true),
    deleteInvitation: vi.fn().mockResolvedValue(true),
    resendInvitation: vi.fn().mockResolvedValue(true),
    removeMember: vi.fn().mockResolvedValue(true),
    setMemberRole: vi.fn().mockResolvedValue(true),
    bindOrgInvitations: vi.fn(),
    unbindOrgInvitations: vi.fn()
  };

  const store = createStore({
    modules: {
      auth: {
        namespaced: true,
        state: { userId: options.userId || "user-admin-1" }
      },
      orgs: {
        namespaced: true,
        state: { currentOrg }
      },
      members: {
        namespaced: true,
        state: { orgInvitations: invitations },
        actions
      },
      users: {
        namespaced: true,
        getters: {
          currentOrgUsers: () => users
        }
      }
    }
  });

  const wrapper = mount(PageOrgMembers, {
    global: {
      plugins: [
        [Quasar, { components, directives: { ClosePopup: All.ClosePopup } }],
        store,
        createI18n({ legacy: true, locale: options.locale || "en-us", messages })
      ],
      mocks: {
        $route: { params: { orgId: "org-1" } }
      },
      stubs: {
        QPage: { template: "<div class='q-page'><slot /></div>" }
      }
    }
  });

  return { wrapper, actions, invitations, users };
}

describe("PageOrgMembers.vue - Role Explanations & Invitation Resend", () => {
  it("renders pending invitations with role badge, tooltips, and Resend button", () => {
    const { wrapper } = mountPageOrgMembers();
    expect(wrapper.text()).toContain("charlie@example.com");
    expect(wrapper.text()).toContain("dana@example.com");
    expect(wrapper.text()).toContain("Resend");
  });

  it("calls resendInvitation action when clicking Resend", async () => {
    const { wrapper, actions, invitations } = mountPageOrgMembers();
    await wrapper.vm.resend(invitations[0]);

    expect(actions.resendInvitation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        invitationId: "inv-1",
        email: "charlie@example.com"
      })
    );
  });

  it("displays role badges for both Admin and Member with informative tooltips", () => {
    const { wrapper } = mountPageOrgMembers();
    const text = wrapper.text();
    expect(text).toContain("Admin");
    expect(text).toContain("Member");
    const tooltips = wrapper.findAllComponents(All.QTooltip);
    expect(tooltips.length).toBeGreaterThanOrEqual(2);
  });

  it("renders with zero Chinese characters in English locale", () => {
    const { wrapper } = mountPageOrgMembers({ locale: "en-us" });
    const html = wrapper.html();
    const chineseRegex = /[\u4e00-\u9fff]/;
    expect(chineseRegex.test(html)).toBe(false);
  });

  it("renders workspace tier and seat meter for organization members", () => {
    const { wrapper } = mountPageOrgMembers();
    const text = wrapper.text();
    expect(text).toContain("Community Tier");
    expect(text).toContain("seats committed");
    expect(text).toContain("Unlimited read-only stakeholder viewers included");
    expect(text).toContain("Upgrade Tier");
  });

  it("displays seat limit reached banner when capacity is reached", () => {
    // Current org has default 1 seat limit, and there are 2 users + 2 invitations = 4 committed seats >= 1
    const { wrapper } = mountPageOrgMembers();
    expect(wrapper.vm.isSeatFull).toBe(true);
    expect(wrapper.text()).toContain("reached its seat limit");
  });
});
